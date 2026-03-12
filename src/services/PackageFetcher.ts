import type { Effect } from "effect";
import { Context } from "effect";
import type { NetworkError } from "../errors/NetworkError.js";
import type { PackageNotFoundError } from "../errors/PackageNotFoundError.js";
import type { ParseError } from "../errors/ParseError.js";
import type { FileTreeResponse } from "../schemas/FileTree.js";
import type { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";

export interface PackageMetadata {
	readonly versions: string[];
	readonly tags: Record<string, string>;
}

export interface PackageFetcherShape {
	readonly getVersions: (name: string) => Effect.Effect<PackageMetadata, NetworkError | ParseError>;
	readonly resolveVersion: (name: string, ref: string) => Effect.Effect<string, NetworkError | PackageNotFoundError>;
	readonly getFileTree: (pkg: PackageSpec) => Effect.Effect<FileTreeResponse, NetworkError | ParseError>;
	readonly downloadFile: (pkg: PackageSpec, path: string) => Effect.Effect<string, NetworkError>;
	readonly getPackageJson: (pkg: PackageSpec) => Effect.Effect<PackageJson, NetworkError | ParseError>;
	readonly getTypeFiles: (pkg: PackageSpec) => Effect.Effect<Map<string, string>, NetworkError | ParseError>;
}

export class PackageFetcher extends Context.Tag("type-registry-effect/PackageFetcher")<
	PackageFetcher,
	PackageFetcherShape
>() {}

// Constants used by the layer implementation
export const JSDELIVR_DATA_API = "https://data.jsdelivr.com/v1";
export const JSDELIVR_CDN = "https://cdn.jsdelivr.net";
export const TYPE_FILE_PATTERN = /\.d\.([^.]+\.)?[cm]?ts$/i;

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
