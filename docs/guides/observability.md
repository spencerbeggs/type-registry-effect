# Observability

The `effect-type-registry` package uses an event-based observability system
with structured events. Instead of logging directly, the registry emits events
at key lifecycle points that you can handle however you need.

## Event System

Provide an optional `onLogEvent` callback to receive structured events:

```typescript
import { TypeRegistry, type LogEvent } from "effect-type-registry"

const registry = TypeRegistry.create({
 onLogEvent: (event: LogEvent) => {
  // event.event - Event type (e.g., "cache.hit", "package.loaded")
  // event.level - Severity level ("debug" | "info" | "warn" | "error")
  // event.message - Human-readable message
  // event.timestamp - Unix timestamp
  // event.data - Event-specific data

  console.log(`[${event.level}] ${event.message}`)
 },
})
```

## Event Types

The registry emits these events:

### Package Version Events

**`package.version.resolved`** - Version range resolved to specific version

```typescript
{
 event: "package.version.resolved",
 level: "info",
 message: "Resolved zod@latest to 3.22.4",
 data: {
  package: "zod",
  versionRequested: "latest",
  versionResolved: "3.22.4"
 }
}
```

### Cache Events

**`cache.hit`** - Package found in cache (within TTL)

```typescript
{
 event: "cache.hit",
 level: "debug",
 message: "Cache hit for @effect/cli@0.73.0 (12 minutes old)",
 data: {
  package: "@effect/cli",
  version: "0.73.0",
  ageMinutes: 12
 }
}
```

**`cache.miss`** - Package not in cache, needs fetching

```typescript
{
 event: "cache.miss",
 level: "debug",
 message: "Cache miss for zod@4.0.0",
 data: {
  package: "zod",
  version: "4.0.0"
 }
}
```

**`cache.stale`** - Package in cache but TTL expired

```typescript
{
 event: "cache.stale",
 level: "debug",
 message: "Cache stale for ts-pattern@5.0.0 (8 days old, TTL 7 days)",
 data: {
  package: "ts-pattern",
  version: "5.0.0",
  ageMinutes: 11520,
  ttlMinutes: 10080
 }
}
```

### Package Loading Events

**`package.fetch.start`** - HTTP download started

```typescript
{
 event: "package.fetch.start",
 level: "info",
 message: "Fetching @effect/cli@0.73.0",
 data: {
  package: "@effect/cli",
  version: "0.73.0"
 }
}
```

**`package.loaded`** - Package successfully loaded

```typescript
{
 event: "package.loaded",
 level: "info",
 message: "Loaded @effect/cli@0.73.0 (47 type definition files)",
 data: {
  package: "@effect/cli",
  version: "0.73.0",
  files: 47,
  fromCache: false
 }
}
```

**`package.load.failed`** - Package failed to load

```typescript
{
 event: "package.load.failed",
 level: "error",
 message: "Failed to load nonexistent@1.0.0: Package not found",
 data: {
  package: "nonexistent",
  version: "1.0.0",
  error: "Package not found",
  retries: 3
 }
}
```

### Batch Events

**`packages.batch.start`** - Batch fetch started

```typescript
{
 event: "packages.batch.start",
 level: "info",
 message: "Starting batch fetch for 3 packages",
 data: {
  packages: ["zod@4.0.0", "@effect/cli@0.73.0", "ts-pattern@5.0.0"],
  count: 3
 }
}
```

**`packages.batch.complete`** - Batch fetch completed

```typescript
{
 event: "packages.batch.complete",
 level: "info",
 message: "Batch fetch complete: 3 succeeded, 0 failed",
 data: {
  succeeded: 3,
  failed: 0,
  durationMs: 1247
 }
}
```

## Event Handler Patterns

### Three-Mode Handler

Handle events with different verbosity levels (info, verbose, debug):

```typescript
function createEventHandler(mode: "info" | "verbose" | "debug") {
 return (event: LogEvent) => {
  if (mode === "debug") {
   // Structured JSON for programmatic consumption
   console.log(JSON.stringify(event))
   return
  }

  if (mode === "info") {
   // Suppress all TypeRegistry events (show only high-level summaries)
   return
  }

  // Verbose mode: Human-friendly output
  switch (event.event) {
   case "cache.hit": {
    const { package: pkg, version, ageMinutes } = event.data
    console.log(`✓ ${pkg}@${version} (cached, ${ageMinutes}m old)`)
    break
   }
   case "package.loaded": {
    const { package: pkg, version, files } = event.data
    console.log(`✓ Loaded ${pkg}@${version} (${files} files)`)
    break
   }
   case "package.fetch.start": {
    const { package: pkg, version } = event.data
    console.log(`⬇ Fetching ${pkg}@${version}...`)
    break
   }
   case "package.load.failed": {
    const { package: pkg, version, error } = event.data
    console.error(`✗ Failed to load ${pkg}@${version}: ${error}`)
    break
   }
   // Handle other events as needed
  }
 }
}

const registry = TypeRegistry.create({
 onLogEvent: createEventHandler("verbose"),
})
```

### Filtering by Level

Only show warnings and errors:

```typescript
const registry = TypeRegistry.create({
 onLogEvent: (event) => {
  if (event.level === "warn" || event.level === "error") {
   console.log(`[${event.level.toUpperCase()}] ${event.message}`)
  }
 },
})
```

### Metrics Collection

Collect metrics from events:

```typescript
interface Metrics {
 cacheHits: number
 cacheMisses: number
 packagesFetched: number
 errors: number
}

function createMetricsHandler(metrics: Metrics) {
 return (event: LogEvent) => {
  switch (event.event) {
   case "cache.hit":
    metrics.cacheHits++
    break
   case "cache.miss":
    metrics.cacheMisses++
    break
   case "package.fetch.start":
    metrics.packagesFetched++
    break
   case "package.load.failed":
    metrics.errors++
    break
  }
 }
}

const metrics: Metrics = {
 cacheHits: 0,
 cacheMisses: 0,
 packagesFetched: 0,
 errors: 0,
}

const registry = TypeRegistry.create({
 onLogEvent: createMetricsHandler(metrics),
})

// After operations complete
const hitRate = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)
console.log(`Cache hit rate: ${(hitRate * 100).toFixed(1)}%`)
```

### Integration with Logging Libraries

#### Winston

```typescript
import winston from "winston"

const logger = winston.createLogger({
 level: "info",
 format: winston.format.json(),
 transports: [new winston.transports.File({ filename: "registry.log" })],
})

const registry = TypeRegistry.create({
 onLogEvent: (event) => {
  logger.log({
   level: event.level,
   message: event.message,
   ...event.data,
  })
 },
})
```

#### Pino

```typescript
import pino from "pino"

const logger = pino()

const registry = TypeRegistry.create({
 onLogEvent: (event) => {
  logger[event.level]({
   msg: event.message,
   event: event.event,
   ...event.data,
  })
 },
})
```

## Benefits

- **Zero dependencies**: Just a callback function, no Effect-TS required
- **Type-safe**: Events validated with Effect Schema
- **Flexible**: Format output however you need (JSON, pretty-print, metrics)
- **Clean separation**: Business logic stays logging-free
- **Framework-agnostic**: Works with any logging library or metrics system

## Design Philosophy

The event-based observability system follows these principles:

1. **Separation of concerns**: Business logic emits events; consumers decide
   how to handle them
2. **Structured data**: All events have consistent schema with typed data
3. **Minimal overhead**: Events are only processed if a handler is provided
4. **Composable**: Multiple handlers can be combined using event routing
5. **Production-ready**: Events include enough context for debugging and
   monitoring

## Further Reading

- See `.claude/design/effect-type-registry/observability.md` for the full
  design document
- See `docs/architecture/overview.md` for how observability fits into the
  overall architecture
- See `rspress-plugin-api-extractor/src/type-registry-loader.ts` for a
  reference implementation
