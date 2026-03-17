/**
 * Tests for structured log event emission from TypeRegistry programs.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NetworkError } from "../src/errors/NetworkError.js";
import { makeNodeCacheLayer } from "../src/layers/CacheServiceLive.js";
import { TypeResolverLive } from "../src/layers/TypeResolverLive.js";
import type { PackageJson } from "../src/schemas/PackageJson.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import { CacheService } from "../src/services/CacheService.js";
import { PackageFetcher } from "../src/services/PackageFetcher.js";
import * as TypeRegistry from "../src/TypeRegistry.js";

// ── Log capture infrastructure ───────────────────────────────────────────────

interface CapturedLog {
	readonly message: string;
	readonly logLevel: string;
	readonly annotations: ReadonlyMap<string, unknown>;
}

function createTestLogger(captured: CapturedLog[]) {
	return Logger.make(({ message, logLevel, annotations }) => {
		captured.push({
			message: typeof message === "string" ? message : String(message),
			logLevel: logLevel._tag,
			annotations: new Map(annotations),
		});
	});
}

// ── Fixture helpers (mirrored from TypeRegistry.unit.test.ts) ────────────────

function getFixturePath(packageName: string): string {
	return Path.join(import.meta.dirname, "fixtures", packageName);
}

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

// ── Test layer factory ────────────────────────────────────────────────────────

function makeTestLayer(cacheDir: string, captured: CapturedLog[]) {
	const services = Layer.mergeAll(
		makeNodeCacheLayer(cacheDir).pipe(Layer.provide(NodeFileSystem.layer)),
		MockPackageFetcherLayer,
		TypeResolverLive,
	);
	const logger = createTestLogger(captured);
	const logLayer = Layer.merge(Logger.replace(Logger.defaultLogger, logger), Logger.minimumLogLevel(LogLevel.Debug));
	return Layer.merge(services, logLayer);
}

function findEvents(captured: CapturedLog[], eventName: string): CapturedLog[] {
	return captured.filter((log) => log.annotations.get("event") === eventName);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TypeRegistry logging", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(Path.join(tmpdir(), "registry-logging-test-"));
	});

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("fetchAndCache", () => {
		it("emits package.fetch.start at Debug level with package/version annotations", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
			const captured: CapturedLog[] = [];

			await Effect.runPromise(TypeRegistry.fetchAndCache(pkg).pipe(Effect.provide(makeTestLayer(tempDir, captured))));

			const events = findEvents(captured, "package.fetch.start");
			expect(events.length).toBeGreaterThanOrEqual(1);

			const event = events[0];
			expect(event.logLevel).toBe("Debug");
			expect(event.annotations.get("package")).toBe("zod");
			expect(event.annotations.get("version")).toBe("3.22.4");
		});
	});

	describe("getPackageVFS", () => {
		it("emits cache.miss (Debug) then package.loaded (Info) with source=network on first fetch", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
			const captured: CapturedLog[] = [];

			await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, captured))));

			const missEvents = findEvents(captured, "cache.miss");
			expect(missEvents.length).toBeGreaterThanOrEqual(1);
			expect(missEvents[0].logLevel).toBe("Debug");
			expect(missEvents[0].annotations.get("package")).toBe("zod");
			expect(missEvents[0].annotations.get("version")).toBe("3.22.4");

			const loadedEvents = findEvents(captured, "package.loaded");
			expect(loadedEvents.length).toBeGreaterThanOrEqual(1);
			const loadedEvent = loadedEvents[0];
			expect(loadedEvent.logLevel).toBe("Info");
			expect(loadedEvent.annotations.get("source")).toBe("network");
			expect(Number(loadedEvent.annotations.get("durationMs"))).toBeGreaterThanOrEqual(0);
			expect(Number(loadedEvent.annotations.get("files"))).toBeGreaterThan(0);
		});

		it("emits cache.hit (Info) then package.loaded (Info) with source=cache on second fetch", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
			const captured: CapturedLog[] = [];

			// First call populates the cache
			await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, captured))));

			// Reset captured logs
			captured.length = 0;

			// Second call should be a cache hit
			await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, captured))));

			const hitEvents = findEvents(captured, "cache.hit");
			expect(hitEvents.length).toBeGreaterThanOrEqual(1);
			const hitEvent = hitEvents[0];
			expect(hitEvent.logLevel).toBe("Info");
			expect(Number(hitEvent.annotations.get("ageMinutes"))).toBeGreaterThanOrEqual(0);

			const loadedEvents = findEvents(captured, "package.loaded");
			expect(loadedEvents.length).toBeGreaterThanOrEqual(1);
			expect(loadedEvents[0].annotations.get("source")).toBe("cache");
		});

		it("emits cache.stale (Debug) when TTL is expired and refetches", async () => {
			const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
			const captured: CapturedLog[] = [];

			// Manually populate cache with stale metadata (1 hour ago, ttl=1ms)
			const setup = Effect.gen(function* () {
				const cache = yield* CacheService;
				const fetcher = yield* PackageFetcher;
				const packageJson = yield* fetcher.getPackageJson(pkg);
				yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));
				const typeFiles = yield* fetcher.getTypeFiles(pkg);
				for (const [filePath, content] of typeFiles) {
					const normalizedPath = filePath.replace(/^\//, "");
					if (normalizedPath !== "package.json") {
						yield* cache.write(pkg, normalizedPath, content);
					}
				}
				yield* cache.writeMetadata(pkg, {
					cachedAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
					version: pkg.version,
					ttl: 1, // 1ms TTL — immediately stale
				});
			});

			await Effect.runPromise(setup.pipe(Effect.provide(makeTestLayer(tempDir, captured))));
			captured.length = 0;

			await Effect.runPromise(TypeRegistry.getPackageVFS(pkg).pipe(Effect.provide(makeTestLayer(tempDir, captured))));

			const staleEvents = findEvents(captured, "cache.stale");
			expect(staleEvents.length).toBeGreaterThanOrEqual(1);
			const staleEvent = staleEvents[0];
			expect(staleEvent.logLevel).toBe("Debug");
			expect(Number(staleEvent.annotations.get("ageMinutes"))).toBeGreaterThan(0);
		});
	});

	describe("getVFS", () => {
		it("emits packages.batch.start (Debug) and packages.batch.complete (Info) for two packages", async () => {
			const packages = [
				new PackageSpec({ name: "zod", version: "3.22.4" }),
				new PackageSpec({ name: "ts-pattern", version: "5.0.6" }),
			];
			const captured: CapturedLog[] = [];

			await Effect.runPromise(TypeRegistry.getVFS(packages).pipe(Effect.provide(makeTestLayer(tempDir, captured))));

			const batchStartEvents = findEvents(captured, "packages.batch.start");
			expect(batchStartEvents.length).toBeGreaterThanOrEqual(1);
			const batchStart = batchStartEvents[0];
			expect(batchStart.logLevel).toBe("Debug");
			expect(batchStart.annotations.get("total")).toBe("2");

			const batchCompleteEvents = findEvents(captured, "packages.batch.complete");
			expect(batchCompleteEvents.length).toBeGreaterThanOrEqual(1);
			const batchComplete = batchCompleteEvents[0];
			expect(batchComplete.logLevel).toBe("Info");
			expect(batchComplete.annotations.get("loaded")).toBe("2");
			expect(batchComplete.annotations.get("failed")).toBe("0");
			expect(Number(batchComplete.annotations.get("durationMs"))).toBeGreaterThanOrEqual(0);
			expect(Number(batchComplete.annotations.get("totalFiles"))).toBeGreaterThan(0);
		});

		it("emits package.load.failed (Warning) and batch.complete with loaded=1, failed=1 for partial failure", async () => {
			const packages = [
				new PackageSpec({ name: "zod", version: "3.22.4" }),
				new PackageSpec({ name: "nonexistent-pkg", version: "1.0.0" }),
			];
			const captured: CapturedLog[] = [];

			await Effect.runPromise(TypeRegistry.getVFS(packages).pipe(Effect.provide(makeTestLayer(tempDir, captured))));

			const failedEvents = findEvents(captured, "package.load.failed");
			expect(failedEvents.length).toBeGreaterThanOrEqual(1);
			const failedEvent = failedEvents[0];
			expect(failedEvent.logLevel).toBe("Warning");
			expect(failedEvent.annotations.get("package")).toBe("nonexistent-pkg");

			const batchCompleteEvents = findEvents(captured, "packages.batch.complete");
			expect(batchCompleteEvents.length).toBeGreaterThanOrEqual(1);
			const batchComplete = batchCompleteEvents[0];
			expect(batchComplete.annotations.get("loaded")).toBe("1");
			expect(batchComplete.annotations.get("failed")).toBe("1");
		});
	});

	describe("resolveVersion", () => {
		it("emits package.version.resolved (Info) with package, requested, and resolved annotations", async () => {
			const captured: CapturedLog[] = [];

			await Effect.runPromise(
				TypeRegistry.resolveVersion("zod", "3.22.4").pipe(Effect.provide(makeTestLayer(tempDir, captured))),
			);

			const events = findEvents(captured, "package.version.resolved");
			expect(events.length).toBeGreaterThanOrEqual(1);
			const event = events[0];
			expect(event.logLevel).toBe("Info");
			expect(event.annotations.get("package")).toBe("zod");
			expect(event.annotations.get("requested")).toBe("3.22.4");
			expect(event.annotations.get("resolved")).toBe("3.22.4");
		});
	});
});
