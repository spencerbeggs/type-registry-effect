/**
 * Package fetcher service for downloading type definitions from npm
 */

import { HttpClient } from "@effect/platform";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import type { PackageJson, PackageSpec } from "../types.js";

/**
 * Package metadata from jsDelivr
 *
 * @public
 */
export interface PackageMetadata {
	readonly versions: string[];
	readonly tags: Record<string, string>;
}

/**
 * File tree entry from jsDelivr
 */
interface FileTreeEntry {
	readonly name: string;
	readonly hash: string;
	readonly time: string;
	readonly size: number;
}

/**
 * File tree response from jsDelivr
 *
 * @public
 */
export interface FileTreeResponse {
	readonly default: string; // default file path
	readonly files: FileTreeEntry[];
}

/**
 * Version resolution response from jsDelivr
 */
interface VersionResolveResponse {
	readonly version: string;
}

/**
 * PackageFetcher service interface
 */
export interface PackageFetcher {
	/**
	 * Get all available versions for a package
	 */
	readonly getVersions: (packageName: string) => Effect.Effect<PackageMetadata, Error, HttpClient.HttpClient>;

	/**
	 * Resolve a version reference (latest, ^1.0.0, etc) to a specific version
	 */
	readonly resolveVersion: (
		packageName: string,
		versionRef: string,
	) => Effect.Effect<string, Error, HttpClient.HttpClient>;

	/**
	 * Get file tree for a package version
	 */
	readonly getFileTree: (pkg: PackageSpec) => Effect.Effect<FileTreeResponse, Error, HttpClient.HttpClient>;

	/**
	 * Download a file from a package
	 */
	readonly downloadFile: (pkg: PackageSpec, filePath: string) => Effect.Effect<string, Error, HttpClient.HttpClient>;

	/**
	 * Get package.json for a package
	 */
	readonly getPackageJson: (pkg: PackageSpec) => Effect.Effect<PackageJson, Error, HttpClient.HttpClient>;

	/**
	 * Get all type definition files for a package
	 */
	readonly getTypeFiles: (pkg: PackageSpec) => Effect.Effect<Map<string, string>, Error, HttpClient.HttpClient>;
}

/**
 * PackageFetcher service tag for dependency injection
 */
export const PackageFetcher: Context.Tag<PackageFetcher, PackageFetcher> = Context.GenericTag<PackageFetcher>(
	"effect-type-registry/PackageFetcher",
);

/**
 * jsDelivr CDN URLs
 */
const JSDELIVR_DATA_API = "https://data.jsdelivr.com/v1";
const JSDELIVR_CDN = "https://cdn.jsdelivr.net";

/**
 * Type definition file pattern
 */
const TYPE_FILE_PATTERN = /\.d\.([^.]+\.)?[cm]?ts$/i;

/**
 * Built-in Node.js modules that don't need fetching
 */
const NODE_BUILTINS: Set<string> = new Set([
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
	// With subpaths
	"fs/promises",
	"stream/web",
	"stream/consumers",
	"timers/promises",
	"dns/promises",
]);

/**
 * Normalize module name (handle scoped packages, node: prefix, subpaths)
 */
export function normalizeModuleName(moduleSpecifier: string): string {
	// Handle node: protocol
	if (moduleSpecifier.startsWith("node:")) {
		return "node";
	}

	// Check if it's a built-in Node module
	if (NODE_BUILTINS.has(moduleSpecifier)) {
		return "node";
	}

	// Handle scoped packages (@scope/package/subpath -> @scope/package)
	if (moduleSpecifier.startsWith("@")) {
		const parts = moduleSpecifier.split("/");
		if (parts.length >= 2) {
			return `${parts[0]}/${parts[1]}`;
		}
		return moduleSpecifier;
	}

	// Handle regular packages (package/subpath -> package)
	const firstSlash = moduleSpecifier.indexOf("/");
	if (firstSlash === -1) {
		return moduleSpecifier;
	}

	return moduleSpecifier.slice(0, firstSlash);
}

/**
 * Default retry schedule: exponential backoff with 3 retries
 * (100ms, 200ms, 400ms)
 */
const defaultRetrySchedule: Schedule.Schedule<number, unknown, never> = Schedule.exponential(Duration.millis(100)).pipe(
	Schedule.compose(Schedule.recurs(3)),
);

/**
 * Default request timeout: 30 seconds
 */
const defaultTimeout: Duration.Duration = Duration.seconds(30);

/**
 * Implementation of PackageFetcher
 */
class PackageFetcherImpl implements PackageFetcher {
	getVersions(packageName: string): Effect.Effect<PackageMetadata, Error, HttpClient.HttpClient> {
		return Effect.gen(this, function* () {
			const http = yield* HttpClient.HttpClient;
			const url = `${JSDELIVR_DATA_API}/package/npm/${packageName}`;

			const response = yield* http.get(url).pipe(
				Effect.flatMap((res) => res.json),
				Effect.timeout(defaultTimeout),
				Effect.retry(defaultRetrySchedule),
				Effect.catchAll((error) =>
					Effect.fail(new Error(`Failed to fetch package metadata for ${packageName}: ${String(error)}`)),
				),
			);

			return response as PackageMetadata;
		});
	}

	resolveVersion(packageName: string, versionRef: string): Effect.Effect<string, Error, HttpClient.HttpClient> {
		return Effect.gen(this, function* () {
			const http = yield* HttpClient.HttpClient;
			const url = `${JSDELIVR_DATA_API}/package/resolve/npm/${packageName}@${versionRef}`;

			const response = yield* http.get(url).pipe(
				Effect.flatMap((res) => res.json),
				Effect.timeout(defaultTimeout),
				Effect.retry(defaultRetrySchedule),
				Effect.catchAll((error) =>
					Effect.fail(new Error(`Failed to resolve version ${versionRef} for ${packageName}: ${String(error)}`)),
				),
			);

			const data = response as VersionResolveResponse;
			return data.version;
		});
	}

	getFileTree(pkg: PackageSpec): Effect.Effect<FileTreeResponse, Error, HttpClient.HttpClient> {
		return Effect.gen(this, function* () {
			const http = yield* HttpClient.HttpClient;
			const url = `${JSDELIVR_DATA_API}/package/npm/${pkg.name}@${pkg.version}/flat`;

			const response = yield* http.get(url).pipe(
				Effect.flatMap((res) => res.json),
				Effect.timeout(defaultTimeout),
				Effect.retry(defaultRetrySchedule),
				Effect.catchAll((error) =>
					Effect.fail(new Error(`Failed to fetch file tree for ${pkg.name}@${pkg.version}: ${String(error)}`)),
				),
			);

			// Validate response structure
			if (!response || typeof response !== "object" || !Array.isArray((response as FileTreeResponse).files)) {
				yield* Effect.fail(
					new Error(
						`Invalid response from jsDelivr for ${pkg.name}@${pkg.version}: ` +
							`expected FileTreeResponse with files array, got ${JSON.stringify(response)}`,
					),
				);
			}

			return response as FileTreeResponse;
		});
	}

	downloadFile(pkg: PackageSpec, filePath: string): Effect.Effect<string, Error, HttpClient.HttpClient> {
		return Effect.gen(this, function* () {
			const http = yield* HttpClient.HttpClient;
			// Ensure filePath starts with /
			const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
			const url = `${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}${normalizedPath}`;

			const response = yield* http.get(url).pipe(
				Effect.flatMap((res) => res.text),
				Effect.timeout(defaultTimeout),
				Effect.retry(defaultRetrySchedule),
				Effect.catchAll((error) =>
					Effect.fail(
						new Error(`Failed to download file ${filePath} from ${pkg.name}@${pkg.version}: ${String(error)}`),
					),
				),
			);

			return response;
		});
	}

	getPackageJson(pkg: PackageSpec): Effect.Effect<PackageJson, Error, HttpClient.HttpClient> {
		return Effect.gen(this, function* () {
			const content = yield* this.downloadFile(pkg, "/package.json");
			const packageJson = JSON.parse(content) as PackageJson;
			return packageJson;
		});
	}

	getTypeFiles(pkg: PackageSpec): Effect.Effect<Map<string, string>, Error, HttpClient.HttpClient> {
		return Effect.gen(this, function* () {
			// Get file tree
			const fileTree = yield* this.getFileTree(pkg);

			// Filter for type definition files
			const typeFiles = fileTree.files.filter((file) => TYPE_FILE_PATTERN.test(file.name));

			// Download all type files
			const vfs = new Map<string, string>();

			for (const file of typeFiles) {
				const content = yield* this.downloadFile(pkg, file.name);
				vfs.set(file.name, content);
			}

			// Also get package.json if not already included
			const hasPackageJson = fileTree.files.some((file) => file.name === "/package.json");
			if (!hasPackageJson) {
				const packageJson = yield* this.downloadFile(pkg, "/package.json");
				vfs.set("/package.json", packageJson);
			}

			return vfs;
		});
	}
}

/**
 * Default PackageFetcher layer
 */
export const PackageFetcherLive: Effect.Effect<PackageFetcher, never, HttpClient.HttpClient> = Effect.gen(function* () {
	// Ensure HttpClient is available
	yield* HttpClient.HttpClient;

	return new PackageFetcherImpl();
}).pipe(Effect.map((impl) => impl as PackageFetcher));
