/**
 * Tests for typed RegistryEvent emission from TypeRegistry programs.
 *
 * TypeRegistry no longer emits diagnostics via `Effect.log`; programmatic
 * consumers subscribe through the {@link TypeRegistryObserver} channel. These
 * tests provide a callback observer and assert on the captured events.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCache } from "xdg-effect";
import { NetworkError } from "../src/errors/NetworkError.js";
import { makeNodeCacheLayer } from "../src/layers/CacheServiceLive.js";
import { TypeResolverLive } from "../src/layers/TypeResolverLive.js";
import type { PackageJson } from "../src/schemas/PackageJson.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import { CacheService } from "../src/services/CacheService.js";
import { PackageFetcher } from "../src/services/PackageFetcher.js";
import type { RegistryEvent } from "../src/services/TypeRegistryObserver.js";
import { layerCallback } from "../src/services/TypeRegistryObserver.js";
import * as TypeRegistry from "../src/TypeRegistry.js";

// ── Fixture helpers (mirrored from TypeRegistry.unit.test.ts) ────────────────

function getFixturePath(packageName: string): string {
	return Path.join(import.meta.dirname, "fixtures", packageName);
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const fullPath = Path.join(dir, entry);
		if (statSync(fullPath).isDirectory()) {
			files.push(...getAllFiles(fullPath, baseDir));
		} else {
			files.push(`/${Path.relative(baseDir, fullPath).replace(/\\/g, "/")}`);
		}
	}
	return files;
}

const MockPackageFetcherLayer: Layer.Layer<PackageFetcher> = Layer.succeed(PackageFetcher, {
	getVersions: (name) =>
		Effect.try({
			try: () => {
				const packageJson = JSON.parse(readFileSync(Path.join(getFixturePath(name), "package.json"), "utf-8"));
				return { versions: [packageJson.version as string], tags: { latest: packageJson.version as string } };
			},
			catch: (e) => new NetworkError({ url: `fixture/${name}`, message: String(e) }),
		}),
	resolveVersion: (_name, ref) => Effect.succeed(ref),
	getFileTree: (pkg) =>
		Effect.try({
			try: () => ({
				default: "/package.json",
				files: getAllFiles(getFixturePath(pkg.name)).map((filePath) => ({
					name: filePath,
					hash: "mock-hash",
					time: "2024-01-01T00:00:00.000Z",
					size: 0,
				})),
			}),
			catch: (e) => new NetworkError({ url: `fixture/${pkg.name}`, message: String(e) }),
		}),
	downloadFile: (_pkg, _path) => Effect.succeed(""),
	getPackageJson: (pkg) =>
		Effect.try({
			try: () => JSON.parse(readFileSync(Path.join(getFixturePath(pkg.name), "package.json"), "utf-8")) as PackageJson,
			catch: (e) => new NetworkError({ url: `fixture/${pkg.name}`, message: String(e) }),
		}),
	getTypeFiles: (pkg) =>
		Effect.try({
			try: () => {
				const fixturePath = getFixturePath(pkg.name);
				const typeFiles = new Map<string, string>();
				const typeFilePattern = /\.d\.([^.]+\.)?[cm]?ts$/i;
				for (const file of getAllFiles(fixturePath)) {
					if (typeFilePattern.test(file) || file.endsWith("package.json")) {
						typeFiles.set(file, readFileSync(Path.join(fixturePath, file.replace(/^\//, "")), "utf-8"));
					}
				}
				return typeFiles;
			},
			catch: (e) => new NetworkError({ url: `fixture/${pkg.name}`, message: String(e) }),
		}),
});

function makeTestLayer(cacheDir: string, events: RegistryEvent[]) {
	// File-based SQLite so metadata persists across separate `runPromise` calls
	// (several tests fetch, then re-run to assert hit/stale behavior).
	const sqlite = SqliteCache.Live().pipe(
		Layer.provide(SqliteClient.layer({ filename: Path.join(cacheDir, "metadata.db") })),
	);
	const services = Layer.mergeAll(
		makeNodeCacheLayer(cacheDir).pipe(
			Layer.provide(NodeFileSystem.layer),
			Layer.provide(NodePath.layer),
			Layer.provide(sqlite),
		),
		MockPackageFetcherLayer,
		TypeResolverLive,
	);
	return Layer.merge(
		services,
		layerCallback((e) => events.push(e)),
	);
}

const only = <K extends RegistryEvent["_tag"]>(
	events: RegistryEvent[],
	tag: K,
): Extract<RegistryEvent, { _tag: K }>[] =>
	events.filter((e): e is Extract<RegistryEvent, { _tag: K }> => e._tag === tag);

describe("TypeRegistry events", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(Path.join(tmpdir(), "registry-events-test-"));
	});

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it("emits FetchStart with package/version on fetchAndCache", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const events: RegistryEvent[] = [];
		await Effect.runPromise(TypeRegistry.fetchAndCache(pkg).pipe(Effect.provide(makeTestLayer(tempDir, events))));

		const starts = only(events, "FetchStart");
		expect(starts.length).toBeGreaterThanOrEqual(1);
		expect(starts[0].package).toBe("zod");
		expect(starts[0].version).toBe("3.22.4");
	});

	it("emits CacheMiss then PackageLoaded(source=network) on first fetch", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const events: RegistryEvent[] = [];
		await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, events))));

		expect(only(events, "CacheMiss").length).toBeGreaterThanOrEqual(1);
		const loaded = only(events, "PackageLoaded");
		expect(loaded.length).toBeGreaterThanOrEqual(1);
		expect(loaded[0].source).toBe("network");
		expect(loaded[0].files).toBeGreaterThan(0);
		expect(loaded[0].durationMs).toBeGreaterThanOrEqual(0);
	});

	it("emits CacheHit then PackageLoaded(source=cache) on second fetch", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const events: RegistryEvent[] = [];
		await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, events))));
		events.length = 0;
		await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, events))));

		const hits = only(events, "CacheHit");
		expect(hits.length).toBeGreaterThanOrEqual(1);
		expect(hits[0].ageMinutes).toBeGreaterThanOrEqual(0);
		expect(only(events, "PackageLoaded")[0].source).toBe("cache");
	});

	it("emits CacheStale when TTL is expired", async () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const events: RegistryEvent[] = [];
		const setup = Effect.gen(function* () {
			const cache = yield* CacheService;
			const fetcher = yield* PackageFetcher;
			yield* cache.write(pkg, "package.json", JSON.stringify(yield* fetcher.getPackageJson(pkg), null, 2));
			for (const [filePath, content] of yield* fetcher.getTypeFiles(pkg)) {
				const normalizedPath = filePath.replace(/^\//, "");
				if (normalizedPath !== "package.json") yield* cache.write(pkg, normalizedPath, content);
			}
			yield* cache.writeMetadata(pkg, { cachedAt: Date.now() - 1000 * 60 * 60, version: pkg.version, ttl: 1 });
		});
		await Effect.runPromise(setup.pipe(Effect.provide(makeTestLayer(tempDir, events))));
		events.length = 0;
		await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, events))));

		const stale = only(events, "CacheStale");
		expect(stale.length).toBeGreaterThanOrEqual(1);
		// Metadata is evicted on expiry, so age is no longer known — reported as 0.
		expect(stale[0].ageMinutes).toBeGreaterThanOrEqual(0);
	});

	it("emits BatchStart and BatchComplete for two packages", async () => {
		const packages = [
			new PackageSpec({ name: "zod", version: "3.22.4" }),
			new PackageSpec({ name: "ts-pattern", version: "5.0.6" }),
		];
		const events: RegistryEvent[] = [];
		await Effect.runPromise(TypeRegistry.getVFS(packages).pipe(Effect.provide(makeTestLayer(tempDir, events))));

		const start = only(events, "BatchStart");
		expect(start.length).toBeGreaterThanOrEqual(1);
		expect(start[0].total).toBe(2);
		const complete = only(events, "BatchComplete");
		expect(complete.length).toBeGreaterThanOrEqual(1);
		expect(complete[0].loaded).toBe(2);
		expect(complete[0].failed).toBe(0);
		expect(complete[0].totalFiles).toBeGreaterThan(0);
	});

	it("emits PackageLoadFailed (classified) and BatchComplete loaded=1 failed=1 on partial failure", async () => {
		const packages = [
			new PackageSpec({ name: "zod", version: "3.22.4" }),
			new PackageSpec({ name: "nonexistent-pkg", version: "1.0.0" }),
		];
		const events: RegistryEvent[] = [];
		await Effect.runPromise(TypeRegistry.getVFS(packages).pipe(Effect.provide(makeTestLayer(tempDir, events))));

		const failed = only(events, "PackageLoadFailed");
		expect(failed.length).toBeGreaterThanOrEqual(1);
		expect(failed[0].package).toBe("nonexistent-pkg");
		expect(["network", "not-found", "unknown"]).toContain(failed[0].kind);
		const complete = only(events, "BatchComplete")[0];
		expect(complete.loaded).toBe(1);
		expect(complete.failed).toBe(1);
	});

	it("emits VersionResolved on success", async () => {
		const events: RegistryEvent[] = [];
		await Effect.runPromise(
			TypeRegistry.resolveVersion("zod", "3.22.4").pipe(Effect.provide(makeTestLayer(tempDir, events))),
		);
		const resolved = only(events, "VersionResolved");
		expect(resolved.length).toBe(1);
		expect(resolved[0].package).toBe("zod");
		expect(resolved[0].requested).toBe("3.22.4");
		expect(resolved[0].resolved).toBe("3.22.4");
	});

	it("emits VersionResolveFailed when resolution fails", async () => {
		const events: RegistryEvent[] = [];
		const FailingFetcher = Layer.succeed(PackageFetcher, {
			...Effect.runSync(PackageFetcher.pipe(Effect.provide(MockPackageFetcherLayer))),
			resolveVersion: (name, ref) => Effect.fail(new NetworkError({ url: `fixture/${name}@${ref}`, message: "boom" })),
		});
		await Effect.runPromise(
			TypeRegistry.resolveVersion("zod", "3.22.4").pipe(
				Effect.provide(
					Layer.merge(
						FailingFetcher,
						layerCallback((e) => events.push(e)),
					),
				),
				Effect.ignore,
			),
		);
		const failed = only(events, "VersionResolveFailed");
		expect(failed.length).toBe(1);
		expect(failed[0].package).toBe("zod");
		expect(failed[0].requested).toBe("3.22.4");
	});
});
