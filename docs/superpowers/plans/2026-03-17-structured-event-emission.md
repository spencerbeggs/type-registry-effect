# Structured Event Emission Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit structured log events from TypeRegistry programs via Effect.log
with annotations, add Effect Metrics for counters and timing histograms, and
remove the unused callback-based API.

**Architecture:** Add `Effect.log`/`Effect.logDebug`/`Effect.logWarning` calls
with `Effect.annotateLogs` at lifecycle points in `TypeRegistry.ts`. Create a
new `src/metrics.ts` module with Effect Metric definitions. Remove
`createLogEvent` and `LogEventHandler` from the public API.

**Tech Stack:** Effect (`Effect.log`, `Effect.annotateLogs`, `Metric`,
`MetricBoundaries`)

**Spec:** `docs/superpowers/specs/2026-03-17-structured-event-emission-design.md`

---

## Chunk 1: Schema Changes and Metrics Module

### Task 1: Update LogEventSchema — add durationMs to package.loaded

**Files:**

- Modify: `src/events.ts:121-133`
- Modify: `__test__/events.test.ts:66-84`

- [ ] **Step 1: Update the package.loaded schema variant**

In `src/events.ts`, add `durationMs` to the `package.loaded` data struct:

```typescript
// In the package.loaded Schema.Struct (around line 121-133)
// Add durationMs to the data struct:
data: Schema.Struct({
  package: Schema.String,
  version: Schema.String,
  files: Schema.Number,
  source: Schema.Literal("cache", "network"),
  durationMs: Schema.Number,
}),
```

- [ ] **Step 2: Remove createLogEvent and LogEventHandler**

In `src/events.ts`, delete the `LogEventHandler` type alias (line ~228-239)
and the `createLogEvent` function (line ~241-262). Keep only `LogEventSchema`
and `LogEvent`.

- [ ] **Step 3: Update events test file**

Rewrite `__test__/events.test.ts` to:

- Remove the `createLogEvent` import
- Import `Schema` from `effect` and `LogEventSchema` from `../src/events.js`
- Replace all `createLogEvent(input)` calls with
  `Schema.decodeUnknownSync(LogEventSchema)(input)`
- Update the two `package.loaded` test cases to include
  `durationMs: 1234` in the data
- Update the test descriptions from `"createLogEvent"` to
  `"LogEventSchema"`

```typescript
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { LogEventSchema } from "../src/events.js";

const decode = Schema.decodeUnknownSync(LogEventSchema);

const base = {
  message: "test message",
  timestamp: Date.now(),
};

const baseWithFiber = {
  ...base,
  fiber: "fiber-123",
};

describe("LogEventSchema", () => {
  describe("valid events", () => {
    it("should validate package.version.resolved", () => {
      const input = {
        ...base,
        event: "package.version.resolved",
        level: "info",
        data: {
          package: "react",
          requested: "^18",
          resolved: "18.2.0",
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate cache.hit", () => {
      const input = {
        ...base,
        event: "cache.hit",
        level: "info",
        data: {
          package: "react",
          version: "18.2.0",
          ageMinutes: 5,
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate cache.stale", () => {
      const input = {
        ...base,
        event: "cache.stale",
        level: "debug",
        data: {
          package: "react",
          version: "18.2.0",
          ageMinutes: 120,
          ttlMinutes: 60,
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate cache.miss", () => {
      const input = {
        ...base,
        event: "cache.miss",
        level: "debug",
        data: { package: "react", version: "18.2.0" },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate package.fetch.start", () => {
      const input = {
        ...base,
        event: "package.fetch.start",
        level: "debug",
        data: { package: "react", version: "18.2.0" },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate package.loaded", () => {
      const input = {
        ...base,
        event: "package.loaded",
        level: "info",
        data: {
          package: "react",
          version: "18.2.0",
          files: 42,
          source: "cache" as const,
          durationMs: 1234,
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate package.loaded with source network", () => {
      const input = {
        ...base,
        event: "package.loaded",
        level: "info",
        data: {
          package: "react",
          version: "18.2.0",
          files: 42,
          source: "network" as const,
          durationMs: 5678,
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate package.load.failed", () => {
      const input = {
        ...base,
        event: "package.load.failed",
        level: "warn",
        data: {
          package: "react",
          version: "18.2.0",
          error: "404 Not Found",
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate packages.batch.start", () => {
      const input = {
        ...base,
        event: "packages.batch.start",
        level: "debug",
        data: {
          total: 3,
          packages: ["react", "vue", "svelte"],
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate packages.batch.complete", () => {
      const input = {
        ...base,
        event: "packages.batch.complete",
        level: "info",
        data: {
          loaded: 2,
          failed: 1,
          total: 3,
          totalFiles: 100,
          durationMs: 1500,
        },
      };
      expect(decode(input)).toEqual(input);
    });

    it("should validate typescript.cache.created", () => {
      const input = {
        ...base,
        event: "typescript.cache.created",
        level: "info",
        data: {
          packages: ["react", "vue"],
          fileCount: 50,
          rootFiles: 2,
        },
      };
      expect(decode(input)).toEqual(input);
    });
  });

  describe("optional fiber field", () => {
    it("should accept an event without fiber", () => {
      const input = {
        ...base,
        event: "cache.hit",
        level: "info",
        data: {
          package: "react",
          version: "18.2.0",
          ageMinutes: 5,
        },
      };
      const result = decode(input);
      expect(result).toEqual(input);
      expect("fiber" in result).toBe(false);
    });

    it("should accept an event with fiber", () => {
      const input = {
        ...baseWithFiber,
        event: "cache.hit",
        level: "info",
        data: {
          package: "react",
          version: "18.2.0",
          ageMinutes: 5,
        },
      };
      const result = decode(input);
      expect(result).toEqual(input);
      expect(result.fiber).toBe("fiber-123");
    });
  });

  describe("invalid events", () => {
    it("should throw on missing required field (message)", () => {
      const input = {
        event: "cache.hit",
        level: "info",
        timestamp: Date.now(),
        data: {
          package: "react",
          version: "18.2.0",
          ageMinutes: 5,
        },
      };
      expect(() => decode(input)).toThrow();
    });

    it("should throw on missing data field", () => {
      const input = {
        ...base,
        event: "cache.hit",
        level: "info",
      };
      expect(() => decode(input)).toThrow();
    });

    it("should throw on unknown event discriminator", () => {
      const input = {
        ...base,
        event: "unknown.event",
        level: "info",
        data: {},
      };
      expect(() => decode(input)).toThrow();
    });

    it("should throw on wrong level for event type", () => {
      const input = {
        ...base,
        event: "cache.hit",
        level: "debug",
        data: {
          package: "react",
          version: "18.2.0",
          ageMinutes: 5,
        },
      };
      expect(() => decode(input)).toThrow();
    });

    it("should throw on invalid source literal", () => {
      const input = {
        ...base,
        event: "package.loaded",
        level: "info",
        data: {
          package: "react",
          version: "18.2.0",
          files: 42,
          source: "disk",
          durationMs: 100,
        },
      };
      expect(() => decode(input)).toThrow();
    });

    it("should throw on completely invalid input", () => {
      expect(() => decode(null)).toThrow();
      expect(() => decode(42)).toThrow();
      expect(() => decode("string")).toThrow();
    });
  });
});
```

- [ ] **Step 4: Run events tests**

Run: `pnpm vitest run __test__/events.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Update index.ts exports**

In `src/index.ts`, change the events export block (around line 93-96):

```typescript
// ── Events ──────────────────────────────────────────────────────────────────

export type { LogEvent } from "./events.js";
export { LogEventSchema } from "./events.js";
```

Remove `LogEventHandler` from the type export and `createLogEvent` from the
value export.

- [ ] **Step 6: Commit**

```bash
git add src/events.ts src/index.ts __test__/events.test.ts
git commit -m "refactor: remove createLogEvent/LogEventHandler, add durationMs to package.loaded schema"
```

### Task 2: Create metrics module

**Files:**

- Create: `src/metrics.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the metrics test file**

Create `__test__/metrics.test.ts`:

```typescript
import { Effect, Metric } from "effect";
import { describe, expect, it } from "vitest";
import {
  batchDuration,
  cacheHits,
  cacheMisses,
  cacheStale,
  packageLoadDuration,
  packagesFailed,
  packagesLoaded,
} from "../src/metrics.js";

describe("Metrics", () => {
  describe("counters", () => {
    it("should increment cacheHits", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.increment(cacheHits);
        yield* Metric.increment(cacheHits);
        const state = yield* Metric.value(cacheHits);
        return state.count;
      });
      const result = await Effect.runPromise(program);
      expect(result).toBeGreaterThanOrEqual(2);
    });

    it("should increment cacheMisses", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.increment(cacheMisses);
        const state = yield* Metric.value(cacheMisses);
        return state.count;
      });
      const result = await Effect.runPromise(program);
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it("should increment cacheStale", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.increment(cacheStale);
        const state = yield* Metric.value(cacheStale);
        return state.count;
      });
      const result = await Effect.runPromise(program);
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it("should increment packagesLoaded", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.increment(packagesLoaded);
        const state = yield* Metric.value(packagesLoaded);
        return state.count;
      });
      const result = await Effect.runPromise(program);
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it("should increment packagesFailed", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.increment(packagesFailed);
        const state = yield* Metric.value(packagesFailed);
        return state.count;
      });
      const result = await Effect.runPromise(program);
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  describe("histograms", () => {
    it("should track packageLoadDuration", async () => {
      const program = Effect.gen(function* () {
        yield* Effect.sleep("10 millis").pipe(
          Metric.trackDuration(packageLoadDuration),
        );
        const state = yield* Metric.value(packageLoadDuration);
        return state;
      });
      const result = await Effect.runPromise(program);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.min).toBeGreaterThan(0);
    });

    it("should track batchDuration", async () => {
      const program = Effect.gen(function* () {
        yield* Effect.sleep("10 millis").pipe(
          Metric.trackDuration(batchDuration),
        );
        const state = yield* Metric.value(batchDuration);
        return state;
      });
      const result = await Effect.runPromise(program);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.min).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __test__/metrics.test.ts`
Expected: FAIL — cannot resolve `../src/metrics.js`.

- [ ] **Step 3: Create src/metrics.ts**

```typescript
/**
 * Effect Metrics for TypeRegistry operations.
 *
 * @remarks
 * Counters track cumulative event counts. Histograms (via {@link Metric.timer})
 * track operation durations in milliseconds. Consumers can read metric values
 * via {@link Metric.value} or connect an OpenTelemetry exporter.
 *
 * @packageDocumentation
 */

import { Metric } from "effect";

// ── Counters ────────────────────────────────────────────────────────────────

/** Number of cache hits (package found in cache and fresh). */
export const cacheHits = Metric.counter("type_registry.cache.hits", {
  description: "Cache hits — package found in cache and fresh",
  incremental: true,
});

/** Number of cache misses (package not in cache). */
export const cacheMisses = Metric.counter("type_registry.cache.misses", {
  description: "Cache misses — package not in cache",
  incremental: true,
});

/** Number of stale cache entries (TTL expired, re-fetch triggered). */
export const cacheStale = Metric.counter("type_registry.cache.stale", {
  description: "Cache stale — TTL expired, re-fetch triggered",
  incremental: true,
});

/** Number of packages loaded successfully. */
export const packagesLoaded = Metric.counter(
  "type_registry.packages.loaded",
  {
    description: "Packages loaded successfully",
    incremental: true,
  },
);

/** Number of packages that failed to load. */
export const packagesFailed = Metric.counter(
  "type_registry.packages.failed",
  {
    description: "Packages that failed to load",
    incremental: true,
  },
);

// ── Histograms (timers) ─────────────────────────────────────────────────────

/** Duration to load a single package (cache or network), in milliseconds. */
export const packageLoadDuration = Metric.timer(
  "type_registry.package.load.duration",
  "Time to load a single package in milliseconds",
);

/** Duration of a full getVFS batch operation, in milliseconds. */
export const batchDuration = Metric.timer(
  "type_registry.batch.duration",
  "Time for a full getVFS batch operation in milliseconds",
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/metrics.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Add metrics exports to index.ts**

In `src/index.ts`, add after the Events section:

```typescript
// ── Metrics ─────────────────────────────────────────────────────────────────

export {
  batchDuration,
  cacheHits,
  cacheMisses,
  cacheStale,
  packageLoadDuration,
  packagesFailed,
  packagesLoaded,
} from "./metrics.js";
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/metrics.ts src/index.ts __test__/metrics.test.ts
git commit -m "feat: add Effect Metrics module with counters and timing histograms"
```

## Chunk 2: Emit Events from TypeRegistry Programs

### Task 3: Add log events to fetchAndCache

**Files:**

- Modify: `src/TypeRegistry.ts:109-141`

- [ ] **Step 1: Write the logging test for fetchAndCache**

Create `__test__/TypeRegistry.logging.test.ts` with the first test case.
This file uses a custom Logger that captures annotations.

```typescript
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Logger, List, FiberRef, LogLevel } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NetworkError } from "../src/errors/NetworkError.js";
import { makeNodeCacheLayer } from "../src/layers/CacheServiceLive.js";
import { TypeResolverLive } from "../src/layers/TypeResolverLive.js";
import type { PackageJson } from "../src/schemas/PackageJson.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import { CacheService } from "../src/services/CacheService.js";
import { PackageFetcher } from "../src/services/PackageFetcher.js";
import { TypeResolver } from "../src/services/TypeResolver.js";
import * as TypeRegistry from "../src/TypeRegistry.js";

// ── Captured log entry ──────────────────────────────────────────────────────

interface CapturedLog {
  readonly message: string;
  readonly logLevel: string;
  readonly annotations: ReadonlyMap<string, unknown>;
}

// ── Fixture helpers (same as TypeRegistry.unit.test.ts) ─────────────────────

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

// ── Mock PackageFetcher ─────────────────────────────────────────────────────

const MockPackageFetcherLayer: Layer.Layer<PackageFetcher> = Layer.succeed(
  PackageFetcher,
  {
    getVersions: (name) =>
      Effect.try({
        try: () => {
          const fixturePath = getFixturePath(name);
          const packageJson = JSON.parse(
            readFileSync(Path.join(fixturePath, "package.json"), "utf-8"),
          );
          return {
            versions: [packageJson.version as string],
            tags: { latest: packageJson.version as string },
          };
        },
        catch: (e) =>
          new NetworkError({
            url: `fixture/${name}`,
            message: String(e),
          }),
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
        catch: (e) =>
          new NetworkError({
            url: `fixture/${pkg.name}`,
            message: String(e),
          }),
      }),
    downloadFile: (_pkg, _path) => Effect.succeed(""),
    getPackageJson: (pkg) =>
      Effect.try({
        try: () => {
          const fixturePath = getFixturePath(pkg.name);
          return JSON.parse(
            readFileSync(
              Path.join(fixturePath, "package.json"),
              "utf-8",
            ),
          ) as PackageJson;
        },
        catch: (e) =>
          new NetworkError({
            url: `fixture/${pkg.name}`,
            message: String(e),
          }),
      }),
    getTypeFiles: (pkg) =>
      Effect.try({
        try: () => {
          const fixturePath = getFixturePath(pkg.name);
          const files = getAllFiles(fixturePath);
          const typeFiles = new Map<string, string>();
          const typeFilePattern = /\.d\.([^.]+\.)?[cm]?ts$/i;
          for (const file of files) {
            if (
              typeFilePattern.test(file) ||
              file.endsWith("package.json")
            ) {
              const normalizedPath = file.startsWith("/")
                ? file.slice(1)
                : file;
              typeFiles.set(
                file,
                readFileSync(
                  Path.join(fixturePath, normalizedPath),
                  "utf-8",
                ),
              );
            }
          }
          return typeFiles;
        },
        catch: (e) =>
          new NetworkError({
            url: `fixture/${pkg.name}`,
            message: String(e),
          }),
      }),
  },
);

// ── Test helpers ────────────────────────────────────────────────────────────

function createTestLogger(captured: CapturedLog[]) {
  return Logger.make(({ message, logLevel, annotations }) => {
    const msg = typeof message === "string"
      ? message
      : String(message);
    captured.push({
      message: msg,
      logLevel: logLevel._tag,
      annotations: new Map(annotations),
    });
  });
}

function makeTestLayer(cacheDir: string, captured: CapturedLog[]) {
  const services = Layer.mergeAll(
    makeNodeCacheLayer(cacheDir).pipe(
      Layer.provide(NodeFileSystem.layer),
    ),
    MockPackageFetcherLayer,
    TypeResolverLive,
  );
  const logger = createTestLogger(captured);
  const logLayer = Logger.replace(Logger.defaultLogger, logger);
  return Layer.merge(services, logLayer);
}

function findEvents(
  captured: CapturedLog[],
  eventName: string,
): CapturedLog[] {
  return captured.filter(
    (log) => log.annotations.get("event") === eventName,
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("TypeRegistry Logging", () => {
  let tempDir: string;
  let captured: CapturedLog[];

  beforeEach(() => {
    tempDir = mkdtempSync(
      Path.join(tmpdir(), "registry-logging-test-"),
    );
    captured = [];
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("fetchAndCache", () => {
    it("should emit package.fetch.start", async () => {
      const pkg = new PackageSpec({
        name: "zod",
        version: "3.22.4",
      });
      const program = TypeRegistry.fetchAndCache(pkg);
      await Effect.runPromise(
        Effect.provide(program, makeTestLayer(tempDir, captured)),
      );

      const events = findEvents(captured, "package.fetch.start");
      expect(events.length).toBe(1);
      expect(events[0].logLevel).toBe("Debug");
      expect(events[0].annotations.get("package")).toBe("zod");
      expect(events[0].annotations.get("version")).toBe("3.22.4");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: FAIL — no `package.fetch.start` event emitted.

- [ ] **Step 3: Add package.fetch.start to fetchAndCache**

In `src/TypeRegistry.ts`, add the log event at the start of `fetchAndCache`,
right after yielding the services:

```typescript
export const fetchAndCache = (
  pkg: PackageSpec,
  options?: { readonly ttl?: number },
): Effect.Effect<
  void,
  NetworkError | ParseError | CacheError,
  CacheService | PackageFetcher
> =>
  Effect.gen(function* () {
    const cache = yield* CacheService;
    const fetcher = yield* PackageFetcher;

    // Emit fetch start event
    yield* Effect.logDebug(`Fetching ${pkg.toString()}`).pipe(
      Effect.annotateLogs("event", "package.fetch.start"),
      Effect.annotateLogs("package", pkg.name),
      Effect.annotateLogs("version", pkg.version),
    );

    // ... rest of existing implementation unchanged
  });
```

Add `Metric` to the imports at the top of the file:

```typescript
import { Effect, Metric } from "effect";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/TypeRegistry.ts __test__/TypeRegistry.logging.test.ts
git commit -m "feat: emit package.fetch.start event from fetchAndCache"
```

### Task 4: Add log events and metrics to getPackageVFS

**Files:**

- Modify: `src/TypeRegistry.ts:187-226`
- Modify: `__test__/TypeRegistry.logging.test.ts`

- [ ] **Step 1: Write tests for cache.miss, cache.hit, cache.stale, and package.loaded**

Append to the `describe("TypeRegistry Logging")` block in
`__test__/TypeRegistry.logging.test.ts`:

```typescript
  describe("getPackageVFS", () => {
    it("should emit cache.miss and package.loaded on cache miss", async () => {
      const pkg = new PackageSpec({
        name: "zod",
        version: "3.22.4",
      });
      const program = TypeRegistry.getPackageVFS(pkg);
      await Effect.runPromise(
        Effect.provide(program, makeTestLayer(tempDir, captured)),
      );

      const misses = findEvents(captured, "cache.miss");
      expect(misses.length).toBe(1);
      expect(misses[0].logLevel).toBe("Debug");
      expect(misses[0].annotations.get("package")).toBe("zod");
      expect(misses[0].annotations.get("version")).toBe("3.22.4");

      const loaded = findEvents(captured, "package.loaded");
      expect(loaded.length).toBe(1);
      expect(loaded[0].logLevel).toBe("Info");
      expect(loaded[0].annotations.get("source")).toBe("network");
      expect(
        Number(loaded[0].annotations.get("durationMs")),
      ).toBeGreaterThanOrEqual(0);
      expect(
        Number(loaded[0].annotations.get("files")),
      ).toBeGreaterThan(0);
    });

    it("should emit cache.hit and package.loaded on cache hit", async () => {
      const pkg = new PackageSpec({
        name: "zod",
        version: "3.22.4",
      });
      // First call populates cache
      await Effect.runPromise(
        Effect.provide(
          TypeRegistry.getPackageVFS(pkg),
          makeTestLayer(tempDir, captured),
        ),
      );

      // Reset captured logs
      captured.length = 0;

      // Second call should hit cache
      await Effect.runPromise(
        Effect.provide(
          TypeRegistry.getPackageVFS(pkg),
          makeTestLayer(tempDir, captured),
        ),
      );

      const hits = findEvents(captured, "cache.hit");
      expect(hits.length).toBe(1);
      expect(hits[0].logLevel).toBe("Info");
      expect(hits[0].annotations.get("package")).toBe("zod");
      expect(
        Number(hits[0].annotations.get("ageMinutes")),
      ).toBeGreaterThanOrEqual(0);

      const loaded = findEvents(captured, "package.loaded");
      expect(loaded.length).toBe(1);
      expect(loaded[0].annotations.get("source")).toBe("cache");
    });

    it("should emit cache.stale on stale cache", async () => {
      const pkg = new PackageSpec({
        name: "zod",
        version: "3.22.4",
      });
      // Populate cache with expired TTL
      const setup = Effect.gen(function* () {
        const cache = yield* CacheService;
        const fetcher = yield* PackageFetcher;
        const packageJson = yield* fetcher.getPackageJson(pkg);
        yield* cache.write(
          pkg,
          "package.json",
          JSON.stringify(packageJson, null, 2),
        );
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
          ttl: 1, // 1ms TTL — already expired
        });
      });
      await Effect.runPromise(
        Effect.provide(setup, makeTestLayer(tempDir, captured)),
      );

      captured.length = 0;

      await Effect.runPromise(
        Effect.provide(
          TypeRegistry.getPackageVFS(pkg, { ttl: 1 }),
          makeTestLayer(tempDir, captured),
        ),
      );

      const stale = findEvents(captured, "cache.stale");
      expect(stale.length).toBe(1);
      expect(stale[0].logLevel).toBe("Debug");
      expect(
        Number(stale[0].annotations.get("ageMinutes")),
      ).toBeGreaterThan(0);
      expect(
        Number(stale[0].annotations.get("ttlMinutes")),
      ).toBeGreaterThanOrEqual(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: FAIL — no cache.miss, cache.hit, cache.stale, or package.loaded
events emitted.

- [ ] **Step 3: Implement log events and metrics in getPackageVFS**

Rewrite `getPackageVFS` in `src/TypeRegistry.ts`. Add the metrics import at
the top:

```typescript
import {
  batchDuration,
  cacheHits,
  cacheMisses,
  cacheStale,
  packageLoadDuration,
  packagesFailed,
  packagesLoaded,
} from "./metrics.js";
```

Then rewrite `getPackageVFS`:

```typescript
export const getPackageVFS = (
  pkg: PackageSpec,
  options?: {
    readonly autoFetch?: boolean;
    readonly ttl?: number;
  },
): Effect.Effect<
  VirtualFileSystem,
  NetworkError | ParseError | CacheError | PackageNotFoundError,
  CacheService | PackageFetcher
> => {
  const inner = Effect.gen(function* () {
    const cache = yield* CacheService;
    const autoFetch = options?.autoFetch ?? true;
    const startTime = Date.now();

    const exists = yield* cache.exists(pkg);
    let source: "cache" | "network" = "cache";

    if (!exists && autoFetch) {
      // Cache miss — fetch from network
      yield* Effect.logDebug(
        `Cache miss for ${pkg.toString()}`,
      ).pipe(
        Effect.annotateLogs("event", "cache.miss"),
        Effect.annotateLogs("package", pkg.name),
        Effect.annotateLogs("version", pkg.version),
      );
      yield* Metric.increment(cacheMisses);
      yield* fetchAndCache(pkg, options);
      source = "network";
    } else if (!exists && !autoFetch) {
      yield* Effect.fail(
        new PackageNotFoundError({
          name: pkg.name,
          version: pkg.version,
          message: `Package ${pkg.toString()} is not cached and autoFetch is disabled`,
        }),
      );
    } else if (exists && autoFetch) {
      // Check TTL staleness
      const metaResult = yield* cache.readMetadata(pkg).pipe(
        Effect.map((meta) => ({
          isStale:
            meta.ttl !== undefined
              ? meta.cachedAt + meta.ttl < Date.now()
              : false,
          ageMinutes: (Date.now() - meta.cachedAt) / 60000,
          ttlMinutes:
            meta.ttl !== undefined ? meta.ttl / 60000 : undefined,
        })),
        Effect.catchAll(() =>
          Effect.succeed({
            isStale: false,
            ageMinutes: 0,
            ttlMinutes: undefined as number | undefined,
          }),
        ),
      );

      if (metaResult.isStale) {
        yield* Effect.logDebug(
          `Cache stale for ${pkg.toString()}`,
        ).pipe(
          Effect.annotateLogs("event", "cache.stale"),
          Effect.annotateLogs("package", pkg.name),
          Effect.annotateLogs("version", pkg.version),
          Effect.annotateLogs(
            "ageMinutes",
            String(Math.round(metaResult.ageMinutes)),
          ),
          Effect.annotateLogs(
            "ttlMinutes",
            String(Math.round(metaResult.ttlMinutes ?? 0)),
          ),
        );
        yield* Metric.increment(cacheStale);
        yield* fetchAndCache(pkg, options);
        source = "network";
      } else {
        yield* Effect.log(
          `Cache hit for ${pkg.toString()}`,
        ).pipe(
          Effect.annotateLogs("event", "cache.hit"),
          Effect.annotateLogs("package", pkg.name),
          Effect.annotateLogs("version", pkg.version),
          Effect.annotateLogs(
            "ageMinutes",
            String(Math.round(metaResult.ageMinutes)),
          ),
        );
        yield* Metric.increment(cacheHits);
      }
    } else {
      // exists && !autoFetch — use cache silently
      const metaResult = yield* cache.readMetadata(pkg).pipe(
        Effect.map((meta) => ({
          ageMinutes: (Date.now() - meta.cachedAt) / 60000,
        })),
        Effect.catchAll(() =>
          Effect.succeed({ ageMinutes: 0 }),
        ),
      );
      yield* Effect.log(
        `Cache hit for ${pkg.toString()}`,
      ).pipe(
        Effect.annotateLogs("event", "cache.hit"),
        Effect.annotateLogs("package", pkg.name),
        Effect.annotateLogs("version", pkg.version),
        Effect.annotateLogs(
          "ageMinutes",
          String(Math.round(metaResult.ageMinutes)),
        ),
      );
      yield* Metric.increment(cacheHits);
    }

    const vfs = yield* cache.getVFS(pkg);

    // Emit package.loaded
    const durationMs = Date.now() - startTime;
    yield* Effect.log(
      `Loaded ${pkg.toString()} (${vfs.size} files, ${source})`,
    ).pipe(
      Effect.annotateLogs("event", "package.loaded"),
      Effect.annotateLogs("package", pkg.name),
      Effect.annotateLogs("version", pkg.version),
      Effect.annotateLogs("files", String(vfs.size)),
      Effect.annotateLogs("source", source),
      Effect.annotateLogs("durationMs", String(durationMs)),
    );
    yield* Metric.increment(packagesLoaded);

    return vfs;
  });

  return inner.pipe(Metric.trackDuration(packageLoadDuration));
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass (including existing unit tests).

- [ ] **Step 6: Commit**

```bash
git add src/TypeRegistry.ts __test__/TypeRegistry.logging.test.ts
git commit -m "feat: emit cache and package.loaded events from getPackageVFS with metrics"
```

### Task 5: Add log events and metrics to getVFS

**Files:**

- Modify: `src/TypeRegistry.ts:275-314`
- Modify: `__test__/TypeRegistry.logging.test.ts`

- [ ] **Step 1: Write tests for batch events and package.load.failed**

Append to `__test__/TypeRegistry.logging.test.ts`:

```typescript
  describe("getVFS", () => {
    it("should emit batch start and complete events", async () => {
      const packages = [
        new PackageSpec({ name: "zod", version: "3.22.4" }),
        new PackageSpec({ name: "ts-pattern", version: "5.0.6" }),
      ];
      const program = TypeRegistry.getVFS(packages);
      await Effect.runPromise(
        Effect.provide(program, makeTestLayer(tempDir, captured)),
      );

      const starts = findEvents(captured, "packages.batch.start");
      expect(starts.length).toBe(1);
      expect(starts[0].logLevel).toBe("Debug");
      expect(starts[0].annotations.get("total")).toBe("2");

      const completes = findEvents(
        captured,
        "packages.batch.complete",
      );
      expect(completes.length).toBe(1);
      expect(completes[0].logLevel).toBe("Info");
      expect(completes[0].annotations.get("loaded")).toBe("2");
      expect(completes[0].annotations.get("failed")).toBe("0");
      expect(
        Number(completes[0].annotations.get("durationMs")),
      ).toBeGreaterThanOrEqual(0);
      expect(
        Number(completes[0].annotations.get("totalFiles")),
      ).toBeGreaterThan(0);
    });

    it("should emit package.load.failed for failing packages", async () => {
      const packages = [
        new PackageSpec({ name: "zod", version: "3.22.4" }),
        new PackageSpec({
          name: "nonexistent-pkg",
          version: "1.0.0",
        }),
      ];
      const program = TypeRegistry.getVFS(packages);
      await Effect.runPromise(
        Effect.provide(program, makeTestLayer(tempDir, captured)),
      );

      const failed = findEvents(captured, "package.load.failed");
      expect(failed.length).toBe(1);
      expect(failed[0].logLevel).toBe("Warning");
      expect(failed[0].annotations.get("package")).toBe(
        "nonexistent-pkg",
      );
      expect(failed[0].annotations.get("version")).toBe("1.0.0");

      const completes = findEvents(
        captured,
        "packages.batch.complete",
      );
      expect(completes[0].annotations.get("loaded")).toBe("1");
      expect(completes[0].annotations.get("failed")).toBe("1");
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: FAIL — no batch events or package.load.failed emitted.

- [ ] **Step 3: Implement log events and metrics in getVFS**

Rewrite `getVFS` in `src/TypeRegistry.ts`:

```typescript
export const getVFS = (
  packages: ReadonlyArray<PackageSpec>,
  options?: {
    readonly autoFetch?: boolean;
    readonly ttl?: number;
  },
): Effect.Effect<
  VirtualFileSystem,
  PackageNotFoundError,
  CacheService | PackageFetcher
> => {
  const inner = Effect.gen(function* () {
    const startTime = Date.now();

    // Emit batch start
    yield* Effect.logDebug(
      `Fetching VFS for ${packages.length} package(s)`,
    ).pipe(
      Effect.annotateLogs("event", "packages.batch.start"),
      Effect.annotateLogs("total", String(packages.length)),
      Effect.annotateLogs(
        "packages",
        packages.map((p) => p.toString()).join(", "),
      ),
    );

    const results = yield* Effect.forEach(
      packages,
      (pkg) =>
        getPackageVFS(pkg, options).pipe(
          Effect.map(
            (vfs) => ({ _tag: "ok" as const, vfs, pkg }),
          ),
          Effect.catchAll((error) => {
            return Effect.gen(function* () {
              yield* Effect.logWarning(
                `Failed to load ${pkg.toString()}: ${String(error)}`,
              ).pipe(
                Effect.annotateLogs(
                  "event",
                  "package.load.failed",
                ),
                Effect.annotateLogs("package", pkg.name),
                Effect.annotateLogs("version", pkg.version),
                Effect.annotateLogs("error", String(error)),
              );
              yield* Metric.increment(packagesFailed);
              return {
                _tag: "err" as const,
                pkg,
                error,
              };
            });
          }),
        ),
      { concurrency: 5 },
    );

    const merged: VirtualFileSystem = new Map();
    const errors: Array<{
      pkg: PackageSpec;
      error: unknown;
    }> = [];
    let totalFiles = 0;

    for (const result of results) {
      if (result._tag === "ok") {
        for (const [path, content] of result.vfs) {
          merged.set(path, content);
        }
        totalFiles += result.vfs.size;
      } else {
        errors.push({ pkg: result.pkg, error: result.error });
      }
    }

    const durationMs = Date.now() - startTime;
    const loadedCount = packages.length - errors.length;

    // Emit batch complete
    yield* Effect.log(
      `Batch complete: ${loadedCount}/${packages.length} packages (${totalFiles} files, ${durationMs}ms)`,
    ).pipe(
      Effect.annotateLogs("event", "packages.batch.complete"),
      Effect.annotateLogs("loaded", String(loadedCount)),
      Effect.annotateLogs("failed", String(errors.length)),
      Effect.annotateLogs("total", String(packages.length)),
      Effect.annotateLogs("totalFiles", String(totalFiles)),
      Effect.annotateLogs("durationMs", String(durationMs)),
    );

    if (
      errors.length === packages.length &&
      packages.length > 0
    ) {
      yield* Effect.fail(
        new PackageNotFoundError({
          name: errors.map((e) => e.pkg.name).join(", "),
          version: "",
          message: `Failed to fetch VFS for all packages:\n${errors.map((e) => `- ${e.pkg.toString()}: ${String(e.error)}`).join("\n")}`,
        }),
      );
    }

    return merged;
  });

  return inner.pipe(Metric.trackDuration(batchDuration));
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/TypeRegistry.ts __test__/TypeRegistry.logging.test.ts
git commit -m "feat: emit batch events and package.load.failed from getVFS with metrics"
```

### Task 6: Add log event to resolveVersion

**Files:**

- Modify: `src/TypeRegistry.ts:457-464`
- Modify: `__test__/TypeRegistry.logging.test.ts`

- [ ] **Step 1: Write test for package.version.resolved**

Append to `__test__/TypeRegistry.logging.test.ts`:

```typescript
  describe("resolveVersion", () => {
    it("should emit package.version.resolved", async () => {
      const program = TypeRegistry.resolveVersion("zod", "3.22.4");
      await Effect.runPromise(
        Effect.provide(program, makeTestLayer(tempDir, captured)),
      );

      const events = findEvents(
        captured,
        "package.version.resolved",
      );
      expect(events.length).toBe(1);
      expect(events[0].logLevel).toBe("Info");
      expect(events[0].annotations.get("package")).toBe("zod");
      expect(events[0].annotations.get("requested")).toBe("3.22.4");
      expect(events[0].annotations.get("resolved")).toBe("3.22.4");
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: FAIL — no `package.version.resolved` event emitted.

- [ ] **Step 3: Implement log event in resolveVersion**

In `src/TypeRegistry.ts`, update `resolveVersion`:

```typescript
export const resolveVersion = (
  name: string,
  ref: string,
): Effect.Effect<
  string,
  NetworkError | PackageNotFoundError,
  PackageFetcher
> =>
  Effect.gen(function* () {
    const fetcher = yield* PackageFetcher;
    const resolved = yield* fetcher.resolveVersion(name, ref);

    yield* Effect.log(
      `Resolved ${name}: ${ref} -> ${resolved}`,
    ).pipe(
      Effect.annotateLogs("event", "package.version.resolved"),
      Effect.annotateLogs("package", name),
      Effect.annotateLogs("requested", ref),
      Effect.annotateLogs("resolved", resolved),
    );

    return resolved;
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/TypeRegistry.logging.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/TypeRegistry.ts __test__/TypeRegistry.logging.test.ts
git commit -m "feat: emit package.version.resolved event from resolveVersion"
```

## Chunk 3: Validation and Cleanup

### Task 7: Lint, typecheck, and final validation

**Files:**

- All modified files

- [ ] **Step 1: Run linter**

Run: `pnpm run lint:fix`
Expected: No errors. Fix any that appear.

- [ ] **Step 2: Run markdown lint**

Run: `pnpm run lint:md:fix`
Expected: No errors.

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: No type errors.

- [ ] **Step 4: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass.

- [ ] **Step 5: Run test coverage**

Run: `pnpm run test:coverage`
Expected: Coverage meets or exceeds existing thresholds (80% lines/statements,
70% functions, 60% branches).

- [ ] **Step 6: Commit any lint fixes**

If linting produced changes:

```bash
git add -A
git commit -m "style: lint fixes for observability implementation"
```

### Task 8: Update design documentation

**Files:**

- Modify: `.claude/design/type-registry-effect/observability.md`
- Modify: `.claude/design/type-registry-effect/architecture.md`

- [ ] **Step 1: Update observability.md integration status**

In `.claude/design/type-registry-effect/observability.md`, update the
"Integration Status" section to reflect that events are now wired into
TypeRegistry programs via `Effect.log` with annotations. Remove the note
about the callback-based subscription API being planned. Add a section
documenting the Effect Metrics module.

- [ ] **Step 2: Update architecture.md**

In `.claude/design/type-registry-effect/architecture.md`, update the
"Public API" section's Events subsection to remove `createLogEvent` and
`LogEventHandler` references and add the metrics exports. Update the
"What Has Been Completed" section to include structured logging integration.

- [ ] **Step 3: Commit doc updates**

```bash
git add .claude/design/
git commit -m "docs: update design docs for observability implementation"
```
