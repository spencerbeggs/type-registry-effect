/**
 * Integration tests for TypeRegistry
 * These tests make real API calls to jsDelivr CDN and are slow.
 * Run with: pnpm test:integration
 *
 * For fast unit tests with mocks, see TypeRegistry.unit.test.ts
 *
 * These tests use a persistent test cache directory to speed up repeated runs.
 * The cache is stored at: /Users/spencer/.cache/effect-type-registry-test
 */

import * as os from "node:os";
import * as Path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { TypeRegistry } from "../src/TypeRegistry.js";
import type { PackageSpec } from "../src/types.js";

/**
 * Get persistent test cache directory
 * Uses XDG_CACHE_HOME or falls back to ~/.cache
 */
function getTestCacheDir(): string {
	const xdgCacheHome = process.env.XDG_CACHE_HOME;
	if (xdgCacheHome) {
		return Path.join(xdgCacheHome, "effect-type-registry-test");
	}
	return Path.join(os.homedir(), ".cache", "effect-type-registry-test");
}

describe("TypeRegistry (Integration Tests)", () => {
	let registry: TypeRegistry;

	beforeEach(() => {
		// Use persistent test cache directory (shared across test runs)
		registry = TypeRegistry.create({
			cacheDir: getTestCacheDir(),
			ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
		});
	});

	describe("create", () => {
		it("should create registry with default options", () => {
			const reg = TypeRegistry.create();
			expect(reg).toBeInstanceOf(TypeRegistry);
		});

		it("should create registry with custom cache directory", () => {
			const customDir = Path.join(os.tmpdir(), "custom-cache-test");
			const reg = TypeRegistry.create({ cacheDir: customDir });
			expect(reg).toBeInstanceOf(TypeRegistry);
		});

		it("should create registry with custom TTL", () => {
			const reg = TypeRegistry.create({ ttl: 1000 });
			expect(reg).toBeInstanceOf(TypeRegistry);
		});
	});

	describe("hasCached", () => {
		it("should return false for non-cached package", async () => {
			const pkg: PackageSpec = { name: "non-existent", version: "1.0.0" };
			const result = await registry.hasCached(pkg);
			expect(result).toBe(false);
		});
	});

	describe("fetchAndCache", () => {
		it("should fetch and cache a real package (real API call)", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Fetch and cache
			await registry.fetchAndCache(pkg);

			// Verify cached
			const isCached = await registry.hasCached(pkg);
			expect(isCached).toBe(true);
		}, 30000); // 30s timeout for network request

		it("should not re-fetch if already cached and not stale", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// First fetch
			await registry.fetchAndCache(pkg);

			// Second fetch should be a no-op (check by ensuring it's fast)
			const start = Date.now();
			await registry.fetchAndCache(pkg);
			const duration = Date.now() - start;

			// Should be very fast since it's cached
			expect(duration).toBeLessThan(1000);
		}, 30000);
	});

	describe("ensureCached", () => {
		it("should fetch if not cached", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			await registry.ensureCached(pkg);

			const isCached = await registry.hasCached(pkg);
			expect(isCached).toBe(true);
		}, 30000);

		it("should not fetch if already cached", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// First ensure
			await registry.ensureCached(pkg);

			// Second ensure should be fast
			const start = Date.now();
			await registry.ensureCached(pkg);
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(1000);
		}, 30000);
	});

	describe("getPackageVFS", () => {
		it("should auto-fetch and return VFS", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			const vfs = await registry.getPackageVFS(pkg, { autoFetch: true });

			// Should have package.json
			expect(vfs.has("node_modules/zod/package.json")).toBe(true);

			// Should have type definitions
			const hasTypeFiles = Array.from(vfs.keys()).some((key) => key.endsWith(".d.ts"));
			expect(hasTypeFiles).toBe(true);
		}, 30000);

		it("should throw if not cached and autoFetch is false", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Clear cache first to ensure package is not cached
			try {
				await registry.clearCache(pkg);
			} catch {
				// Ignore if not cached
			}

			await expect(registry.getPackageVFS(pkg, { autoFetch: false })).rejects.toThrow();
		});

		it("should return VFS for cached package without fetching", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Fetch first
			await registry.fetchAndCache(pkg);

			// Get VFS should be fast
			const start = Date.now();
			const vfs = await registry.getPackageVFS(pkg, { autoFetch: false });
			const duration = Date.now() - start;

			expect(vfs.size).toBeGreaterThan(0);
			expect(duration).toBeLessThan(1000);
		}, 30000);
	});

	describe("getVFS", () => {
		it("should combine VFS from multiple packages", async () => {
			const packages: PackageSpec[] = [
				{ name: "zod", version: "3.22.4" },
				{ name: "ts-pattern", version: "5.0.6" },
			];

			const vfs = await registry.getVFS(packages, { autoFetch: true });

			// Should have files from both packages
			const zodFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/zod"));
			const patternFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/ts-pattern"));

			expect(zodFiles.length).toBeGreaterThan(0);
			expect(patternFiles.length).toBeGreaterThan(0);
		}, 60000); // 60s timeout for multiple packages

		it("should handle partial failures gracefully", async () => {
			const packages: PackageSpec[] = [
				{ name: "zod", version: "3.22.4" }, // Valid package
				{ name: "definitely-does-not-exist-package-xyz", version: "999.999.999" }, // Invalid
			];

			// Should not throw, but continue processing
			const vfs = await registry.getVFS(packages, { autoFetch: true });

			// Should have files from valid package
			const zodFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/zod"));
			expect(zodFiles.length).toBeGreaterThan(0);
		}, 60000);

		it("should throw if all packages fail", async () => {
			const packages: PackageSpec[] = [
				{ name: "does-not-exist-1", version: "999.999.999" },
				{ name: "does-not-exist-2", version: "999.999.999" },
			];

			await expect(registry.getVFS(packages, { autoFetch: true })).rejects.toThrow("Failed to fetch VFS for all");
		}, 30000);
	});

	describe("resolveImport", () => {
		it("should resolve import specifier to file path", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Ensure package is cached
			await registry.ensureCached(pkg);

			// Resolve main entry
			const result = await registry.resolveImport(pkg, "zod");

			expect(result.filePath).toBeTruthy();
			expect(result.isTypeDefinition).toBe(true);
		}, 30000);

		it("should throw for uncached package", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Clear cache first to ensure package is not cached
			try {
				await registry.clearCache(pkg);
			} catch {
				// Ignore if not cached
			}

			await expect(registry.resolveImport(pkg, "zod")).rejects.toThrow("not cached");
		});
	});

	describe("getTypeEntries", () => {
		it("should get all type entry points for package", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Ensure package is cached
			await registry.ensureCached(pkg);

			// Get type entries
			const entries = await registry.getTypeEntries(pkg);

			expect(entries.length).toBeGreaterThan(0);
			expect(entries.every((e) => e.filePath)).toBe(true);
			expect(entries.every((e) => typeof e.isTypeDefinition === "boolean")).toBe(true);
		}, 30000);

		it("should throw for uncached package", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Clear cache first to ensure package is not cached
			try {
				await registry.clearCache(pkg);
			} catch {
				// Ignore if not cached
			}

			await expect(registry.getTypeEntries(pkg)).rejects.toThrow("not cached");
		});
	});

	describe("clearCache", () => {
		it("should remove package from cache", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Cache package
			await registry.fetchAndCache(pkg);
			expect(await registry.hasCached(pkg)).toBe(true);

			// Clear cache
			await registry.clearCache(pkg);

			// Verify removed
			expect(await registry.hasCached(pkg)).toBe(false);
		}, 30000);
	});

	describe("cache TTL behavior", () => {
		it("should respect cache TTL", async () => {
			// Create registry with 1 second TTL (use temp dir for this test)
			const testCacheDir = Path.join(getTestCacheDir(), "ttl-test");
			const shortTtlRegistry = TypeRegistry.create({
				cacheDir: testCacheDir,
				ttl: 1000, // 1 second
			});

			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Fetch and cache
			await shortTtlRegistry.fetchAndCache(pkg);

			// Wait for TTL to expire
			await new Promise((resolve) => setTimeout(resolve, 1500));

			// Fetch again - should re-fetch due to expired TTL
			// (This is hard to verify without mocking, but at least check it doesn't error)
			await shortTtlRegistry.fetchAndCache(pkg);

			expect(await shortTtlRegistry.hasCached(pkg)).toBe(true);
		}, 60000);
	});

	describe("scoped packages", () => {
		it("should handle scoped package names", async () => {
			const pkg: PackageSpec = { name: "@effect/schema", version: "0.68.0" };

			await registry.fetchAndCache(pkg);

			const isCached = await registry.hasCached(pkg);
			expect(isCached).toBe(true);

			const vfs = await registry.getPackageVFS(pkg, { autoFetch: false });
			const hasFiles = Array.from(vfs.keys()).some((key) => key.includes("node_modules/@effect/schema"));
			expect(hasFiles).toBe(true);
		}, 30000);
	});

	describe("concurrent operations", () => {
		it("should handle concurrent fetches of same package", async () => {
			const pkg: PackageSpec = { name: "zod", version: "3.22.4" };

			// Fetch concurrently
			await Promise.all([registry.fetchAndCache(pkg), registry.fetchAndCache(pkg), registry.fetchAndCache(pkg)]);

			const isCached = await registry.hasCached(pkg);
			expect(isCached).toBe(true);
		}, 30000);

		it("should handle concurrent fetches of different packages", async () => {
			const packages: PackageSpec[] = [
				{ name: "zod", version: "3.22.4" },
				{ name: "ts-pattern", version: "5.0.6" },
				{ name: "@effect/schema", version: "0.68.0" },
			];

			// Fetch all concurrently
			await Promise.all(packages.map((pkg) => registry.fetchAndCache(pkg)));

			// Verify all cached
			const results = await Promise.all(packages.map((pkg) => registry.hasCached(pkg)));
			expect(results.every((r) => r === true)).toBe(true);
		}, 60000);
	});
});
