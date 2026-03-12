/**
 * Node.js platform layer and Promise convenience API for TypeRegistry.
 */

import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import {
	createDefaultMapFromNodeModules,
	createFSBackedSystem,
	createVirtualTypeScriptEnvironment,
} from "@typescript/vfs";
import { Effect, Layer } from "effect";
import * as ts from "typescript";
import { TypeRegistryLive } from "../layers/TypeRegistryLive.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import type { VirtualFileSystem } from "../services/CacheService.js";
import * as TypeRegistry from "../TypeRegistry.js";

/**
 * Node.js platform layer that provides FileSystem and HttpClient,
 * composed with all TypeRegistry service layers.
 */
export const NodeLayer = TypeRegistryLive.pipe(
	Layer.provide(NodeFileSystem.layer),
	Layer.provide(NodeHttpClient.layerUndici),
);

// ── Promise convenience API ─────────────────────────────────────────────────

const runWithNodeLayer = <A, E>(effect: Effect.Effect<A, E, Layer.Layer.Success<typeof NodeLayer>>): Promise<A> =>
	Effect.runPromise(Effect.provide(effect, NodeLayer));

/**
 * Check if a package is cached (Promise API).
 */
export const hasCached = (pkg: PackageSpec): Promise<boolean> => runWithNodeLayer(TypeRegistry.hasCached(pkg));

/**
 * Fetch and cache a package's type definitions (Promise API).
 */
export const fetchAndCache = (pkg: PackageSpec, options?: { readonly ttl?: number }): Promise<void> =>
	runWithNodeLayer(TypeRegistry.fetchAndCache(pkg, options));

/**
 * Get combined VFS for multiple packages (Promise API).
 */
export const getVFS = (
	packages: ReadonlyArray<PackageSpec>,
	options?: { readonly autoFetch?: boolean; readonly ttl?: number },
): Promise<VirtualFileSystem> => runWithNodeLayer(TypeRegistry.getVFS(packages, options));

/**
 * Resolve a version reference to a specific version (Promise API).
 */
export const resolveVersion = (name: string, ref: string): Promise<string> =>
	runWithNodeLayer(TypeRegistry.resolveVersion(name, ref));

/**
 * Create a TypeScript virtual environment cache for use with Twoslash
 * or other TypeScript language service consumers (Promise API).
 */
export const createTypeScriptCache = async (
	packages: ReadonlyArray<PackageSpec>,
	compilerOptions: ts.CompilerOptions,
): Promise<Map<string, VirtualTypeScriptEnvironment>> => {
	const vfs = await getVFS(packages, { autoFetch: true });

	// Add TypeScript lib files from node_modules
	const libMap = createDefaultMapFromNodeModules(compilerOptions, ts);
	for (const [path, content] of libMap) {
		vfs.set(path, content);
	}

	// Create FS-backed system that prioritises VFS over real filesystem
	const sys = createFSBackedSystem(vfs, process.cwd(), ts);

	// Root files are declaration files in the VFS
	const rootFiles = Array.from(vfs.keys()).filter(
		(path) => path.endsWith(".d.ts") || path.endsWith(".d.mts") || path.endsWith(".d.cts"),
	);

	const tsEnv = createVirtualTypeScriptEnvironment(sys, rootFiles, ts, compilerOptions);

	const cacheKey = JSON.stringify(compilerOptions);
	const cache = new Map<string, VirtualTypeScriptEnvironment>();
	cache.set(cacheKey, tsEnv);

	return cache;
};
