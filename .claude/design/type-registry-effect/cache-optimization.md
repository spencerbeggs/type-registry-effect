---
status: current
module: type-registry-effect
category: performance
created: 2026-01-17
updated: 2026-08-11
last-synced: 2026-08-11
completeness: 85
related:
  - ./architecture.md
  - ./observability.md
dependencies: []
---

# Cache: two-plane storage, native TTL and prune

`TypeCache` stores type definition files on disk and per-package metadata in a SQLite-backed store, with native
TTL, evict-on-read expiry and bulk prune.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [On-disk layout](#on-disk-layout)
5. [The metadata plane](#the-metadata-plane)
6. [The stale-vs-miss ladder](#the-stale-vs-miss-ladder)
7. [Removal ordering](#removal-ordering)
8. [Prune](#prune)
9. [Cache directory resolution](#cache-directory-resolution)
10. [Testing the cache](#testing-the-cache)
11. [Related documentation](#related-documentation)

---

## Overview

The cache splits storage across two planes:

- **Files** — the bulky payload (`package.json` plus every `.d.ts`) on disk under
  `<cacheDir>/<name>/<version>/`.
- **Metadata** — the small per-package record (`version`, `cachedAt`, optional `ttl`) in `@effected/store`'s
  `Cache`, a SQLite store with native TTL, expiry and prune.

Both live behind one service, `TypeCache` (`package/src/TypeCache.ts`). The two planes are queried independently and that independence is the design — see [The stale-vs-miss ladder](#the-stale-vs-miss-ladder).

---

## Current State

- Files on disk at `<cacheDir>/<name>/<version>/...`; metadata in an `@effected/store` `Cache`.
- The package **never builds the store layer**. The consumer provides `Cache.layerSqlite` (or `layerTest`),
  which is what makes the metadata plane swappable without touching this package.
- TTL is forwarded to the store's native expiry, so `readMetadata` returns `Option.none()` when an entry is
  absent **or expired** (expiry evicts on read). That `None` is the staleness signal.
- `remove` deletes metadata first, then the directory. `prune` is deliberately best-effort and not
  transactional.
- VFS keys are `node_modules/<name>/<relative-path>` regardless of the on-disk layout.
- Every operation is a span (`TypeCache.<method>`) and every failure is a typed `TypeCacheError` carrying
  `operation`, `path` and a structural `cause`.

Changed in the v4 rewrite: the metadata store moved from `xdg-effect`'s `SqliteCache` to `@effected/store`'s
`Cache`, cache-root resolution moved from `xdg-effect` `AppDirs` to `@effected/xdg` `AppDirs`, and the layer is
now a parameterized static on the service class rather than a `makeNodeCacheLayer` free function.

---

## Rationale

### Why two planes at all

Freshness is a question about a small record; the payload is megabytes of declarations. Keeping metadata in a
queryable store means "is this entry live?" and "which entries have expired?" are database operations rather
than filesystem stats and directory crawls. Keeping files on disk means the payload is served by the OS page
cache and is inspectable by a human.

### Why the store owns TTL

Delegating TTL to the store gives evict-on-read expiry and a single bulk `prune()` for free, instead of
hand-rolled `.metadata.json` sidecars where every freshness check was a stat plus a JSON read. It also means
expiry semantics are the store's tested behaviour, not this package's.

### Why the consumer builds the store layer

`Cache.layerSqlite` needs its database directory to exist and carries its own configuration. Owning it here
would force one database location on every consumer and make the test path awkward. Exposing `Cache` as a layer
requirement lets a test provide `Cache.layerTest()` (`:memory:`) and a host point the store wherever it wants.

### Why the directory tree looks the way it does

The version is its own directory level (`<name>/<version>/…`) rather than encoded into the package directory
name, so scoped packages nest naturally and the cache key is a direct mirror of the path. The tree stays
human-readable.

---

## On-disk layout

```text
<cacheDir>/
  zod/3.23.8/...                    # unscoped: name/version/…
  @effect/schema/1.0.0/...          # scoped: @scope/name/version/…
```

Two write paths land here. `TypeCache.write` is the low-level single-file primitive: it writes one file straight into the live `<cacheDir>/<name>/<version>/` directory and does not guard completeness. `TypeCache.writePackage` is the whole-package path the registry commits through, and it is atomic — see [Atomic package writes](#atomic-package-writes).

Both reject any `filePath` that is absolute or contains `..` **before** any join (`isSafeRelativePath`, `package/src/internal/resolution.ts`), failing with a typed `TypeCacheError`. The paths written here come from a CDN file tree, so a hostile tree must not be able to write outside its target directory. `PackageSpec`'s own field patterns close the same hole for `name` and `version`.

Directory listing (`listFiles`, `getVfs`) walks recursively under `MAX_NESTING_DEPTH`; a tree deeper than the cap fails typed rather than recursing without bound.

`getVfs` reads every cached file and keys it `node_modules/<name>/<path>`, normalizing backslashes. The disk tree is an implementation detail the VFS hides.

### Atomic package writes

`writePackage(pkg, files)` replaces the whole `<name>/<version>/` tree in one step, so the live directory only ever holds a *complete* file set. It stages every file into a `.staging-<version>` directory that is a **sibling** of the live dir — same `<cacheDir>/<name>` parent, so the promoting `rename` is same-filesystem and atomic, and a `.staging-*` name is invisible to reads, which target the live dir specifically — then promotes by removing the live dir and renaming staging onto it. Because the whole directory is replaced rather than merged, obsolete files from a larger previous version are dropped.

A path-safety or IO failure during staging aborts **before** promotion, leaving the live dir untouched (or absent, on a first fetch); a crash never leaves a partial tree the stale-vs-miss ladder would serve as usable stale data. There is a tiny window between the live-dir remove and the rename where the live dir is briefly absent; a concurrent reader there classifies the package as a miss (see [The stale-vs-miss ladder](#the-stale-vs-miss-ladder)), which self-heals on the next fetch — strictly better than serving a partial tree. This atomic promotion is what lets `exists` read "files present" as "package complete"; no completion marker is written.

`TypeRegistry.fetchAndCache` is the only caller — it assembles the full file array then commits it through `writePackage` under the mutation semaphore. See [architecture.md](./architecture.md#typeregistry) for the commit-only lock scope.

---

## The metadata plane

The key is `PackageSpec.cacheKey`: colon-delimited, `@scope:name:version` for scoped packages and
`name:version` otherwise. `PackageSpec.parseCacheKey` is the inverse and returns `Option.none()` for anything
mis-shaped — the store may hold keys this package never wrote, so a bad key is data, not a defect.

The value is `TypeCacheMetadata` (`version`, `cachedAt` as `DateTimeUtcFromString`, optional `ttl` as
`DurationFromMillis`) encoded via `Schema.fromJsonString`, stored as UTF-8 bytes with
`contentType: "application/json"` and tagged with the package name. When `ttl` is present it is also passed to
the store's native `ttl`, so the entry participates in expiry and prune automatically. An absent `ttl` means the
entry never expires and is never pruned.

The key scheme mirrors v3's layout, but there is no compat contract with databases written by earlier versions
— nothing was published.

---

## The stale-vs-miss ladder

`TypeRegistry.getPackageVfs` decides freshness from **two independent signals**: `readMetadata` (live metadata?)
and `exists` (files on disk?).

| Metadata | Files | Outcome |
| --- | --- | --- |
| Some | present | **Hit.** Emits `CacheHit` with the entry's age. |
| None | present | **Stale.** Emits `CacheStale`. Refetched when `autoFetch`, else served from disk as-is. |
| Some | absent | Treated as a **miss** — see below. |
| None | absent | **Miss.** Emits `CacheMiss`. Fetched when `autoFetch`, else fails `PackageNotFoundError`. |

Two details are load-bearing:

- **A hit requires both planes.** Live metadata whose files are gone is an external deletion; serving it would make `getVfs` return an empty plane. Requiring both makes that case a miss and self-heals.
- **`exists` is a pure disk check — and now a trustworthy completeness signal.** It does not consult metadata, which is exactly what lets the ladder distinguish "files present, metadata expired" from an outright miss. "Files present" can be read as "package complete" because `writePackage` only ever exposes a fully-staged directory (see [Atomic package writes](#atomic-package-writes)) — a present directory is never a half-written one, so "stale" never means "partial". A filesystem failure surfaces as `TypeCacheError` rather than being laundered into `false` (which v3 did).

In-process interleavings that could strand one plane are prevented by `TypeRegistry`'s mutation semaphore; the
both-planes check is the backstop for anything external, including other processes.

---

## Removal ordering

`TypeCache.remove` deletes the metadata entry **first**, then the directory — two explicit steps.

It deliberately does not ride the store's transactional `invalidate(key, onRemoved)` callback, because that
callback only fires when a metadata row actually matched, and files routinely outlive their metadata (a
TTL-expired entry is evicted on read, leaving files behind). Ordering metadata first means a crash between the
two steps leaves harmless orphaned files that a later refetch overwrites, never a phantom cache hit with
metadata present and files gone.

---

## Prune

`TypeCache.prune` calls the store's `prune()`, then walks the returned keys, parses each back into a
`PackageSpec` and removes its directory. It returns `CachePruneResult`
(`{ count, removed: [{ name, version }] }`), where `count` is the store's evicted-entry count and `removed`
lists only the directories that were **actually** deleted.

Prune is deliberately **not** transactional. File removals are side effects outside the SQL transaction, so a
mid-loop rollback would restore all metadata while earlier directories were already gone. Metadata is pruned
first and per-directory failures are swallowed — an orphaned directory is harmless because a later refetch
overwrites it — but a failed removal is not claimed in `removed`.

`TypeRegistry.pruneCache` wraps this under the mutation semaphore and its own span.

---

## Cache directory resolution

Two layer factories, both parameterized statics on the service class:

- `TypeCache.layer({ cacheDir })` — an explicit absolute directory. A relative path is developer wiring and
  dies at layer construction.
- `TypeCache.layerXdg({ namespace? })` — roots the cache at `<AppDirs cache>/<namespace>`, default namespace
  `ts-vfs`. It uses `AppDirs.ensureCache`, which also discharges the store's recorded constraint that the
  database directory must exist before `SqliteClient.layer` is built, then creates the namespace subdirectory.
  A namespace that is empty, `.`/`..`, or contains a separator is a wiring defect and dies at construction.

Because these are factories rather than layer values, **bind the built layer to a `const` and provide that
const** — two provide sites of `TypeCache.layerXdg()` mint two independent caches. This is the layer
memoization discipline.

The two factories differ in what they oblige the consumer to install. `AppDirs` / `AppDirsError` appear only in `layerXdg`'s signature, so `@effected/xdg` is an **optional peer**: a consumer that roots its cache explicitly with `layer({ cacheDir })` never installs it. `@effected/store` is a **required peer** for both, because `Cache` is in the requirements of each. Neither is ever a `dependencies` entry: both carry their own `effect` peer, and a nested copy would resolve against a different `effect` and mint a second `Context.Key`, so the consumer's `Cache` layer would silently fail to satisfy this package's requirement. See [Why the install contract is four required peers](./architecture.md#why-the-install-contract-is-four-required-peers).

---

## Testing the cache

The metadata plane is swappable, so cache tests need no real database file:

```typescript
const TestLayer = TypeCache.layer({ cacheDir }).pipe(
  Layer.provideMerge(Layer.mergeAll(Cache.layerTest(), NodeFileSystem.layer, Path.layer)),
);
```

`package/__test__/TypeCache.test.ts` pairs `Cache.layerTest()` (`:memory:`) with a temp `cacheDir`, uses `FileSystem.layerNoop` to force IO failures into typed `TypeCacheError` values, and asserts that the wiring defects (relative `cacheDir`, malformed namespace) die under `Layer.build` + `Effect.exit`.

---

## Related documentation

- **Architecture:** `./architecture.md` — service composition, error model, public API
- **Observability:** `./observability.md` — cache events, spans, fault tolerance
- **Main package README:** `package/README.md`
