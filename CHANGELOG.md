# type-registry-effect

## 0.2.2

### Tests

* [`1560ac3`](https://github.com/spencerbeggs/type-registry-effect/commit/1560ac3506ed36e0b69f4a58d7db36ef3063ea76) Added branch coverage tests for `TypeResolverLive` to meet stricter coverage thresholds in `@savvy-web/vitest` v1.0.0 (branches: 60% → 75%).

### Build System

* [`1560ac3`](https://github.com/spencerbeggs/type-registry-effect/commit/1560ac3506ed36e0b69f4a58d7db36ef3063ea76) Simplified `vitest.config.ts` to use `VitestConfig.create()` zero-config defaults.

### Dependencies

* | [`1560ac3`](https://github.com/spencerbeggs/type-registry-effect/commit/1560ac3506ed36e0b69f4a58d7db36ef3063ea76) | Dependency    | Type    | Action | From   | To |
  | :---------------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/vitest                                                                                                 | devDependency | updated | 0.2.2  | 1.0.0  |    |
  | @savvy-web/rslib-builder                                                                                          | devDependency | updated | 0.18.3 | 0.19.0 |    |
  | @savvy-web/changesets                                                                                             | devDependency | updated | 0.5.3  | 0.6.0  |    |
  | semver-effect                                                                                                     | dependency    | updated | 0.1.0  | 0.2.0  |    |
  | @savvy-web/pnpm-plugin-silk                                                                                       | config        | updated | 0.9.0  | 0.10.0 |    |

## 0.2.1

### Other

* [`2eb388e`](https://github.com/spencerbeggs/type-registry-effect/commit/2eb388e12df00e04dcddd4df5ba1f00c8099305e) Migrate Effect ecosystem dependencies to `catalog:silk` and `catalog:silkPeers` for centralized version management via `@savvy-web/pnpm-plugin-silk`. Fixes #12.

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
