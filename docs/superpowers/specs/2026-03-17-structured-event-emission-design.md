# Structured Event Emission via Effect.log

**Issue:** [#8 — Emit structured events from service programs via Effect.log](https://github.com/spencerbeggs/type-registry-effect/issues/8)
**Branch:** `feat/observability`
**Date:** 2026-03-17

## Problem

The `events.ts` module defines 10 structured event schemas (`LogEventSchema`)
but no `TypeRegistry` program emits events. Consumers cannot observe cache
behavior, fetch timing, or per-package outcomes. The `getVFS` function silently
swallows per-package failures.

## Solution

Emit structured events from `TypeRegistry` namespace programs via `Effect.log`
with `Effect.annotateLogs`. Add Effect Metrics for counters and timing
histograms. Remove the unused callback-based `createLogEvent` and
`LogEventHandler` exports.

## Design

### Event Placement

Each `TypeRegistry` function emits events at specific lifecycle points using
the appropriate log level function (`Effect.log` for info, `Effect.logDebug`
for debug, `Effect.logWarning` for warn).

#### `resolveVersion`

- `package.version.resolved` (info) — after successful resolution

#### `fetchAndCache`

- `package.fetch.start` (debug) — before downloading from CDN

#### `getPackageVFS`

- `cache.hit` (info) — package in cache and fresh, includes `ageMinutes`
- `cache.miss` (debug) — package not in cache
- `cache.stale` (debug) — package in cache but TTL expired
- `package.loaded` (info) — VFS ready, with `source`, `files`, and `durationMs`

#### `getVFS`

- `packages.batch.start` (debug) — before concurrent forEach
- `package.load.failed` (warn) — per-package, in the catchAll branch
- `packages.batch.complete` (info) — summary with `loaded`/`failed`/`total`/`totalFiles`/`durationMs`

Note: per-package `package.loaded` events come from delegated `getPackageVFS`
calls — no duplication.

### Annotation Mapping

The existing `LogEventSchema` fields map to `Effect.log` as follows:

| Schema field | Effect.log mapping |
| --- | --- |
| `event` | `Effect.annotateLogs("event", "cache.hit")` |
| `level` | Determines log function: `Effect.logDebug`, `Effect.log`, `Effect.logWarning` |
| `message` | Message string passed to `Effect.log(message)` |
| `data.*` | Individual annotations: `Effect.annotateLogs("package", pkg.name)` |
| `timestamp` | Handled by Effect's Logger automatically |
| `fiber` | Handled by Effect's Logger automatically |

### Schema Change

Add `durationMs` to the `package.loaded` event variant:

```typescript
// In LogEventSchema, package.loaded variant
data: Schema.Struct({
  package: Schema.String,
  version: Schema.String,
  files: Schema.Number,
  source: Schema.Literal("cache", "network"),
  durationMs: Schema.Number,  // NEW
}),
```

### Effect Metrics

New module `src/metrics.ts` exporting metric definitions.

**Counters:**

- `type_registry.cache.hits` — cache hit count
- `type_registry.cache.misses` — cache miss count
- `type_registry.cache.stale` — stale cache entry count
- `type_registry.packages.loaded` — packages loaded successfully
- `type_registry.packages.failed` — packages that failed to load

**Histograms:**

- `type_registry.package.load.duration` — time to load a single package
  (cache or network), using `Metric.trackDuration`
- `type_registry.batch.duration` — time for a full `getVFS` batch operation

Metrics are global in Effect — no new service or layer needed. Consumers can
read/observe them via `Metric.value` or connect an OpenTelemetry exporter.

### Public API Changes

**Removed:**

- `createLogEvent` function (callback model replaced by Effect.log)
- `LogEventHandler` type

**Added:**

- Metric constants from `src/metrics.ts`

**Modified:**

- `LogEvent` type (`package.loaded` variant gains `durationMs` field)

This is a 0.x library so the removals are non-breaking.

## File Changes

| File | Action |
| --- | --- |
| `src/metrics.ts` | **New** — 5 counters, 2 histograms |
| `src/events.ts` | **Modify** — remove `createLogEvent`/`LogEventHandler`, add `durationMs` to `package.loaded` |
| `src/TypeRegistry.ts` | **Modify** — add ~10 `Effect.log` calls with annotations + metric instrumentation |
| `src/index.ts` | **Modify** — update exports (remove `createLogEvent`/`LogEventHandler`, add metrics) |
| `__test__/TypeRegistry.logging.test.ts` | **New** — log event emission tests |
| `__test__/metrics.test.ts` | **New** — metric counter/histogram tests |
| `__test__/events.test.ts` | **Modify** — remove `createLogEvent` tests, update schema validation |

**No changes to:**

- Service interfaces (`CacheService`, `PackageFetcher`, `TypeResolver`)
- Layer implementations (`CacheServiceLive`, `PackageFetcherLive`,
  `TypeResolverLive`)
- `node.ts` / `platforms/node.ts`
- Existing unit or integration tests

## Testing Strategy

### Log Event Tests (`__test__/TypeRegistry.logging.test.ts`)

Use a custom `Logger.make` that captures log messages and annotations into an
array. Provide it as a layer alongside existing mock services.

**Test cases:**

1. `fetchAndCache` emits `package.fetch.start`
2. `getPackageVFS` (cache miss) emits `cache.miss` then `package.loaded`
   with `source: "network"` and `durationMs`
3. `getPackageVFS` (cache hit) emits `cache.hit` with `ageMinutes` then
   `package.loaded` with `source: "cache"`
4. `getPackageVFS` (stale) emits `cache.stale` then `package.loaded` with
   `source: "network"`
5. `getVFS` emits `packages.batch.start` then per-package events then
   `packages.batch.complete` with correct counts and `durationMs`
6. `getVFS` with a failing package emits `package.load.failed`
7. `resolveVersion` emits `package.version.resolved`

### Metrics Tests (`__test__/metrics.test.ts`)

After running operations, read metric values via `Metric.value` and assert
counters incremented correctly. Verify histograms recorded non-zero durations.

### Existing Test Updates

- `__test__/events.test.ts` — remove `createLogEvent` tests, update
  `package.loaded` schema validation to include `durationMs`
- `__test__/TypeRegistry.unit.test.ts` — no changes needed

## Non-Goals

- Callback-based subscription API (Effect.log replaces this)
- Breaking changes to Promise wrapper API in `/node`
- Changes to service interfaces or layer implementations
- OpenTelemetry exporter configuration (consumers wire that up)
