# Observability

type-registry-effect is **silent by default** — it emits no `Effect.log` output.
Diagnostics are available through two opt-in surfaces: a typed **event channel**
for reacting programmatically, and **Effect Metrics** for aggregate counters and
timers. Per-failure detail is also available through typed errors (see the
[architecture overview](../architecture/overview.md)).

## Typed event channel

`TypeRegistry` programs emit strongly-typed `RegistryEvent` values at key
lifecycle points. A consumer opts in by providing a `TypeRegistryObserver` layer;
when none is provided, emission is a no-op and costs nothing.

### Event types

`RegistryEvent` is a `Data.TaggedEnum`. Its variants:

| Variant | Fields | When |
| --- | --- | --- |
| `VersionResolved` | `package`, `requested`, `resolved` | A version range/tag resolved to a pinned version |
| `VersionResolveFailed` | `package`, `requested`, `reason` | Version resolution failed |
| `CacheHit` | `package`, `version`, `ageMinutes` | Package found fresh in cache |
| `CacheStale` | `package`, `version`, `ageMinutes`, `ttlMinutes` | Cached but expired; refetching |
| `CacheMiss` | `package`, `version` | Package not cached |
| `FetchStart` | `package`, `version` | HTTP download started |
| `FetchFailed` | `url`, `status`, `bodySnippet` | A request returned a non-2xx response |
| `PackageLoaded` | `package`, `version`, `files`, `source`, `durationMs` | Package loaded (from cache or network) |
| `PackageLoadFailed` | `package`, `version`, `kind`, `message` | Loading a package failed |
| `BatchStart` | `total`, `packages` | A multi-package batch began |
| `BatchComplete` | `loaded`, `failed`, `total`, `totalFiles`, `durationMs` | A batch finished |

`PackageLoadFailed.kind` is a stable classification (`not-found`,
`version-range`, `schema`, `json`, `network`, `unknown`) so you can react without
parsing error strings.

### Receiving events

The lowest-friction way to subscribe is `layerCallback` — a plain callback, no
`PubSub`/`Stream`/`Scope` ceremony:

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec, layerCallback, RegistryEvent } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

const observer = layerCallback((event) =>
  RegistryEvent.$match(event, {
    PackageLoaded: ({ package: pkg, files, source }) =>
      console.log(`Loaded ${pkg} (${files} files, ${source})`),
    PackageLoadFailed: ({ package: pkg, kind, message }) =>
      console.error(`Failed: ${pkg} [${kind}]: ${message}`),
    BatchComplete: ({ loaded, total }) => console.log(`Batch: ${loaded}/${total}`),
    // all other variants ignored
    _: () => {},
  }),
);

const program = TypeRegistry.getVFS([
  new PackageSpec({ name: "zod", version: "3.23.8" }),
]);

await Effect.runPromise(
  program.pipe(Effect.provide(observer), Effect.provide(NodeLayer)),
);
```

`RegistryEvent` provides `$match` (exhaustive handling) and `$is` (refinement),
so you never match on raw strings. For custom wiring, implement the observer
service directly — its shape is a single `emit(event)` method, so you can back it
with a `PubSub`, a `Stream` sink, your own logger, or metrics. `layerNoop` is an
explicit "drop all events" layer, handy in tests.

### Migrating from the log-annotation API

Earlier versions emitted diagnostics via `Effect.log` + `Effect.annotateLogs`,
intercepted by providing a custom `Logger` layer. That approach is gone: the
library no longer logs, and the `LogEventSchema` / `LogEvent` exports are
`@deprecated` (still exported for backward compatibility, removal deferred to a
future major). Replace any `Logger.replace(...)` interception with a
`TypeRegistryObserver` layer as shown above — and note that event fields are now
properly typed (numbers are numbers, not stringified annotations).

## Metrics

The library exports Effect Metrics that are automatically updated during
TypeRegistry operations. Read values via `Metric.value`, or connect an
OpenTelemetry exporter.

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
| `packageLoadDuration` | Time to load a single package |
| `batchDuration` | Time for a full `getVFS` batch |

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

Metric names use underscore-separated format compatible with Prometheus and
OpenTelemetry (e.g., `type_registry_cache_hits_total`).
