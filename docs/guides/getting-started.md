# Getting Started

This guide walks you through installing and using effect-type-registry
for the first time.

## Table of Contents

1. [Installation](#installation)
2. [Basic Usage](#basic-usage)
3. [Understanding the Cache](#understanding-the-cache)
4. [Common Patterns](#common-patterns)
5. [Next Steps](#next-steps)

## Installation

Install the package using your preferred package manager:

```bash
# Using pnpm (recommended)
pnpm add effect-type-registry

# Using npm
npm install effect-type-registry

# Using yarn
yarn add effect-type-registry
```

The package requires Node.js ≥20.0.0 and has peer dependencies on
Effect-TS packages that will be installed automatically.

## Basic Usage

### Creating a Registry

Start by creating a TypeRegistry instance:

```typescript
import { TypeRegistry } from 'effect-type-registry';

const registry = TypeRegistry.create({
 // Optional: custom cache directory
 cacheDir: '~/.cache/my-app',

 // Optional: cache TTL in milliseconds (default: 7 days)
 ttl: 7 * 24 * 60 * 60 * 1000,

 // Optional: event handler for observability
 onLogEvent: (event) => {
  console.log(`[${event.level}] ${event.message}`);
 },
});
```

### Fetching Types

Fetch and cache type definitions for a package:

```typescript
// Fetch types for a specific version
await registry.fetchAndCache({
 name: 'zod',
 version: '3.22.4',
});

// Fetch types for latest version
await registry.fetchAndCache({
 name: '@effect/cli',
 version: 'latest',
});
```

### Generating a VFS

Create a virtual file system for use with TypeScript:

```typescript
// Get VFS for multiple packages
const vfs = await registry.getVFS([
 { name: 'zod', version: '3.22.4' },
 { name: 'ts-pattern', version: '5.0.1' },
]);

// VFS is a Map<string, string> with paths and contents
// Keys: node_modules/zod/lib/index.d.ts
// Values: File contents as strings
```

### Complete Example

Here's a complete example showing the basic workflow:

```typescript
import { TypeRegistry } from 'effect-type-registry';

async function main() {
 // Create registry
 const registry = TypeRegistry.create({
  onLogEvent: (event) => {
   if (event.level === 'info') {
    console.log(event.message);
   }
  },
 });

 // Define packages we need
 const packages = [
  { name: 'zod', version: '3.22.4' },
  { name: '@effect/cli', version: '0.73.0' },
 ];

 // Get VFS (auto-fetches if not cached)
 const vfs = await registry.getVFS(packages);

 console.log(`Loaded ${vfs.size} files`);

 // Use VFS with your tool
 // initializeTwoslash(vfs);
}

main();
```

## Understanding the Cache

### Cache Location

By default, the cache is stored in a system-appropriate location:

- **Linux/macOS**: `~/.cache/effect-type-registry/`
- **With XDG**: `$XDG_CACHE_HOME/effect-type-registry/`
- **Custom**: Specify `cacheDir` in options

### Cache Structure

Each package is stored in its own directory:

```text
~/.cache/effect-type-registry/
├── zod@3.22.4/
│   ├── .metadata.json    # Cache metadata
│   ├── package.json       # Package manifest
│   └── lib/
│       └── index.d.ts     # Type definitions
└── @effect/
    └── cli@0.73.0/
        ├── .metadata.json
        ├── package.json
        └── dist/
            └── dts/
                └── index.d.ts
```

### Cache Behavior

- **First request**: Types are downloaded from jsDelivr CDN
- **Subsequent requests**: Types are loaded from cache (fast)
- **After TTL expires**: Types are re-downloaded and cache is updated
- **Manual management**: Use `clearCache()` to remove packages

### Checking Cache Status

```typescript
// Check if package is cached
const isCached = await registry.hasCached({
 name: 'zod',
 version: '3.22.4',
});

// Ensure package is cached (auto-fetch if needed)
await registry.ensureCached({
 name: 'zod',
 version: '3.22.4',
});

// Clear specific package from cache
await registry.clearCache({
 name: 'zod',
 version: '3.22.4',
});
```

## Common Patterns

### Pattern 1: Batch Fetching

Fetch multiple packages efficiently:

```typescript
const packages = [
 { name: 'zod', version: '3.22.4' },
 { name: 'ts-pattern', version: '5.0.1' },
 { name: '@effect/schema', version: '0.79.0' },
];

// Fetches in parallel with automatic caching
const vfs = await registry.getVFS(packages);
```

### Pattern 2: Version Resolution

Let the registry resolve version references:

```typescript
// Use 'latest' to get the newest version
await registry.fetchAndCache({
 name: 'zod',
 version: 'latest',
});

// Use a version tag
await registry.fetchAndCache({
 name: '@effect/cli',
 version: 'next',
});

// Use a semver range (resolves to specific version)
await registry.fetchAndCache({
 name: 'zod',
 version: '^3.0.0',
});
```

### Pattern 3: Import Resolution

Resolve import specifiers to file paths:

```typescript
// Resolve a subpath export
const resolved = await registry.resolveImport(
 { name: '@effect/cli', version: '0.73.0' },
 './Command'
);
// => { filePath: 'dist/dts/Command.d.ts', isTypeDefinition: true }

// Get all type entry points
const entries = await registry.getTypeEntries({
 name: '@effect/cli',
 version: '0.73.0',
});
// => [
//   { filePath: 'dist/dts/index.d.ts', isTypeDefinition: true },
//   { filePath: 'dist/dts/Command.d.ts', isTypeDefinition: true },
//   ...
// ]
```

### Pattern 4: Event Handling

Monitor operations with structured events:

```typescript
const registry = TypeRegistry.create({
 onLogEvent: (event) => {
  switch (event.event) {
   case 'cache.hit':
    console.log(`✓ ${event.data.package}@${event.data.version} (cached)`);
    break;

   case 'package.loaded':
    console.log(
     `✓ Loaded ${event.data.package}@${event.data.version} ` +
      `(${event.data.files} files)`
    );
    break;

   case 'package.load.failed':
    console.error(
     `✗ Failed to load ${event.data.package}@${event.data.version}`
    );
    break;
  }
 },
});
```

## Next Steps

Now that you understand the basics, explore these guides:

- [Caching Guide](./caching.md) - Optimize cache performance and
  configuration
- [Observability Guide](./observability.md) - Deep dive into event
  system and monitoring
- [Twoslash Integration](../integration/twoslash.md) - Use with
  Twoslash for interactive code examples
- [Troubleshooting](../troubleshooting.md) - Common issues and
  solutions

## Quick Reference

### Essential Methods

```typescript
// Create registry
const registry = TypeRegistry.create(options);

// Fetch and cache
await registry.fetchAndCache(pkg);

// Get VFS
const vfs = await registry.getVFS(packages);

// Check cache
const cached = await registry.hasCached(pkg);

// Ensure cached
await registry.ensureCached(pkg);

// Clear cache
await registry.clearCache(pkg);

// Resolve import
const resolved = await registry.resolveImport(pkg, specifier);

// Get type entries
const entries = await registry.getTypeEntries(pkg);
```

### Common Options

```typescript
interface TypeRegistryOptions {
 cacheDir?: string; // Default: ~/.cache/effect-type-registry
 ttl?: number; // Default: 7 days (in milliseconds)
 onLogEvent?: (event: LogEvent) => void; // Optional
 maxRetries?: number; // HTTP retry attempts (default: 3)
 requestTimeout?: number; // Request timeout (default: 30000ms)
 maxConcurrency?: number; // Parallel fetches (default: 5)
}
```

For complete API documentation, see the
[main README](../../README.md#api-reference).
