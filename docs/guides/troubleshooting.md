# Troubleshooting

Common issues and solutions when using type-registry-effect.

## Peer dependency errors

### Missing required peers

If you see errors like:

```text
Cannot find module 'effect' or its corresponding type declarations
```

Install the required peer dependencies:

```bash
pnpm add effect @effect/platform
```

### Missing optional peers

If you import from `type-registry-effect/node` and see:

```text
Cannot find module '@effect/platform-node'
```

Install the Node.js platform adapter:

```bash
pnpm add @effect/platform-node
```

### Version mismatches

Effect packages must have compatible versions. If you see runtime errors
like:

```text
TypeError: Effect.gen is not a function
```

Check that all `@effect/*` packages are from the same release:

```bash
pnpm list effect @effect/platform @effect/platform-node
```

Update them together:

```bash
pnpm add effect@latest @effect/platform@latest @effect/platform-node@latest
```

## Missing layer errors

### TypeScript compile error: service not provided

If you see a type error like:

```text
Type 'Effect<VirtualFileSystem, ..., CacheService | PackageFetcher>'
  is not assignable to type 'Effect<VirtualFileSystem, ..., never>'
```

This means you forgot to provide a layer. Every `TypeRegistry` function
requires services listed in its `R` type parameter. Provide a layer
before running:

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

// Wrong: missing layer
// await Effect.runPromise(TypeRegistry.getVFS([...]));

// Correct: provide NodeLayer
await Effect.runPromise(
  Effect.provide(TypeRegistry.getVFS([...]), NodeLayer),
);
```

## Typed errors

All errors are `Data.TaggedError` instances with a `_tag` field. Use
`Effect.catchTag` for targeted recovery:

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";

const program = TypeRegistry.fetchAndCache(
  new PackageSpec({ name: "zod", version: "3.23.8" }),
).pipe(
  Effect.catchTag("NetworkError", (err) =>
    Effect.logWarning(`Offline: ${err.message}`),
  ),
  Effect.catchTag("CacheError", (err) =>
    Effect.logWarning(`Disk issue: ${err.message}`),
  ),
);
```

### Error reference

| Tag | Cause | Recovery |
| --- | --- | --- |
| `CacheError` | Disk read/write failure | Check permissions, clear cache |
| `NetworkError` | HTTP failure or CDN unreachable | Retry later, check connectivity |
| `PackageNotFoundError` | Package/version not on CDN | Verify name and version exist |
| `ParseError` | Invalid JSON from CDN | CDN may be returning HTML error page |
| `ResolutionError` | Cannot resolve import from package.json | Check package exports field |
| `TimeoutError` | Operation timed out | Retry or increase timeout |

## Cache issues

### Permission denied

```text
Error: EACCES: permission denied, mkdir '~/.type-registry-effect'
```

Fix:

```bash
mkdir -p ~/.type-registry-effect
chmod 755 ~/.type-registry-effect
```

Or point the cache somewhere writable via the environment variable:

```bash
export XDG_CACHE_HOME=/tmp/cache   # cache root becomes /tmp/cache/type-registry-effect
```

For a fully custom directory, build the layer with `makeNodeCacheLayer(dir)` and
provide the required platform layers — see the
[Caching guide](./caching.md#overriding-the-cache-directory).

### Cache corruption

If you see JSON parse errors from cached data, clear the affected
package:

```typescript
yield* TypeRegistry.clearCache(
  new PackageSpec({ name: "zod", version: "3.23.8" }),
);
```

Or remove the entire cache:

```bash
rm -rf ~/.type-registry-effect
```

## Network issues

### CDN connectivity

Test access to the jsDelivr CDN:

```bash
curl -I https://cdn.jsdelivr.net/npm/zod@3.23.8/package.json
```

### CDN sync delay

Newly published packages take 5--10 minutes to appear on jsDelivr. If a
freshly published version returns 404, wait and retry.

## Getting help

If your issue is not covered here:

1. Check typed errors with `Effect.catchAll` to see the exact error tag
2. Clear cache to rule out corruption
3. Verify CDN access with curl
4. Report an issue with the package name, version, error tag, and
   Node.js version
