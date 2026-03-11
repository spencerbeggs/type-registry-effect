/**
 * Cache service for managing disk-based type definition storage
 */

import * as Path from "node:path";
import { FileSystem } from "@effect/platform";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { CacheMetadata, PackageSpec, VirtualFileSystem } from "../types.js";
import { getDefaultCacheDir } from "../utils/xdg.js";

/**
 * Cache service interface
 */
export interface CacheService {
	/**
	 * Get the cache path for a package
	 */
	readonly getCachePath: (pkg: PackageSpec, filePath?: string) => string;

	/**
	 * Check if a package is cached
	 */
	readonly exists: (pkg: PackageSpec) => Effect.Effect<boolean, never, FileSystem.FileSystem>;

	/**
	 * Read a cached file
	 */
	readonly read: (pkg: PackageSpec, filePath: string) => Effect.Effect<string, Error, FileSystem.FileSystem>;

	/**
	 * Write a file to cache
	 */
	readonly write: (
		pkg: PackageSpec,
		filePath: string,
		content: string,
	) => Effect.Effect<void, Error, FileSystem.FileSystem>;

	/**
	 * List all files for a package
	 */
	readonly listFiles: (pkg: PackageSpec) => Effect.Effect<string[], Error, FileSystem.FileSystem>;

	/**
	 * Read package metadata
	 */
	readonly readMetadata: (pkg: PackageSpec) => Effect.Effect<CacheMetadata, Error, FileSystem.FileSystem>;

	/**
	 * Write package metadata
	 */
	readonly writeMetadata: (
		pkg: PackageSpec,
		metadata: CacheMetadata,
	) => Effect.Effect<void, Error, FileSystem.FileSystem>;

	/**
	 * Get VFS for a package from cache
	 */
	readonly getVFS: (pkg: PackageSpec) => Effect.Effect<VirtualFileSystem, Error, FileSystem.FileSystem>;

	/**
	 * Remove a package from cache
	 */
	readonly remove: (pkg: PackageSpec) => Effect.Effect<void, Error, FileSystem.FileSystem>;
}

/**
 * Cache service tag for dependency injection
 */
export const CacheService: Context.Tag<CacheService, CacheService> = Context.GenericTag<CacheService>(
	"effect-type-registry/CacheService",
);

/**
 * Implementation of CacheService
 */
class CacheServiceImpl implements CacheService {
	constructor(private readonly baseDir: string) {}

	getCachePath(pkg: PackageSpec, filePath?: string): string {
		const pkgPath = Path.join(this.baseDir, `${pkg.name}@${pkg.version}`);
		return filePath ? Path.join(pkgPath, filePath) : pkgPath;
	}

	exists(pkg: PackageSpec): Effect.Effect<boolean, never, FileSystem.FileSystem> {
		return Effect.gen(this, function* () {
			const fs = yield* FileSystem.FileSystem;
			const cachePath = Path.join(this.baseDir, `${pkg.name}@${pkg.version}`);
			const result = yield* fs.exists(cachePath);
			return result;
		}).pipe(Effect.catchAll(() => Effect.succeed(false)));
	}

	read(pkg: PackageSpec, filePath: string): Effect.Effect<string, Error, FileSystem.FileSystem> {
		return Effect.gen(this, function* () {
			const fs = yield* FileSystem.FileSystem;
			const fullPath = Path.join(this.baseDir, `${pkg.name}@${pkg.version}`, filePath);
			const content = yield* fs.readFileString(fullPath);
			return content;
		});
	}

	write(pkg: PackageSpec, filePath: string, content: string): Effect.Effect<void, Error, FileSystem.FileSystem> {
		return Effect.gen(this, function* () {
			const fs = yield* FileSystem.FileSystem;
			const fullPath = Path.join(this.baseDir, `${pkg.name}@${pkg.version}`, filePath);
			const dirPath = Path.dirname(fullPath);

			// Ensure directory exists
			yield* fs.makeDirectory(dirPath, { recursive: true });

			// Write file
			yield* fs.writeFileString(fullPath, content);
		});
	}

	listFiles(pkg: PackageSpec): Effect.Effect<string[], Error, FileSystem.FileSystem> {
		const baseDir = this.baseDir;
		return Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const cachePath = Path.join(baseDir, `${pkg.name}@${pkg.version}`);

			// Recursively list all files
			const files: string[] = [];

			const listRecursive = (dir: string): Effect.Effect<void, Error, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					const entries = yield* fs.readDirectory(dir);

					for (const entry of entries) {
						const fullPath = Path.join(dir, entry);
						const stat = yield* fs.stat(fullPath);

						if (stat.type === "Directory") {
							yield* listRecursive(fullPath);
						} else {
							const relativePath = Path.relative(cachePath, fullPath);
							files.push(relativePath);
						}
					}
				});

			yield* listRecursive(cachePath);
			return files;
		});
	}

	readMetadata(pkg: PackageSpec): Effect.Effect<CacheMetadata, Error, FileSystem.FileSystem> {
		return Effect.gen(this, function* () {
			const fs = yield* FileSystem.FileSystem;
			const metadataPath = Path.join(this.baseDir, `${pkg.name}@${pkg.version}`, ".metadata.json");
			const content = yield* fs.readFileString(metadataPath);
			return JSON.parse(content) as CacheMetadata;
		});
	}

	writeMetadata(pkg: PackageSpec, metadata: CacheMetadata): Effect.Effect<void, Error, FileSystem.FileSystem> {
		return Effect.gen(this, function* () {
			const fs = yield* FileSystem.FileSystem;
			const metadataPath = Path.join(this.baseDir, `${pkg.name}@${pkg.version}`, ".metadata.json");
			const dirPath = Path.dirname(metadataPath);

			// Ensure directory exists
			yield* fs.makeDirectory(dirPath, { recursive: true });

			// Write metadata
			yield* fs.writeFileString(metadataPath, JSON.stringify(metadata, null, 2));
		});
	}

	getVFS(pkg: PackageSpec): Effect.Effect<VirtualFileSystem, Error, FileSystem.FileSystem> {
		return Effect.gen(this, function* () {
			const files = yield* this.listFiles(pkg);
			const vfs = new Map<string, string>();

			for (const file of files) {
				if (file === ".metadata.json") continue; // Skip metadata

				const content = yield* this.read(pkg, file);
				// Store with node_modules prefix to match Twoslash expectations
				const vfsPath = Path.join("node_modules", pkg.name, file);
				vfs.set(vfsPath, content);
			}

			return vfs;
		});
	}

	remove(pkg: PackageSpec): Effect.Effect<void, Error, FileSystem.FileSystem> {
		return Effect.gen(this, function* () {
			const fs = yield* FileSystem.FileSystem;
			const cachePath = Path.join(this.baseDir, `${pkg.name}@${pkg.version}`);
			yield* fs.remove(cachePath, { recursive: true });
		});
	}
}

/**
 * Create a CacheService layer with the specified base directory
 * Defaults to XDG-compliant cache directory ($XDG_CACHE_HOME/effect-type-registry or ~/.cache/effect-type-registry)
 */
export const makeCacheServiceLayer = (baseDir?: string): Layer.Layer<CacheService> => {
	const cacheDir = baseDir ?? getDefaultCacheDir();

	return Layer.succeed(CacheService, new CacheServiceImpl(cacheDir));
};

/**
 * Default CacheService layer using default cache directory
 */
export const CacheServiceLive: Layer.Layer<CacheService> = makeCacheServiceLayer();
