import * as Path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import { CacheError } from "../errors/CacheError.js";
import { CacheMetadata } from "../schemas/CacheMetadata.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import type { VirtualFileSystem } from "../services/CacheService.js";
import { CacheService } from "../services/CacheService.js";
import { getDefaultCacheDir } from "../utils/xdg.js";

const pkgDir = (baseDir: string, pkg: PackageSpec): string => Path.join(baseDir, pkg.toString());

const mapToCacheError = (operation: "read" | "write" | "delete" | "list", path: string) => (error: unknown) =>
	new CacheError({ operation, path, message: String(error) });

/**
 * Creates a {@link CacheService} layer backed by the local filesystem.
 *
 * @param baseDir - Optional custom cache directory. When omitted the XDG
 *   cache directory is used (see {@link getDefaultCacheDir}).
 * @returns A `Layer` providing {@link CacheService} that requires
 *   {@link @effect/platform#FileSystem | FileSystem}.
 *
 * @example
 * ```typescript
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { Effect, Layer } from "effect";
 * import { CacheService, makeNodeCacheLayer } from "type-registry-effect";
 *
 * const CustomCache = makeNodeCacheLayer("/tmp/my-type-cache");
 * const MainLayer = Layer.provide(CustomCache, NodeFileSystem.layer);
 *
 * const program = Effect.gen(function* () {
 *   const cache = yield* CacheService;
 *   console.log("using custom cache dir");
 * });
 *
 * Effect.runPromise(Effect.provide(program, MainLayer));
 * ```
 *
 * @see {@link CacheService}
 * @see {@link getDefaultCacheDir}
 *
 * @public
 */
export const makeNodeCacheLayer = (baseDir?: string): Layer.Layer<CacheService, never, FileSystem.FileSystem> =>
	Layer.effect(
		CacheService,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const cacheDir = baseDir ?? getDefaultCacheDir();

			const listRecursive = (dir: string, relativeTo: string): Effect.Effect<string[], CacheError, never> =>
				Effect.gen(function* () {
					const entries = yield* fs.readDirectory(dir).pipe(Effect.mapError(mapToCacheError("list", dir)));
					const files: string[] = [];
					for (const entry of entries) {
						const fullPath = Path.join(dir, entry);
						const stat = yield* fs.stat(fullPath).pipe(Effect.mapError(mapToCacheError("list", fullPath)));
						if (stat.type === "Directory") {
							files.push(...(yield* listRecursive(fullPath, relativeTo)));
						} else {
							files.push(Path.relative(relativeTo, fullPath));
						}
					}
					return files;
				});

			return {
				exists: (pkg) => fs.exists(pkgDir(cacheDir, pkg)).pipe(Effect.catchAll(() => Effect.succeed(false))),

				read: (pkg, filePath) => {
					const fullPath = Path.join(pkgDir(cacheDir, pkg), filePath);
					return fs.readFileString(fullPath).pipe(Effect.mapError(mapToCacheError("read", fullPath)));
				},

				write: (pkg, filePath, content) => {
					const fullPath = Path.join(pkgDir(cacheDir, pkg), filePath);
					const dirPath = Path.dirname(fullPath);
					return Effect.gen(function* () {
						yield* fs
							.makeDirectory(dirPath, { recursive: true })
							.pipe(Effect.mapError(mapToCacheError("write", dirPath)));
						yield* fs.writeFileString(fullPath, content).pipe(Effect.mapError(mapToCacheError("write", fullPath)));
					});
				},

				listFiles: (pkg) => {
					const cachePath = pkgDir(cacheDir, pkg);
					return listRecursive(cachePath, cachePath);
				},

				readMetadata: (pkg) => {
					const metaPath = Path.join(pkgDir(cacheDir, pkg), ".metadata.json");
					return fs.readFileString(metaPath).pipe(
						Effect.mapError(mapToCacheError("read", metaPath)),
						Effect.flatMap((content) =>
							Schema.decodeUnknown(CacheMetadata)(JSON.parse(content)).pipe(
								Effect.mapError(mapToCacheError("read", metaPath)),
							),
						),
					);
				},

				writeMetadata: (pkg, metadata) => {
					const metaPath = Path.join(pkgDir(cacheDir, pkg), ".metadata.json");
					const dirPath = Path.dirname(metaPath);
					return Effect.gen(function* () {
						yield* fs
							.makeDirectory(dirPath, { recursive: true })
							.pipe(Effect.mapError(mapToCacheError("write", dirPath)));
						const encoded = Schema.encodeSync(CacheMetadata)(metadata);
						yield* fs
							.writeFileString(metaPath, JSON.stringify(encoded, null, 2))
							.pipe(Effect.mapError(mapToCacheError("write", metaPath)));
					});
				},

				getVFS: (pkg) =>
					Effect.gen(function* () {
						const cachePath = pkgDir(cacheDir, pkg);
						const files = yield* listRecursive(cachePath, cachePath);
						const vfs: VirtualFileSystem = new Map();
						for (const file of files) {
							if (file === ".metadata.json") continue;
							const fullPath = Path.join(cachePath, file);
							const content = yield* fs
								.readFileString(fullPath)
								.pipe(Effect.mapError(mapToCacheError("read", fullPath)));
							const vfsPath = Path.join("node_modules", pkg.name, file);
							vfs.set(vfsPath, content);
						}
						return vfs;
					}),

				remove: (pkg) => {
					const cachePath = pkgDir(cacheDir, pkg);
					return fs.remove(cachePath, { recursive: true }).pipe(Effect.mapError(mapToCacheError("delete", cachePath)));
				},
			};
		}),
	);

/**
 * Default {@link CacheService} layer using the XDG cache directory.
 *
 * @remarks
 * This is equivalent to calling {@link makeNodeCacheLayer} with no arguments.
 * Requires a {@link @effect/platform#FileSystem | FileSystem} layer to be
 * provided at composition time.
 *
 * @see {@link makeNodeCacheLayer}
 *
 * @public
 */
export const CacheServiceLive: Layer.Layer<CacheService, never, FileSystem.FileSystem> = makeNodeCacheLayer();
