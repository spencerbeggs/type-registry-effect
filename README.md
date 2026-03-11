# type-registry-effect

Effect-based type definition registry for TypeScript with version-aware caching, fault tolerance, and observability.

Built with [Effect](https://effect.website) for robust error handling, composable async operations, and production-ready fault tolerance.

## Features

- ✅ Version-aware caching of type definitions
- ✅ Disk-based storage by package and version
- ✅ Generates VFS for Twoslash integration
- ✅ HTTP retry with exponential backoff
- ✅ Event-based observability with structured events
- ✅ Graceful error handling and partial success
- ✅ Framework-agnostic (works with any TypeScript tool)

## Installation

```bash
npm install effect-type-registry
```

## Quick Start

```typescript
import { TypeRegistry } from "type-registry-effect"

// Create registry instance
const registry = TypeRegistry.create({
 cacheDir: "~/.cache/my-docs",
 ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
})

// Fetch and cache a package
await registry.fetchAndCache({
 name: "@effect/cli",
 version: "0.73.0",
})

// Get VFS for Twoslash
const vfs = await registry.getVFS([
 { name: "@effect/cli", version: "0.73.0" },
 { name: "zod", version: "4.0.0" },
])
```

## Basic Usage

### Check if Package is Cached

```typescript
const isCached = await registry.hasCached({
 name: "@effect/cli",
 version: "0.73.0",
})
```

### Ensure Package is Cached

Auto-fetch if not present:

```typescript
await registry.ensureCached({
 name: "zod",
 version: "4.0.0",
})
```

### Clear Package Cache

```typescript
await registry.clearCache({ name: "@effect/cli", version: "0.73.0" })
```

## Cache Structure

The cache follows the
[XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/):

- Uses `$XDG_CACHE_HOME/effect-type-registry` if `XDG_CACHE_HOME` is set
- Falls back to `~/.cache/effect-type-registry` otherwise
- Can be overridden via the `cacheDir` option

```text
~/.cache/effect-type-registry/
├── @effect/
│   └── cli@0.73.0/
│       ├── .metadata.json
│       ├── package.json
│       └── dist/
│           └── dts/
│               ├── index.d.ts
│               └── ...
└── zod@4.0.0/
    ├── .metadata.json
    ├── package.json
    └── lib/
        └── ...
```

## Configuration Options

```typescript
interface TypeRegistryOptions {
 cacheDir?: string // Cache location (default: XDG compliant)
 ttl?: number // Cache TTL in ms (default: 7 days)
 cdnProvider?: "unpkg" | "jsdelivr" // CDN provider
 npmRegistry?: string // Custom npm registry
 onLogEvent?: (event: LogEvent) => void // Event handler
 maxRetries?: number // HTTP retries (default: 3)
 requestTimeout?: number // Timeout in ms (default: 30000)
 maxConcurrency?: number // Parallel fetches (default: 5)
}
```

## Documentation

Comprehensive guides and references:

- **[Getting Started Guide](./docs/guides/getting-started.md)** - Detailed
  setup and usage
- **[Caching Guide](./docs/guides/caching.md)** - Cache management and
  optimization
- **[Observability Guide](./docs/guides/observability.md)** - Event system
  and logging
- **[Advanced Usage Guide](./docs/guides/advanced-usage.md)** - Direct
  service usage and Effect-TS patterns
- **[Troubleshooting Guide](./docs/guides/troubleshooting.md)** - Common
  issues and solutions
- **[Architecture Overview](./docs/architecture/overview.md)** - Internal
  design and components

## API Reference

### TypeRegistry

Main API for managing type definitions:

- **`create(options)`** - Create registry instance
- **`fetchAndCache(pkg)`** - Fetch and cache package types
- **`ensureCached(pkg)`** - Ensure package is cached (auto-fetch if needed)
- **`hasCached(pkg)`** - Check if package is cached
- **`getPackageVFS(pkg, options)`** - Get VFS for single package
- **`getVFS(packages, options)`** - Get combined VFS for multiple packages
- **`resolveImport(pkg, specifier)`** - Resolve import to file path
- **`getTypeEntries(pkg)`** - Get all type entry points
- **`clearCache(pkg)`** - Remove package from cache

See [Advanced Usage Guide](./docs/guides/advanced-usage.md) for direct
service access (PackageFetcher, TypeResolver) and XDG utilities.

## License

[MIT](LICENSE)
