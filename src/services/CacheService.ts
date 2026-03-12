import type { Effect } from "effect";
import { Context } from "effect";
import type { CacheError } from "../errors/CacheError.js";
import type { CacheMetadata } from "../schemas/CacheMetadata.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";

/**
 * A `Map<string, string>` that maps virtual file paths to their contents.
 *
 * @remarks
 * Keys are prefixed with `node_modules/` so the map can be fed directly into
 * an in-memory TypeScript compiler host. Values are the UTF-8 file contents
 * (typically `.d.ts` declarations).
 *
 * @example
 * ```typescript
 * import type { VirtualFileSystem } from "type-registry-effect";
 *
 * const vfs: VirtualFileSystem = new Map([
 *   ["node_modules/lodash/index.d.ts", "declare module 'lodash' { ... }"],
 * ]);
 * ```
 *
 * @see {@link CacheService}
 *
 * @public
 */
export type VirtualFileSystem = Map<string, string>;

/**
 * Effect service interface for the disk-based type definition cache.
 *
 * @remarks
 * Implementations store type definition files and metadata on disk using a
 * platform-specific {@link @effect/platform#FileSystem | FileSystem} service.
 * Platform dependencies are resolved **within the layer**, so consumers of this
 * interface never interact with the filesystem directly.
 *
 * Use this tag to access cache methods inside an `Effect.gen` block. The live
 * implementation is provided by {@link CacheServiceLive} (or the lower-level
 * {@link makeNodeCacheLayer}).
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { CacheService } from "type-registry-effect";
 * import type { PackageSpec } from "type-registry-effect";
 *
 * const program = Effect.gen(function* () {
 *   const cache = yield* CacheService;
 *   const exists = yield* cache.exists({ name: "lodash", version: "4.17.21" } as PackageSpec);
 *   console.log("cached:", exists);
 * });
 * ```
 *
 * @see {@link CacheServiceLive}
 * @see {@link makeNodeCacheLayer}
 *
 * @public
 */
export interface CacheService {
	/** Check whether cached type definitions exist for a package. */
	readonly exists: (pkg: PackageSpec) => Effect.Effect<boolean, CacheError>;
	/** Read a single cached file by relative path within the package cache directory. */
	readonly read: (pkg: PackageSpec, filePath: string) => Effect.Effect<string, CacheError>;
	/** Write a single file into the package cache directory, creating parent directories as needed. */
	readonly write: (pkg: PackageSpec, filePath: string, content: string) => Effect.Effect<void, CacheError>;
	/** List all cached file paths (relative) for a package. */
	readonly listFiles: (pkg: PackageSpec) => Effect.Effect<ReadonlyArray<string>, CacheError>;
	/** Read the `.metadata.json` sidecar for a cached package. */
	readonly readMetadata: (pkg: PackageSpec) => Effect.Effect<CacheMetadata, CacheError>;
	/** Write or overwrite the `.metadata.json` sidecar for a cached package. */
	readonly writeMetadata: (pkg: PackageSpec, metadata: CacheMetadata) => Effect.Effect<void, CacheError>;
	/** Build a {@link VirtualFileSystem} from the cache, suitable for an in-memory TS compiler host. */
	readonly getVFS: (pkg: PackageSpec) => Effect.Effect<VirtualFileSystem, CacheError>;
	/** Remove all cached data for a package, including metadata. */
	readonly remove: (pkg: PackageSpec) => Effect.Effect<void, CacheError>;
}

/**
 * Effect Context tag for the {@link CacheService} service.
 *
 * @see {@link CacheServiceLive}
 * @see {@link makeNodeCacheLayer}
 */
export const CacheService = Context.GenericTag<CacheService>("type-registry-effect/CacheService");
