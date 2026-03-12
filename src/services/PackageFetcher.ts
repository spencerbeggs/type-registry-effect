import type { Effect } from "effect";
import { Context } from "effect";
import type { NetworkError } from "../errors/NetworkError.js";
import type { PackageNotFoundError } from "../errors/PackageNotFoundError.js";
import type { ParseError } from "../errors/ParseError.js";
import type { FileTreeResponse } from "../schemas/FileTree.js";
import type { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";

/**
 * Version and tag metadata for an npm package as returned by the jsDelivr API.
 *
 * @remarks
 * The `versions` array contains every published version string. The `tags`
 * record maps dist-tags (e.g. `"latest"`, `"next"`) to their corresponding
 * version strings.
 *
 * @public
 */
export interface PackageMetadata {
	readonly versions: string[];
	readonly tags: Record<string, string>;
}

/**
 * Effect service interface for fetching type definitions and package metadata
 * from the jsDelivr CDN.
 *
 * @remarks
 * All network calls are retried up to 3 times with exponential back-off
 * (starting at 100 ms) and are subject to a 30-second timeout. The live
 * implementation is provided by {@link PackageFetcherLive}.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { PackageFetcher } from "type-registry-effect";
 *
 * const program = Effect.gen(function* () {
 *   const fetcher = yield* PackageFetcher;
 *   const meta = yield* fetcher.getVersions("lodash");
 *   console.log("latest:", meta.tags["latest"]);
 * });
 * ```
 *
 * @see {@link PackageFetcherLive}
 *
 * @public
 */
export interface PackageFetcher {
	/** Fetch all published versions and dist-tags for a package. */
	readonly getVersions: (name: string) => Effect.Effect<PackageMetadata, NetworkError | ParseError>;
	/** Resolve a semver range or dist-tag to a concrete version string. */
	readonly resolveVersion: (name: string, ref: string) => Effect.Effect<string, NetworkError | PackageNotFoundError>;
	/** Retrieve the flat file tree listing for a specific package version. */
	readonly getFileTree: (pkg: PackageSpec) => Effect.Effect<FileTreeResponse, NetworkError | ParseError>;
	/** Download a single file from the CDN by path. */
	readonly downloadFile: (pkg: PackageSpec, path: string) => Effect.Effect<string, NetworkError>;
	/** Download and schema-validate the `package.json` for a package version. */
	readonly getPackageJson: (pkg: PackageSpec) => Effect.Effect<PackageJson, NetworkError | ParseError>;
	/** Download all TypeScript declaration files for a package version, returned as a path-to-content map. */
	readonly getTypeFiles: (pkg: PackageSpec) => Effect.Effect<Map<string, string>, NetworkError | ParseError>;
}

/**
 * Effect Context tag for the {@link PackageFetcher} service.
 *
 * @see {@link PackageFetcherLive}
 */
export const PackageFetcher = Context.GenericTag<PackageFetcher>("type-registry-effect/PackageFetcher");

/**
 * Base URL for the jsDelivr data/metadata API.
 *
 * @public
 */
export const JSDELIVR_DATA_API = "https://data.jsdelivr.com/v1";

/**
 * Base URL for the jsDelivr file-serving CDN.
 *
 * @public
 */
export const JSDELIVR_CDN = "https://cdn.jsdelivr.net";

/**
 * Regular expression matching TypeScript declaration file names
 * (e.g. `.d.ts`, `.d.mts`, `.d.cts`).
 *
 * @public
 */
export const TYPE_FILE_PATTERN = /\.d\.([^.]+\.)?[cm]?ts$/i;

/**
 * Set of Node.js built-in module names (including sub-paths like `fs/promises`).
 *
 * @remarks
 * Used by {@link normalizeModuleName} to detect built-in specifiers so they
 * can be mapped to the `@types/node` package.
 *
 * @internal
 */
export const NODE_BUILTINS: Set<string> = new Set([
	"assert",
	"async_hooks",
	"buffer",
	"child_process",
	"cluster",
	"console",
	"constants",
	"crypto",
	"dgram",
	"diagnostics_channel",
	"dns",
	"domain",
	"events",
	"fs",
	"http",
	"http2",
	"https",
	"inspector",
	"module",
	"net",
	"os",
	"path",
	"perf_hooks",
	"process",
	"punycode",
	"querystring",
	"readline",
	"repl",
	"stream",
	"string_decoder",
	"timers",
	"tls",
	"trace_events",
	"tty",
	"url",
	"util",
	"v8",
	"vm",
	"wasi",
	"worker_threads",
	"zlib",
	"fs/promises",
	"stream/web",
	"stream/consumers",
	"timers/promises",
	"dns/promises",
]);

/**
 * Extracts the npm package name from an arbitrary module specifier.
 *
 * @remarks
 * - Specifiers beginning with `node:` or matching a {@link NODE_BUILTINS}
 *   entry are normalized to `"node"`.
 * - Scoped packages (`@scope/pkg/deep`) keep the scope and package name but
 *   strip deep-import segments.
 * - Bare specifiers (`lodash/fp`) keep only the first path segment.
 *
 * @param moduleSpecifier - The raw import specifier (e.g. `"node:fs"`,
 *   `"@effect/platform/HttpClient"`, `"lodash/fp"`).
 * @returns The normalized npm package name.
 *
 * @example
 * ```typescript
 * import { normalizeModuleName } from "type-registry-effect";
 *
 * normalizeModuleName("node:fs");              // "node"
 * normalizeModuleName("@effect/platform/Http"); // "@effect/platform"
 * normalizeModuleName("lodash/fp");             // "lodash"
 * ```
 *
 * @public
 */
export function normalizeModuleName(moduleSpecifier: string): string {
	if (moduleSpecifier.startsWith("node:")) return "node";
	if (NODE_BUILTINS.has(moduleSpecifier)) return "node";
	if (moduleSpecifier.startsWith("@")) {
		const parts = moduleSpecifier.split("/");
		if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
		return moduleSpecifier;
	}
	const firstSlash = moduleSpecifier.indexOf("/");
	if (firstSlash === -1) return moduleSpecifier;
	return moduleSpecifier.slice(0, firstSlash);
}
