/**
 * type-registry-effect — platform-agnostic entry point.
 *
 * Provides composable Effect programs for fetching, caching, and resolving
 * TypeScript type definitions from npm packages via the jsDelivr CDN.
 *
 * @remarks
 * This entry point contains only platform-agnostic code. It exports:
 *
 * - **Namespace modules** — {@link TypeRegistry} (composable programs) and
 *   {@link VirtualPackage} (synthetic packages from local declarations).
 * - **Schemas** — {@link PackageSpec}, {@link CacheMetadata},
 *   {@link ResolvedModule}, {@link PackageJson}, {@link FileTreeResponse}.
 * - **Errors** — {@link CacheError}, {@link NetworkError},
 *   {@link PackageNotFoundError}, {@link ParseError},
 *   {@link ResolutionError}, {@link TimeoutError}.
 * - **Services** — {@link CacheService}, {@link PackageFetcher},
 *   {@link TypeResolver}.
 * - **Layers** — {@link CacheServiceLive}, {@link PackageFetcherLive},
 *   {@link TypeResolverLive}, {@link TypeRegistryLive}.
 * - **Events** — {@link LogEventSchema}, {@link LogEvent}.
 *
 * For a Node.js convenience layer and Promise-returning wrappers, import
 * from `type-registry-effect/node` instead.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { TypeRegistry, PackageSpec, TypeRegistryLive } from "type-registry-effect";
 * import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
 *   yield* TypeRegistry.fetchAndCache(pkg);
 *   return yield* TypeRegistry.getVFS([pkg]);
 * });
 *
 * const vfs = await program.pipe(
 *   Effect.provide(TypeRegistryLive),
 *   Effect.provide(NodeFileSystem.layer),
 *   Effect.provide(NodeHttpClient.layerUndici),
 *   Effect.runPromise,
 * );
 * ```
 *
 * @packageDocumentation
 */

import type { CacheError } from "./errors/CacheError.js";
import type { NetworkError } from "./errors/NetworkError.js";
import type { PackageNotFoundError } from "./errors/PackageNotFoundError.js";
import type { ParseError } from "./errors/ParseError.js";
import type { ResolutionError } from "./errors/ResolutionError.js";
import type { TimeoutError } from "./errors/TimeoutError.js";

// ── Namespace re-exports ────────────────────────────────────────────────────

export * as TypeRegistry from "./TypeRegistry.js";
export * as VirtualPackage from "./VirtualPackage.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

export { CacheMetadata } from "./schemas/CacheMetadata.js";
export { FileTreeEntry, FileTreeResponse } from "./schemas/FileTree.js";
export { PackageJson } from "./schemas/PackageJson.js";
export { PackageSpec, PackageSpecBase } from "./schemas/PackageSpec.js";
export { ResolvedModule, ResolvedModuleBase } from "./schemas/ResolvedModule.js";

// ── Errors ──────────────────────────────────────────────────────────────────

export { CacheError, CacheErrorBase } from "./errors/CacheError.js";
export { NetworkError, NetworkErrorBase } from "./errors/NetworkError.js";
export { PackageNotFoundError, PackageNotFoundErrorBase } from "./errors/PackageNotFoundError.js";
export { ParseError, ParseErrorBase } from "./errors/ParseError.js";
export { ResolutionError, ResolutionErrorBase } from "./errors/ResolutionError.js";
export { TimeoutError, TimeoutErrorBase } from "./errors/TimeoutError.js";

/**
 * Union of all error types that can be raised by the type-registry-effect package.
 *
 * @remarks
 * `TypeRegistryError` is a discriminated union over the `_tag` field. Each
 * variant corresponds to a specific failure mode:
 *
 * - `"CacheError"` -- disk cache operations
 * - `"NetworkError"` -- HTTP requests to the CDN
 * - `"PackageNotFoundError"` -- missing packages or versions
 * - `"ParseError"` -- schema validation / JSON parsing
 * - `"ResolutionError"` -- import specifier resolution
 * - `"TimeoutError"` -- operation time limits
 *
 * Use `Effect.catchTags` to exhaustively handle all variants, or
 * `Effect.catchTag` for selective handling of individual error types.
 *
 * @public
 */
export type TypeRegistryError =
	| CacheError
	| NetworkError
	| PackageNotFoundError
	| ParseError
	| ResolutionError
	| TimeoutError;

// ── Services ────────────────────────────────────────────────────────────────

export { type CachePruneResult, CacheService, type VirtualFileSystem } from "./services/CacheService.js";
export { PackageFetcher, type PackageMetadata } from "./services/PackageFetcher.js";
export {
	RegistryEvent,
	TypeRegistryObserver,
	type TypeRegistryObserverShape,
	emitEvent,
	layerCallback,
	layerNoop,
} from "./services/TypeRegistryObserver.js";
export { TypeResolver } from "./services/TypeResolver.js";

// ── Layers ──────────────────────────────────────────────────────────────────

export { CacheServiceLive, makeNodeCacheLayer } from "./layers/CacheServiceLive.js";
export { PackageFetcherLive } from "./layers/PackageFetcherLive.js";
export { TypeRegistryLive } from "./layers/TypeRegistryLive.js";
export { TypeResolverLive } from "./layers/TypeResolverLive.js";

// ── Events ──────────────────────────────────────────────────────────────────

export type { LogEvent } from "./events.js";
export { LogEventSchema } from "./events.js";

// ── Metrics ─────────────────────────────────────────────────────────────────

export {
	batchDuration,
	cacheHits,
	cacheMisses,
	cacheStale,
	packageLoadDuration,
	packagesFailed,
	packagesLoaded,
} from "./metrics.js";
