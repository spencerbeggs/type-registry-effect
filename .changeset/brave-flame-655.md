---
"type-registry-effect": minor
---

## Features

Add structured event emission and Effect Metrics to TypeRegistry programs.

TypeRegistry namespace functions now emit structured log events via
`Effect.log` with `Effect.annotateLogs` at key lifecycle points (cache
hit/miss/stale, fetch start, package loaded/failed, batch start/complete,
version resolved). Consumers receive events through Effect's standard
Logger layer.

New `src/metrics.ts` module exports 5 counters (`cacheHits`,
`cacheMisses`, `cacheStale`, `packagesLoaded`, `packagesFailed`) and
2 timer histograms (`packageLoadDuration`, `batchDuration`) compatible
with OpenTelemetry exporters.

## Breaking Changes

Removes `createLogEvent` function and `LogEventHandler` type from the
public API (replaced by Effect.log integration). Adds `durationMs` field
to the `package.loaded` event schema variant.

## Other

Closes #8
