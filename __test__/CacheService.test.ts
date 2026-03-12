/**
 * Tests for CacheService
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeNodeCacheLayer } from "../src/layers/CacheServiceLive.js";
import { CacheMetadata } from "../src/schemas/CacheMetadata.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import { CacheService } from "../src/services/CacheService.js";

describe("CacheService", () => {
	let tempDir: string;
	let testPkg: PackageSpec;

	beforeEach(() => {
		// Create a temporary directory for each test
		tempDir = mkdtempSync(Path.join(tmpdir(), "cache-test-"));
		testPkg = new PackageSpec({
			name: "@effect/cli",
			version: "0.73.0",
		});
	});

	afterEach(() => {
		// Clean up temporary directory
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	const makeLayer = () => makeNodeCacheLayer(tempDir).pipe(Layer.provide(NodeFileSystem.layer));

	describe("exists", () => {
		it("should return false for non-existent package", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const result = yield* cache.exists(testPkg);
				expect(result).toBe(false);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});

		it("should return true after writing files", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;

				// Write a file
				yield* cache.write(testPkg, "test.txt", "content");

				// Check existence
				const result = yield* cache.exists(testPkg);
				expect(result).toBe(true);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});
	});

	describe("write and read", () => {
		it("should write and read file content", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const content = "export type Foo = string;";

				// Write file
				yield* cache.write(testPkg, "types/index.d.ts", content);

				// Read file
				const result = yield* cache.read(testPkg, "types/index.d.ts");
				expect(result).toBe(content);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});

		it("should create nested directories automatically", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;

				// Write file with nested path
				yield* cache.write(testPkg, "deep/nested/path/file.ts", "content");

				// Verify can read it back
				const result = yield* cache.read(testPkg, "deep/nested/path/file.ts");
				expect(result).toBe("content");
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});
	});

	describe("listFiles", () => {
		it("should list all files in package cache", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;

				// Write multiple files
				yield* cache.write(testPkg, "package.json", "{}");
				yield* cache.write(testPkg, "index.d.ts", "export {}");
				yield* cache.write(testPkg, "types/helpers.d.ts", "export {}");

				// List files
				const files = yield* cache.listFiles(testPkg);

				// Sort for consistent comparison (files is ReadonlyArray)
				expect([...files].sort()).toEqual(["index.d.ts", "package.json", "types/helpers.d.ts"].sort());
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});

		it("should fail with CacheError for non-existent package", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const result = yield* cache.listFiles(testPkg).pipe(
					Effect.map(() => "success" as const),
					Effect.catchTag("CacheError", () => Effect.succeed("cache-error" as const)),
				);
				expect(result).toBe("cache-error");
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});
	});

	describe("metadata", () => {
		it("should write and read metadata", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const metadata = new CacheMetadata({
					version: "0.73.0",
					cachedAt: Date.now(),
					ttl: 7 * 24 * 60 * 60 * 1000,
				});

				// Write metadata
				yield* cache.writeMetadata(testPkg, metadata);

				// Read metadata
				const result = yield* cache.readMetadata(testPkg);
				expect(result.version).toBe(metadata.version);
				expect(result.cachedAt).toBe(metadata.cachedAt);
				expect(result.ttl).toBe(metadata.ttl);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});

		it("should store metadata as JSON", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const metadata = new CacheMetadata({
					version: "1.0.0",
					cachedAt: 1234567890,
				});

				yield* cache.writeMetadata(testPkg, metadata);

				// Read raw file to verify JSON format
				const rawContent = yield* cache.read(testPkg, ".metadata.json");
				const parsed = JSON.parse(rawContent);
				expect(parsed.version).toBe("1.0.0");
				expect(parsed.cachedAt).toBe(1234567890);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});
	});

	describe("getVFS", () => {
		it("should create VFS with node_modules prefix", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;

				// Write files
				yield* cache.write(testPkg, "package.json", '{"name":"@effect/cli"}');
				yield* cache.write(testPkg, "index.d.ts", "export {}");
				yield* cache.write(testPkg, ".metadata.json", "{}");

				// Get VFS
				const vfs = yield* cache.getVFS(testPkg);

				// Check VFS entries
				expect(vfs.has("node_modules/@effect/cli/package.json")).toBe(true);
				expect(vfs.has("node_modules/@effect/cli/index.d.ts")).toBe(true);
				expect(vfs.has("node_modules/@effect/cli/.metadata.json")).toBe(false); // Should skip metadata
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});

		it("should include file contents in VFS", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const content = "export type Test = string;";

				yield* cache.write(testPkg, "test.d.ts", content);

				const vfs = yield* cache.getVFS(testPkg);
				expect(vfs.get("node_modules/@effect/cli/test.d.ts")).toBe(content);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});
	});

	describe("remove", () => {
		it("should remove package from cache", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;

				// Write files
				yield* cache.write(testPkg, "package.json", "{}");
				yield* cache.write(testPkg, "index.d.ts", "export {}");

				// Verify exists
				const existsBefore = yield* cache.exists(testPkg);
				expect(existsBefore).toBe(true);

				// Remove
				yield* cache.remove(testPkg);

				// Verify removed
				const existsAfter = yield* cache.exists(testPkg);
				expect(existsAfter).toBe(false);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});
	});

	describe("multiple packages", () => {
		it("should handle multiple packages independently", async () => {
			const program = Effect.gen(function* () {
				const cache = yield* CacheService;
				const pkg1 = new PackageSpec({ name: "zod", version: "3.22.4" });
				const pkg2 = new PackageSpec({ name: "@effect/cli", version: "0.73.0" });

				// Write to different packages
				yield* cache.write(pkg1, "index.d.ts", "zod content");
				yield* cache.write(pkg2, "index.d.ts", "effect content");

				// Read and verify
				const content1 = yield* cache.read(pkg1, "index.d.ts");
				const content2 = yield* cache.read(pkg2, "index.d.ts");

				expect(content1).toBe("zod content");
				expect(content2).toBe("effect content");

				// Remove one shouldn't affect the other
				yield* cache.remove(pkg1);
				const exists1 = yield* cache.exists(pkg1);
				const exists2 = yield* cache.exists(pkg2);

				expect(exists1).toBe(false);
				expect(exists2).toBe(true);
			});

			await Effect.runPromise(program.pipe(Effect.provide(makeLayer())));
		});
	});
});
