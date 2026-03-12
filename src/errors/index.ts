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

export type TypeRegistryError =
	| CacheError
	| NetworkError
	| PackageNotFoundError
	| ParseError
	| ResolutionError
	| TimeoutError;
