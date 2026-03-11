/**
 * Core types for the type registry
 */

import type { LogEvent } from "./events.js";

/**
 * Virtual file system mapping file paths to their content
 */
export type VirtualFileSystem = Map<string, string>;

/**
 * Package specification with name and version
 */
export interface PackageSpec {
	/** Package name (e.g., `@effect/cli`) */
	name: string;
	/** Exact version (e.g., "0.73.0") */
	version: string;
	/** Optional registry URL (defaults to npm) */
	registry?: string;
}

/**
 * Configuration options for TypeRegistry
 */
export interface TypeRegistryOptions {
	/** Cache directory path (defaults to $XDG_CACHE_HOME/effect-type-registry or ~/.cache/effect-type-registry) */
	cacheDir?: string;
	/** Cache time-to-live in milliseconds (defaults to 7 days) */
	ttl?: number;
	/** CDN provider for fetching type files */
	cdnProvider?: "unpkg" | "jsdelivr";
	/** Custom npm registry URL */
	npmRegistry?: string;
	/** Log level for observability (defaults to "info") */
	logLevel?: "debug" | "info" | "warn" | "error" | "none";
	/** Maximum retry attempts for HTTP requests (defaults to 3) */
	maxRetries?: number;
	/** Request timeout in milliseconds (defaults to 30000) */
	requestTimeout?: number;
	/** Maximum concurrent package fetches (defaults to 5) */
	maxConcurrency?: number;
	/** Optional callback for receiving structured log events */
	onLogEvent?: (event: LogEvent) => void;
}

/**
 * Cache metadata for a package
 */
export interface CacheMetadata {
	/** Package version */
	version: string;
	/** Timestamp when cached */
	cachedAt: number;
	/** Optional time-to-live in milliseconds */
	ttl?: number;
}

/**
 * Package.json structure (minimal subset we need)
 */
export interface PackageJson {
	name: string;
	version: string;
	types?: string;
	typings?: string;
	main?: string;
	module?: string;
	exports?: Record<string, unknown> | string;
	typesVersions?: Record<string, Record<string, string[]>>;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

/**
 * Error types for the registry
 */
export type RegistryError =
	| { readonly _tag: "PackageNotFound"; readonly package: string; readonly version: string }
	| { readonly _tag: "NetworkError"; readonly message: string; readonly cause?: unknown }
	| { readonly _tag: "CacheError"; readonly message: string; readonly cause?: unknown }
	| { readonly _tag: "ParseError"; readonly message: string; readonly cause?: unknown }
	| { readonly _tag: "ResolutionError"; readonly message: string; readonly importPath: string };

/**
 * Subset of TypeScript CompilerOptions relevant for type resolution.
 *
 * This interface provides a stable, strongly-typed subset of TypeScript's
 * CompilerOptions that are commonly needed for Twoslash and type resolution.
 * Using numeric values for enum options ensures compatibility across TypeScript
 * versions (these values are stable).
 *
 * The interface includes an index signature to be compatible with TypeScript's
 * CompilerOptions interface, allowing it to be passed directly to TypeScript APIs.
 *
 * @example
 * ```ts
 * const options: TypeResolutionCompilerOptions = {
 *   target: 99,           // ESNext
 *   module: 99,           // ESNext
 *   moduleResolution: 100, // Bundler
 *   lib: ["ESNext", "DOM"],
 *   strict: false,
 *   skipLibCheck: true,
 * };
 * ```
 *
 * @remarks
 * Numeric values for `target`, `module`, `moduleResolution`, and `jsx`:
 * - target: 99 = ESNext, 9 = ES2022, 8 = ES2021, etc.
 * - module: 99 = ESNext, 100 = Node16, 199 = NodeNext, 1 = CommonJS
 * - moduleResolution: 100 = Bundler, 3 = Node16, 99 = NodeNext, 2 = Node
 * - jsx: 1 = Preserve, 2 = React, 4 = ReactJSX, 5 = ReactJSXDev
 */
export interface TypeResolutionCompilerOptions {
	/** Specify ECMAScript target version (e.g., 99 for ESNext) */
	target?: number;

	/** Specify what module code is generated (e.g., 99 for ESNext) */
	module?: number;

	/** Specify how TypeScript looks up a file from a given module specifier (e.g., 100 for Bundler) */
	moduleResolution?: number;

	/** Set of library files to include in the compilation (e.g., ["ESNext", "DOM"]) */
	lib?: string[];

	/** Enable all strict type-checking options */
	strict?: boolean;

	/** Skip type checking of declaration files */
	skipLibCheck?: boolean;

	/** Emit additional JavaScript to ease interop with CommonJS modules */
	esModuleInterop?: boolean;

	/** Allow default imports from modules with no default export */
	allowSyntheticDefaultImports?: boolean;

	/** Specify what JSX code is generated (e.g., 4 for ReactJSX) */
	jsx?: number;

	/** Type package names to be included without being referenced in a source file */
	types?: string[];
}
