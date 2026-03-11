---
status: current
module: type-registry-effect
category: observability
created: 2026-01-17
updated: 2026-01-18
last-synced: 2026-01-18
completeness: 90
related: []
dependencies: []
---

# Observability & Fault Tolerance

## 1. Event-Based Observability Architecture

### Overview

The package uses a **schema-based event system** built with Effect Schema.
Instead of logging directly from services, `TypeRegistry` emits structured
events at key lifecycle points. Consumers receive events via a callback and
can format them however they need.

**Key Benefits:**

- Zero Effect dependency for consumers (just a callback function)
- Runtime type validation with Effect Schema
- Three distinct output modes without code duplication
- Clean separation between business logic and logging
- LLM-friendly structured JSON output in DEBUG mode

### Event Schema Definition

All events are defined as a discriminated union validated by Effect Schema:

```typescript
// src/events.ts
import * as Schema from "effect/Schema";

export class LogEventSchema extends Schema.Union(
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
  // Cache miss
  Schema.Struct({
    event: Schema.Literal("cache.miss"),
    level: Schema.Literal("debug"),
    message: Schema.String,
    timestamp: Schema.Number,
    fiber: Schema.optional(Schema.String),
    data: Schema.Struct({
      package: Schema.String,
      version: Schema.String,
    }),
  }),
  // ... (9 total event types)
) {}

export type LogEvent = Schema.Schema.Type<typeof LogEventSchema>;
export type LogEventHandler = (event: LogEvent) => void;
```

**Event Types:**

1. `package.version.resolved` - Version range resolved to specific version
2. `cache.hit` - Package found in cache (within TTL)
3. `cache.miss` - Package not in cache, needs fetching
4. `cache.stale` - Package in cache but TTL expired
5. `package.fetch.start` - HTTP download started
6. `package.loaded` - Package successfully loaded
7. `package.load.failed` - Package failed to load
8. `packages.batch.start` - Batch fetch started
9. `packages.batch.complete` - Batch fetch completed

### TypeRegistry Configuration

Consumers provide an optional callback to receive events:

```typescript
// src/types.ts
export interface TypeRegistryOptions {
  /** Cache directory path */
  cacheDir?: string;

  /** Cache TTL in milliseconds */
  ttl?: number;

  /** Optional callback for receiving structured log events */
  onLogEvent?: (event: LogEvent) => void;
}
```

**Example usage:**

```typescript
const registry = TypeRegistry.create({
  cacheDir: "/path/to/cache",
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  onLogEvent: (event) => {
    console.log(JSON.stringify(event)); // Raw JSON output
  },
});
```

### Event Emission

`TypeRegistry` emits events at key lifecycle points:

```typescript
// src/TypeRegistry.ts
private emitEvent(event: LogEvent): void {
  if (this.options.onLogEvent) {
    this.options.onLogEvent(event);
  }
}

// Example: Cache hit event
this.emitEvent({
  event: "cache.hit",
  level: "info",
  message: `Cache hit for ${pkg.name}@${pkg.version}`,
  timestamp: Date.now(),
  data: {
    package: pkg.name,
    version: pkg.version,
    ageMinutes: ageInMinutes,
  },
});
```

**Services remain logging-free.** All `Effect.log*` calls have been removed from:

- `CacheService` - No logging in cache operations
- `PackageFetcher` - No logging in HTTP requests
- `TypeResolver` - No logging in type resolution

This keeps business logic clean and testable.

### Three-Mode Event Handler

The `rspress-plugin-api-extractor` demonstrates a smart event handler with
three modes:

**INFO Mode (default):**

- Suppresses all TypeRegistry events
- Only shows high-level plugin summaries

**VERBOSE Mode:**

- Human-friendly formatted output with indentation
- Shows progress for each package
- Displays version resolutions and cache status

**DEBUG Mode:**

- Structured JSON for LLM consumption
- All event data preserved

```typescript
// pkgs/rspress-plugin-api-extractor/src/type-registry-loader.ts
private handleLogEvent(event: LogEvent): void {
  if (!this.logger) {
    return;
  }

  if (this.logger.isDebug()) {
    // In debug mode, emit structured JSON for LLM consumption
    this.logger.debug(JSON.stringify(event));
    return;
  }

  if (!this.logger.isVerbose()) {
    // In info mode, suppress all TypeRegistry events
    // (Plugin shows high-level summaries instead)
    return;
  }

  // Verbose mode: Human-friendly output
  switch (event.event) {
    case "package.version.resolved": {
      const { package: pkg, requested, resolved } = event.data;
      if (requested !== resolved) {
        this.logger.verbose(`   Resolved ${pkg}: ${requested} → ${resolved}`);
      }
      break;
    }

    case "cache.hit": {
      const { package: pkg, version, ageMinutes } = event.data;
      this.logger.verbose(`   ✓ ${pkg}@${version} (cached, ${ageMinutes}m old)`);
      break;
    }

    case "cache.miss": {
      const { package: pkg, version } = event.data;
      this.logger.verbose(`   Fetching ${pkg}@${version}...`);
      break;
    }

    case "package.loaded": {
      const { package: pkg, version, files, source } = event.data;
      const sourceLabel = source === "cache" ? "cached" : "downloaded";
      this.logger.verbose(`   ✓ Loaded ${pkg}@${version} (${files} files, ${sourceLabel})`);
      break;
    }

    // ... (9 total cases)
  }
}
```

### Example Output

**INFO mode (clean):**

```text
✅ Successfully loaded types for 2 package(s)
```

**VERBOSE mode (human-friendly):**

```text
📦 Loading types for 2 external package(s)...
   Fetching zod@3.22.4...
   ✓ Loaded zod@3.22.4 (24 files, downloaded)
   Fetching ts-pattern@5.0.1...
   ✓ Loaded ts-pattern@5.0.1 (12 files, downloaded)
   Completed: 2 packages loaded (36 files, 1.23s)
```

**DEBUG mode (structured JSON):**

```json
{"event":"cache.miss","level":"debug","message":"Cache miss for zod@3.22.4","timestamp":1705334400000,"data":{"package":"zod","version":"3.22.4"}}
{"event":"package.loaded","level":"info","message":"Loaded zod@3.22.4","timestamp":1705334401234,"data":{"package":"zod","version":"3.22.4","files":24,"source":"network"}}
```

## 2. Metrics & Telemetry

### Metrics to Track

**Performance Metrics:**

- HTTP request duration (p50, p95, p99)
- Cache operation duration
- VFS generation time
- Total package fetch time

**Resource Metrics:**

- Cache size (MB)
- Number of cached packages
- Cache hit rate (%)
- Network bandwidth usage

**Error Metrics:**

- HTTP error rate by status code
- Cache error rate
- Resolution failure rate

### Implementation with Effect Metrics

```typescript
import * as Metric from "effect/Metric"

// Define metrics
const fetchDuration = Metric.histogram("package_fetch_duration_ms", {
  description: "Time to fetch package from CDN",
  boundaries: [100, 500, 1000, 5000, 10000]
})

const cacheHitRate = Metric.counter("cache_hits_total")
const cacheMissRate = Metric.counter("cache_misses_total")

// Use in code
yield* Effect.log("Fetching package").pipe(
  Effect.withMetric(fetchDuration),
  Effect.annotateSpans("package", pkg.name)
)

// Export metrics for Prometheus/OpenTelemetry
```

### Distributed Tracing

```typescript
import * as Tracer from "effect/Tracer"

// Add spans for major operations
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

```typescript
// Define error types for better observability
export class NetworkError extends Data.TaggedError("NetworkError")<{
  url: string
  statusCode?: number
  cause: unknown
}> {}

export class CacheError extends Data.TaggedError("CacheError")<{
  operation: "read" | "write" | "delete"
  path: string
  cause: unknown
}> {}

export class ResolutionError extends Data.TaggedError("ResolutionError")<{
  package: string
  specifier: string
  cause: unknown
}> {}

// Track error rates by type
yield* Effect.catchTags({
  NetworkError: (error) => {
    yield* Metric.increment("network_errors_total", {
      url: error.url,
      status: error.statusCode
    })
    return Effect.fail(error)
  },
  CacheError: (error) => {
    yield* Metric.increment("cache_errors_total", {
      operation: error.operation
    })
    return Effect.fail(error)
  }
})
```

## Current Implementation

The package currently implements essential fault tolerance and observability
features:

**Implemented:**

- Event-based observability with structured schema
- HTTP retry with exponential backoff (3 retries, 1s initial delay, 2x backoff)
- Request timeouts (30s for package.json, 60s for files)
- Graceful error handling with partial success support
- Cache event tracking (hits, misses, stale)
- Version resolution tracking
- Package loading lifecycle events

**Error Handling:**

- Network errors: Automatic retry with backoff
- Timeout errors: Fail fast after configured timeout
- HTTP errors: No retry for 4xx, retry for 5xx
- Partial failures: Return successful packages, log failures

## Future Enhancements

### Metrics & Monitoring

- Cache hit/miss rates
- Request duration histograms
- Error rate by type
- Concurrency metrics

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

- **Type Loading & VFS:**
  `.claude/design/rspress-plugin-api-extractor/type-loading-vfs.md` -
  Integration with RSPress plugin
- **Main Package README:** `pkgs/effect-type-registry/README.md`
- **Package CLAUDE.md:** `pkgs/effect-type-registry/CLAUDE.md`

### External Resources

- Effect documentation: <https://effect.website/>
- Effect Schema: <https://effect.website/docs/schema/introduction>
- jsDelivr API: <https://www.jsdelivr.com/docs/api>
