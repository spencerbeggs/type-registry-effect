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

import type { Layer } from "effect";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { NodeLayer } from "../src/platforms/node.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import * as TypeRegistry from "../src/TypeRegistry.js";

type NodeLayerServices = Layer.Layer.Success<typeof NodeLayer>;

const run = <A, E>(effect: Effect.Effect<A, E, NodeLayerServices>) =>
	Effect.runPromise(Effect.provide(effect, NodeLayer));

describe("TypeRegistry (Integration Tests)", () => {
	describe("hasCached", () => {
		it("should return false for non-cached package", async () => {
			const pkg = new PackageSpec({ name: "non-existent", version: "1.0.0" });
			const result = await run(TypeRegistry.hasCached(pkg));
			expect(result).toBe(false);
		});
	});

	describe("fetchAndCache", () => {
		it("should fetch and cache a real package (real API call)", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Fetch and cache
			await run(TypeRegistry.fetchAndCache(pkg));

			// Verify cached
			const isCached = await run(TypeRegistry.hasCached(pkg));
			expect(isCached).toBe(true);
		}, 30000); // 30s timeout for network request
	});

	describe("getPackageVFS", () => {
		it("should auto-fetch and return VFS", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			const vfs = await run(TypeRegistry.getPackageVFS(pkg, { autoFetch: true }));

			// Should have package.json
			expect(vfs.has("node_modules/zod/package.json")).toBe(true);

			// Should have type definitions
			const hasTypeFiles = Array.from(vfs.keys()).some((key) => key.endsWith(".d.ts"));
			expect(hasTypeFiles).toBe(true);
		}, 30000);

		it("should throw if not cached and autoFetch is false", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Clear cache first to ensure package is not cached
			try {
				await run(TypeRegistry.clearCache(pkg));
			} catch {
				// Ignore if not cached
			}

			await expect(run(TypeRegistry.getPackageVFS(pkg, { autoFetch: false }))).rejects.toThrow();
		});

		it("should return VFS for cached package without fetching", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Fetch first
			await run(TypeRegistry.fetchAndCache(pkg));

			// Get VFS should be fast
			const start = Date.now();
			const vfs = await run(TypeRegistry.getPackageVFS(pkg, { autoFetch: false }));
			const duration = Date.now() - start;

			expect(vfs.size).toBeGreaterThan(0);
			expect(duration).toBeLessThan(1000);
		}, 30000);
	});

	describe("getVFS", () => {
		it("should combine VFS from multiple packages", async () => {
			const packages = [
				new PackageSpec({ name: "zod", version: "3.22.4" }),
				new PackageSpec({ name: "ts-pattern", version: "5.0.6" }),
			];

			const vfs = await run(TypeRegistry.getVFS(packages, { autoFetch: true }));

			// Should have files from both packages
			const zodFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/zod"));
			const patternFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/ts-pattern"));

			expect(zodFiles.length).toBeGreaterThan(0);
			expect(patternFiles.length).toBeGreaterThan(0);
		}, 60000); // 60s timeout for multiple packages

		it("should handle partial failures gracefully", async () => {
			const packages = [
				new PackageSpec({ name: "zod", version: "3.22.4" }), // Valid package
				new PackageSpec({ name: "definitely-does-not-exist-package-xyz", version: "999.999.999" }), // Invalid
			];

			// Should not throw, but continue processing
			const vfs = await run(TypeRegistry.getVFS(packages, { autoFetch: true }));

			// Should have files from valid package
			const zodFiles = Array.from(vfs.keys()).filter((key) => key.includes("node_modules/zod"));
			expect(zodFiles.length).toBeGreaterThan(0);
		}, 60000);

		it("should throw if all packages fail", async () => {
			const packages = [
				new PackageSpec({ name: "does-not-exist-1", version: "999.999.999" }),
				new PackageSpec({ name: "does-not-exist-2", version: "999.999.999" }),
			];

			await expect(run(TypeRegistry.getVFS(packages, { autoFetch: true }))).rejects.toThrow();
		}, 30000);
	});

	describe("resolveImport", () => {
		it("should resolve import specifier to file path", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Ensure package is cached
			await run(TypeRegistry.fetchAndCache(pkg));

			// Resolve main entry
			const result = await run(TypeRegistry.resolveImport(pkg, "zod"));

			expect(result.filePath).toBeTruthy();
			expect(result.isTypeDefinition).toBe(true);
		}, 30000);

		it("should throw for uncached package", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Clear cache first to ensure package is not cached
			try {
				await run(TypeRegistry.clearCache(pkg));
			} catch {
				// Ignore if not cached
			}

			await expect(run(TypeRegistry.resolveImport(pkg, "zod"))).rejects.toThrow();
		});
	});

	describe("getTypeEntries", () => {
		it("should get all type entry points for package", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Ensure package is cached
			await run(TypeRegistry.fetchAndCache(pkg));

			// Get type entries
			const entries = await run(TypeRegistry.getTypeEntries(pkg));

			expect(entries.length).toBeGreaterThan(0);
			expect(entries.every((e) => e.filePath)).toBe(true);
			expect(entries.every((e) => typeof e.isTypeDefinition === "boolean")).toBe(true);
		}, 30000);

		it("should throw for uncached package", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Clear cache first to ensure package is not cached
			try {
				await run(TypeRegistry.clearCache(pkg));
			} catch {
				// Ignore if not cached
			}

			await expect(run(TypeRegistry.getTypeEntries(pkg))).rejects.toThrow();
		});
	});

	describe("clearCache", () => {
		it("should remove package from cache", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Cache package
			await run(TypeRegistry.fetchAndCache(pkg));
			expect(await run(TypeRegistry.hasCached(pkg))).toBe(true);

			// Clear cache
			await run(TypeRegistry.clearCache(pkg));

			// Verify removed
			expect(await run(TypeRegistry.hasCached(pkg))).toBe(false);
		}, 30000);
	});

	describe("scoped packages", () => {
		it("should handle scoped package names", async () => {
			const pkg = new PackageSpec({ name: "@effect/schema", version: "0.68.0" });

			await run(TypeRegistry.fetchAndCache(pkg));

			const isCached = await run(TypeRegistry.hasCached(pkg));
			expect(isCached).toBe(true);

			const vfs = await run(TypeRegistry.getPackageVFS(pkg, { autoFetch: false }));
			const hasFiles = Array.from(vfs.keys()).some((key) => key.includes("node_modules/@effect/schema"));
			expect(hasFiles).toBe(true);
		}, 30000);
	});

	describe("concurrent operations", () => {
		it("should handle concurrent fetches of same package", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });

			// Fetch concurrently
			await Promise.all([
				run(TypeRegistry.fetchAndCache(pkg)),
				run(TypeRegistry.fetchAndCache(pkg)),
				run(TypeRegistry.fetchAndCache(pkg)),
			]);

			const isCached = await run(TypeRegistry.hasCached(pkg));
			expect(isCached).toBe(true);
		}, 30000);

		it("should handle concurrent fetches of different packages", async () => {
			const packages = [
				new PackageSpec({ name: "zod", version: "3.22.4" }),
				new PackageSpec({ name: "ts-pattern", version: "5.0.6" }),
				new PackageSpec({ name: "@effect/schema", version: "0.68.0" }),
			];

			// Fetch all concurrently
			await Promise.all(packages.map((pkg) => run(TypeRegistry.fetchAndCache(pkg))));

			// Verify all cached
			const results = await Promise.all(packages.map((pkg) => run(TypeRegistry.hasCached(pkg))));
			expect(results.every((r) => r === true)).toBe(true);
		}, 60000);
	});
});
