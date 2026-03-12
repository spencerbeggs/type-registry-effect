import type { FileSystem, HttpClient } from "@effect/platform";
import type { Layer } from "effect";
// Use a namespace import to access Layer.mergeAll without Effect.Layer
import { Layer as L } from "effect";
import type { CacheService } from "../services/CacheService.js";
import type { PackageFetcher } from "../services/PackageFetcher.js";
import type { TypeResolver } from "../services/TypeResolver.js";
import { CacheServiceLive } from "./CacheServiceLive.js";
import { PackageFetcherLive } from "./PackageFetcherLive.js";
import { TypeResolverLive } from "./TypeResolverLive.js";

/**
 * Composed layer providing {@link CacheService}, {@link PackageFetcher}, and
 * {@link TypeResolver} as a single unified layer.
 *
 * @remarks
 * This layer merges {@link CacheServiceLive}, {@link PackageFetcherLive}, and
 * {@link TypeResolverLive}. It still requires platform-specific
 * {@link @effect/platform#FileSystem | FileSystem} and
 * {@link @effect/platform#HttpClient | HttpClient} layers to be provided.
 * Use the Node.js platform layers to satisfy these requirements:
 *
 * @example
 * ```typescript
 * import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
 * import { Effect, Layer } from "effect";
 * import { TypeRegistryLive } from "type-registry-effect";
 *
 * const NodeLayer = Layer.mergeAll(NodeFileSystem.layer, NodeHttpClient.layer);
 * const MainLayer = Layer.provide(TypeRegistryLive, NodeLayer);
 *
 * const program = Effect.gen(function* () {
 *   // All three services are now available
 *   console.log("registry ready");
 * });
 *
 * Effect.runPromise(Effect.provide(program, MainLayer));
 * ```
 *
 * @see {@link CacheServiceLive}
 * @see {@link PackageFetcherLive}
 * @see {@link TypeResolverLive}
 *
 * @public
 */
export const TypeRegistryLive: Layer.Layer<
	CacheService | PackageFetcher | TypeResolver,
	never,
	FileSystem.FileSystem | HttpClient.HttpClient
> = L.mergeAll(CacheServiceLive, PackageFetcherLive, TypeResolverLive);
