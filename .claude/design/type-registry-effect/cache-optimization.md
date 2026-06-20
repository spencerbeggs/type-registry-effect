---
status: current
module: type-registry-effect
category: performance
created: 2026-01-17
updated: 2026-06-19
last-synced: 2026-06-19
completeness: 75
related:
  - ./architecture.md
  - ./observability.md
dependencies: []
---

# Cache: SQLite metadata and friendly file tree

The disk cache stores type definition files on disk and per-package metadata in a single SQLite database, with native TTL, expiry and prune.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [On-disk layout](#on-disk-layout)
5. [SQLite metadata](#sqlite-metadata)
6. [Staleness and prune](#staleness-and-prune)
7. [Removal ordering](#removal-ordering)
8. [Cache directory resolution](#cache-directory-resolution)
9. [Related documentation](#related-documentation)

---

## Overview

The cache splits storage across two backends: the bulky type definition payload (`.d.ts` and `package.json` files) lives on disk, and the small per-package metadata (cached-at timestamp, version, optional TTL) lives in an xdg-effect `SqliteCache` -- a single SQLite database with native TTL/expiry, prune and PubSub events. Earlier versions hand-rolled both the metadata sidecars (`.metadata.json` files) and the XDG path logic; both are gone.

The implementation lives in `src/layers/CacheServiceLive.ts`. The `CacheService` interface it satisfies is in `src/services/CacheService.ts`.

---

## Current State

- Files on disk under `<cacheRoot>/<name>/<version>/...`; metadata in one SQLite DB at `<cacheRoot>/metadata.db`.
- TTL, expiry and prune are native to `SqliteCache`. `readMetadata` returns `Option.none()` when an entry is absent or its TTL has expired (expired entries are evicted on read).
- `remove` deletes the metadata entry, then the on-disk directory (two explicit steps); `prune` is best-effort by design.
- VFS output keys are unchanged: `node_modules/<name>/...`, fed directly into an in-memory TypeScript compiler host.
- The cache root resolves via xdg-effect `AppDirs` for the `type-registry-effect` namespace.

---

## Rationale

### Why move metadata into SQLite

The previous `.metadata.json` sidecars meant every freshness check and every TTL decision was a filesystem stat plus a JSON read, and there was no way to ask "which entries have expired?" without walking the whole tree. `SqliteCache` gives native TTL/expiry semantics and a single `prune` query, so freshness and eviction become database operations rather than directory crawls. It also offers PubSub events for cache changes, available to hosts that want them.

### Why the friendlier directory tree

The new layout makes the version its own directory level (`<name>/<version>/...`) instead of encoding it into the package directory name. Scoped packages then nest naturally (`@scope/name/version/…`) and unscoped packages sit flat (`name/version/…`). This keeps the on-disk tree human-readable and makes the cache key derivation a direct mirror of the path.

---

## On-disk layout

```text
<cacheRoot>/
  metadata.db                       # SQLite metadata store
  zod/3.23.8/...                    # unscoped: name/version/…
  @effect/schema/1.0.0/...          # scoped: @scope/name/version/…
```

VFS keys remain `node_modules/<name>/<relative-path>` regardless of the on-disk layout -- the disk tree is an implementation detail the VFS hides.

---

## SQLite metadata

Metadata keys are colon-delimited, mirroring the directory layout: scoped packages become `@scope:name:version` (e.g. `@effect:schema:1.0.0`) and unscoped become `name:version` (e.g. `xdg-effect:1.0.0`). See `keyOf` and its inverse `keyToPackage` in `src/layers/CacheServiceLive.ts`.

The metadata value is the `CacheMetadata` schema (`src/schemas/CacheMetadata.ts`) encoded as JSON. When a TTL is present it is applied as the SQLite entry's native expiry, so the entry participates in `prune` automatically.

---

## Staleness and prune

Freshness is decided in `getPackageVFS` (`src/TypeRegistry.ts`) from two signals -- a live metadata entry and the presence of the on-disk directory:

- **Live metadata present** -> cache hit.
- **Metadata `None` but on-disk directory present** -> stale (TTL expired and evicted, but the files remain). With `autoFetch` the package is refetched; otherwise the on-disk files are served as-is.
- **Nothing present** -> miss.

`pruneCache()` (public program) evicts every expired metadata entry and deletes each one's on-disk directory, returning a `CachePruneResult` (`{ count, removed }`). Packages cached without a TTL never expire and are never pruned.

---

## Removal ordering

`remove` (single package) deletes the metadata entry, then the on-disk directory -- two explicit steps. It deliberately does **not** use SqliteCache's transactional `invalidate(key, onRemoved)` callback, because that callback only fires when a metadata row actually matched, and files can outlive their metadata: a TTL-expired entry is evicted from SQLite on read, leaving the on-disk files behind. Deleting metadata first means a crash between the two steps leaves harmless orphaned files (a later refetch overwrites them) rather than a phantom cache hit (metadata present, files gone).

`prune` (bulk) evicts every expired metadata entry, then deletes each one's directory best-effort, ignoring per-directory failures. File removals are side effects outside the SQL transaction, so an orphaned directory is harmless -- a later refetch overwrites it. See the comments in `src/layers/CacheServiceLive.ts`.

---

## Cache directory resolution

The cache root resolves through xdg-effect `AppDirs` for the `type-registry-effect` namespace (configured in `src/platforms/node.ts`), replacing the deleted hand-rolled XDG helper.

Note one behavioral quirk: `AppDirs` does not apply XDG per-type defaults. With `XDG_CACHE_HOME` unset, the cache root is `~/.type-registry-effect` (no `.cache` segment); with it set, the root is `$XDG_CACHE_HOME/type-registry-effect`. The SQLite DB lives at `<cacheRoot>/metadata.db`.

For tests, pair `makeNodeCacheLayer(baseDir)` with `SqliteCache.Test()` to control the cache location directly.

---

## Related documentation

- **Architecture:** `./architecture.md` -- service and layer composition, public API
- **Observability:** `./observability.md` -- event channel, metrics, fault tolerance
- **Main package README:** `README.md`
