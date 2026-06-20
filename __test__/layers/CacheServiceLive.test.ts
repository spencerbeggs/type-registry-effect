import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCache } from "xdg-effect";
import { makeNodeCacheLayer } from "../../src/layers/CacheServiceLive.js";
import { PackageSpec } from "../../src/schemas/PackageSpec.js";
import { CacheService } from "../../src/services/CacheService.js";

describe("CacheServiceLive", () => {
	let tempDir: string;
	let testLayer: Layer.Layer<CacheService>;

	beforeEach(() => {
		tempDir = mkdtempSync(Path.join(tmpdir(), "cache-test-"));
		testLayer = makeNodeCacheLayer(tempDir).pipe(
			Layer.provide(NodeFileSystem.layer),
			Layer.provide(NodePath.layer),
			Layer.provide(SqliteCache.Test()),
		);
	});

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {}
	});

	const run = <A, E>(effect: Effect.Effect<A, E, CacheService>) => Effect.runPromise(Effect.provide(effect, testLayer));

	it("should report non-existent package as not cached", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const result = await run(
			Effect.gen(function* () {
				const cache = yield* CacheService;
				return yield* cache.exists(pkg);
			}),
		);
		expect(result).toBe(false);
	});

	it("should write and read a file", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const result = await run(
			Effect.gen(function* () {
				const cache = yield* CacheService;
				yield* cache.write(pkg, "index.d.ts", "export declare const z: any;");
				return yield* cache.read(pkg, "index.d.ts");
			}),
		);
		expect(result).toBe("export declare const z: any;");
	});

	it("should write and read metadata", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const meta = { version: "3.22.4", cachedAt: Date.now() };
		const result = await run(
			Effect.gen(function* () {
				const cache = yield* CacheService;
				yield* cache.writeMetadata(pkg, meta);
				return yield* cache.readMetadata(pkg);
			}),
		);
		expect(Option.isSome(result)).toBe(true);
		expect(Option.getOrThrow(result).version).toBe("3.22.4");
	});

	it("should generate VFS with node_modules prefix", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const result = await run(
			Effect.gen(function* () {
				const cache = yield* CacheService;
				yield* cache.write(pkg, "package.json", '{"name":"zod"}');
				yield* cache.write(pkg, "index.d.ts", "export declare const z: any;");
				return yield* cache.getVFS(pkg);
			}),
		);
		expect(result.has("node_modules/zod/package.json")).toBe(true);
		expect(result.has("node_modules/zod/index.d.ts")).toBe(true);
	});

	it("should remove a cached package", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const meta = { version: "3.22.4", cachedAt: Date.now() };
		const result = await run(
			Effect.gen(function* () {
				const cache = yield* CacheService;
				yield* cache.write(pkg, "index.d.ts", "content");
				yield* cache.writeMetadata(pkg, meta);
				yield* cache.remove(pkg);
				return yield* cache.exists(pkg);
			}),
		);
		expect(result).toBe(false);
	});
});
