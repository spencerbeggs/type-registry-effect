/**
 * type-registry-effect/node — Node.js platform layer and Promise convenience API.
 *
 * @remarks
 * This entry point provides {@link NodeLayer}, a fully-closed Effect layer that
 * composes {@link TypeRegistryLive} with `NodeFileSystem` and `NodeHttpClient`
 * from `@effect/platform-node`. It also re-exports every {@link TypeRegistry}
 * namespace function as a plain `Promise`-returning wrapper so consumers who do
 * not use Effect directly can call `await fetchAndCache(pkg)` without managing
 * layers.
 *
 * Install the optional peer dependency before importing this entry point:
 *
 * ```bash
 * npm install @effect/platform-node
 * ```
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = TypeRegistry.getVFS([
 *   new PackageSpec({ name: "zod", version: "3.23.8" }),
 * ]);
 *
 * const vfs = await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @example
 * ```typescript
 * import { PackageSpec } from "type-registry-effect";
 * import { fetchAndCache, getVFS } from "type-registry-effect/node";
 *
 * const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
 * await fetchAndCache(pkg);
 * const vfs = await getVFS([pkg]);
 * ```
 *
 * @packageDocumentation
 */

// External types — re-exported here (not from main entry) because
// @typescript/vfs is an optional peer dependency
export type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
export { type CacheError, CacheErrorBase } from "./errors/CacheError.js";
export { type NetworkError, NetworkErrorBase } from "./errors/NetworkError.js";
export { type PackageNotFoundError, PackageNotFoundErrorBase } from "./errors/PackageNotFoundError.js";
export { type ParseError, ParseErrorBase } from "./errors/ParseError.js";
export { type ResolutionError, ResolutionErrorBase } from "./errors/ResolutionError.js";
export { type TimeoutError, TimeoutErrorBase } from "./errors/TimeoutError.js";
export {
	NodeLayer,
	createTypeScriptCache,
	fetchAndCache,
	getVFS,
	hasCached,
	resolveVersion,
} from "./platforms/node.js";

// Types referenced by service interfaces — needed for DTS bundling
export type { CacheMetadata } from "./schemas/CacheMetadata.js";
export type { FileTreeResponse } from "./schemas/FileTree.js";
export type { PackageJson } from "./schemas/PackageJson.js";
export { PackageSpec, PackageSpecBase } from "./schemas/PackageSpec.js";
export { type ResolvedModule, ResolvedModuleBase } from "./schemas/ResolvedModule.js";
export type { VirtualFileSystem } from "./services/CacheService.js";
export { CacheService } from "./services/CacheService.js";
export type { PackageMetadata } from "./services/PackageFetcher.js";
export { PackageFetcher } from "./services/PackageFetcher.js";
export { TypeResolver } from "./services/TypeResolver.js";
