/**
 * TypeRegistry namespace module — composable Effect programs for managing type definitions.
 */

import { Effect } from "effect";
import type { CacheError } from "./errors/CacheError.js";
import type { NetworkError } from "./errors/NetworkError.js";
import { PackageNotFoundError } from "./errors/PackageNotFoundError.js";
import type { ParseError } from "./errors/ParseError.js";
import type { ResolutionError } from "./errors/ResolutionError.js";
import { CacheMetadata } from "./schemas/CacheMetadata.js";
import type { PackageJson } from "./schemas/PackageJson.js";
import type { PackageSpec } from "./schemas/PackageSpec.js";
import type { ResolvedModule } from "./schemas/ResolvedModule.js";
import type { VirtualFileSystem } from "./services/CacheService.js";
import { CacheService } from "./services/CacheService.js";
import { PackageFetcher } from "./services/PackageFetcher.js";
import { TypeResolver } from "./services/TypeResolver.js";

/**
 * Check if a package is cached.
 */
export const hasCached = (pkg: PackageSpec): Effect.Effect<boolean, CacheError, CacheService> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		return yield* cache.exists(pkg);
	});

/**
 * Fetch a package's type definitions and write them to the cache.
 */
export const fetchAndCache = (
	pkg: PackageSpec,
	options?: { readonly ttl?: number },
): Effect.Effect<void, NetworkError | ParseError | CacheError, CacheService | PackageFetcher> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		const fetcher = yield* PackageFetcher;

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
		const metadata = new CacheMetadata({
			cachedAt: Date.now(),
			version: pkg.version,
			...(options?.ttl !== undefined ? { ttl: options.ttl } : {}),
		});
		yield* cache.writeMetadata(pkg, metadata);
	});

/**
 * Get VFS for a single cached package, optionally fetching it first.
 */
export const getPackageVFS = (
	pkg: PackageSpec,
	options?: { readonly autoFetch?: boolean; readonly ttl?: number },
): Effect.Effect<
	VirtualFileSystem,
	NetworkError | ParseError | CacheError | PackageNotFoundError,
	CacheService | PackageFetcher
> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		const autoFetch = options?.autoFetch ?? true;

		const exists = yield* cache.exists(pkg);

		if (!exists && autoFetch) {
			yield* fetchAndCache(pkg, options);
		} else if (!exists && !autoFetch) {
			yield* Effect.fail(
				new PackageNotFoundError({
					name: pkg.name,
					version: pkg.version,
					message: `Package ${pkg.toString()} is not cached and autoFetch is disabled`,
				}),
			);
		}

		return yield* cache.getVFS(pkg);
	});

/**
 * Get combined VFS for multiple packages with graceful degradation.
 * Continues processing even if some packages fail; fails only when ALL packages fail.
 */
export const getVFS = (
	packages: ReadonlyArray<PackageSpec>,
	options?: { readonly autoFetch?: boolean; readonly ttl?: number },
): Effect.Effect<VirtualFileSystem, PackageNotFoundError, CacheService | PackageFetcher> =>
	Effect.gen(function* () {
		const results = yield* Effect.forEach(
			packages,
			(pkg) =>
				getPackageVFS(pkg, options).pipe(
					Effect.map((vfs) => ({ _tag: "ok" as const, vfs })),
					Effect.catchAll((error) => Effect.succeed({ _tag: "err" as const, pkg, error })),
				),
			{ concurrency: 5 },
		);

		const merged: VirtualFileSystem = new Map();
		const errors: Array<{ pkg: PackageSpec; error: unknown }> = [];

		for (const result of results) {
			if (result._tag === "ok") {
				for (const [path, content] of result.vfs) {
					merged.set(path, content);
				}
			} else {
				errors.push({ pkg: result.pkg, error: result.error });
			}
		}

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

/**
 * Resolve an import specifier for a cached package.
 */
export const resolveImport = (
	pkg: PackageSpec,
	specifier: string,
): Effect.Effect<ResolvedModule, CacheError | ResolutionError, CacheService | TypeResolver> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		const resolver = yield* TypeResolver;

		const packageJsonContent = yield* cache.read(pkg, "package.json");
		const packageJson = JSON.parse(packageJsonContent) as PackageJson;

		return yield* resolver.resolveImport(specifier, packageJson, pkg);
	});

/**
 * Get all type entry points for a cached package.
 */
export const getTypeEntries = (
	pkg: PackageSpec,
): Effect.Effect<ReadonlyArray<ResolvedModule>, CacheError | ResolutionError, CacheService | TypeResolver> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		const resolver = yield* TypeResolver;

		const packageJsonContent = yield* cache.read(pkg, "package.json");
		const packageJson = JSON.parse(packageJsonContent) as PackageJson;

		return yield* resolver.resolveTypeEntries(packageJson, pkg);
	});

/**
 * Resolve a version reference (latest, ^1.0.0, etc.) to a specific version.
 */
export const resolveVersion = (
	name: string,
	ref: string,
): Effect.Effect<string, NetworkError | PackageNotFoundError, PackageFetcher> =>
	Effect.gen(function* () {
		const fetcher = yield* PackageFetcher;
		return yield* fetcher.resolveVersion(name, ref);
	});

/**
 * Remove a package from the cache.
 */
export const clearCache = (pkg: PackageSpec): Effect.Effect<void, CacheError, CacheService> =>
	Effect.gen(function* () {
		const cache = yield* CacheService;
		yield* cache.remove(pkg);
	});
