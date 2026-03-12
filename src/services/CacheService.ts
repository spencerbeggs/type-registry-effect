import type { Effect } from "effect";
import { Context } from "effect";
import type { CacheError } from "../errors/CacheError.js";
import type { CacheMetadata } from "../schemas/CacheMetadata.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";

/** Virtual file system mapping file paths to content */
export type VirtualFileSystem = Map<string, string>;

/**
 * Cache service for managing disk-based type definition storage.
 * Platform dependencies (FileSystem) are resolved within the layer,
 * not exposed in the interface.
 */
export interface CacheServiceShape {
	readonly exists: (pkg: PackageSpec) => Effect.Effect<boolean, CacheError>;
	readonly read: (pkg: PackageSpec, filePath: string) => Effect.Effect<string, CacheError>;
	readonly write: (pkg: PackageSpec, filePath: string, content: string) => Effect.Effect<void, CacheError>;
	readonly listFiles: (pkg: PackageSpec) => Effect.Effect<ReadonlyArray<string>, CacheError>;
	readonly readMetadata: (pkg: PackageSpec) => Effect.Effect<CacheMetadata, CacheError>;
	readonly writeMetadata: (pkg: PackageSpec, metadata: CacheMetadata) => Effect.Effect<void, CacheError>;
	readonly getVFS: (pkg: PackageSpec) => Effect.Effect<VirtualFileSystem, CacheError>;
	readonly remove: (pkg: PackageSpec) => Effect.Effect<void, CacheError>;
}

export class CacheService extends Context.Tag("type-registry-effect/CacheService")<CacheService, CacheServiceShape>() {}
