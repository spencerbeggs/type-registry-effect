---
"type-registry-effect": major
---

## Breaking Changes

- **Per-package metadata now lives in a SQLite store, not `.metadata.json`
  sidecars.** Metadata is tracked via xdg-effect's `SqliteCache` (with native TTL
  expiry, pruning, and events). `CacheService.readMetadata` now returns
  `Option<CacheMetadata>` (`None` when absent or expired — expired entries are
  evicted on read) instead of failing, and `CacheService` gains a `prune`
  operation. Cache freshness is now derived from the metadata entry plus on-disk
  presence rather than a hand-rolled `cachedAt + ttl` check.
- **The cache root was renamed and is now resolved via xdg-effect `AppDirs`**
  (namespace `type-registry-effect`). The directory is `effect-type-registry`
  no longer; it resolves to `$XDG_CACHE_HOME/type-registry-effect` when
  `XDG_CACHE_HOME` is set, otherwise `~/.type-registry-effect`. Any existing
  `~/.cache/effect-type-registry` directory is orphaned and can be deleted.
- **Friendlier on-disk layout.** Cached files are stored under
  `<name>/<version>/...`, so scoped packages nest naturally
  (`@scope/name/version/…`) and unscoped packages sit flat (`name/version/…`).
- **`getDefaultCacheDir` was removed** from the public API. Path resolution is
  handled by xdg-effect `AppDirs`.
- **New dependencies.** `xdg-effect` and `@effect/sql-sqlite-node` are now
  required; the Node entry point provisions the SQLite metadata store.
- **`VirtualPackage.fromFile` is now Effect-returning.** It reads through the
  `@effect/platform` `FileSystem` service instead of `node:fs`, so it returns
  `Effect<VirtualPackage, PlatformError, FileSystem>` rather than a
  `VirtualPackage`. Wrap call sites accordingly (e.g.
  `yield* VirtualPackage.fromFile(...)` / `Effect.runPromise(...)` with a
  `FileSystem` layer provided). This removes the last `node:fs` dependency from
  the platform-agnostic entry point.

## Features

- Added `TypeRegistry.pruneCache()` (and a `pruneCache()` Promise wrapper in
  `type-registry-effect/node`) which evicts every expired package from the
  metadata store and deletes the matching on-disk directories, returning a
  `CachePruneResult` describing how many — and which — packages were removed.
  Packages cached without a TTL never expire and are never pruned.
