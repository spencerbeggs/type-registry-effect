# Caching

type-registry-effect uses a disk-based cache with TTL (time-to-live) to
store type definitions fetched from the jsDelivr CDN.

## How caching works

1. **First request** -- types downloaded from jsDelivr, written to disk
2. **Subsequent requests** -- types loaded from disk (milliseconds)
3. **After TTL expires** -- types re-downloaded on next access
4. **Version-aware** -- each `name@version` is cached separately

## Cache location

The cache follows the XDG Base Directory Specification:

| Platform | Default path |
| --- | --- |
| macOS / Linux | `~/.cache/effect-type-registry/` |
| With `$XDG_CACHE_HOME` | `$XDG_CACHE_HOME/effect-type-registry/` |
| Custom | Use `makeNodeCacheLayer(dir)` |

### Overriding the cache directory

```typescript
import { makeNodeCacheLayer } from "type-registry-effect";

// Creates a CacheServiceLive layer that writes to the specified directory
const cacheLayer = makeNodeCacheLayer("/tmp/my-types-cache");
```

Or set the environment variable:

```bash
export XDG_CACHE_HOME=/tmp/cache
```

## Cache structure

Each package version gets its own directory:

```text
~/.cache/effect-type-registry/
+-- zod@3.23.8/
|   +-- .metadata.json     # CacheMetadata (cachedAt, version, ttl)
|   +-- package.json        # Package manifest from CDN
|   +-- lib/
|       +-- index.d.ts      # Type definition files
+-- @effect/
    +-- schema@0.79.0/
        +-- .metadata.json
        +-- package.json
        +-- dist/
            +-- dts/
                +-- index.d.ts
                +-- Schema.d.ts
```

## CacheMetadata

Each cached package has a `.metadata.json` file described by the
`CacheMetadata` schema:

```typescript
import type { CacheMetadata } from "type-registry-effect";

// CacheMetadata is a Schema.Struct, not a class — use plain object literals
const metadata: CacheMetadata = {
  cachedAt: Date.now(),   // Unix timestamp when cached
  version: "3.23.8",      // Resolved version string
  ttl: 604_800_000,       // Optional TTL in milliseconds (default: 7 days)
};
```

## TTL (time-to-live)

Pass `ttl` when calling `fetchAndCache` to control how long a cached
package is considered fresh:

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

```typescript
yield* TypeRegistry.clearCache(
  new PackageSpec({ name: "zod", version: "3.23.8" }),
);
```

### Clear the entire cache

Remove the cache directory from disk:

```bash
rm -rf ~/.cache/effect-type-registry
```

## VFS generation

`CacheService.getVFS` reads all cached files for a package and returns a
`Map<string, string>` with `node_modules/`-prefixed paths:

```text
node_modules/zod/package.json       -> "{\"name\":\"zod\",...}"
node_modules/zod/lib/index.d.ts     -> "export declare ..."
```

This VFS is compatible with `@typescript/vfs` and Twoslash.
