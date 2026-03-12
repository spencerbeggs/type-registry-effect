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

export const makeNodeCacheLayer = (baseDir?: string): Layer.Layer<CacheService, never, FileSystem.FileSystem> =>
	Layer.effect(
		CacheService,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const cacheDir = baseDir ?? getDefaultCacheDir();

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
					const listRecursive = (dir: string): Effect.Effect<string[], CacheError, never> =>
						Effect.gen(function* () {
							const entries = yield* fs.readDirectory(dir).pipe(Effect.mapError(mapToCacheError("list", dir)));
							const files: string[] = [];
							for (const entry of entries) {
								const fullPath = Path.join(dir, entry);
								const stat = yield* fs.stat(fullPath).pipe(Effect.mapError(mapToCacheError("list", fullPath)));
								if (stat.type === "Directory") {
									const subFiles = yield* listRecursive(fullPath);
									files.push(...subFiles);
								} else {
									files.push(Path.relative(cachePath, fullPath));
								}
							}
							return files;
						});
					return listRecursive(cachePath);
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
						const listRecursive = (dir: string): Effect.Effect<string[], CacheError, never> =>
							Effect.gen(function* () {
								const entries = yield* fs.readDirectory(dir).pipe(Effect.mapError(mapToCacheError("list", dir)));
								const files: string[] = [];
								for (const entry of entries) {
									const fullPath = Path.join(dir, entry);
									const stat = yield* fs.stat(fullPath).pipe(Effect.mapError(mapToCacheError("list", fullPath)));
									if (stat.type === "Directory") {
										const subFiles = yield* listRecursive(fullPath);
										files.push(...subFiles);
									} else {
										files.push(Path.relative(cachePath, fullPath));
									}
								}
								return files;
							});

						const files = yield* listRecursive(cachePath);
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

export const CacheServiceLive: Layer.Layer<CacheService, never, FileSystem.FileSystem> = makeNodeCacheLayer();
