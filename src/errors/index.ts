/**
 * Error types for the type-registry-effect package.
 *
 * @remarks
 * This module re-exports all error classes and their internal base constants.
 * Each error extends `Data.TaggedError` and can be matched with
 * `Effect.catchTag` using its `_tag` discriminant. The {@link TypeRegistryError}
 * union type covers all possible error cases.
 *
 * @packageDocumentation
 */

import type { CacheError } from "./CacheError.js";
import type { NetworkError } from "./NetworkError.js";
import type { PackageNotFoundError } from "./PackageNotFoundError.js";
import type { ParseError } from "./ParseError.js";
import type { ResolutionError } from "./ResolutionError.js";
import type { TimeoutError } from "./TimeoutError.js";

export { CacheError, CacheErrorBase } from "./CacheError.js";
export { NetworkError, NetworkErrorBase } from "./NetworkError.js";
export { PackageNotFoundError, PackageNotFoundErrorBase } from "./PackageNotFoundError.js";
export { ParseError, ParseErrorBase } from "./ParseError.js";
export { ResolutionError, ResolutionErrorBase } from "./ResolutionError.js";
export { TimeoutError, TimeoutErrorBase } from "./TimeoutError.js";

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
