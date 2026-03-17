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

export type { TypeRegistryError } from "./errors/index.js";
export {
	CacheError,
	CacheErrorBase,
	NetworkError,
	NetworkErrorBase,
	PackageNotFoundError,
	PackageNotFoundErrorBase,
	ParseError,
	ParseErrorBase,
	ResolutionError,
	ResolutionErrorBase,
	TimeoutError,
	TimeoutErrorBase,
} from "./errors/index.js";

// ── Services ────────────────────────────────────────────────────────────────

export { CacheService, type VirtualFileSystem } from "./services/CacheService.js";
export { PackageFetcher, type PackageMetadata } from "./services/PackageFetcher.js";
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

// ── Utilities ───────────────────────────────────────────────────────────────

export { getDefaultCacheDir } from "./utils/xdg.js";
