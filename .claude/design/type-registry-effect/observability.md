---
status: current
module: type-registry-effect
category: observability
created: 2026-01-17
updated: 2026-06-19
last-synced: 2026-06-19
completeness: 95
related:
  - ./architecture.md
  - ./cache-optimization.md
dependencies: []
---

# Observability and fault tolerance

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Typed event channel](#typed-event-channel)
5. [Metrics and telemetry](#metrics-and-telemetry)
6. [Fault tolerance](#fault-tolerance)
7. [Related documentation](#related-documentation)

---

## Overview

The library exposes three independent diagnostics surfaces. None of them are coupled to each other, and the library is **silent by default** -- it emits no `Effect.log` output. A consumer opts into whichever surface fits their need:

1. **Typed event channel** (`TypeRegistryObserver` / `RegistryEvent`) -- the primary, programmatic surface. Opt-in, zero-cost when unused.
2. **Effect Metrics** (`src/metrics.ts`) -- aggregate counters and timer histograms, always tracked, read or exported on demand.
3. **Typed errors** (`Data.TaggedError`) -- per-failure recovery via `catchTag` / `catchTags` (see `architecture.md`).

Events are emitted **only** from `src/TypeRegistry.ts`, with the single exception of the `FetchFailed` event emitted from `src/layers/PackageFetcherLive.ts`. The service layers (`CacheService`, `PackageFetcher`, `TypeResolver`) remain logging-free in their core operations, keeping business logic independently testable.

---

## Current State

The typed event channel and Effect Metrics are both implemented and active. The legacy `Effect.log` + `LogEventSchema` annotation system has been removed as the diagnostics surface; `LogEventSchema` / `LogEvent` remain exported but `@deprecated`. Fault tolerance covers HTTP retry, request timeouts, fail-fast on non-2xx responses and graceful per-package degradation (see [Fault tolerance](#fault-tolerance)). Distributed tracing, circuit breaking and rate limiting are not yet implemented.

---

## Rationale

Earlier versions emitted human-readable diagnostics via `Effect.log` + `Effect.annotateLogs`, intercepted through a custom Logger layer. That surface stringifies every value (a count arrived as a string) and forces consumers to parse log annotations to react programmatically. The typed channel keeps numbers as numbers and gives consumers a discriminated union instead of a string-keyed map. Making it opt-in via `Effect.serviceOption` means the library stays silent and zero-cost by default while still offering a first-class programmatic surface to hosts that want one.

---

## Typed event channel

See `src/services/TypeRegistryObserver.ts` for the service, the `RegistryEvent` tagged-enum variants and the helper layers.

### The load-bearing decision: opt-in and zero-cost

Internal call sites emit through `emitEvent`, which resolves the observer via `Effect.serviceOption`. This is the crux of the design:

- `emitEvent` adds **no requirement** to a program's type signature. A function that emits events still advertises only the services it genuinely depends on (`CacheService`, `PackageFetcher`, and so on). The observer never leaks into public effect signatures.
- When no observer layer is provided it is a **no-op** -- the default. Consumers who do not care pay nothing and configure nothing.

A consumer opts in by providing a `TypeRegistryObserver` layer. The service shape is deliberately minimal -- a single `emit` the host implements -- so it can be backed by a callback, a `PubSub`, a `Stream` sink, a logger, metrics, whatever the host prefers.

```typescript
readonly emit: (event: RegistryEvent) => Effect.Effect<void>;
```

### Helper layers

- `layerCallback(onEvent)` -- the lowest-friction subscription: a plain callback, no `PubSub`/`Stream`/`Scope` ceremony and no Effect knowledge required.
- `layerNoop` -- explicit "events are intentionally dropped"; equivalent to providing nothing, but visible in tests.

`RegistryEvent` is a `Data.TaggedEnum`, so consumers get constructors plus `$is` / `$match` for exhaustive, string-free handling.

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { layerCallback, RegistryEvent } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

const observer = layerCallback((e) =>
  RegistryEvent.$match(e, {
    BatchComplete: ({ loaded, total }) => report.summary(loaded, total),
    PackageLoadFailed: ({ package: p, kind }) => report.fail(p, kind),
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

### Deprecated log-annotation surface

The old annotation schema (`LogEventSchema` / `LogEvent` in `src/events.ts`) is now `@deprecated`. It is still exported for backward compatibility; removal is deferred to a future major release. The library no longer emits those log annotations. See [Rationale](#rationale) for why it was replaced.

---

## Metrics and telemetry

`src/metrics.ts` defines all metrics with `effect/Metric`, exported as named constants and incremented or tracked directly in `src/TypeRegistry.ts`. See those files for the exact metric names; the topology is:

- **Counters:** cache hits, misses and stale entries (from `getPackageVFS`); packages loaded (from `getPackageVFS`); packages failed (from `getVFS`'s per-package catch).
- **Timer histograms:** per-package load duration (`getPackageVFS`) and batch duration (`getVFS`), both via `Metric.trackDuration`.

Metrics accumulate in the Effect Metrics registry and are read via `Metric.value` or exported to any OpenTelemetry-compatible sink.

```typescript
import { Effect, Metric } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";
import { cacheHits, cacheMisses } from "type-registry-effect";

const program = Effect.gen(function* () {
  yield* TypeRegistry.getVFS([
    new PackageSpec({ name: "zod", version: "3.23.8" }),
  ]);
  const hits = yield* Metric.value(cacheHits);
  const misses = yield* Metric.value(cacheMisses);
  console.log({ hits: hits.count, misses: misses.count });
}).pipe(Effect.provide(NodeLayer));
```

---

## Fault tolerance

### Implemented

- **HTTP retry with exponential back-off** in `PackageFetcherLive` (`Schedule.exponential` from 100 ms, composed with `recurs(3)`), plus a 30 s request timeout. Transport and timeout errors are retried.
- **Fail-fast on non-2xx responses.** `fetchOk` checks the HTTP status before parsing the body. Previously a 404's plain-text body (jsDelivr returns e.g. `Couldn't find version …`) was fed into `res.json` and surfaced as an opaque "JSON parse failed". Now a non-2xx response is **not** retried (it is not transient): the fetcher emits a `FetchFailed` event carrying `url`, `status` and a body snippet, and fails with a `NetworkError` that now carries the HTTP `status`.
- **Error classification.** `classifyLoadError` in `src/TypeRegistry.ts` maps a per-package failure to a stable `PackageLoadFailed.kind` (`not-found`, `version-range`, `schema`, `json`, `network`, `unknown`) so consumers react without parsing error strings.
- **Graceful degradation.** `getVFS` loads packages concurrently (limit 5), catches per-package failures, emits `PackageLoadFailed` for each and returns the merged VFS of the survivors. It fails only when **every** package fails. See `src/TypeRegistry.ts`.

### Planned

- Circuit breaker and rate limiting for CDN requests.
- Adaptive timeouts and request deduplication.
- Distributed tracing via OpenTelemetry spans on the major operations (`fetchAndCache`, package-json/type-file fetch, cache write).
- Health-check surface.

---

## Related documentation

- **Architecture:** `./architecture.md` -- service patterns, data layer, public API
- **Cache optimization:** `./cache-optimization.md` -- on-disk layout, SQLite metadata, TTL and prune
- **Main package README:** `README.md`

### External resources

- Effect documentation: <https://effect.website/>
- Effect Schema: <https://effect.website/docs/schema/introduction>
- jsDelivr API: <https://www.jsdelivr.com/docs/api>
