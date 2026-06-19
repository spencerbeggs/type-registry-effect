# Caching

type-registry-effect caches type definitions fetched from the jsDelivr CDN so
repeated lookups are fast. Cached **files** live on disk; per-package
**metadata** (cached-at timestamp, version, optional TTL) lives in a SQLite
database via [xdg-effect](https://github.com/spencerbeggs/xdg-effect)'s
`SqliteCache`, which provides native TTL, expiry, and pruning.

## How caching works

1. **First request** -- types downloaded from jsDelivr, written to disk; a
   metadata row is written to the SQLite store.
2. **Subsequent requests** -- types loaded from disk (milliseconds).
3. **After TTL expires** -- the metadata row is evicted on read, and the package
   is re-downloaded on next access.
4. **Version-aware** -- each `name@version` is cached separately.

## Cache location

The cache root is resolved by xdg-effect's `AppDirs` for the
`type-registry-effect` namespace:

| Platform | Cache root |
| --- | --- |
| `$XDG_CACHE_HOME` set | `$XDG_CACHE_HOME/type-registry-effect/` |
| `$XDG_CACHE_HOME` unset | `~/.type-registry-effect/` |

> **Note:** Unlike the XDG default, when `XDG_CACHE_HOME` is unset the root is
> `~/.type-registry-effect` — there is no `.cache` segment. Set `XDG_CACHE_HOME`
> if you want the cache under `~/.cache`.

### Overriding the cache directory

The simplest override is the environment variable:

```bash
export XDG_CACHE_HOME=/tmp/cache
```

For full control, build a `CacheService` layer rooted at an explicit directory
with `makeNodeCacheLayer(dir)`. It requires a `FileSystem`, a `Path`, and a
`SqliteCache` layer to be provided (the default `NodeLayer` wires all of these
for you):

```typescript
import { makeNodeCacheLayer } from "type-registry-effect";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SqliteCache } from "xdg-effect";
import { Layer } from "effect";

const cacheLayer = makeNodeCacheLayer("/tmp/my-types-cache").pipe(
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodePath.layer),
  Layer.provide(SqliteCache.Test()), // or a SqliteClient-backed SqliteCache.Live()
);
```

## Cache structure

Files are stored in a friendly tree — the package name and version are each their
own directory level — alongside a single SQLite metadata database:

```text
<cacheRoot>/
+-- metadata.db                  # SQLite metadata store (all packages)
+-- zod/
|   +-- 3.23.8/
|       +-- package.json         # Package manifest from CDN
|       +-- lib/
|           +-- index.d.ts       # Type definition files
+-- @effect/
    +-- schema/
        +-- 0.79.0/
            +-- package.json
            +-- dist/dts/index.d.ts
```

Scoped packages (`@effect/schema`) nest as `@scope/name/version/`; unscoped
packages (`zod`) sit flat as `name/version/`.

## CacheMetadata

Each cached package has a metadata record (stored in `metadata.db`, not a file on
disk) described by the `CacheMetadata` schema:

```typescript
import type { CacheMetadata } from "type-registry-effect";

// CacheMetadata is a Schema.Struct, not a class — use plain object literals
const metadata: CacheMetadata = {
  cachedAt: Date.now(),   // Unix timestamp when cached
  version: "3.23.8",      // Resolved version string
  ttl: 604_800_000,       // Optional TTL in milliseconds
};
```

When `ttl` is present it becomes the SQLite entry's native expiry, so the entry
participates in pruning automatically. When `ttl` is omitted the entry never
expires and is never pruned.

## TTL (time-to-live)

Pass `ttl` when calling `fetchAndCache` to control how long a cached package is
considered fresh:

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";

yield* TypeRegistry.fetchAndCache(
  new PackageSpec({ name: "zod", version: "3.23.8" }),
  { ttl: 24 * 60 * 60 * 1000 }, // 1 day
);
```

The Promise convenience API accepts the same option:

```typescript
import { fetchAndCache } from "type-registry-effect/node";
import { PackageSpec } from "type-registry-effect";

await fetchAndCache(
  new PackageSpec({ name: "zod", version: "3.23.8" }),
  { ttl: 24 * 60 * 60 * 1000 },
);
```

## Cache operations

### Check if a package is cached

```typescript
const isCached = yield* TypeRegistry.hasCached(
  new PackageSpec({ name: "zod", version: "3.23.8" }),
);
```

### Remove a package from the cache

Deletes both the metadata entry and the on-disk directory:

```typescript
yield* TypeRegistry.clearCache(
  new PackageSpec({ name: "zod", version: "3.23.8" }),
);
```

### Prune expired packages

Evicts every metadata entry whose TTL has elapsed and deletes the corresponding
on-disk directories, returning what was removed:

```typescript
const { count, removed } = yield* TypeRegistry.pruneCache();
console.log(`Pruned ${count} package(s):`, removed);
```

The Promise API exposes the same operation:

```typescript
import { pruneCache } from "type-registry-effect/node";

const { count } = await pruneCache();
```

### Clear the entire cache

Remove the cache root from disk:

```bash
rm -rf ~/.type-registry-effect          # or "$XDG_CACHE_HOME/type-registry-effect"
```

## VFS generation

`CacheService.getVFS` reads all cached files for a package and returns a
`Map<string, string>` with `node_modules/`-prefixed paths (the on-disk tree is an
implementation detail the VFS hides):

```text
node_modules/zod/package.json       -> "{\"name\":\"zod\",...}"
node_modules/zod/lib/index.d.ts     -> "export declare ..."
```

This VFS is compatible with `@typescript/vfs` and Twoslash.
