# type-registry-effect

## 1.0.0

### Breaking Changes

* [`b64aa3e`](https://github.com/spencerbeggs/type-registry-effect/commit/b64aa3e6fcf4e03dce57dd5bab27d5e951afc1c2) **Per-package metadata now lives in a SQLite store, not `.metadata.json`
  sidecars.** Metadata is tracked via xdg-effect's `SqliteCache` (with native TTL
  expiry, pruning, and events). `CacheService.readMetadata` now returns
  `Option<CacheMetadata>` (`None` when absent or expired — expired entries are
  evicted on read) instead of failing, and `CacheService` gains a `prune`
  operation. Cache freshness is now derived from the metadata entry plus on-disk
  presence rather than a hand-rolled `cachedAt + ttl` check.
* **The cache root was renamed and is now resolved via xdg-effect `AppDirs`**
  (namespace `type-registry-effect`). The directory is `effect-type-registry`
  no longer; it resolves to `$XDG_CACHE_HOME/type-registry-effect` when
  `XDG_CACHE_HOME` is set, otherwise `~/.type-registry-effect`. Any existing
  `~/.cache/effect-type-registry` directory is orphaned and can be deleted.
* **Friendlier on-disk layout.** Cached files are stored under
  `<name>/<version>/...`, so scoped packages nest naturally
  (`@scope/name/version/…`) and unscoped packages sit flat (`name/version/…`).
* **`getDefaultCacheDir` was removed** from the public API. Path resolution is
  handled by xdg-effect `AppDirs`.
* **New dependencies.** `xdg-effect` and `@effect/sql-sqlite-node` are now
  required; the Node entry point provisions the SQLite metadata store.
* **`VirtualPackage.fromFile` is now Effect-returning.** It reads through the
  `@effect/platform` `FileSystem` service instead of `node:fs`, so it returns
  `Effect<VirtualPackage, PlatformError, FileSystem>` rather than a
  `VirtualPackage`. Wrap call sites accordingly (e.g.
  `yield* VirtualPackage.fromFile(...)` / `Effect.runPromise(...)` with a
  `FileSystem` layer provided). This removes the last `node:fs` dependency from
  the platform-agnostic entry point.

### Features

* [`b64aa3e`](https://github.com/spencerbeggs/type-registry-effect/commit/b64aa3e6fcf4e03dce57dd5bab27d5e951afc1c2) Added `TypeRegistry.pruneCache()` (and a `pruneCache()` Promise wrapper in
  `type-registry-effect/node`) which evicts every expired package from the
  metadata store and deletes the matching on-disk directories, returning a
  `CachePruneResult` describing how many — and which — packages were removed.
  Packages cached without a TTL never expire and are never pruned.

- [`b64aa3e`](https://github.com/spencerbeggs/type-registry-effect/commit/b64aa3e6fcf4e03dce57dd5bab27d5e951afc1c2) Adds a typed, opt-in event channel for programmatic consumers, replacing diagnostic logging as the way to observe registry operations.

* New `TypeRegistryObserver` service with a `RegistryEvent` tagged union (`VersionResolved`, `VersionResolveFailed`, `CacheHit`, `CacheStale`, `CacheMiss`, `FetchStart`, `FetchFailed`, `PackageLoaded`, `PackageLoadFailed`, `BatchStart`, `BatchComplete`).
* `layerCallback(fn)` for the low-friction subscription path, `layerNoop` for an explicit no-op, and `emitEvent` for internal emission. Emission is opt-in and adds no requirement to program signatures — it is a no-op unless an observer layer is provided.
* `PackageLoadFailed` carries a `kind` discriminator (`not-found`, `version-range`, `schema`, `json`, `network`, `unknown`) so consumers can react without parsing error strings. `FetchFailed` carries the HTTP status and a response body snippet.

### Bug Fixes

* [`b64aa3e`](https://github.com/spencerbeggs/type-registry-effect/commit/b64aa3e6fcf4e03dce57dd5bab27d5e951afc1c2) HTTP requests now fail fast on a non-2xx status instead of feeding the error response body into `res.json` / `res.text`. Previously a 404 (for example an unpublished version or a version range the CDN rejects) surfaced as an opaque "JSON parse failed" error; it now fails with the real status and body.

### Bug Fixes

* [`b64aa3e`](https://github.com/spencerbeggs/type-registry-effect/commit/b64aa3e6fcf4e03dce57dd5bab27d5e951afc1c2) Allow `null` for the `default` field in the jsDelivr flat file-tree response schema. Some packages (for example `ink`) report `default: null`, which previously failed schema validation and prevented their type definitions from loading. The field is metadata only — loading consumes `files`, never `default`.

### Minor Changes

* [`b64aa3e`](https://github.com/spencerbeggs/type-registry-effect/commit/b64aa3e6fcf4e03dce57dd5bab27d5e951afc1c2) Allow `null` for the `default` field in the jsDelivr flat file-tree response schema. Some packages (for example `ink`) report `default: null`, which previously failed schema validation and prevented their type definitions from loading. The field is metadata only — loading consumes `files`, never `default`.

## 0.2.3

### Dependencies

* | [`0063767`](https://github.com/spencerbeggs/type-registry-effect/commit/0063767b48d2d129a9af5af551eec4a97470ef2e) | Dependency    | Type    | Action  | From    | To |
  | :---------------------------------------------------------------------------------------------------------------- | :------------ | :------ | :------ | :------ | -- |
  | semver-effect                                                                                                     | dependency    | updated | ^0.2.0  | ^0.2.1  |    |
  | @savvy-web/changesets                                                                                             | devDependency | updated | ^0.8.0  | ^0.10.0 |    |
  | @savvy-web/commitlint                                                                                             | devDependency | updated | ^0.6.0  | ^0.9.0  |    |
  | @savvy-web/lint-staged                                                                                            | devDependency | updated | ^1.0.0  | ^1.1.0  |    |
  | @savvy-web/rslib-builder                                                                                          | devDependency | updated | ^0.20.3 | ^0.20.5 |    |
  | @savvy-web/vitest                                                                                                 | devDependency | updated | ^1.3.1  | ^1.3.2  |    |

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
