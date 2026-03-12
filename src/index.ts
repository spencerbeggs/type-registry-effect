/**
 * effect-type-registry
 *
 * Version-aware type definition registry for TypeScript documentation with Twoslash.
 * Built with Effect for robust error handling and composable async operations.
 *
 * @packageDocumentation
 */

// ── Namespace re-exports ────────────────────────────────────────────────────

export * as TypeRegistry from "./TypeRegistry.js";
export * as VirtualPackage from "./VirtualPackage.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

export { CacheMetadata } from "./schemas/CacheMetadata.js";
export { FileTreeEntry, FileTreeResponse } from "./schemas/FileTree.js";
export { PackageJson } from "./schemas/PackageJson.js";
export { PackageSpec } from "./schemas/PackageSpec.js";
export { ResolvedModule } from "./schemas/ResolvedModule.js";

// ── Errors ──────────────────────────────────────────────────────────────────

export type { TypeRegistryError } from "./errors/index.js";
export {
	CacheError,
	NetworkError,
	PackageNotFoundError,
	ParseError,
	ResolutionError,
	TimeoutError,
} from "./errors/index.js";

// ── Services ────────────────────────────────────────────────────────────────

export { CacheService, type CacheServiceShape, type VirtualFileSystem } from "./services/CacheService.js";
export { PackageFetcher, type PackageFetcherShape } from "./services/PackageFetcher.js";
export { TypeResolver, type TypeResolverShape } from "./services/TypeResolver.js";

// ── Layers ──────────────────────────────────────────────────────────────────

export { CacheServiceLive, makeNodeCacheLayer } from "./layers/CacheServiceLive.js";
export { PackageFetcherLive } from "./layers/PackageFetcherLive.js";
export { TypeRegistryLive } from "./layers/TypeRegistryLive.js";
export { TypeResolverLive } from "./layers/TypeResolverLive.js";

// ── Events ──────────────────────────────────────────────────────────────────

export type { LogEvent, LogEventHandler } from "./events.js";
export { LogEventSchema, createLogEvent } from "./events.js";

// ── External types ──────────────────────────────────────────────────────────

export type { VirtualTypeScriptEnvironment } from "@typescript/vfs";

// ── Utilities ───────────────────────────────────────────────────────────────

export { getDefaultCacheDir } from "./utils/xdg.js";
