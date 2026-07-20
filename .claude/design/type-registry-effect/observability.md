---
status: current
module: type-registry-effect
category: observability
created: 2026-01-17
updated: 2026-07-20
last-synced: 2026-07-20
completeness: 90
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
5. [The event catalogue](#the-event-catalogue)
6. [Tracing](#tracing)
7. [Fault tolerance](#fault-tolerance)
8. [Related documentation](#related-documentation)

---

## Overview

The library is **silent by default**: it performs no `Effect.log` of its own and emits nothing unless asked.
Three independent surfaces are available, and none is coupled to another:

1. **Typed event channel** (`RegistryObserver` / `RegistryEvent`) — the programmatic progress surface. Opt-in
   and zero-cost when unused.
2. **Tracing spans** — every public operation runs inside a named span, so a host that installs a tracer gets
   the topology for free.
3. **Typed errors** — per-failure recovery on structured fields via `catchTag` / `catchTags`
   (see `architecture.md`).

Events are emitted from `src/TypeRegistry.ts`, with one exception: `FetchFailed` is emitted from
`src/PackageFetcher.ts`, where the HTTP status is actually observed. `TypeCache` and `TypeResolver` emit
nothing, which keeps their operations independently testable.

---

## Current State

- `RegistryEvent` is a `Schema.Union` of eleven `Schema.TaggedStruct` variants (`src/RegistryEvent.ts`).
- `RegistryObserver` is a `Context.Service` with a single `emit` method, plus `layerCallback` and `layerNoop`
  statics.
- The internal `emit` helper resolves the observer via `Effect.serviceOption` and no-ops on absence.
- Spans wrap every public operation via `Effect.fn("<Service>.<method>")` and `Effect.withSpan`.
- Fault tolerance covers HTTP retry, request timeouts, fail-fast on non-2xx, materialization budgets and
  best-effort batch degradation.

Changed in the v4 rewrite:

- **The Effect Metrics module is gone.** `src/metrics.ts` and its counters/histograms were deleted. Everything
  a metric carried is present on the event stream as typed fields (`duration` on `PackageLoaded` and
  `BatchComplete`, `source` on `PackageLoaded`, counts on `BatchComplete`), so a host that wants metrics
  derives them in its observer against its own registry rather than accumulating in this library's.
- **The deprecated log-annotation surface is gone.** `src/events.ts`, `LogEventSchema` and `LogEvent` are
  deleted outright rather than kept `@deprecated`.
- `RegistryEvent` moved from a `Data.TaggedEnum` to a `Schema.Union`, so there are no `$is` / `$match`
  combinators — narrow with `switch (event._tag)` or `Match`.
- The service was renamed `TypeRegistryObserver` → `RegistryObserver`, tag id
  `type-registry-effect/RegistryObserver`.

Not implemented: circuit breaking, rate limiting, adaptive timeouts, request deduplication, a health-check
surface.

---

## Rationale

### Why opt-in and zero-cost

`emit` resolves the observer through `Effect.serviceOption`, which is the crux of the design:

- It adds **no requirement** to any signature. A function that emits events still advertises only the services
  it genuinely depends on (`TypeCache`, `PackageFetcher`). The observer never leaks into a public effect type.
- Providing nothing is the default and is a genuine no-op. Consumers who do not care pay nothing and configure
  nothing.

### Why typed events instead of logs

Earlier versions emitted human-readable diagnostics via `Effect.log` + `Effect.annotateLogs`, intercepted by a
custom Logger layer. That surface stringifies every value — a count arrived as a string — and forces consumers
to parse annotations to react programmatically. A discriminated union keeps numbers as numbers, `Duration` as
`Duration`, and the failing error as the error itself.

### Why schema-backed

Events cross the library/host boundary and hosts ship them to telemetry, so they are `Schema`-backed (following
the store `CacheEventPayload` precedent) and can be encoded without a bespoke serializer.

### Why a push callback rather than a PubSub

These events are progress reporting for a host UI. A callback has no subscription lifecycle and no `Scope`, so
it is usable from non-Effect hosts. (`@effected/store`'s `Cache` exposes a `PubSub` instead because its events
are intrinsic to an eviction-bearing store. The two postures are deliberate and should not be unified.)

### Why no metrics module

An always-on metrics registry inside a library is a policy decision imposed on the host: it fixes metric names,
units and cardinality, and it accumulates whether or not anyone reads it. Every quantity the old module tracked
is already a typed field on an event, so a host that wants counters writes three lines in its observer and owns
the naming.

---

## Typed event channel

The service shape is deliberately minimal — a single `emit` the host implements — so it can be backed by a
callback, a `PubSub`, a `Stream` sink, a logger, metrics, whatever the host prefers:

```typescript
readonly emit: (event: RegistryEvent) => Effect.Effect<void>;
```

### Helper layers

- `RegistryObserver.layerCallback(onEvent)` — the lowest-friction bridge: a plain callback, no `PubSub` /
  `Stream` / `Scope` ceremony and no Effect knowledge required. A throwing callback is a programmer bug and
  stays a defect; it is not laundered into a typed error channel.
- `RegistryObserver.layerNoop` — explicit "events are intentionally dropped". Equivalent to providing nothing,
  but visible in a composition.

```typescript
import { Effect, Layer } from "effect";
import { PackageSpec, RegistryObserver, TypeRegistry } from "type-registry-effect";

const ObserverLayer = RegistryObserver.layerCallback((event) => {
  switch (event._tag) {
    case "BatchComplete":
      report.summary(event.loaded, event.total);
      break;
    case "PackageLoadFailed":
      report.fail(event.package, event.kind);
      break;
    default:
      break;
  }
});

const program = Effect.gen(function* () {
  const registry = yield* TypeRegistry;
  return yield* registry.getVfs([PackageSpec.fromString("zod@3.23.8")]);
}).pipe(Effect.provide(Layer.mergeAll(AppLayer, ObserverLayer)));
```

---

## The event catalogue

| Tag | Fields | Emitted from |
| --- | --- | --- |
| `VersionResolved` | `package`, `requested`, `resolved` | `resolveVersion` |
| `VersionResolveFailed` | `package`, `requested`, `kind` (`not-found` \| `no-match` \| `network`) | `resolveVersion` |
| `CacheHit` | `package`, `version`, `age` (`Duration`) | `getPackageVfs` |
| `CacheStale` | `package`, `version` | `getPackageVfs` |
| `CacheMiss` | `package`, `version` | `getPackageVfs` |
| `FetchStart` | `package`, `version` | `fetchAndCache` |
| `FetchFailed` | `url`, `status`, `bodySnippet` | `PackageFetcher.fetchOk` |
| `PackageLoaded` | `package`, `version`, `files`, `source` (`cache` \| `network`), `duration` | `getPackageVfs` |
| `PackageLoadFailed` | `package`, `version`, `kind`, `error` | `getVfs` per-package catch |
| `BatchStart` | `total`, `packages` | `getVfs` |
| `BatchComplete` | `loaded`, `failed`, `total`, `totalFiles`, `duration` | `getVfs` |

`PackageLoadFailed.error` is the typed error itself, preserved structurally as `Schema.Defect()` — a host can
inspect it rather than relying only on `kind`.

### Classification

`classify` in `src/TypeRegistry.ts` maps a per-package failure to a stable `PackageLoadFailed.kind` (`not-found`,
`version-range`, `schema`, `network`, `cache`, `unknown`) from **typed error tags and structured fields only**:
`FetchError` splits on its `status === 404` and `kind === "schema"` fields, and everything else branches on
`_tag`. v3's `classifyLoadError` did substring matching over stringified errors; that is dead, and no event
`kind` depends on message text. `VersionResolveFailed.kind` is derived the same way.

---

## Tracing

Every public operation is wrapped in a named span, so the call topology is available to any host that installs
a tracer — no configuration in this library:

- `TypeRegistry.*` — `hasCached`, `fetchAndCache`, `getPackageVfs`, `getVfs`, `resolveImport`,
  `getTypeEntries`, `resolveVersion`, `clearCache`, `pruneCache`
- `TypeCache.*` — `exists`, `read`, `write`, `listFiles`, `readMetadata`, `writeMetadata`, `getVfs`, `remove`,
  `prune`
- `PackageFetcher.*` — `getVersions`, `getFileTree`, `downloadFile`, `getPackageJson`, `getTypeFiles`
- `TsEnvironment.make`, `VirtualPackage.fromFile`

Most are declared with `Effect.fn("<name>")`, which names the span and preserves the call-site stack trace;
the few non-function values (`pruneCache`, `TypeCache.prune`) use `Effect.withSpan`.

This replaces the "distributed tracing — planned" item from the v3 design: spans exist throughout, and
exporting them is the host's `Tracer` choice.

---

## Fault tolerance

### Implemented

- **Retry with exponential back-off.** `PackageFetcher` retries up to 3 times on a `Schedule.exponential` from
  100 ms, gated by `isTransient` — transport errors and timeouts only. Non-2xx responses are not transient and
  are never retried.
- **Request timeout.** 30 s per request, before the retry gate.
- **Fail fast on non-2xx.** `fetchOk` checks the status before touching the body. jsDelivr returns plain-text
  error bodies (`Couldn't find version …`) that would otherwise reach the JSON decoder and surface as an opaque
  schema failure. Instead the fetcher emits `FetchFailed` with the status and a 200-character body snippet and
  fails with a typed `FetchError` (`kind: "status"`). If reading the diagnostic body itself fails, that read
  failure is carried as the `cause` rather than pretending the body was empty.
- **Materialization budgets.** `getTypeFiles` caps declaration files per package (5,000) and total downloaded
  bytes (64 MiB), pre-checking the file tree's declared sizes before any download and then accounting actual
  UTF-8 bytes as bodies land. Over budget fails typed (`FetchError`, `kind: "body"`) instead of exhausting
  memory. See `architecture.md` for the caps and the documented overshoot bound.
- **Graceful batch degradation.** `getVfs` loads at concurrency 5, catches each per-package failure, emits
  `PackageLoadFailed`, and returns the merged VFS of the survivors. It fails only when every package fails, and
  then with a structured `BatchLoadError` carrying each package's typed error.
- **Mutation serialization.** A semaphore of 1 in `TypeRegistry` serializes `fetchAndCache`, `clearCache` and
  `pruneCache` so cache mutations cannot interleave into a half-written state. Per-runtime only; see
  `cache-optimization.md` for the both-planes backstop.
- **Structural failure preservation.** Every error carries its underlying cause as `Schema.Defect()`, so
  diagnosis never depends on a message string.

### Planned

- Circuit breaker and rate limiting for CDN requests.
- Adaptive timeouts and request deduplication.
- Streaming enforcement of the download byte budget.
- A health-check surface.

---

## Related documentation

- **Architecture:** `./architecture.md` — services, error model, hardening, public API
- **Cache optimization:** `./cache-optimization.md` — two-plane storage, TTL, staleness, prune
- **Main package README:** `README.md`

### External resources

- Effect v4 source (vendored, read-only): `.repos/effect-smol` @ `effect@4.0.0-beta.99` (checkout of
  `Effect-TS/effect`; directory name kept from the archived `effect-smol` repo)
- Effect documentation: <https://effect.website/>
- jsDelivr API: <https://www.jsdelivr.com/docs/api>
