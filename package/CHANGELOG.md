# type-registry-effect

## 2.3.2

### Dependencies

* | Dependency       | Type           | Action  | From   | To     |                                                                            |
  | ---------------- | -------------- | ------- | ------ | ------ | -------------------------------------------------------------------------- |
  | @effected/semver | peerDependency | updated | ^0.2.0 | ^0.3.0 | [#101][#101] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

### Patch Changes

[#101]: https://github.com/spencerbeggs/type-registry-effect/pull/101

## 2.3.1

### Dependencies

* | Dependency              | Type           | Action  | From   | To     |                                                                          |
  | ----------------------- | -------------- | ------- | ------ | ------ | ------------------------------------------------------------------------ |
  | @effected/tsconfig-json | peerDependency | updated | ^0.3.0 | ^0.4.0 | [#99][#99] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

### Patch Changes

[#99]: https://github.com/spencerbeggs/type-registry-effect/pull/99

## 2.3.0

### Dependencies

* | Dependency              | Type           | Action  | From   | To     |        |        |                                                          |
  | ----------------------- | -------------- | ------- | ------ | ------ | ------ | ------ | -------------------------------------------------------- |
  | @effected/tsconfig-json | peerDependency | updated | ^0.2.7 |        | ^0.3.0 | ^0.3.0 |                                                          |
  | @effected/semver        | peerDependency | added   | —      | ^0.2.0 |        |        | Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

## 2.2.0

### Features

* `TypeCache` gains `writePackage(pkg, files)`, which writes a package's entire file set atomically. It stages every file in a `.staging-<version>` sibling of the live cache directory, then promotes it in a single same-filesystem `rename`, so a reader sees either the package's previous complete state or its new complete state — never a half-written mixture. Because the whole directory is replaced rather than merged, obsolete files left over from a larger previous version are dropped. The existing single-file `write` remains as a low-level primitive.

### Bug Fixes

* A crash or IO failure part-way through caching a package no longer leaves a partial directory that the stale-vs-miss ladder serves as usable stale data. `TypeRegistry.fetchAndCache` now assembles the complete file set and commits it through the atomic `writePackage`, so an interrupted fetch leaves the prior complete directory intact (or, on a first fetch, no directory at all — a clean miss that self-heals).
* Concurrent batch fetches (`getVfs`) no longer serialize on the cache mutation lock. Network fetches now run outside the lock; only the commit — the atomic directory promotion plus the metadata write — is serialized, so uncached packages in a batch are fetched in parallel while `clearCache`/`pruneCache` stay mutually exclusive with a commit. [#87][#87]

### Refactoring

* Now compatible with `@effected/tsconfig-json` `0.3.0`: its `TsEnumCodec.encodeCompilerOptions` returns a structural `ProgrammaticCompilerOptions` type, so `TsEnvironment.make` drops the workaround cast to `@typescript/vfs`'s parameter type. The optional peer range widens from `^0.2.7` to `^0.2.7 || ^0.3.0`; the change is types-only, so `0.2.7` still resolves at runtime. [#87][#87]

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#87]: https://github.com/spencerbeggs/type-registry-effect/pull/87

## 2.1.2

### Dependencies

* | Dependency              | Type           | Action  | From           | To             |                                                          |
  | ----------------------- | -------------- | ------- | -------------- | -------------- | -------------------------------------------------------- |
  | @effect/platform-node   | peerDependency | updated | 4.0.0-beta.98  | 4.0.0-beta.99  |                                                          |
  | @effected/store         | peerDependency | updated | ^0.1.0         | ^0.1.1         |                                                          |
  | @effected/tsconfig-json | peerDependency | updated | ^0.2.3         | ^0.2.7         |                                                          |
  | @effected/xdg           | peerDependency | updated | ^0.1.3         | ^0.1.7         |                                                          |
  | effect                  | peerDependency | updated | 4.0.0-beta.98. | 4.0.0-beta.99. | Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

## 2.1.1

### Dependencies

* | Dependency       | Type       | Action  | From   | To     |
  | ---------------- | ---------- | ------- | ------ | ------ |
  | @effected/semver | dependency | updated | ^0.1.1 | ^0.2.0 |

## 2.1.0

### Bug Fixes

* Both newly-optional peers are now loaded lazily, so omitting them behaves as
  the `optional` flag advertises. `src/TsEnvironment.ts` loads
  `@effected/tsconfig-json` inside the same dynamic `Promise.all` as the
  `typescript` and `@typescript/vfs` peers, and `src/TypeCache.ts` loads
  `@effected/xdg` inside `layerXdg`. Both were previously static value
  imports, and because `index.ts` re-exports `TsEnvironment` and `TypeCache`
  statically, either one made `import("type-registry-effect")` resolve the
  peer eagerly — so a consumer who omitted it got `ERR_MODULE_NOT_FOUND` on
  package import rather than reaching the seam that needs it. [#81][#81]

### Dependencies

* | Dependency                | Type           | Action  | From   | To     |
  | ------------------------- | -------------- | ------- | ------ | ------ |
  | `@effected/semver`        | peerDependency | removed | ^0.1.0 | —      |
  | `@effected/semver`        | dependency     | added   | —      | ^0.1.1 |
  | `@effected/xdg`           | peerDependency | updated | ^0.1.3 | ^0.1.3 |
  | `@effected/tsconfig-json` | peerDependency | updated | ^0.2.3 | ^0.2.3 |

### Maintenance

* Shrunk the required install contract from seven peers to three: `effect`,
  `@effect/platform-node`, and `@effected/store`.

  * **`@effected/semver` is no longer a peer.** It moved to a regular
    `dependencies` entry (`^0.1.1`) — `Range`/`SemVer` are used only inside
    `TypeRegistry.resolveVersion`'s body and never appear in an exported
    signature, so consumers no longer install it themselves.
  * **`@effected/xdg` and `@effected/tsconfig-json` are now optional peers**
    (`peerDependenciesMeta` gains `optional: true` for both; their required
    version ranges are unchanged). `AppDirs`/`AppDirsError` appear only in
    `TypeCache.layerXdg`'s signature, and `CompilerOptions`/`TsEnumCodec` only
    through `TsEnvironment.make`. A consumer on `TypeCache.layer({ cacheDir })`
    who never touches `TsEnvironment` no longer needs either installed.
  * **`@effected/store` remains a required peer** — `Cache` sits in the `R`
    channel of both `TypeCache` layer factories, so a duplicate copy would mint
    a second `Context` tag identity and break layer resolution.

  Existing consumers who keep all seven packages installed see no behavior
  change.

### Minor Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#81]: https://github.com/spencerbeggs/type-registry-effect/pull/81

## 2.0.0

### Breaking Changes

* Ground-up rewrite on **Effect v4** (`4.0.0-beta.98`), replacing the Effect v3
  implementation. Effect v3 is no longer supported.

  * **`type-registry-effect/node` entry point removed.** There is now a single
    `.` export. `NodeLayer`, `createTypeScriptCache`, the `fetchAndCache`
    convenience wrapper, and the Promise-returning API are gone — consumers wire
    platform layers (for example `NodeHttpClient`, `NodeFileSystem` from
    `@effect/platform-node`) at the edge themselves. `./package.json` is now
    also an explicit export.
  * **New flat public API.** `TypeRegistry` (facade: `getVfs`, `getPackageVfs`,
    `fetchAndCache`, `resolveVersion`, `clearCache`), `TypeCache` (two-plane
    cache with `layer({ cacheDir })` / `layerXdg({ namespace })` statics),
    `PackageFetcher`, `TypeResolver`, `TsEnvironment` (lazily loads the optional
    `typescript` / `@typescript/vfs` peers), `PackageSpec`, `Vfs` (`mergeVfs`,
    `prefixVfs`), `VirtualPackage`, and `RegistryEvent` / `RegistryObserver`.
    The v3 names `CacheService`, `CacheServiceLive`, `TypeRegistryLive`,
    `TypeResolverLive`, `TypeRegistryObserver`, and `NodeLayer` are gone.
  * **`TsEnvironment.make`'s `compilerOptions` no longer takes
    `ts.CompilerOptions`.** It now takes tsconfig JSON form via
    `CompilerOptions.Type` from `@effected/tsconfig-json` — e.g.
    `{ target: "es2022" }` instead of `{ target: ts.ScriptTarget.ES2022 }` —
    converted to the compiler's numeric enums internally. Callers no longer need
    to import `typescript` to build this option.
  * **Services are `Context.Service` classes** with namespaced tag IDs
    (`type-registry-effect/TypeCache`, `/TypeRegistry`, `/PackageFetcher`,
    `/RegistryObserver`), each paired with an exported `*Shape` interface.
    Layers are statics on the service class rather than separate exports.
  * **Errors are `Schema.TaggedErrorClass`** (`FetchError`,
    `PackageNotFoundError`, `VersionNotFoundError`, `TypeCacheError`,
    `BatchLoadError`, `TsEnvironmentError`). The v3 `Data.TaggedError` error
    types and their `*Base` exports are gone.
  * **Metrics module removed.** Observability is now the opt-in
    `RegistryObserver` / `RegistryEvent` channel — 11 typed event variants,
    silent by default — plus `Effect.fn` span tracing on service methods.
  * **Hardening.** New input limits and path-safety checks
    (safe relative paths, prototype-pollution guards) reject malformed input as
    typed errors instead of failing unpredictably deeper in the pipeline.

### Dependencies

* | Dependency                | Type           | Action  | From     | To            |
  | ------------------------- | -------------- | ------- | -------- | ------------- |
  | `effect`                  | peerDependency | updated | ^3.21.4  | 4.0.0-beta.98 |
  | `semver-effect`           | dependency     | removed | ^0.3.1   | —             |
  | `xdg-effect`              | dependency     | removed | ^2.1.1   | —             |
  | `@effected/semver`        | peerDependency | added   | —        | ^0.1.0        |
  | `@effected/store`         | peerDependency | added   | —        | ^0.1.0        |
  | `@effected/tsconfig-json` | peerDependency | added   | —        | ^0.2.3        |
  | `@effected/xdg`           | peerDependency | added   | —        | ^0.1.3        |
  | `typescript`              | peerDependency | updated | ^7.0.2   | ^6.0.3        |
  | `@effect/platform`        | peerDependency | removed | ^0.96.2  | —             |
  | `@effect/sql`             | peerDependency | removed | ^0.51.1  | —             |
  | `@effect/sql-sqlite-node` | peerDependency | removed | ^0.52.0  | —             |
  | `@effect/platform-node`   | peerDependency | updated | ^0.107.0 | 4.0.0-beta.98 |

  `typescript` is pinned to `^6.0.3` — tsgo 7.x lacks the compiler API
  `TsEnvironment` needs. `typescript` and `@typescript/vfs` are now optional
  peers: consumers that never call `TsEnvironment` don't need either installed.
  `@effected/tsconfig-json` is a required peer — it supplies the
  `CompilerOptions` type and enum codec `TsEnvironment.make` converts JSON-form
  options with, and has no dependency on `typescript` itself. [#75][#75]

### Major Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#75]: https://github.com/spencerbeggs/type-registry-effect/pull/75

## 1.1.0

### Dependencies

* | Dependency              | Type           | Action | From | To                |                                                          |
  | ----------------------- | -------------- | ------ | ---- | ----------------- | -------------------------------------------------------- |
  | @effect/sql             | peerDependency | added  | —    | catalog:silkPeers |                                                          |
  | @effect/sql-sqlite-node | peerDependency | added  | —    | catalog:silkPeers | Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

## 1.0.2

### Bug Fixes

* [`cc6b1bc`](https://github.com/spencerbeggs/type-registry-effect/commit/cc6b1bce39226dfd72bf60c086868b217f12441f) Fixes namespace type exports.

## 1.0.1

### Documentation

* [`0dd5262`](https://github.com/spencerbeggs/type-registry-effect/commit/0dd5262ca99966cade77fcc674cf386083f7ff0a) Added TSDoc release tags (`@public` / `@internal`) across exported errors, schemas, services, and layers so the bundled declaration output carries accurate API Extractor release tags
* Restructured the `TypeRegistry` and `VirtualPackage` namespace re-exports in `src/index.ts` from `export * as X` into real `export namespace` declarations with `export import` member aliases, so each namespace carries its own release tag in the bundled `.d.ts` — consumer imports are unchanged

### Build System

* [`0dd5262`](https://github.com/spencerbeggs/type-registry-effect/commit/0dd5262ca99966cade77fcc674cf386083f7ff0a) Migrated `savvy.build.ts` to the `build()` API from `@savvy-web/bundler`, replacing the previous `defineBuild`/`runBuild` pair
* Suppresses the `ae-forgotten-export` warning for the `_base` pattern generated by Effect's `Context.Tag`, which can't be release-tagged from source
* Bumped the pinned `@savvy-web/pnpm-plugin-silk` config dependency

### Dependencies

* [`0dd5262`](https://github.com/spencerbeggs/type-registry-effect/commit/0dd5262ca99966cade77fcc674cf386083f7ff0a) | Dependency | Type | Action | From | To |
  \| ------------- | ---------- | ------- | ------ | ------ |
  \| semver-effect | dependency | updated | ^0.2.1 | ^0.3.0 |
  \| xdg-effect | dependency | updated | ^2.0.0 | ^2.1.0 |

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

- [`b64aa3e`](https://github.com/spencerbeggs/type-registry-effect/commit/b64aa3e6fcf4e03dce57dd5bab27d5e951afc1c2) Allow `null` for the `default` field in the jsDelivr flat file-tree response schema. Some packages (for example `ink`) report `default: null`, which previously failed schema validation and prevented their type definitions from loading. The field is metadata only — loading consumes `files`, never `default`.

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
