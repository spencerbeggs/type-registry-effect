# Caching Guide

This guide explains how effect-type-registry caches type definitions,
how to optimize cache performance, and how to manage the cache
effectively.

## Table of Contents

1. [How Caching Works](#how-caching-works)
2. [Cache Configuration](#cache-configuration)
3. [Cache Management](#cache-management)
4. [Performance Optimization](#performance-optimization)
5. [Troubleshooting](#troubleshooting)

## How Caching Works

### Cache Strategy

effect-type-registry uses a **disk-based cache** with TTL (time-to-live)
to store type definitions:

1. **First request**: Types downloaded from jsDelivr CDN, stored in
   cache
2. **Subsequent requests**: Types loaded from cache (milliseconds vs
   seconds)
3. **After TTL expires**: Types re-downloaded and cache updated
4. **Version-aware**: Each package version cached separately

### Cache Location

The cache follows the **XDG Base Directory Specification**:

**Default locations:**

- Linux/macOS: `~/.cache/effect-type-registry/`
- With XDG_CACHE_HOME set: `$XDG_CACHE_HOME/effect-type-registry/`
- Custom: Configurable via `cacheDir` option

**Why XDG?**

- Standard location that doesn't clutter home directory
- Respects user preferences via environment variables
- Easy to find and manage
- Can be cleared by system cache cleaners

### Cache Structure

Each package version is stored in its own directory:

```text
~/.cache/effect-type-registry/
├── zod@3.22.4/
│   ├── .metadata.json
│   ├── package.json
│   └── lib/
│       └── index.d.ts
├── @effect/
│   └── cli@0.73.0/
│       ├── .metadata.json
│       ├── package.json
│       └── dist/
│           └── dts/
│               ├── index.d.ts
│               └── Command.d.ts
└── ts-pattern@5.0.1/
    ├── .metadata.json
    ├── package.json
    └── dist/
        └── index.d.ts
```

**Metadata file** (`.metadata.json`):

```json
{
 "version": "1.0.0",
 "packageName": "zod",
 "packageVersion": "3.22.4",
 "cachedAt": 1705334400000,
 "ttl": 604800000
}
```

## Cache Configuration

### Basic Configuration

Configure cache behavior when creating the registry:

```typescript
import { TypeRegistry } from 'effect-type-registry';

const registry = TypeRegistry.create({
 // Custom cache directory
 cacheDir: '~/.cache/my-app',

 // Cache TTL in milliseconds (7 days)
 ttl: 7 * 24 * 60 * 60 * 1000,
});
```

### TTL Configuration

Choose a TTL based on your needs:

**Short TTL (1 day):**

```typescript
const registry = TypeRegistry.create({
 ttl: 24 * 60 * 60 * 1000, // 1 day
});
```

- **Pros**: Always fresh types, good for development
- **Cons**: More network requests, slower builds
- **Use when**: Types change frequently, development environment

**Medium TTL (7 days, default):**

```typescript
const registry = TypeRegistry.create({
 ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

- **Pros**: Good balance of freshness and performance
- **Cons**: May have slightly stale types
- **Use when**: Most applications, CI/CD pipelines

**Long TTL (30 days):**

```typescript
const registry = TypeRegistry.create({
 ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
});
```

- **Pros**: Maximum performance, minimal network requests
- **Cons**: Types may be stale
- **Use when**: Production builds, stable dependencies

**No expiration:**

```typescript
const registry = TypeRegistry.create({
 ttl: Infinity, // Never expire
});
```

- **Pros**: Maximum performance, zero network requests
- **Cons**: Types never update automatically
- **Use when**: Offline environments, locked dependencies

### Custom Cache Directory

Use a custom cache directory for specific use cases:

**Project-specific cache:**

```typescript
import { join } from 'node:path';

const registry = TypeRegistry.create({
 cacheDir: join(process.cwd(), '.cache', 'types'),
});
```

**Shared cache across projects:**

```typescript
const registry = TypeRegistry.create({
 cacheDir: '/tmp/shared-type-cache',
});
```

**Read-only cache:**

Useful for Docker containers or CI:

```typescript
const registry = TypeRegistry.create({
 cacheDir: '/var/cache/types',
 // Set ttl to Infinity so it never tries to update
 ttl: Infinity,
});
```

## Cache Management

### Checking Cache Status

Check if a package is cached before using it:

```typescript
const isCached = await registry.hasCached({
 name: 'zod',
 version: '3.22.4',
});

if (isCached) {
 console.log('Types already cached, will load quickly');
} else {
 console.log('Types not cached, will download');
}
```

### Ensuring Packages Are Cached

Pre-fetch types to ensure they're cached:

```typescript
// Ensure specific package is cached
await registry.ensureCached({
 name: 'zod',
 version: '3.22.4',
});

// Batch ensure multiple packages
const packages = [
 { name: 'zod', version: '3.22.4' },
 { name: 'ts-pattern', version: '5.0.1' },
];

for (const pkg of packages) {
 await registry.ensureCached(pkg);
}
```

### Clearing Cache

Remove packages from cache:

```typescript
// Clear specific package
await registry.clearCache({
 name: 'zod',
 version: '3.22.4',
});

// Clear all packages (rm -rf cache directory)
import { rm } from 'node:fs/promises';
import { getDefaultCacheDir } from 'effect-type-registry';

await rm(getDefaultCacheDir(), { recursive: true, force: true });
```

### Manual Cache Management

Use XDG utilities to work with cache programmatically:

```typescript
import {
 getDefaultCacheDir,
 getXdgCacheHome,
} from 'effect-type-registry';

// Get cache directory
const cacheDir = getDefaultCacheDir();
console.log(`Cache directory: ${cacheDir}`);

// Get XDG cache home
const xdgCacheHome = getXdgCacheHome();
console.log(`XDG cache home: ${xdgCacheHome}`);
```

## Performance Optimization

### Pre-warming the Cache

Pre-fetch types during build or deployment:

```typescript
// scripts/warm-cache.ts
import { TypeRegistry } from 'effect-type-registry';

const packages = [
 { name: 'zod', version: '3.22.4' },
 { name: 'ts-pattern', version: '5.0.1' },
 { name: '@effect/cli', version: '0.73.0' },
 // Add all your dependencies...
];

const registry = TypeRegistry.create({
 ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
});

// Pre-fetch all packages
console.log(`Pre-fetching ${packages.length} packages...`);
const vfs = await registry.getVFS(packages);
console.log(`Cached ${vfs.size} files`);
```

Run before your main build:

```json
{
 "scripts": {
  "prebuild": "tsx scripts/warm-cache.ts",
  "build": "your-build-command"
 }
}
```

### Parallel Fetching

The registry fetches packages in parallel automatically:

```typescript
// Fetches all packages concurrently (default: 5 at a time)
const vfs = await registry.getVFS([
 { name: 'zod', version: '3.22.4' },
 { name: 'ts-pattern', version: '5.0.1' },
 { name: '@effect/cli', version: '0.73.0' },
 { name: '@effect/schema', version: '0.79.0' },
 { name: 'effect', version: '3.19.14' },
]);
```

Configure concurrency:

```typescript
const registry = TypeRegistry.create({
 maxConcurrency: 10, // Fetch up to 10 packages at once
});
```

### CI/CD Cache Strategies

#### Strategy 1: Persistent cache across builds

Use CI cache to persist the type cache:

```yaml
# GitHub Actions example
- name: Cache type definitions
  uses: actions/cache@v3
  with:
      path: ~/.cache/effect-type-registry
      key: type-cache-${{ hashFiles('package.json') }}
      restore-keys: |
          type-cache-
```

#### Strategy 2: Pre-built cache in Docker

Include cache in Docker image:

```dockerfile
# Pre-fetch types during build
RUN node scripts/warm-cache.js

# Cache is now baked into image
```

#### Strategy 3: Shared cache volume

Share cache across CI jobs:

```yaml
volumes:
    - type-cache:/root/.cache/effect-type-registry
```

## Troubleshooting

### Cache Not Being Used

**Symptoms:** Types downloaded every time despite being cached.

**Possible causes:**

1. **TTL expired**: Increase TTL or use `Infinity`
2. **Cache directory changed**: Check `cacheDir` is consistent
3. **Permissions issue**: Ensure cache directory is writable

**Solution:**

```typescript
const registry = TypeRegistry.create({
 cacheDir: getDefaultCacheDir(), // Use consistent location
 ttl: 30 * 24 * 60 * 60 * 1000, // Longer TTL
 onLogEvent: (event) => {
  // Log cache hits/misses
  if (event.event === 'cache.hit') {
   console.log('Cache hit:', event.data.package);
  } else if (event.event === 'cache.miss') {
   console.log('Cache miss:', event.data.package);
  }
 },
});
```

### Cache Taking Too Much Space

**Symptoms:** Cache directory is very large.

**Solution 1:** Clear old packages manually

```bash
# List cache size
du -sh ~/.cache/effect-type-registry

# Remove entire cache
rm -rf ~/.cache/effect-type-registry

# Remove specific package
rm -rf ~/.cache/effect-type-registry/zod@3.22.4
```

**Solution 2:** Shorter TTL to allow automatic cleanup

```typescript
const registry = TypeRegistry.create({
 ttl: 7 * 24 * 60 * 60 * 1000, // 7 days (default)
});
```

### Corrupted Cache

**Symptoms:** Errors loading cached files.

**Solution:** Clear cache and re-download:

```typescript
import { rm } from 'node:fs/promises';
import { getDefaultCacheDir } from 'effect-type-registry';

// Clear entire cache
await rm(getDefaultCacheDir(), { recursive: true, force: true });

// Re-fetch packages
const vfs = await registry.getVFS(packages);
```

## Related Documentation

- [Getting Started](./getting-started.md) - Basic usage
- [Observability](./observability.md) - Monitor cache operations
- [Troubleshooting](../troubleshooting.md) - Common issues
- [Architecture](../architecture/overview.md) - CacheService details
