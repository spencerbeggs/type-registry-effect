/**
 * Unit tests for TypeRegistry with mocked HTTP client
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NetworkError } from "../src/errors/NetworkError.js";
import { makeNodeCacheLayer } from "../src/layers/CacheServiceLive.js";
import { TypeResolverLive } from "../src/layers/TypeResolverLive.js";
import { CacheMetadata } from "../src/schemas/CacheMetadata.js";
import type { PackageJson } from "../src/schemas/PackageJson.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import type { VirtualFileSystem } from "../src/services/CacheService.js";
import { CacheService } from "../src/services/CacheService.js";
import { PackageFetcher } from "../src/services/PackageFetcher.js";
import { TypeResolver } from "../src/services/TypeResolver.js";

/**
 * Get fixture directory path for a package
 */
function getFixturePath(packageName: string): string {
	return Path.join(import.meta.dirname, "fixtures", packageName);
}

/**
 * Get all files recursively from a directory
 */
function getAllFiles(dir: string, baseDir: string = dir): string[] {
	const files: string[] = [];
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = Path.join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			files.push(...getAllFiles(fullPath, baseDir));
		} else {
			const relativePath = Path.relative(baseDir, fullPath);
			files.push(`/${relativePath.replace(/\\/g, "/")}`);
		}
	}

	return files;
}

/**
 * Mock PackageFetcher layer using fixtures
 */
const MockPackageFetcherLayer: Layer.Layer<PackageFetcher> = Layer.succeed(PackageFetcher, {
	getVersions: (name) =>
		Effect.try({
			try: () => {
				const fixturePath = getFixturePath(name);
				const packageJson = JSON.parse(readFileSync(Path.join(fixturePath, "package.json"), "utf-8"));
				return {
					versions: [packageJson.version as string],
					tags: { latest: packageJson.version as string },
				};
			},
			catch: (e) => new NetworkError({ url: `fixture/${name}`, message: String(e) }),
		}),

	resolveVersion: (_name, ref) => Effect.succeed(ref),

	getFileTree: (pkg) =>
		Effect.try({
			try: () => {
				const fixturePath = getFixturePath(pkg.name);
				const files = getAllFiles(fixturePath);
				return {
					default: "/package.json",
					files: files.map((filePath) => ({
						name: filePath,
						hash: "mock-hash",
						time: "2024-01-01T00:00:00.000Z",
						size: 0,
					})),
				};
			},
			catch: (e) => new NetworkError({ url: `fixture/${pkg.name}`, message: String(e) }),
		}),

	downloadFile: (_pkg, _path) => Effect.succeed(""),

	getPackageJson: (pkg) =>
		Effect.try({
			try: () => {
				const fixturePath = getFixturePath(pkg.name);
				return JSON.parse(readFileSync(Path.join(fixturePath, "package.json"), "utf-8")) as PackageJson;
			},
			catch: (e) => new NetworkError({ url: `fixture/${pkg.name}`, message: String(e) }),
		}),

	getTypeFiles: (pkg) =>
		Effect.try({
			try: () => {
				const fixturePath = getFixturePath(pkg.name);
				const files = getAllFiles(fixturePath);
				const typeFiles = new Map<string, string>();
				const typeFilePattern = /\.d\.([^.]+\.)?[cm]?ts$/i;

				for (const file of files) {
					if (typeFilePattern.test(file) || file.endsWith("package.json")) {
						const normalizedPath = file.startsWith("/") ? file.slice(1) : file;
						typeFiles.set(file, readFileSync(Path.join(fixturePath, normalizedPath), "utf-8"));
					}
				}

				return typeFiles;
			},
			catch: (e) => new NetworkError({ url: `fixture/${pkg.name}`, message: String(e) }),
		}),
});

/**
 * Helper to run Effect programs with mocked services
 */
function runWithMockServices<A, E>(
	program: Effect.Effect<A, E, CacheService | PackageFetcher | TypeResolver>,
	cacheDir: string,
): Promise<A> {
	const testLayer = Layer.mergeAll(
		makeNodeCacheLayer(cacheDir).pipe(Layer.provide(NodeFileSystem.layer)),
		MockPackageFetcherLayer,
		TypeResolverLive,
	);
	return Effect.runPromise(Effect.provide(program, testLayer));
}

describe("TypeRegistry (Unit Tests with Mocks)", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(Path.join(tmpdir(), "registry-unit-test-"));
	});

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("fetchAndCache", () => {
		it("should fetch and cache a package", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;

				// Fetch package.json
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);

				// Fetch type files
				const typeFiles: Map<string, string> = yield* fetcher.getTypeFiles(pkg);

				// Write to cache
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				for (const [filePath, content] of typeFiles) {
					const normalizedPath = filePath.replace(/^\//, "");
					if (normalizedPath !== "package.json") {
						yield* cache.write(pkg, normalizedPath, content);
					}
				}

				// Write metadata
				const metadata = new CacheMetadata({
					cachedAt: Date.now(),
					version: pkg.version,
				});
				yield* cache.writeMetadata(pkg, metadata);

				// Verify it exists
				return yield* cache.exists(pkg);
			});

			const result = await runWithMockServices(program, tempDir);
			expect(result).toBe(true);
		});

		it("should not re-fetch if already cached and not stale", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
			const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;

				// First fetch
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				const metadata = new CacheMetadata({
					cachedAt: Date.now(),
					version: pkg.version,
					ttl,
				});
				yield* cache.writeMetadata(pkg, metadata);

				// Check if cached
				const exists = yield* cache.exists(pkg);
				const cachedMetadata = yield* cache.readMetadata(pkg);
				const age = Date.now() - cachedMetadata.cachedAt;

				return { exists, isStale: cachedMetadata.ttl !== undefined && age >= cachedMetadata.ttl };
			});

			const result = await runWithMockServices(program, tempDir);
			expect(result.exists).toBe(true);
			expect(result.isStale).toBe(false);
		});
	});

	describe("getPackageVFS", () => {
		it("should return VFS with node_modules prefix", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;

				// Fetch and cache
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				const typeFiles: Map<string, string> = yield* fetcher.getTypeFiles(pkg);

				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				for (const [filePath, content] of typeFiles) {
					const normalizedPath = filePath.replace(/^\//, "");
					if (normalizedPath !== "package.json") {
						yield* cache.write(pkg, normalizedPath, content);
					}
				}

				const metadata = new CacheMetadata({
					cachedAt: Date.now(),
					version: pkg.version,
				});
				yield* cache.writeMetadata(pkg, metadata);

				// Get VFS
				return yield* cache.getVFS(pkg);
			});

			const vfs: VirtualFileSystem = await runWithMockServices(program, tempDir);

			// Check that files have node_modules prefix
			expect(vfs.has("node_modules/zod/package.json")).toBe(true);

			// Check for type definition files
			const hasTypeFiles = Array.from(vfs.keys()).some((key) => key.endsWith(".d.ts"));
			expect(hasTypeFiles).toBe(true);
		});
	});

	describe("multiple packages", () => {
		it("should combine VFS from multiple packages", async () => {
			const packages = [
				new PackageSpec({ name: "zod", version: "3.22.4" }),
				new PackageSpec({ name: "ts-pattern", version: "5.0.6" }),
			];

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;
				const vfs = new Map<string, string>();

				for (const pkg of packages) {
					// Fetch and cache
					const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
					const typeFiles: Map<string, string> = yield* fetcher.getTypeFiles(pkg);

					yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

					for (const [filePath, content] of typeFiles) {
						const normalizedPath = filePath.replace(/^\//, "");
						if (normalizedPath !== "package.json") {
							yield* cache.write(pkg, normalizedPath, content);
						}
					}

					const metadata = new CacheMetadata({
						cachedAt: Date.now(),
						version: pkg.version,
					});
					yield* cache.writeMetadata(pkg, metadata);

					// Get VFS for this package
					const pkgVfs = yield* cache.getVFS(pkg);
					for (const [path, content] of pkgVfs) {
						vfs.set(path, content);
					}
				}

				return vfs;
			});

			const vfs: VirtualFileSystem = await runWithMockServices(program, tempDir);

			// Check for files from both packages
			const zodFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/zod"));
			const patternFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/ts-pattern"));

			expect(zodFiles.length).toBeGreaterThan(0);
			expect(patternFiles.length).toBeGreaterThan(0);
		});
	});

	describe("scoped packages", () => {
		it("should handle scoped package names", async () => {
			const pkg = new PackageSpec({ name: "@effect/schema", version: "0.68.0" });

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;

				// Fetch and cache
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				const typeFiles: Map<string, string> = yield* fetcher.getTypeFiles(pkg);

				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				for (const [filePath, content] of typeFiles) {
					const normalizedPath = filePath.replace(/^\//, "");
					if (normalizedPath !== "package.json") {
						yield* cache.write(pkg, normalizedPath, content);
					}
				}

				const metadata = new CacheMetadata({
					cachedAt: Date.now(),
					version: pkg.version,
				});
				yield* cache.writeMetadata(pkg, metadata);

				// Get VFS
				return yield* cache.getVFS(pkg);
			});

			const vfs: VirtualFileSystem = await runWithMockServices(program, tempDir);

			const hasFiles = Array.from(vfs.keys()).some((key) => key.includes("node_modules/@effect/schema"));
			expect(hasFiles).toBe(true);
		});
	});

	describe("resolveImport", () => {
		it("should resolve import specifier to file path", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;
				const resolver = yield* TypeResolver;

				// Fetch and cache
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				const metadata = new CacheMetadata({
					cachedAt: Date.now(),
					version: pkg.version,
				});
				yield* cache.writeMetadata(pkg, metadata);

				// Resolve import
				const resolved = yield* resolver.resolveImport("zod", packageJson, pkg);

				return {
					filePath: resolved.filePath,
					isTypeDefinition: resolved.isTypeDefinition,
				};
			});

			const result = await runWithMockServices(program, tempDir);

			expect(result.filePath).toBeTruthy();
			expect(result.isTypeDefinition).toBe(true);
		});
	});

	describe("getTypeEntries", () => {
		it("should get all type entry points for package", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;
				const resolver = yield* TypeResolver;

				// Fetch and cache
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				const metadata = new CacheMetadata({
					cachedAt: Date.now(),
					version: pkg.version,
				});
				yield* cache.writeMetadata(pkg, metadata);

				// Get type entries
				const entries = yield* resolver.resolveTypeEntries(packageJson, pkg);

				return entries.map((entry) => ({
					filePath: entry.filePath,
					isTypeDefinition: entry.isTypeDefinition,
				}));
			});

			const entries = await runWithMockServices(program, tempDir);

			expect(entries.length).toBeGreaterThan(0);
			expect(entries.every((e) => e.filePath)).toBe(true);
			expect(entries.every((e) => typeof e.isTypeDefinition === "boolean")).toBe(true);
		});
	});
});
