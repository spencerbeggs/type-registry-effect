# Architecture Overview

This document provides a high-level overview of the effect-type-registry
architecture, explaining how components work together to fetch, cache,
and serve TypeScript type definitions.

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Components](#core-components)
3. [Data Flow](#data-flow)
4. [Design Decisions](#design-decisions)
5. [Related Documentation](#related-documentation)

## System Overview

effect-type-registry is built around three main components that work
together to provide fast, reliable access to TypeScript type
definitions from npm packages:

```text
┌─────────────────┐
│  TypeRegistry   │ ← Main API (Promise-based)
└────────┬────────┘
         │
    ┌────┴─────────────────────────┐
    │                              │
┌───▼────────────┐    ┌───────────▼──────┐
│ CacheService   │    │ PackageFetcher   │
│ (Disk Storage) │    │ (HTTP Client)    │
└───┬────────────┘    └───────────┬──────┘
    │                             │
    │         ┌───────────────────┘
    │         │
┌───▼─────────▼────┐
│  TypeResolver    │
│ (Import Logic)   │
└──────────────────┘
```

### Key Capabilities

- **Version-Aware Caching** - Packages are cached by name and version
  with configurable TTL
- **Automatic Fetching** - Missing packages are fetched automatically
  from jsDelivr CDN
- **Complex Module Resolution** - Handles exports maps, typesVersions,
  and legacy resolution
- **VFS Generation** - Creates virtual file systems for TypeScript
  language services
- **Fault Tolerance** - HTTP retries, timeouts, and graceful error
  handling
- **Event-Based Observability** - Structured events for monitoring and
  debugging

## Core Components

### 1. TypeRegistry

The main API for managing type definitions. It provides a Promise-based
interface that wraps the underlying Effect services.

**Responsibilities:**

- Coordinate fetching and caching operations
- Provide simple Promise API (no Effect-TS knowledge required)
- Emit structured events for observability
- Manage service lifecycle

**Key Methods:**

```typescript
// Fetch and cache a package
await registry.fetchAndCache({ name: 'zod', version: '3.22.4' });

// Get VFS for multiple packages (auto-fetches if needed)
const vfs = await registry.getVFS([
 { name: 'zod', version: '3.22.4' },
 { name: '@effect/cli', version: '0.73.0' },
]);

// Resolve import specifier
const resolved = await registry.resolveImport(
 { name: 'zod', version: '3.22.4' },
 './types'
);
```

**Why TypeRegistry?**

This component provides a simple, Promise-based API so consumers don't
need to understand Effect-TS. Internally, it uses Effect for robust
error handling and composability, but this complexity is hidden from
users.

### 2. CacheService

Manages disk-based caching of type definitions using the XDG Base
Directory specification.

**Responsibilities:**

- Store and retrieve cached packages
- Manage cache metadata (version, timestamp, TTL)
- Generate VFS with proper `node_modules/` paths
- Handle file I/O operations

**Cache Structure:**

```text
~/.cache/effect-type-registry/  (or $XDG_CACHE_HOME)
├── @effect/
│   └── cli@0.73.0/
│       ├── .metadata.json    # Cache metadata (timestamp, TTL)
│       ├── package.json       # Package manifest
│       └── dist/
│           └── dts/
│               ├── index.d.ts
│               └── Command.d.ts
└── zod@3.22.4/
    ├── .metadata.json
    ├── package.json
    └── lib/
        └── index.d.ts
```

**Why Disk Caching?**

Type definitions can be large (megabytes), and fetching them repeatedly
is slow. Disk caching with TTL ensures fast access for repeated
operations while allowing updates when packages change.

### 3. PackageFetcher

Fetches package metadata and files from the jsDelivr CDN.

**Responsibilities:**

- Resolve version references (latest, tags, semver ranges)
- Download package.json for metadata
- Fetch all type definition files (.d.ts, .d.mts, .d.cts)
- Handle HTTP errors with retry and timeout

**jsDelivr API Endpoints:**

```text
# Get package versions
https://data.jsdelivr.com/v1/package/npm/{name}

# Download files
https://cdn.jsdelivr.com/npm/{name}@{version}/{file}
```

**Why jsDelivr?**

jsDelivr provides a free, reliable CDN for npm packages with excellent
global performance. It supports version resolution and file tree
traversal, making it ideal for fetching type definitions.

### 4. TypeResolver

Resolves import specifiers to file paths using package.json metadata.

**Responsibilities:**

- Resolve package.json `exports` field (including conditional exports)
- Resolve package.json `typesVersions` field
- Handle wildcard pattern matching
- Map JavaScript files to TypeScript definitions (.js → .d.ts)
- Find main entry points (types, typings, exports, main)

**Resolution Strategies (in order):**

1. **Exports field** - Modern package.json exports with conditions
2. **TypesVersions** - TypeScript version-specific type mappings
3. **Types/Typings field** - Legacy type definition location
4. **Conventional paths** - index.d.ts, index.ts, etc.

**Why Complex Resolution?**

Modern npm packages use sophisticated module resolution with conditional
exports, TypeScript version mappings, and various file extensions.
Supporting all these patterns ensures compatibility with the entire npm
ecosystem.

## Data Flow

### Fetching a Package

```text
1. User calls registry.fetchAndCache({ name: 'zod', version: '3.22.4' })
   │
   ├─→ 2. Check cache with CacheService.exists()
   │    │
   │    ├─→ If cached and fresh: Done ✓
   │    │
   │    └─→ If missing or stale: Continue to fetch
   │
   ├─→ 3. Fetch package.json from jsDelivr via PackageFetcher
   │    │
   │    └─→ Resolve version if needed (latest, tags, ranges)
   │
   ├─→ 4. Download all type definition files
   │    │
   │    └─→ Retry on failure (exponential backoff)
   │
   ├─→ 5. Write to cache via CacheService
   │    │
   │    └─→ Store package.json, .d.ts files, metadata
   │
   └─→ 6. Emit package.loaded event
        │
        └─→ Consumer receives event via onLogEvent callback
```

### Generating a VFS

```text
1. User calls registry.getVFS([{ name: 'zod', version: '3.22.4' }])
   │
   ├─→ 2. For each package:
   │    │
   │    ├─→ Call ensureCached() (auto-fetch if missing)
   │    │
   │    └─→ Call CacheService.getVFS()
   │
   ├─→ 3. Merge all package VFS into one
   │    │
   │    └─→ Keys: node_modules/{name}/{file}
   │
   └─→ 4. Return combined VFS
        │
        └─→ Consumer uses with TypeScript language service
```

## Design Decisions

### Why Effect-TS?

Effect-TS provides:

- **Composable error handling** - Type-safe error channels
- **Retry and timeout primitives** - Built-in fault tolerance
- **Service dependencies** - Dependency injection without manual wiring
- **Testing** - Easy to mock services for unit tests

While Effect adds complexity, it enables robust error handling and
fault tolerance that would be difficult to implement manually.

### Why XDG Base Directory?

Following the XDG Base Directory specification ensures the cache is
stored in a standard location that respects user preferences and
doesn't clutter the home directory.

Users can override the cache directory via:

- `$XDG_CACHE_HOME` environment variable
- `cacheDir` option in TypeRegistry.create()

### Why Event-Based Observability?

Instead of logging directly from services, TypeRegistry emits
structured events that consumers can handle however they need. This
provides:

- **Zero dependencies** - No Effect-TS logging required
- **Flexible formatting** - JSON, pretty-print, metrics, etc.
- **Clean separation** - Business logic stays logging-free
- **Type safety** - Events validated with Effect Schema

See the [Observability guide](../guides/observability.md) for details.

### Why Graceful Degradation?

When fetching multiple packages, if one package fails, the others
should still succeed. This "partial success" pattern ensures tools
remain functional even when some dependencies are unavailable.

For example, if fetching types for 10 packages and 1 fails, the VFS
will include the 9 successful packages and the tool can continue
working.

## Related Documentation

**Internal Design Docs:**

- [Observability](../../.claude/design/effect-type-registry/observability.md) -
  Event-based observability architecture

**User Guides:**

- [Caching Guide](../guides/caching.md) - Cache configuration and
  optimization
- [Observability Guide](../guides/observability.md) - Using the event
  system

**Package Documentation:**

- [README](../../README.md) - Package overview and API reference
- [CLAUDE.md](../../CLAUDE.md) - Development guide
