/**
 * effect-type-registry
 *
 * Version-aware type definition registry for TypeScript documentation with Twoslash.
 * Built with Effect for robust error handling and composable async operations.
 *
 * @packageDocumentation
 */

// Re-export VirtualTypeScriptEnvironment for consumers (bundled via dtsBundledPackages)
export type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
// Registry events (Effect Schema)
export * from "./events.js";
export * from "./services/CacheService.js";
export * from "./services/TypeResolver.js";
export * from "./TypeRegistry.js";
export * from "./types.js";
export * from "./utils/xdg.js";
export * from "./VirtualPackage.js";
