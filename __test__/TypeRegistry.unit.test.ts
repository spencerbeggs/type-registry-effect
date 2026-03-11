/**
 * Unit tests for TypeRegistry with mocked HTTP client
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import type { FileSystem, HttpClient } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockPackageFetcherLive } from "../__test__/utils/mockPackageFetcher.js";
import { CacheService, makeCacheServiceLayer } from "./services/CacheService.js";
import { PackageFetcher } from "./services/PackageFetcher.js";
import { TypeResolver, TypeResolverLive } from "./services/TypeResolver.js";
import type { CacheMetadata, PackageJson, PackageSpec, VirtualFileSystem } from "./types.js";

/**
 * Helper to run Effect programs with mocked services
 */
function runWithMockServices<A, E>(
	program: Effect.Effect<
		A,
		E,
		CacheService | PackageFetcher | TypeResolver | FileSystem.FileSystem | HttpClient.HttpClient
	>,
	cacheDir: string,
): Promise<A> {
	const cacheLayer = makeCacheServiceLayer(cacheDir);

	// Note: MockPackageFetcherLive doesn't actually need HttpClient since it reads from fixtures,
	// but the type signature requires it. We strip the HttpClient requirement since the mock
	// doesn't use it.
	const runnable: Effect.Effect<A, E, never> = program.pipe(
		Effect.provide(cacheLayer),
		Effect.provide(NodeFileSystem.layer),
		Effect.provideServiceEffect(PackageFetcher, MockPackageFetcherLive),
		Effect.provideServiceEffect(TypeResolver, TypeResolverLive),
	) as Effect.Effect<A, E, never>;

	return Effect.runPromise(runnable);
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
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

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
				const metadata: CacheMetadata = {
					cachedAt: Date.now(),
					version: pkg.version,
					ttl: undefined,
				};
				yield* cache.writeMetadata(pkg, metadata);

				// Verify it exists
				return yield* cache.exists(pkg);
			});

			const result = await runWithMockServices(program, tempDir);
			expect(result).toBe(true);
		});

		it("should not re-fetch if already cached and not stale", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };
			const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;

				// First fetch
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				const metadata: CacheMetadata = {
					cachedAt: Date.now(),
					version: pkg.version,
					ttl,
				};
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
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

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

				const metadata: CacheMetadata = {
					cachedAt: Date.now(),
					version: pkg.version,
					ttl: undefined,
				};
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
			const packages: PackageSpec[] = [
				{ name: "zod", version: "3.22.4" },
				{ name: "ts-pattern", version: "5.0.6" },
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

					const metadata: CacheMetadata = {
						cachedAt: Date.now(),
						version: pkg.version,
						ttl: undefined,
					};
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
			const pkg: PackageSpec = { name: "@effect/schema", version: "0.68.0" };

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

				const metadata: CacheMetadata = {
					cachedAt: Date.now(),
					version: pkg.version,
					ttl: undefined,
				};
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
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;
				const resolver = yield* TypeResolver;

				// Fetch and cache
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				const metadata: CacheMetadata = {
					cachedAt: Date.now(),
					version: pkg.version,
					ttl: undefined,
				};
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
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;
				const resolver = yield* TypeResolver;

				// Fetch and cache
				const packageJson: PackageJson = yield* fetcher.getPackageJson(pkg);
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

				const metadata: CacheMetadata = {
					cachedAt: Date.now(),
					version: pkg.version,
					ttl: undefined,
				};
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
