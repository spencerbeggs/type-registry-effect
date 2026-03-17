---
status: current
module: type-registry-effect
category: observability
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 95
related:
  - ./architecture.md
  - ./cache-optimization.md
dependencies: []
---

# Observability & Fault Tolerance

## 1. Event-Based Observability Architecture

### Overview

The package uses a **schema-based event system** built with Effect Schema.
Instead of logging directly from services, `TypeRegistry` emits structured
events at key lifecycle points via `Effect.log` and `Effect.annotateLogs`.
Consumers receive events by providing a custom `Logger` layer -- the standard
Effect pattern for log interception.

**Key Benefits:**

- Fully Effect-native: uses `Effect.log` + `Effect.annotateLogs` (no callback)
- Runtime type validation with Effect Schema
- Log level filtering with no code duplication
- Clean separation between business logic and logging -- services remain
  logging-free
- Consumers intercept events via Effect's Logger layer

### Event Schema Definition

All events are defined as a discriminated union validated by Effect Schema.
`LogEventSchema` is a `Schema.Union(...)` value (not a `Schema.Class`):

```typescript
// src/events.ts
import * as Schema from "effect/Schema";

export const LogEventSchema = Schema.Union(
  // Package version resolved
  Schema.Struct({
    event: Schema.Literal("package.version.resolved"),
    level: Schema.Literal("info"),
    message: Schema.String,
    timestamp: Schema.Number,
    fiber: Schema.optional(Schema.String),
    data: Schema.Struct({
      package: Schema.String,
      requested: Schema.String,
      resolved: Schema.String,
    }),
  }),
  // Cache hit
  Schema.Struct({
    event: Schema.Literal("cache.hit"),
    level: Schema.Literal("info"),
    message: Schema.String,
    timestamp: Schema.Number,
    fiber: Schema.optional(Schema.String),
    data: Schema.Struct({
      package: Schema.String,
      version: Schema.String,
      ageMinutes: Schema.Number,
    }),
  }),
  // ... (10 total event types)
);

export type LogEvent = Schema.Schema.Type<typeof LogEventSchema>;
```

Note: `LogEventHandler` has been removed. The callback-based handler model
was replaced by the Effect-native `Effect.log` + Logger layer approach.

**Event Types:**

1. `package.version.resolved` - Version range resolved to specific version
2. `cache.hit` - Package found in cache (within TTL)
3. `cache.miss` - Package not in cache, needs fetching
4. `cache.stale` - Package in cache but TTL expired
5. `package.fetch.start` - HTTP download started
6. `package.loaded` - Package successfully loaded (includes `durationMs`)
7. `package.load.failed` - Package failed to load
8. `packages.batch.start` - Batch fetch started
9. `packages.batch.complete` - Batch fetch completed
10. `typescript.cache.created` - TypeScript in-memory cache created from VFS data

### Integration Status

Log events are **wired into** `TypeRegistry` namespace programs via
`Effect.log` with structured annotations. Services remain logging-free --
all `Effect.log*` calls live exclusively in `src/TypeRegistry.ts`.

**Emission points by function:**

- `fetchAndCache` -- emits `package.fetch.start` (debug)
- `getPackageVFS` -- emits `cache.hit` (info), `cache.miss` (debug),
  `cache.stale` (debug), `package.loaded` (info with `durationMs`,
  `files`, `source`)
- `getVFS` -- emits `packages.batch.start` (debug),
  `package.load.failed` (warn), `packages.batch.complete` (info with
  `loaded`, `failed`, `total`, `totalFiles`, `durationMs`)
- `resolveVersion` -- emits `package.version.resolved` (info)

**Services remain logging-free:**

- `CacheService` -- no logging in cache operations
- `PackageFetcher` -- no logging in HTTP requests
- `TypeResolver` -- no logging in type resolution

This keeps business logic clean and independently testable.

### Consumer Logger Integration

Consumers receive events by providing a custom `Logger` layer -- the
standard Effect pattern. The `TypeRegistry` module is a namespace of
composable Effect programs (not a class), so there is no instance-based
configuration. Log interception is done entirely through the Effect layer
system:

```typescript
import { Effect, Logger, LogLevel } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

// Custom logger that prints structured JSON for each log message
const jsonLogger = Logger.make(({ logLevel, message, annotations }) => {
  console.log(JSON.stringify({ level: logLevel.label, message, ...annotations }));
});

const program = Effect.gen(function* () {
  const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
  return yield* TypeRegistry.getVFS([pkg]);
}).pipe(
  Effect.provide(NodeLayer),
  Effect.provide(Logger.replace(Logger.defaultLogger, jsonLogger)),
  // Optionally filter by log level:
  Effect.provide(Logger.minimumLogLevel(LogLevel.Debug)),
);
```

## 2. Metrics & Telemetry

### Effect Metrics Module

`src/metrics.ts` defines all metrics using `effect/Metric`. Metrics are
exported as named constants and used directly in `src/TypeRegistry.ts`.

**Counters (5):**

| Export | Metric name | Incremented when |
| :--- | :--- | :--- |
| `cacheHits` | `type_registry_cache_hits_total` | `getPackageVFS` finds a valid cache entry |
| `cacheMisses` | `type_registry_cache_misses_total` | `getPackageVFS` finds no cache entry |
| `cacheStale` | `type_registry_cache_stale_total` | `getPackageVFS` finds an expired cache entry |
| `packagesLoaded` | `type_registry_packages_loaded_total` | `getPackageVFS` completes successfully |
| `packagesFailed` | `type_registry_packages_failed_total` | `getVFS` records a per-package failure |

**Timer histograms (2):**

| Export | Metric name | Wraps |
| :--- | :--- | :--- |
| `packageLoadDuration` | `type_registry_package_load_duration` | `getPackageVFS` via `Metric.trackDuration` |
| `batchDuration` | `type_registry_batch_duration` | `getVFS` via `Metric.trackDuration` |

### Reading Metrics

Metrics are accumulated in the Effect Metrics registry and can be read
programmatically or exported to any OpenTelemetry-compatible sink:

```typescript
import { Effect, Metric } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";
import { cacheHits, cacheMisses } from "type-registry-effect/metrics";

const program = Effect.gen(function* () {
  const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
  yield* TypeRegistry.getVFS([pkg]);

  const hits = yield* Metric.value(cacheHits);
  const misses = yield* Metric.value(cacheMisses);
  console.log({ hits: hits.count, misses: misses.count });
}).pipe(Effect.provide(NodeLayer));
```

### Distributed Tracing (Planned)

OpenTelemetry span instrumentation is not yet implemented. Planned
integration points:

```typescript
// Aspirational: spans for major operations
yield* Effect.withSpan("fetchAndCache", {
  attributes: { package: pkg.name, version: pkg.version }
})(
  Effect.gen(function* () {
    yield* Effect.withSpan("fetch_package_json")(
      fetcher.getPackageJson(pkg)
    )
    yield* Effect.withSpan("fetch_type_files")(
      fetcher.getTypeFiles(pkg)
    )
    yield* Effect.withSpan("write_to_cache")(
      writeAllFiles(pkg, files)
    )
  })
)
```

## 3. Fault Tolerance

### Retry Strategies

```typescript
import * as Schedule from "effect/Schedule"

// Exponential backoff for HTTP requests
const httpRetrySchedule = Schedule.exponential("100 millis").pipe(
  Schedule.union(Schedule.spaced("5 seconds")),
  Schedule.compose(Schedule.recurs(3)) // Max 3 retries
)

// Usage in PackageFetcher
yield* http.get(url).pipe(
  Effect.retry(httpRetrySchedule),
  Effect.catchTag("ResponseError", (error) =>
    Effect.logError("Failed to fetch after retries", { error })
  )
)
```

### Timeouts

```typescript
// Add timeouts to all network operations
const FETCH_TIMEOUT = Duration.seconds(30)
const VFS_GENERATION_TIMEOUT = Duration.seconds(120)

yield* fetcher.getPackageJson(pkg).pipe(
  Effect.timeout(FETCH_TIMEOUT),
  Effect.catchTag("TimeoutException", () =>
    Effect.fail(new Error(`Timeout fetching ${pkg.name}`))
  )
)
```

### Circuit Breaker

```typescript
import * as CircuitBreaker from "effect/CircuitBreaker"

// Protect CDN requests with circuit breaker
const cdnCircuitBreaker = CircuitBreaker.make({
  maxFailures: 5,
  resetTimeout: Duration.minutes(1),
  halfOpenTimeout: Duration.seconds(30)
})

yield* CircuitBreaker.withCircuitBreaker(
  httpRequest(url),
  cdnCircuitBreaker
).pipe(
  Effect.catchTag("CircuitBreakerOpen", () =>
    Effect.log("Circuit breaker open - CDN may be down")
  )
)
```

### Graceful Degradation

```typescript
// Continue processing other packages if one fails
async getVFS(packages: PackageSpec[]): Promise<VirtualFileSystem> {
  const vfs = new Map()

  const results = await Effect.all(
    packages.map(pkg =>
      this.getPackageVFS(pkg).pipe(
        Effect.catchAll(error => {
          // Log error but continue
          Effect.log("Failed to fetch package", {
            package: pkg.name,
            error: error.message
          })
          return Effect.succeed(new Map()) // Return empty VFS
        })
      )
    ),
    { concurrency: 5 } // Parallel with concurrency limit
  )

  // Merge all successful results
  for (const pkgVfs of results) {
    for (const [path, content] of pkgVfs) {
      vfs.set(path, content)
    }
  }

  return vfs
}
```

### Partial Success Handling

```typescript
// Track which packages succeeded/failed
interface FetchResult {
  package: PackageSpec
  status: "success" | "failed"
  error?: Error
  vfs?: VirtualFileSystem
}

async getVFSWithResults(packages: PackageSpec[]): Promise<{
  vfs: VirtualFileSystem
  results: FetchResult[]
}> {
  const results: FetchResult[] = []
  const vfs = new Map()

  for (const pkg of packages) {
    try {
      const pkgVfs = await this.getPackageVFS(pkg)
      results.push({ package: pkg, status: "success", vfs: pkgVfs })
      for (const [path, content] of pkgVfs) {
        vfs.set(path, content)
      }
    } catch (error) {
      results.push({
        package: pkg,
        status: "failed",
        error: error as Error
      })
    }
  }

  return { vfs, results }
}
```

## 4. Health Checks

```typescript
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy"
  checks: {
    cache: { status: string; message?: string }
    cdn: { status: string; latency?: number }
    disk: { status: string; available?: number }
  }
}

async healthCheck(): Promise<HealthStatus> {
  const checks = await Effect.all({
    cache: this.checkCacheHealth(),
    cdn: this.checkCDNHealth(),
    disk: this.checkDiskHealth()
  })

  const allHealthy = Object.values(checks).every(c => c.status === "ok")

  return {
    status: allHealthy ? "healthy" : "degraded",
    checks
  }
}
```

## 5. Rate Limiting

```typescript
import * as RateLimiter from "effect/RateLimiter"

// Limit CDN requests to avoid 429 errors
const cdnRateLimiter = RateLimiter.make({
  algorithm: "sliding_window",
  limit: 100,
  interval: Duration.minutes(1)
})

yield* RateLimiter.withRateLimiter(
  httpRequest(url),
  cdnRateLimiter
)
```

## 6. Configuration

### Recommended Defaults

```typescript
interface TypeRegistryOptions {
  // Logging
  logLevel?: "debug" | "info" | "warn" | "error"  // Default: "info"
  logger?: Logger.Logger<unknown, void>

  // Fault tolerance
  retryAttempts?: number          // Default: 3
  retryDelay?: number            // Default: 100ms (exponential backoff)
  requestTimeout?: number        // Default: 30000ms

  // Concurrency
  maxConcurrentFetches?: number  // Default: 5

  // Circuit breaker
  circuitBreakerThreshold?: number  // Default: 5 failures
  circuitBreakerTimeout?: number    // Default: 60000ms

  // Rate limiting
  maxRequestsPerMinute?: number  // Default: 100

  // Telemetry
  enableMetrics?: boolean        // Default: false
  enableTracing?: boolean        // Default: false
  metricsExporter?: MetricsExporter
  tracingExporter?: TracingExporter
}
```

## 7. OpenTelemetry Integration

```typescript
import { NodeSdk } from "@opentelemetry/sdk-node"
import { Resource } from "@opentelemetry/resources"
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions"

// Initialize OpenTelemetry
const sdk = new NodeSdk({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "effect-type-registry",
    [SemanticResourceAttributes.SERVICE_VERSION]: "0.1.0"
  }),
  traceExporter: /* Jaeger/Zipkin/etc */,
  metricReader: /* Prometheus/etc */,
})

sdk.start()

// Effect will automatically emit to OpenTelemetry
```

## 8. Error Categorization

All error types use `Data.TaggedError` with `*Base` export constants for
stable DTS references (see architecture.md for full details):

```typescript
// src/errors/NetworkError.ts
export const NetworkErrorBase = Data.TaggedError("NetworkError");
export class NetworkError extends NetworkErrorBase<{
  readonly url: string;
  readonly status?: number;
  readonly message: string;
}> {}

// src/errors/CacheError.ts
export const CacheErrorBase = Data.TaggedError("CacheError");
export class CacheError extends CacheErrorBase<{
  readonly operation: "read" | "write" | "delete" | "list";
  readonly path: string;
  readonly message: string;
}> {}
```

Note: Errors use `message: string` (not `cause: unknown`) and `CacheError`
includes `"list"` as an operation type. `NetworkError` uses `status?: number`
(not `statusCode`).

## Current Implementation

The package currently implements full observability and essential fault
tolerance features:

**Implemented:**

- Structured log events wired into TypeRegistry programs via
  `Effect.log` + `Effect.annotateLogs` (10 event types, Schema-validated)
- Effect Metrics module (`src/metrics.ts`) with 5 counters and 2 timer
  histograms, all actively incremented/tracked in TypeRegistry programs
- HTTP retry with exponential backoff (3 retries, 1s initial delay, 2x
  backoff)
- Request timeouts (30s for package.json, 60s for files)
- Graceful error handling with partial success support
- New test files: `__test__/TypeRegistry.logging.test.ts` and
  `__test__/metrics.test.ts`

**Error Handling:**

- Network errors: Automatic retry with backoff
- Timeout errors: Fail fast after configured timeout
- HTTP errors: No retry for 4xx, retry for 5xx
- Partial failures: Return successful packages, log failures

## Future Enhancements

### Advanced Fault Tolerance

- Circuit breaker for CDN requests
- Adaptive timeout based on response times
- Request deduplication
- Rate limiting for CDN calls

### Observability Integration

- OpenTelemetry support
- Distributed tracing
- Structured logging with correlation IDs
- Health check endpoint

## Related Documentation

- **Architecture:** `./architecture.md` -- service patterns, data layer, public API
- **Cache Optimization:** `./cache-optimization.md` -- performance characteristics
- **Main Package README:** `README.md`

### External Resources

- Effect documentation: <https://effect.website/>
- Effect Schema: <https://effect.website/docs/schema/introduction>
- jsDelivr API: <https://www.jsdelivr.com/docs/api>
