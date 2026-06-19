/**
 * Tests for CacheService
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCache } from "xdg-effect";
import { makeNodeCacheLayer } from "../src/layers/CacheServiceLive.js";
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

	// makeNodeCacheLayer requires FileSystem (on-disk files) and SqliteCache (metadata).
	const makeLayer = () =>
		makeNodeCacheLayer(tempDir).pipe(
			Layer.provide(NodeFileSystem.layer),
			Layer.provide(NodePath.layer),
			Layer.provide(SqliteCache.Test()),
		);

	const run = <A, E>(effect: Effect.Effect<A, E, CacheService>) =>
		Effect.runPromise(Effect.provide(effect, makeLayer()));

	describe("exists", () => {
		it("should return false for non-existent package", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					return yield* cache.exists(testPkg);
				}),
			);
			expect(result).toBe(false);
		});

		it("should return true after writing files", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "test.txt", "content");
					return yield* cache.exists(testPkg);
				}),
			);
			expect(result).toBe(true);
		});
	});

	describe("friendly on-disk layout", () => {
		it("should nest scoped packages as <scope>/<name>/<version>/...", async () => {
			await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "index.d.ts", "export {}");
				}),
			);
			expect(existsSync(Path.join(tempDir, "@effect", "cli", "0.73.0", "index.d.ts"))).toBe(true);
		});

		it("should place unscoped packages as <name>/<version>/...", async () => {
			const pkg = new PackageSpec({ name: "vitest", version: "4.1.9" });
			await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(pkg, "index.d.ts", "export {}");
				}),
			);
			expect(existsSync(Path.join(tempDir, "vitest", "4.1.9", "index.d.ts"))).toBe(true);
		});
	});

	describe("write and read", () => {
		it("should write and read file content", async () => {
			const content = "export type Foo = string;";
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "types/index.d.ts", content);
					return yield* cache.read(testPkg, "types/index.d.ts");
				}),
			);
			expect(result).toBe(content);
		});

		it("should create nested directories automatically", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "deep/nested/path/file.ts", "content");
					return yield* cache.read(testPkg, "deep/nested/path/file.ts");
				}),
			);
			expect(result).toBe("content");
		});
	});

	describe("listFiles", () => {
		it("should list all files in package cache", async () => {
			const files = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "package.json", "{}");
					yield* cache.write(testPkg, "index.d.ts", "export {}");
					yield* cache.write(testPkg, "types/helpers.d.ts", "export {}");
					return yield* cache.listFiles(testPkg);
				}),
			);
			expect([...files].sort()).toEqual(["index.d.ts", "package.json", "types/helpers.d.ts"].sort());
		});

		it("should fail with CacheError for non-existent package", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					return yield* cache.listFiles(testPkg).pipe(
						Effect.map(() => "success" as const),
						Effect.catchTag("CacheError", () => Effect.succeed("cache-error" as const)),
					);
				}),
			);
			expect(result).toBe("cache-error");
		});
	});

	describe("metadata", () => {
		it("should write and read metadata via the SQLite store", async () => {
			const metadata = {
				version: "0.73.0",
				cachedAt: Date.now(),
				ttl: 7 * 24 * 60 * 60 * 1000,
			};
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.writeMetadata(testPkg, metadata);
					return yield* cache.readMetadata(testPkg);
				}),
			);
			expect(Option.isSome(result)).toBe(true);
			const meta = Option.getOrThrow(result);
			expect(meta.version).toBe(metadata.version);
			expect(meta.cachedAt).toBe(metadata.cachedAt);
			expect(meta.ttl).toBe(metadata.ttl);
		});

		it("should return None when no metadata exists", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					return yield* cache.readMetadata(testPkg);
				}),
			);
			expect(Option.isNone(result)).toBe(true);
		});
	});

	describe("getVFS", () => {
		it("should create VFS with node_modules prefix", async () => {
			const vfs = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "package.json", '{"name":"@effect/cli"}');
					yield* cache.write(testPkg, "index.d.ts", "export {}");
					return yield* cache.getVFS(testPkg);
				}),
			);
			expect(vfs.has("node_modules/@effect/cli/package.json")).toBe(true);
			expect(vfs.has("node_modules/@effect/cli/index.d.ts")).toBe(true);
		});

		it("should include file contents in VFS", async () => {
			const content = "export type Test = string;";
			const vfs = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "test.d.ts", content);
					return yield* cache.getVFS(testPkg);
				}),
			);
			expect(vfs.get("node_modules/@effect/cli/test.d.ts")).toBe(content);
		});
	});

	describe("remove", () => {
		it("should remove a package's files and metadata", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "package.json", "{}");
					yield* cache.write(testPkg, "index.d.ts", "export {}");
					yield* cache.writeMetadata(testPkg, { version: "0.73.0", cachedAt: Date.now() });

					const existsBefore = yield* cache.exists(testPkg);
					yield* cache.remove(testPkg);
					const existsAfter = yield* cache.exists(testPkg);
					const metaAfter = yield* cache.readMetadata(testPkg);
					return { existsBefore, existsAfter, metaAfter };
				}),
			);
			expect(result.existsBefore).toBe(true);
			expect(result.existsAfter).toBe(false);
			expect(Option.isNone(result.metaAfter)).toBe(true);
		});
	});

	describe("prune", () => {
		it("should remove expired packages and delete their directories", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "index.d.ts", "export {}");
					// 1ms TTL so the entry is expired by the time prune runs.
					yield* cache.writeMetadata(testPkg, { version: "0.73.0", cachedAt: Date.now(), ttl: 1 });
					yield* Effect.sleep("10 millis");
					return yield* cache.prune;
				}),
			);
			expect(result.count).toBeGreaterThanOrEqual(1);
			expect(result.removed).toContainEqual({ name: "@effect/cli", version: "0.73.0" });
			expect(existsSync(Path.join(tempDir, "@effect", "cli", "0.73.0"))).toBe(false);
		});

		it("should not prune entries without a TTL", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					yield* cache.write(testPkg, "index.d.ts", "export {}");
					yield* cache.writeMetadata(testPkg, { version: "0.73.0", cachedAt: Date.now() });
					yield* Effect.sleep("10 millis");
					return yield* cache.prune;
				}),
			);
			expect(result.count).toBe(0);
			expect(existsSync(Path.join(tempDir, "@effect", "cli", "0.73.0", "index.d.ts"))).toBe(true);
		});
	});

	describe("multiple packages", () => {
		it("should handle multiple packages independently", async () => {
			const result = await run(
				Effect.gen(function* () {
					const cache = yield* CacheService;
					const pkg1 = new PackageSpec({ name: "zod", version: "3.22.4" });
					const pkg2 = new PackageSpec({ name: "@effect/cli", version: "0.73.0" });

					yield* cache.write(pkg1, "index.d.ts", "zod content");
					yield* cache.write(pkg2, "index.d.ts", "effect content");

					const content1 = yield* cache.read(pkg1, "index.d.ts");
					const content2 = yield* cache.read(pkg2, "index.d.ts");

					yield* cache.remove(pkg1);
					const exists1 = yield* cache.exists(pkg1);
					const exists2 = yield* cache.exists(pkg2);

					return { content1, content2, exists1, exists2 };
				}),
			);
			expect(result.content1).toBe("zod content");
			expect(result.content2).toBe("effect content");
			expect(result.exists1).toBe(false);
			expect(result.exists2).toBe(true);
		});
	});
});
