/**
 * TypeRegistry namespace module — composable Effect programs for managing
 * type definitions fetched from the jsDelivr CDN and stored in a local disk cache.
 *
 * @remarks
 * Every export in this module is a pure, composable {@link https://effect.website | Effect} program.
 * Programs require one or more service layers ({@link CacheService}, {@link PackageFetcher},
 * {@link TypeResolver}) that are provided at the edge of your application via
 * `Effect.provide`. For the standard Node.js implementation, use
 * `NodeLayer` from `"type-registry-effect/node"`.
 *
 * @see {@link CacheService} for the cache abstraction
 * @see {@link PackageFetcher} for the network abstraction
 * @see {@link TypeResolver} for the resolution abstraction
 *
 * @packageDocumentation
 */

import { Effect, Metric } from "effect";
import type { CacheError } from "./errors/CacheError.js";
import type { NetworkError } from "./errors/NetworkError.js";
import { PackageNotFoundError } from "./errors/PackageNotFoundError.js";
import { ParseError } from "./errors/ParseError.js";
import type { ResolutionError } from "./errors/ResolutionError.js";
import {
	batchDuration,
	cacheHits,
	cacheMisses,
	cacheStale,
	packageLoadDuration,
	packagesFailed,
	packagesLoaded,
} from "./metrics.js";
import type { CacheMetadata } from "./schemas/CacheMetadata.js";
import type { PackageJson } from "./schemas/PackageJson.js";
import type { PackageSpec } from "./schemas/PackageSpec.js";
import type { ResolvedModule } from "./schemas/ResolvedModule.js";
import type { VirtualFileSystem } from "./services/CacheService.js";
import { CacheService } from "./services/CacheService.js";
import { PackageFetcher } from "./services/PackageFetcher.js";
import { TypeResolver } from "./services/TypeResolver.js";

/**
 * Check whether a package already exists in the disk cache.
 *
 * @remarks
 * This performs a lightweight existence check against {@link CacheService} without
 * reading any file contents. Use it to decide whether to fetch before calling
 * {@link fetchAndCache}.
 *
 * @param pkg - The package specification to look up.
 * @returns An Effect that succeeds with `true` when the package is cached, `false` otherwise.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
 *   const exists = yield* TypeRegistry.hasCached(pkg);
 *   console.log(`zod@3.23.8 cached: ${exists}`);
 *   return exists;
 * });
 *
 * const result = await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @public
 */
export const hasCached = (pkg: PackageSpec): Effect.Effect<boolean, CacheError, CacheService> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		return yield* cache.exists(pkg);
	});

/**
 * Fetch type definitions for a package from the jsDelivr CDN and write them
 * to the disk cache.
 *
 * @remarks
 * The function downloads the `package.json` and every `.d.ts` file published
 * by the package, then persists them under the {@link CacheService} storage
 * directory. A {@link CacheMetadata} record is written alongside the files so
 * that future cache hits can evaluate freshness.
 *
 * The optional `ttl` (time-to-live) is stored in the metadata and expressed
 * in **milliseconds**. When a subsequent read finds that the cache entry is
 * older than `ttl`, the entry is considered stale and a re-fetch is triggered
 * by higher-level operations such as {@link getPackageVFS}.
 *
 * @param pkg - The package specification to fetch.
 * @param options - Optional configuration. When provided, `options.ttl` sets
 *   the time-to-live in milliseconds for the cached entry.
 * @returns An Effect that succeeds with `void` once all files are written.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new PackageSpec({ name: "lodash", version: "4.17.21" });
 *   // Cache with a 1-hour TTL
 *   yield* TypeRegistry.fetchAndCache(pkg, { ttl: 60 * 60 * 1000 });
 * });
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link hasCached} to check before fetching
 * @see {@link getPackageVFS} for a higher-level API that auto-fetches
 *
 * @public
 */
export const fetchAndCache = (
	pkg: PackageSpec,
	options?: { readonly ttl?: number },
): Effect.Effect<void, NetworkError | ParseError | CacheError, CacheService | PackageFetcher> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		const fetcher = yield* PackageFetcher;

		yield* Effect.logDebug(`Fetching ${pkg.toString()}`).pipe(
			Effect.annotateLogs("event", "package.fetch.start"),
			Effect.annotateLogs("package", pkg.name),
			Effect.annotateLogs("version", pkg.version),
		);

		// Fetch package.json
		const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);

		// Fetch all type files
		const typeFiles: Map<string, string> = yield* fetcher.getTypeFiles(pkg);

		// Write package.json to cache
		yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

		// Write all type files to cache
		for (const [filePath, content] of typeFiles) {
			const normalizedPath = filePath.replace(/^\//, "");
			if (normalizedPath !== "package.json") {
				yield* cache.write(pkg, normalizedPath, content);
			}
		}

		// Write metadata
		const metadata: CacheMetadata = {
			cachedAt: Date.now(),
			version: pkg.version,
			...(options?.ttl !== undefined ? { ttl: options.ttl } : {}),
		};
		yield* cache.writeMetadata(pkg, metadata);
	});

/**
 * Get a {@link VirtualFileSystem} for a single package, optionally fetching
 * it from the CDN first if it is not already cached.
 *
 * @remarks
 * When `autoFetch` is `true` (the default) and the package is not present in
 * the cache, this function transparently calls {@link fetchAndCache} before
 * building the VFS. Set `autoFetch` to `false` to restrict the operation to
 * cached data only; a {@link PackageNotFoundError} is raised if the package
 * is missing.
 *
 * The returned VFS maps file paths (relative to `node_modules/<package>`) to
 * their string contents.
 *
 * @param pkg - The package specification to retrieve.
 * @param options - Optional configuration. When provided, `options.autoFetch`
 *   controls whether to fetch from the CDN on a cache miss (default `true`),
 *   and `options.ttl` sets the time-to-live in milliseconds forwarded to
 *   {@link fetchAndCache}.
 * @returns An Effect that succeeds with the package's {@link VirtualFileSystem}.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { VirtualFileSystem } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
 *   // Auto-fetches if not cached
 *   const vfs: VirtualFileSystem = yield* TypeRegistry.getPackageVFS(pkg);
 *   console.log(`Files: ${[...vfs.keys()].join(", ")}`);
 *   return vfs;
 * });
 *
 * const vfs = await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link getVFS} to load multiple packages at once
 * @see {@link fetchAndCache} for the underlying fetch + write logic
 *
 * @public
 */
export const getPackageVFS = (
	pkg: PackageSpec,
	options?: { readonly autoFetch?: boolean; readonly ttl?: number },
): Effect.Effect<
	VirtualFileSystem,
	NetworkError | ParseError | CacheError | PackageNotFoundError,
	CacheService | PackageFetcher
> => {
	const inner = Effect.gen(function* () {
		const cache = yield* CacheService;
		const autoFetch = options?.autoFetch ?? true;
		const startTime = Date.now();
		const exists = yield* cache.exists(pkg);
		let source: "cache" | "network" = "cache";

		if (!exists && autoFetch) {
			yield* Effect.logDebug(`Cache miss for ${pkg.toString()}`).pipe(
				Effect.annotateLogs("event", "cache.miss"),
				Effect.annotateLogs("package", pkg.name),
				Effect.annotateLogs("version", pkg.version),
			);
			yield* Metric.increment(cacheMisses);
			yield* fetchAndCache(pkg, options);
			source = "network";
		} else if (!exists && !autoFetch) {
			yield* Effect.fail(
				new PackageNotFoundError({
					name: pkg.name,
					version: pkg.version,
					message: `Package ${pkg.toString()} is not cached and autoFetch is disabled`,
				}),
			);
		} else if (exists && autoFetch) {
			// Check TTL staleness — re-fetch if cache entry has expired
			const metaResult = yield* cache.readMetadata(pkg).pipe(
				Effect.map((meta) => ({
					isStale: meta.ttl !== undefined ? meta.cachedAt + meta.ttl < Date.now() : false,
					ageMinutes: (Date.now() - meta.cachedAt) / 60000,
					ttlMinutes: meta.ttl !== undefined ? meta.ttl / 60000 : undefined,
				})),
				Effect.catchAll(() =>
					Effect.succeed({
						isStale: false,
						ageMinutes: 0,
						ttlMinutes: undefined as number | undefined,
					}),
				),
			);

			if (metaResult.isStale) {
				yield* Effect.logDebug(`Cache stale for ${pkg.toString()}`).pipe(
					Effect.annotateLogs("event", "cache.stale"),
					Effect.annotateLogs("package", pkg.name),
					Effect.annotateLogs("version", pkg.version),
					Effect.annotateLogs("ageMinutes", String(Math.round(metaResult.ageMinutes))),
					Effect.annotateLogs("ttlMinutes", String(Math.round(metaResult.ttlMinutes ?? 0))),
				);
				yield* Metric.increment(cacheStale);
				yield* fetchAndCache(pkg, options);
				source = "network";
			} else {
				yield* Effect.log(`Cache hit for ${pkg.toString()}`).pipe(
					Effect.annotateLogs("event", "cache.hit"),
					Effect.annotateLogs("package", pkg.name),
					Effect.annotateLogs("version", pkg.version),
					Effect.annotateLogs("ageMinutes", String(Math.round(metaResult.ageMinutes))),
				);
				yield* Metric.increment(cacheHits);
			}
		} else {
			// exists && !autoFetch
			const metaResult = yield* cache.readMetadata(pkg).pipe(
				Effect.map((meta) => ({ ageMinutes: (Date.now() - meta.cachedAt) / 60000 })),
				Effect.catchAll(() => Effect.succeed({ ageMinutes: 0 })),
			);
			yield* Effect.log(`Cache hit for ${pkg.toString()}`).pipe(
				Effect.annotateLogs("event", "cache.hit"),
				Effect.annotateLogs("package", pkg.name),
				Effect.annotateLogs("version", pkg.version),
				Effect.annotateLogs("ageMinutes", String(Math.round(metaResult.ageMinutes))),
			);
			yield* Metric.increment(cacheHits);
		}

		const vfs = yield* cache.getVFS(pkg);
		const durationMs = Date.now() - startTime;
		yield* Effect.log(`Loaded ${pkg.toString()} (${vfs.size} files, ${source})`).pipe(
			Effect.annotateLogs("event", "package.loaded"),
			Effect.annotateLogs("package", pkg.name),
			Effect.annotateLogs("version", pkg.version),
			Effect.annotateLogs("files", String(vfs.size)),
			Effect.annotateLogs("source", source),
			Effect.annotateLogs("durationMs", String(durationMs)),
		);
		yield* Metric.increment(packagesLoaded);
		return vfs;
	});
	return inner.pipe(Metric.trackDuration(packageLoadDuration));
};

/**
 * Get a combined {@link VirtualFileSystem} for multiple packages with
 * graceful degradation on per-package failures.
 *
 * @remarks
 * Packages are fetched concurrently with a concurrency limit of **5**.
 * Individual package failures are caught and accumulated rather than
 * aborting the entire batch. The operation only fails with a
 * {@link PackageNotFoundError} when **every** requested package fails.
 * When at least one package succeeds, the merged VFS is returned and
 * failing packages are silently skipped.
 *
 * This partial-failure strategy makes the function suitable for
 * best-effort scenarios such as editor integrations where missing type
 * definitions for one dependency should not block the rest.
 *
 * @param packages - Array of package specifications to load.
 * @param options - Optional configuration forwarded to {@link getPackageVFS}.
 *   When provided, `options.autoFetch` controls whether to fetch missing
 *   packages from the CDN (default `true`), and `options.ttl` sets the
 *   time-to-live in milliseconds for newly cached entries.
 * @returns An Effect that succeeds with the merged {@link VirtualFileSystem}.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { VirtualFileSystem } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const packages = [
 *     new PackageSpec({ name: "zod", version: "3.23.8" }),
 *     new PackageSpec({ name: "effect", version: "3.12.5" }),
 *   ];
 *   const vfs: VirtualFileSystem = yield* TypeRegistry.getVFS(packages);
 *   console.log(`Total VFS entries: ${vfs.size}`);
 *   return vfs;
 * });
 *
 * const vfs = await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link getPackageVFS} for loading a single package
 *
 * @public
 */
export const getVFS = (
	packages: ReadonlyArray<PackageSpec>,
	options?: { readonly autoFetch?: boolean; readonly ttl?: number },
): Effect.Effect<VirtualFileSystem, PackageNotFoundError, CacheService | PackageFetcher> => {
	const inner = Effect.gen(function* () {
		const startTime = Date.now();

		yield* Effect.logDebug(`Fetching VFS for ${packages.length} package(s)`).pipe(
			Effect.annotateLogs("event", "packages.batch.start"),
			Effect.annotateLogs("total", String(packages.length)),
			Effect.annotateLogs("packages", packages.map((p) => p.toString()).join(", ")),
		);

		const results = yield* Effect.forEach(
			packages,
			(pkg) =>
				getPackageVFS(pkg, options).pipe(
					Effect.map((vfs) => ({ _tag: "ok" as const, vfs, pkg })),
					Effect.catchAll((error) =>
						Effect.gen(function* () {
							yield* Effect.logWarning(`Failed to load ${pkg.toString()}: ${String(error)}`).pipe(
								Effect.annotateLogs("event", "package.load.failed"),
								Effect.annotateLogs("package", pkg.name),
								Effect.annotateLogs("version", pkg.version),
								Effect.annotateLogs("error", String(error)),
							);
							yield* Metric.increment(packagesFailed);
							return { _tag: "err" as const, pkg, error };
						}),
					),
				),
			{ concurrency: 5 },
		);

		const merged: VirtualFileSystem = new Map();
		const errors: Array<{ pkg: PackageSpec; error: unknown }> = [];
		let totalFiles = 0;

		for (const result of results) {
			if (result._tag === "ok") {
				for (const [path, content] of result.vfs) {
					merged.set(path, content);
				}
				totalFiles += result.vfs.size;
			} else {
				errors.push({ pkg: result.pkg, error: result.error });
			}
		}

		const durationMs = Date.now() - startTime;
		const loadedCount = packages.length - errors.length;

		yield* Effect.log(
			`Batch complete: ${loadedCount}/${packages.length} packages (${totalFiles} files, ${durationMs}ms)`,
		).pipe(
			Effect.annotateLogs("event", "packages.batch.complete"),
			Effect.annotateLogs("loaded", String(loadedCount)),
			Effect.annotateLogs("failed", String(errors.length)),
			Effect.annotateLogs("total", String(packages.length)),
			Effect.annotateLogs("totalFiles", String(totalFiles)),
			Effect.annotateLogs("durationMs", String(durationMs)),
		);

		if (errors.length === packages.length && packages.length > 0) {
			yield* Effect.fail(
				new PackageNotFoundError({
					name: errors.map((e) => e.pkg.name).join(", "),
					version: "",
					message: `Failed to fetch VFS for all packages:\n${errors.map((e) => `- ${e.pkg.toString()}: ${String(e.error)}`).join("\n")}`,
				}),
			);
		}

		return merged;
	});
	return inner.pipe(Metric.trackDuration(batchDuration));
};

/**
 * Resolve an import specifier (e.g. `"zod"`, `"zod/lib/types"`) against a
 * cached package's `package.json` exports map.
 *
 * @remarks
 * The package must already be present in the cache. The resolution logic
 * delegates to {@link TypeResolver} which interprets the `exports`, `types`,
 * and `typings` fields of the cached `package.json`.
 *
 * @param pkg - The cached package to resolve against.
 * @param specifier - The bare import specifier to resolve (e.g. `"zod"` or `"zod/lib/types"`).
 * @returns An Effect that succeeds with a {@link ResolvedModule} describing the resolved file.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { ResolvedModule } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
 *   yield* TypeRegistry.fetchAndCache(pkg);
 *   const resolved: ResolvedModule = yield* TypeRegistry.resolveImport(pkg, "zod");
 *   console.log(`Resolved to: ${resolved.resolvedPath}`);
 *   return resolved;
 * });
 *
 * const resolved = await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link getTypeEntries} to discover all entry points
 * @see {@link TypeResolver} for the underlying resolution service
 *
 * @public
 */
export const resolveImport = (
	pkg: PackageSpec,
	specifier: string,
): Effect.Effect<ResolvedModule, CacheError | ParseError | ResolutionError, CacheService | TypeResolver> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		const resolver = yield* TypeResolver;

		const packageJsonContent = yield* cache.read(pkg, "package.json");
		const packageJson = yield* Effect.try({
			try: () => JSON.parse(packageJsonContent) as PackageJson,
			catch: (error) => new ParseError({ source: "package.json", message: String(error) }),
		});

		return yield* resolver.resolveImport(specifier, packageJson, pkg);
	});

/**
 * Get all type entry points exported by a cached package.
 *
 * @remarks
 * Reads the cached `package.json` and delegates to {@link TypeResolver} to
 * enumerate every entry point that exposes type definitions (via `exports`,
 * `types`, or `typings` fields). The package must already be in the cache.
 *
 * @param pkg - The cached package to inspect.
 * @returns An Effect that succeeds with a read-only array of {@link ResolvedModule} entries.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { ResolvedModule } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new PackageSpec({ name: "effect", version: "3.12.5" });
 *   yield* TypeRegistry.fetchAndCache(pkg);
 *   const entries: ReadonlyArray<ResolvedModule> = yield* TypeRegistry.getTypeEntries(pkg);
 *   for (const entry of entries) {
 *     console.log(`${entry.specifier} -> ${entry.resolvedPath}`);
 *   }
 *   return entries;
 * });
 *
 * const entries = await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link resolveImport} to resolve a single specifier
 * @see {@link TypeResolver} for the underlying resolution service
 *
 * @public
 */
export const getTypeEntries = (
	pkg: PackageSpec,
): Effect.Effect<
	ReadonlyArray<ResolvedModule>,
	CacheError | ParseError | ResolutionError,
	CacheService | TypeResolver
> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		const resolver = yield* TypeResolver;

		const packageJsonContent = yield* cache.read(pkg, "package.json");
		const packageJson = yield* Effect.try({
			try: () => JSON.parse(packageJsonContent) as PackageJson,
			catch: (error) => new ParseError({ source: "package.json", message: String(error) }),
		});

		return yield* resolver.resolveTypeEntries(packageJson, pkg);
	});

/**
 * Resolve a version reference to a concrete, pinned version string.
 *
 * @remarks
 * Accepts any npm-style version reference — `"latest"`, a semver range
 * like `"^1.0.0"`, or an exact version like `"3.23.8"` — and queries the
 * {@link PackageFetcher} (backed by the jsDelivr API) to determine the
 * matching published version.
 *
 * @param name - The npm package name (e.g. `"zod"`).
 * @param ref - A version reference: `"latest"`, a semver range, or an exact version.
 * @returns An Effect that succeeds with the resolved version string (e.g. `"3.23.8"`).
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { TypeRegistry } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const version = yield* TypeRegistry.resolveVersion("zod", "latest");
 *   console.log(`Latest zod version: ${version}`);
 *   return version;
 * });
 *
 * const version = await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link PackageFetcher} for the underlying network service
 *
 * @public
 */
export const resolveVersion = (
	name: string,
	ref: string,
): Effect.Effect<string, NetworkError | PackageNotFoundError, PackageFetcher> =>
	Effect.gen(function* () {
		const fetcher = yield* PackageFetcher;
		const resolved = yield* fetcher.resolveVersion(name, ref);
		yield* Effect.log(`Resolved ${name}: ${ref} -> ${resolved}`).pipe(
			Effect.annotateLogs("event", "package.version.resolved"),
			Effect.annotateLogs("package", name),
			Effect.annotateLogs("requested", ref),
			Effect.annotateLogs("resolved", resolved),
		);
		return resolved;
	});

/**
 * Remove a package and all of its cached files from the disk cache.
 *
 * @param pkg - The package specification to remove.
 * @returns An Effect that succeeds with `void` once the cache entry is deleted.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
 *   yield* TypeRegistry.clearCache(pkg);
 *   console.log("Cache cleared for zod@3.23.8");
 * });
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link hasCached} to check existence before clearing
 * @see {@link fetchAndCache} to repopulate the cache afterward
 *
 * @public
 */
export const clearCache = (pkg: PackageSpec): Effect.Effect<void, CacheError, CacheService> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		yield* cache.remove(pkg);
	});
