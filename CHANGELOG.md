# type-registry-effect

## 0.2.0

### Breaking Changes

* [`75b4f4d`](https://github.com/spencerbeggs/type-registry-effect/commit/75b4f4dcf2eec69e66bb51e9efd1f1a83c42c453) Removes `createLogEvent` function and `LogEventHandler` type from the
  public API (replaced by Effect.log integration). Adds `durationMs` field
  to the `package.loaded` event schema variant.

### Features

* [`75b4f4d`](https://github.com/spencerbeggs/type-registry-effect/commit/75b4f4dcf2eec69e66bb51e9efd1f1a83c42c453) Add structured event emission and Effect Metrics to TypeRegistry programs.

TypeRegistry namespace functions now emit structured log events via
`Effect.log` with `Effect.annotateLogs` at key lifecycle points (cache
hit/miss/stale, fetch start, package loaded/failed, batch start/complete,
version resolved). Consumers receive events through Effect's standard
Logger layer.

New `src/metrics.ts` module exports 5 counters (`cacheHits`,
`cacheMisses`, `cacheStale`, `packagesLoaded`, `packagesFailed`) and
2 timer histograms (`packageLoadDuration`, `batchDuration`) compatible
with OpenTelemetry exporters.

### Other

* [`75b4f4d`](https://github.com/spencerbeggs/type-registry-effect/commit/75b4f4dcf2eec69e66bb51e9efd1f1a83c42c453) Closes #8

## 0.1.0

### Features

* [`97877fe`](https://github.com/spencerbeggs/pnpm-module-template/commit/97877fe11ced82a0fe7bfc621a79e6b1ea3403b0) Initial release of type-registry-effect as a first-class Effect library.

- Platform-agnostic architecture with `FileSystem` and `HttpClient` resolved within layers
- Three composable Effect services: `CacheService`, `PackageFetcher`, `TypeResolver`
- Namespace module pattern (`TypeRegistry.*`) for composable programs
- Disk-based caching with XDG Base Directory support and configurable TTL
- Type resolution from `package.json` exports, typesVersions, types/typings fields
- Structured logging via discriminated union `LogEventSchema`
- `VirtualPackage` utilities for synthetic type packages from local declarations
- Node.js convenience layer (`NodeLayer`) and Promise-returning wrappers via `type-registry-effect/node`
- Full TypeScript declaration bundling with dual entry points (`index`, `node`)
