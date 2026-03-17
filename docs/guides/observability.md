# Observability

type-registry-effect emits structured log events and Effect Metrics from
`TypeRegistry` namespace programs. Events flow through Effect's standard
Logger layer; metrics are compatible with OpenTelemetry exporters.

## Log events

Events are emitted via `Effect.log` with `Effect.annotateLogs` at key
lifecycle points. A custom Logger receives events as flat string
annotations in its `annotations` parameter.

### Event types

| Event | Level | When |
| --- | --- | --- |
| `package.version.resolved` | info | Version range resolved to specific version |
| `cache.hit` | info | Package found in cache and still fresh |
| `cache.miss` | debug | Package not in cache |
| `cache.stale` | debug | Package in cache but TTL expired |
| `package.fetch.start` | debug | HTTP download started |
| `package.loaded` | info | Package successfully loaded (from cache or network) |
| `package.load.failed` | warn | Package failed to load |
| `packages.batch.start` | debug | Batch fetch started |
| `packages.batch.complete` | info | Batch fetch completed |
| `typescript.cache.created` | info | TypeScript virtual environment created |

### Annotation keys

Each event type has a specific set of flat string annotations. The
`event` annotation is the discriminator. All values are strings (numeric
values are stringified before emission).

`LogEventSchema` in `events.ts` documents the exact annotation keys for
each event type and can be used for runtime validation.

### Receiving events

Provide a custom Logger layer to receive events:

```typescript
import { Effect, Logger, LogLevel, Layer } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

const myLogger = Logger.make(({ message, logLevel, annotations }) => {
  const event = annotations.get("event") as string | undefined;

  if (event === "package.loaded") {
    const pkg = annotations.get("package") as string;
    const source = annotations.get("source") as string;
    const files = annotations.get("files") as string;
    console.log(`Loaded ${pkg} (${files} files, ${source})`);
  }

  if (event === "package.load.failed") {
    const pkg = annotations.get("package") as string;
    const error = annotations.get("error") as string;
    console.error(`Failed: ${pkg}: ${error}`);
  }
});

const program = TypeRegistry.getVFS([
  new PackageSpec({ name: "zod", version: "3.23.8" }),
]);

await Effect.runPromise(
  program.pipe(
    Effect.provide(NodeLayer),
    Effect.provide(Logger.replace(Logger.defaultLogger, myLogger)),
    Effect.provide(Logger.minimumLogLevel(LogLevel.Debug)),
  ),
);
```

### Type narrowing

The `LogEvent` type is a discriminated union -- narrow on the `event`
field:

```typescript
import type { LogEvent } from "type-registry-effect";

function handleAnnotations(event: LogEvent): void {
  switch (event.event) {
    case "cache.hit":
      console.log(`cached: ${event.package}@${event.version}`);
      break;
    case "package.loaded":
      console.log(`loaded ${event.files} files from ${event.source}`);
      break;
    case "packages.batch.complete":
      console.log(`batch: ${event.loaded}/${event.total}`);
      break;
  }
}
```

## Metrics

The library exports Effect Metrics that are automatically updated during
TypeRegistry operations. Consumers can read metric values via
`Metric.value` or connect an OpenTelemetry exporter.

### Counters

| Metric | Description |
| --- | --- |
| `cacheHits` | Cache hits (package found and fresh) |
| `cacheMisses` | Cache misses (package not cached) |
| `cacheStale` | Stale cache entries (TTL expired) |
| `packagesLoaded` | Packages loaded successfully |
| `packagesFailed` | Packages that failed to load |

### Histograms (timers)

| Metric | Description |
| --- | --- |
| `packageLoadDuration` | Time to load a single package (ms) |
| `batchDuration` | Time for a full `getVFS` batch (ms) |

### Reading metrics

```typescript
import { Effect, Metric } from "effect";
import { cacheHits, packageLoadDuration } from "type-registry-effect";

const program = Effect.gen(function* () {
  // After some TypeRegistry operations...
  const hits = yield* Metric.value(cacheHits);
  console.log(`Cache hits: ${hits.count}`);

  const timing = yield* Metric.value(packageLoadDuration);
  console.log(`Avg load time: ${timing.sum / timing.count}ms`);
});
```

Metric names use underscore-separated format compatible with
Prometheus and OpenTelemetry (e.g., `type_registry_cache_hits`).
