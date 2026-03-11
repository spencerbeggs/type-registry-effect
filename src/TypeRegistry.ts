/**
 * Main TypeRegistry class for managing type definitions
 */

import type { FileSystem, HttpClient } from "@effect/platform";
import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import {
	createDefaultMapFromNodeModules,
	createFSBackedSystem,
	createVirtualTypeScriptEnvironment,
} from "@typescript/vfs";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as ts from "typescript";
import type { LogEvent } from "./events.js";
import { CacheService, CacheServiceLive, makeCacheServiceLayer } from "./services/CacheService.js";
import { PackageFetcher, PackageFetcherLive } from "./services/PackageFetcher.js";
import { TypeResolver, TypeResolverLive } from "./services/TypeResolver.js";
import type { CacheMetadata, PackageJson, PackageSpec, TypeRegistryOptions, VirtualFileSystem } from "./types.js";

/**
 * TypeRegistry manages type definitions across packages and versions
 */
export class TypeRegistry {
	private constructor(private readonly options: TypeRegistryOptions) {}

	/**
	 * Create a new TypeRegistry instance
	 */
	static create(options: TypeRegistryOptions = {}): TypeRegistry {
		return new TypeRegistry(options);
	}

	/**
	 * Emit a log event through the callback if configured.
	 * @internal
	 */
	private emitEvent(event: LogEvent): void {
		if (this.options.onLogEvent) {
			this.options.onLogEvent(event);
		}
	}

	/**
	 * Check if a package is cached
	 */
	async hasCached(pkg: PackageSpec): Promise<boolean> {
		const program: Effect.Effect<boolean, never, CacheService | FileSystem.FileSystem> = Effect.gen(function* () {
			const cache: CacheService = yield* CacheService;
			return yield* cache.exists(pkg);
		});

		return this.runWithServices(program);
	}

	/**
	 * Fetch and cache a package's type definitions
	 */
	async fetchAndCache(pkg: PackageSpec): Promise<void> {
		const program: Effect.Effect<
			void,
			Error,
			CacheService | PackageFetcher | TypeResolver | FileSystem.FileSystem | HttpClient.HttpClient
		> = Effect.gen(this, function* () {
			const cache: CacheService = yield* CacheService;
			const fetcher: PackageFetcher = yield* PackageFetcher;

			// Check if already cached
			const exists = yield* cache.exists(pkg);
			if (exists) {
				// Check if cache is stale (if TTL is set)
				const metadata = yield* cache.readMetadata(pkg);
				const now = Date.now();
				const age = now - metadata.cachedAt;
				const ageInMinutes = Math.floor(age / 1000 / 60);

				// If TTL is set and cache is not stale, skip fetching
				if (metadata.ttl && age < metadata.ttl) {
					this.emitEvent({
						event: "cache.hit",
						level: "info",
						message: `Cache hit for ${pkg.name}@${pkg.version}`,
						timestamp: Date.now(),
						data: {
							package: pkg.name,
							version: pkg.version,
							ageMinutes: ageInMinutes,
						},
					});
					return;
				}

				this.emitEvent({
					event: "cache.stale",
					level: "debug",
					message: `Cache stale for ${pkg.name}@${pkg.version}`,
					timestamp: Date.now(),
					data: {
						package: pkg.name,
						version: pkg.version,
						ageMinutes: ageInMinutes,
						ttlMinutes: metadata.ttl ? Math.floor(metadata.ttl / 1000 / 60) : 0,
					},
				});
			} else {
				// Cache miss - need to fetch
				this.emitEvent({
					event: "cache.miss",
					level: "debug",
					message: `Cache miss for ${pkg.name}@${pkg.version}`,
					timestamp: Date.now(),
					data: {
						package: pkg.name,
						version: pkg.version,
					},
				});
			}

			// Fetch package.json
			const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);

			// Fetch all type files
			const typeFiles: Map<string, string> = yield* fetcher.getTypeFiles(pkg);

			// Write package.json to cache
			yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

			// Write all type files to cache
			for (const [filePath, content] of typeFiles) {
				// Remove leading slash if present
				const normalizedPath = filePath.replace(/^\//, "");
				if (normalizedPath !== "package.json") {
					// Skip package.json since we already wrote it
					yield* cache.write(pkg, normalizedPath, content);
				}
			}

			// Write metadata
			const metadata: CacheMetadata = {
				cachedAt: Date.now(),
				version: pkg.version,
				ttl: this.options.ttl,
			};
			yield* cache.writeMetadata(pkg, metadata);

			// Emit package loaded event
			this.emitEvent({
				event: "package.loaded",
				level: "info",
				message: `Loaded ${pkg.name}@${pkg.version}`,
				timestamp: Date.now(),
				data: {
					package: pkg.name,
					version: pkg.version,
					files: typeFiles.size,
					source: "network",
				},
			});
		});

		return this.runWithServices(program);
	}

	/**
	 * Ensure a package is cached (fetch if not present or stale)
	 */
	async ensureCached(pkg: PackageSpec): Promise<void> {
		const isCached = await this.hasCached(pkg);
		if (!isCached) {
			await this.fetchAndCache(pkg);
		}
	}

	/**
	 * Get VFS for a cached package (fetches if not cached)
	 */
	async getPackageVFS(pkg: PackageSpec, options?: { autoFetch?: boolean }): Promise<VirtualFileSystem> {
		const autoFetch = options?.autoFetch ?? true;

		const program: Effect.Effect<
			VirtualFileSystem,
			Error,
			CacheService | PackageFetcher | TypeResolver | FileSystem.FileSystem | HttpClient.HttpClient
		> = Effect.gen(this, function* () {
			const cache: CacheService = yield* CacheService;

			// Check if cached
			const exists = yield* cache.exists(pkg);

			if (!exists && autoFetch) {
				// Fetch and cache if auto-fetch is enabled
				const fetcher: PackageFetcher = yield* PackageFetcher;

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
					ttl: this.options.ttl,
				};
				yield* cache.writeMetadata(pkg, metadata);
			} else if (!exists && !autoFetch) {
				throw new Error(`Package ${pkg.name}@${pkg.version} is not cached and autoFetch is disabled`);
			}

			// Get VFS from cache
			return yield* cache.getVFS(pkg);
		});

		return this.runWithServices(program);
	}

	/**
	 * Get combined VFS for multiple packages
	 * Implements graceful error handling - continues processing even if some packages fail
	 */
	async getVFS(packages: PackageSpec[], options?: { autoFetch?: boolean }): Promise<VirtualFileSystem> {
		const vfs: VirtualFileSystem = new Map();
		const errors: Array<{ pkg: PackageSpec; error: Error }> = [];

		for (const pkg of packages) {
			try {
				const pkgVfs: VirtualFileSystem = await this.getPackageVFS(pkg, options);
				for (const [path, content] of pkgVfs) {
					vfs.set(path, content);
				}
			} catch (error) {
				// Log error but continue processing other packages
				const errorObj = error instanceof Error ? error : new Error(String(error));
				errors.push({ pkg, error: errorObj });
				console.error(`Failed to fetch VFS for ${pkg.name}@${pkg.version}: ${errorObj.message}`);
			}
		}

		// If all packages failed, throw an error
		if (errors.length === packages.length && packages.length > 0) {
			throw new Error(
				`Failed to fetch VFS for all packages:\n${errors.map((e) => `- ${e.pkg.name}@${e.pkg.version}: ${e.error.message}`).join("\n")}`,
			);
		}

		return vfs;
	}

	/**
	 * Resolve an import specifier for a package
	 */
	async resolveImport(
		pkg: PackageSpec,
		importSpecifier: string,
	): Promise<{ filePath: string; isTypeDefinition: boolean }> {
		const program: Effect.Effect<
			{ filePath: string; isTypeDefinition: boolean },
			Error,
			CacheService | PackageFetcher | TypeResolver | FileSystem.FileSystem | HttpClient.HttpClient
		> = Effect.gen(function* () {
			const cache: CacheService = yield* CacheService;
			const resolver: TypeResolver = yield* TypeResolver;

			// Ensure package is cached
			const exists = yield* cache.exists(pkg);
			if (!exists) {
				throw new Error(`Package ${pkg.name}@${pkg.version} is not cached. Call fetchAndCache() first.`);
			}

			// Read package.json from cache
			const packageJsonContent = yield* cache.read(pkg, "package.json");
			const packageJson = JSON.parse(packageJsonContent) as PackageJson;

			// Resolve the import
			const resolved = yield* resolver.resolveImport(importSpecifier, packageJson, pkg);

			return {
				filePath: resolved.filePath,
				isTypeDefinition: resolved.isTypeDefinition,
			};
		});

		return this.runWithServices(program);
	}

	/**
	 * Get all type entry points for a package
	 */
	async getTypeEntries(pkg: PackageSpec): Promise<Array<{ filePath: string; isTypeDefinition: boolean }>> {
		const program: Effect.Effect<
			Array<{ filePath: string; isTypeDefinition: boolean }>,
			Error,
			CacheService | PackageFetcher | TypeResolver | FileSystem.FileSystem | HttpClient.HttpClient
		> = Effect.gen(function* () {
			const cache: CacheService = yield* CacheService;
			const resolver: TypeResolver = yield* TypeResolver;

			// Ensure package is cached
			const exists = yield* cache.exists(pkg);
			if (!exists) {
				throw new Error(`Package ${pkg.name}@${pkg.version} is not cached. Call fetchAndCache() first.`);
			}

			// Read package.json from cache
			const packageJsonContent = yield* cache.read(pkg, "package.json");
			const packageJson = JSON.parse(packageJsonContent) as PackageJson;

			// Get all type entries
			const entries = yield* resolver.resolveTypeEntries(packageJson, pkg);

			return entries.map((entry) => ({
				filePath: entry.filePath,
				isTypeDefinition: entry.isTypeDefinition,
			}));
		});

		return this.runWithServices(program);
	}

	/**
	 * Resolve a version reference (latest, ^1.0.0, etc) to a specific version.
	 * Useful for converting version ranges from package.json to exact versions.
	 *
	 * @param packageName - Package name (e.g., "zod")
	 * @param versionRef - Version reference (e.g., "latest", "^3.22.4", "3.22.4")
	 * @returns Promise resolving to exact version string (e.g., "3.23.8")
	 *
	 * @example
	 * ```typescript
	 * const version = await registry.resolveVersion("zod", "^3.22.4");
	 * console.log(version); // "3.23.8"
	 * ```
	 */
	async resolveVersion(packageName: string, versionRef: string): Promise<string> {
		const program: Effect.Effect<string, Error, PackageFetcher | FileSystem.FileSystem | HttpClient.HttpClient> =
			Effect.gen(this, function* () {
				const fetcher: PackageFetcher = yield* PackageFetcher;
				const resolved = yield* fetcher.resolveVersion(packageName, versionRef);

				// Emit version resolved event
				this.emitEvent({
					event: "package.version.resolved",
					level: "info",
					message: `Resolved ${packageName}@${versionRef} to ${resolved}`,
					timestamp: Date.now(),
					data: {
						package: packageName,
						requested: versionRef,
						resolved: resolved,
					},
				});

				return resolved;
			});

		return this.runWithServices(program);
	}

	/**
	 * Remove a package from cache
	 */
	async clearCache(pkg?: PackageSpec): Promise<void> {
		if (!pkg) {
			// TODO: Clear all cache
			throw new Error("Clearing all cache not yet implemented");
		}

		const program: Effect.Effect<void, Error, CacheService | FileSystem.FileSystem> = Effect.gen(function* () {
			const cache: CacheService = yield* CacheService;
			yield* cache.remove(pkg);
		});

		return this.runWithServices(program);
	}

	/**
	 * Create a TypeScript virtual environment cache for use with TypeScript language services.
	 * This cache can be passed to tools like Twoslash that accept a `Map<string, VirtualTypeScriptEnvironment>`.
	 *
	 * @param packages - Array of package specifications to include in the environment
	 * @param compilerOptions - TypeScript compiler options for the environment
	 * @returns Promise resolving to a Map keyed by compiler options hash
	 *
	 * @example
	 * ```typescript
	 * import { CompilerOptions } from "typescript";
	 *
	 * const registry = TypeRegistry.create();
	 * const compilerOptions: CompilerOptions = {
	 *   target: 99, // ESNext
	 *   module: 100, // ESNext
	 *   moduleResolution: 2, // Node
	 *   strict: false,
	 * };
	 *
	 * const cache = await registry.createTypeScriptCache(
	 *   [{ name: "zod", version: "3.23.8" }],
	 *   compilerOptions
	 * );
	 *
	 * // Pass to Twoslash transformer
	 * transformerTwoslash({ cache })
	 * ```
	 */
	async createTypeScriptCache(
		packages: PackageSpec[],
		compilerOptions: import("typescript").CompilerOptions,
	): Promise<Map<string, VirtualTypeScriptEnvironment>> {
		// Get VFS for all packages
		const vfs: VirtualFileSystem = await this.getVFS(packages, { autoFetch: true });

		// Add TypeScript lib files from node_modules
		const libMap = createDefaultMapFromNodeModules(compilerOptions, ts);
		for (const [path, content] of libMap) {
			vfs.set(path, content);
		}

		// Create FS-backed System that prioritizes VFS over real filesystem
		const sys = createFSBackedSystem(vfs, process.cwd(), ts);

		// Get root files from VFS (only .d.ts files, exclude package.json)
		const rootFiles = Array.from(vfs.keys()).filter(
			(path) => path.endsWith(".d.ts") || path.endsWith(".d.mts") || path.endsWith(".d.cts"),
		);

		// Create virtual TypeScript environment
		const tsEnv = createVirtualTypeScriptEnvironment(sys, rootFiles, ts, compilerOptions);

		// Create cache map keyed by compiler options hash
		// The hash is used by Twoslash to reuse environments with the same compiler options
		const cacheKey = JSON.stringify(compilerOptions);
		const cache = new Map<string, VirtualTypeScriptEnvironment>();
		cache.set(cacheKey, tsEnv);

		this.emitEvent({
			event: "typescript.cache.created",
			level: "info",
			message: `Created TypeScript environment cache with ${packages.length} package(s)`,
			timestamp: Date.now(),
			data: {
				packages: packages.map((p) => `${p.name}@${p.version}`),
				fileCount: vfs.size,
				rootFiles: rootFiles.length,
			},
		});

		return cache;
	}

	/**
	 * Helper to run Effect programs with all required services
	 */
	private runWithServices<A, E>(
		program: Effect.Effect<
			A,
			E,
			CacheService | PackageFetcher | TypeResolver | FileSystem.FileSystem | HttpClient.HttpClient
		>,
	): Promise<A> {
		const cacheLayer: Layer.Layer<CacheService> = this.options.cacheDir
			? makeCacheServiceLayer(this.options.cacheDir)
			: CacheServiceLive;

		const runnable = program.pipe(
			Effect.provide(cacheLayer),
			Effect.provide(NodeFileSystem.layer),
			Effect.provideServiceEffect(PackageFetcher, PackageFetcherLive),
			Effect.provideServiceEffect(TypeResolver, TypeResolverLive),
			Effect.provide(NodeHttpClient.layerUndici),
		);

		return Effect.runPromise(runnable);
	}
}
