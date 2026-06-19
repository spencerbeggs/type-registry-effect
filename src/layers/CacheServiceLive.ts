import { FileSystem, Path } from "@effect/platform";
import { Duration, Effect, Layer, Option, Schema } from "effect";
import { AppDirs, SqliteCache } from "xdg-effect";
import { CacheError } from "../errors/CacheError.js";
import { CacheMetadata } from "../schemas/CacheMetadata.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import type { CachePruneResult, VirtualFileSystem } from "../services/CacheService.js";
import { CacheService } from "../services/CacheService.js";

/**
 * Build the SQLite cache key for a package.
 *
 * @remarks
 * Keys are colon-delimited so they mirror the on-disk directory layout: scoped
 * packages become `@scope:name:version` (e.g. `@effect:schema:1.0.0`) and
 * unscoped packages become `name:version` (e.g. `xdg-effect:1.0.0`). See
 * {@link keyToPackage} for the inverse.
 *
 * @internal
 */
export const keyOf = (pkg: PackageSpec): string =>
	pkg.name.startsWith("@") ? `${pkg.name.replace("/", ":")}:${pkg.version}` : `${pkg.name}:${pkg.version}`;

/**
 * Parse a cache key back into a package `name`/`version` pair.
 *
 * @remarks
 * Inverse of {@link keyOf}. Scoped keys (leading `@`) have three colon segments;
 * unscoped keys have two. Returns `null` for keys that match neither shape.
 *
 * @internal
 */
export const keyToPackage = (key: string): { readonly name: string; readonly version: string } | null => {
	const parts = key.split(":");
	if (key.startsWith("@")) {
		if (parts.length !== 3) return null;
		return { name: `${parts[0]}/${parts[1]}`, version: parts[2] };
	}
	if (parts.length !== 2) return null;
	return { name: parts[0], version: parts[1] };
};

const mapToCacheError = (operation: CacheError["operation"], path: string) => (error: unknown) =>
	new CacheError({ operation, path, message: String(error) });

/**
 * Map an xdg-effect `SqliteCache` failure (which uses its own `CacheError`
 * shape) into this package's {@link CacheError}.
 */
const fromSqlite =
	(operation: CacheError["operation"], key: string) =>
	(error: { readonly reason: string }): CacheError =>
		new CacheError({ operation, path: key, message: error.reason });

/**
 * Build the {@link CacheService} implementation for a resolved cache directory.
 *
 * Files live on disk under `<cacheDir>/<name>/<version>/...`; per-package
 * metadata lives in the {@link SqliteCache} metadata store.
 */
const makeCacheService = (
	cacheDir: string,
): Effect.Effect<CacheService, never, FileSystem.FileSystem | SqliteCache | Path.Path> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const sqlite = yield* SqliteCache;
		const path = yield* Path.Path;

		const pkgDir = (pkg: PackageSpec): string => path.join(cacheDir, pkg.name, pkg.version);

		const listRecursive = (dir: string, relativeTo: string): Effect.Effect<string[], CacheError, never> =>
			Effect.gen(function* () {
				const entries = yield* fs.readDirectory(dir).pipe(Effect.mapError(mapToCacheError("list", dir)));
				const files: string[] = [];
				for (const entry of entries) {
					const fullPath = path.join(dir, entry);
					const stat = yield* fs.stat(fullPath).pipe(Effect.mapError(mapToCacheError("list", fullPath)));
					if (stat.type === "Directory") {
						files.push(...(yield* listRecursive(fullPath, relativeTo)));
					} else {
						files.push(path.relative(relativeTo, fullPath));
					}
				}
				return files;
			});

		const decodeMetadata = (key: string, value: Uint8Array): Effect.Effect<CacheMetadata, CacheError> =>
			Effect.try({
				try: () => JSON.parse(new TextDecoder().decode(value)) as unknown,
				catch: mapToCacheError("read", key),
			}).pipe(
				Effect.flatMap((parsed) =>
					Schema.decodeUnknown(CacheMetadata)(parsed).pipe(Effect.mapError(mapToCacheError("read", key))),
				),
			);

		return {
			exists: (pkg) => fs.exists(pkgDir(pkg)).pipe(Effect.catchAll(() => Effect.succeed(false))),

			read: (pkg, filePath) => {
				const fullPath = path.join(pkgDir(pkg), filePath);
				return fs.readFileString(fullPath).pipe(Effect.mapError(mapToCacheError("read", fullPath)));
			},

			write: (pkg, filePath, content) => {
				const fullPath = path.join(pkgDir(pkg), filePath);
				const dirPath = path.dirname(fullPath);
				return Effect.gen(function* () {
					yield* fs
						.makeDirectory(dirPath, { recursive: true })
						.pipe(Effect.mapError(mapToCacheError("write", dirPath)));
					yield* fs.writeFileString(fullPath, content).pipe(Effect.mapError(mapToCacheError("write", fullPath)));
				});
			},

			listFiles: (pkg) => {
				const cachePath = pkgDir(pkg);
				return listRecursive(cachePath, cachePath);
			},

			readMetadata: (pkg) => {
				const key = keyOf(pkg);
				return sqlite.get(key).pipe(
					Effect.mapError(fromSqlite("read", key)),
					Effect.flatMap(
						Option.match({
							onNone: () => Effect.succeed(Option.none<CacheMetadata>()),
							onSome: (entry) => decodeMetadata(key, entry.value).pipe(Effect.map(Option.some)),
						}),
					),
				);
			},

			writeMetadata: (pkg, metadata) => {
				const key = keyOf(pkg);
				return Effect.gen(function* () {
					const encoded = Schema.encodeSync(CacheMetadata)(metadata);
					const value = new TextEncoder().encode(JSON.stringify(encoded));
					yield* sqlite
						.set({
							key,
							value,
							contentType: "application/json",
							tags: [pkg.name],
							...(metadata.ttl !== undefined ? { ttl: Duration.millis(metadata.ttl) } : {}),
						})
						.pipe(Effect.mapError(fromSqlite("write", key)));
				});
			},

			getVFS: (pkg) =>
				Effect.gen(function* () {
					const cachePath = pkgDir(pkg);
					const files = yield* listRecursive(cachePath, cachePath);
					const vfs: VirtualFileSystem = new Map();
					for (const file of files) {
						const fullPath = path.join(cachePath, file);
						const content = yield* fs.readFileString(fullPath).pipe(Effect.mapError(mapToCacheError("read", fullPath)));
						const vfsPath = `node_modules/${pkg.name}/${file.replace(/\\/g, "/")}`;
						vfs.set(vfsPath, content);
					}
					return vfs;
				}),

			remove: (pkg) => {
				const key = keyOf(pkg);
				const cachePath = pkgDir(pkg);
				// Remove metadata first, then the on-disk files. We can't delete the
				// files via SqliteCache's transactional `onRemoved` callback because it
				// only fires when a metadata row actually matched — and files can
				// outlive their metadata (a TTL-expired entry is evicted on read,
				// leaving the files behind). Removing metadata first means a crash
				// between the two steps leaves harmless orphaned files (a later refetch
				// overwrites them) rather than a phantom cache hit. `force` makes
				// removing a non-existent directory a no-op.
				return Effect.gen(function* () {
					yield* sqlite.invalidate(key).pipe(Effect.mapError(fromSqlite("delete", key)));
					yield* fs
						.remove(cachePath, { recursive: true, force: true })
						.pipe(Effect.mapError(mapToCacheError("delete", cachePath)));
				});
			},

			prune: Effect.gen(function* () {
				// Bulk cleanup is intentionally best-effort, NOT transactional: file
				// removals are side effects outside the SQL transaction, so a mid-loop
				// rollback would restore all metadata while leaving earlier dirs already
				// deleted. We prune metadata, then delete each dir, ignoring per-dir
				// failures (an orphaned dir is harmless — a later refetch overwrites it).
				const result = yield* sqlite.prune().pipe(Effect.mapError(fromSqlite("delete", "")));
				const removed: Array<{ name: string; version: string }> = [];
				for (const key of result.keys) {
					const parsed = keyToPackage(key);
					if (parsed === null) continue;
					const dir = path.join(cacheDir, parsed.name, parsed.version);
					yield* fs.remove(dir, { recursive: true, force: true }).pipe(Effect.catchAll(() => Effect.void));
					removed.push({ name: parsed.name, version: parsed.version });
				}
				return { count: result.count, removed } satisfies CachePruneResult;
			}),
		};
	});

/**
 * Create a {@link CacheService} layer rooted at an explicit cache directory.
 *
 * @param baseDir - Absolute path used as the cache root. Files are stored under
 *   `<baseDir>/<name>/<version>/...`.
 * @returns A `Layer` providing {@link CacheService}, requiring
 *   {@link @effect/platform#FileSystem | FileSystem} and the xdg-effect
 *   {@link SqliteCache} (for metadata).
 *
 * @remarks
 * Use this when you want to control the cache location directly (for example in
 * tests, paired with `SqliteCache.Test()`). The default production layer,
 * {@link CacheServiceLive}, resolves the directory from the XDG cache home via
 * `AppDirs` instead.
 *
 * @see {@link CacheServiceLive}
 *
 * @public
 */
export const makeNodeCacheLayer = (
	baseDir: string,
): Layer.Layer<CacheService, never, FileSystem.FileSystem | SqliteCache | Path.Path> =>
	Layer.effect(CacheService, makeCacheService(baseDir));

/**
 * Default {@link CacheService} layer, rooted at the XDG cache directory for the
 * `type-registry-effect` namespace (resolved via xdg-effect's `AppDirs`).
 *
 * @remarks
 * Requires `AppDirs` (XDG path resolution), the xdg-effect {@link SqliteCache}
 * (metadata store), and a {@link @effect/platform#FileSystem | FileSystem}, all
 * provided at composition time. See `NodeLayer` in `"type-registry-effect/node"`
 * for the fully-wired Node.js layer.
 *
 * @see {@link makeNodeCacheLayer}
 *
 * @public
 */
export const CacheServiceLive: Layer.Layer<
	CacheService,
	never,
	FileSystem.FileSystem | SqliteCache | AppDirs | Path.Path
> = Layer.effect(
	CacheService,
	Effect.gen(function* () {
		const appDirs = yield* AppDirs;
		const cacheDir = yield* appDirs.cache.pipe(Effect.orDie);
		return yield* makeCacheService(cacheDir);
	}),
);
