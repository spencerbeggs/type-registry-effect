# Architecture Overview

This document explains the service and layer architecture of type-registry-effect, how platform abstraction works, and how the TypeScript type system enforces correct dependency provision.

## Table of Contents

1. [Service and Layer Architecture](#service-and-layer-architecture)
2. [The Three Services](#the-three-services)
3. [Layer Composition](#layer-composition)
4. [Platform Abstraction](#platform-abstraction)
5. [Type-Level Dependency Enforcement](#type-level-dependency-enforcement)
6. [Data Flow](#data-flow)

## Service and Layer Architecture

type-registry-effect is built on Effect's service pattern. Instead of a class with methods, the library exposes:

- **Services** -- interfaces defined with `Context.GenericTag` and interface/const declaration merging that describe what operations are available
- **Layers** -- implementations of those services that can be swapped at composition time
- **Programs** -- functions in the `TypeRegistry` namespace that use services from the Effect context

```text
Programs (TypeRegistry namespace)
  |
  | yield* CacheService / PackageFetcher / TypeResolver
  v
Services (Context.Tag interfaces)
  |
  | provided by
  v
Layers (Live implementations)
  |
  | require
  v
Platform abstractions (FileSystem, HttpClient)
  |
  | provided by
  v
Platform packages (@effect/platform-node, @effect/platform-bun, etc.)
```

## The Three Services

### CacheService

Manages disk-based storage of type definitions.

**Tag:** `"type-registry-effect/CacheService"`

**Interface methods:**

- `exists(pkg)` -- Check if a package is cached
- `read(pkg, filePath)` -- Read a cached file
- `write(pkg, filePath, content)` -- Write a file to cache
- `listFiles(pkg)` -- List all cached files for a package
- `readMetadata(pkg)` -- Read cache metadata; returns `Option<CacheMetadata>` (`None` when absent or expired)
- `writeMetadata(pkg, metadata)` -- Write cache metadata to the SQLite store
- `getVFS(pkg)` -- Generate a VFS map from cached files
- `remove(pkg)` -- Delete a cached package (files + metadata)
- `prune` -- Evict all expired packages; returns a `CachePruneResult` (`{ count, removed }`)

**Live implementation:** `CacheServiceLive` requires `FileSystem` and `Path` from `@effect/platform` plus xdg-effect's `SqliteCache` (metadata store) and `AppDirs` (cache-directory resolution). The cache root resolves to `$XDG_CACHE_HOME/type-registry-effect` (or `~/.type-registry-effect` when `XDG_CACHE_HOME` is unset). See the [Caching guide](../guides/caching.md) for the on-disk layout.

### PackageFetcher

Downloads type definitions and metadata from the jsDelivr CDN.

**Tag:** `"type-registry-effect/PackageFetcher"`

**Interface methods:**

- `getVersions(name)` -- Get all versions and tags for a package
- `resolveVersion(name, ref)` -- Resolve a version reference to a specific version
- `getFileTree(pkg)` -- Get the flat file tree from jsDelivr
- `downloadFile(pkg, path)` -- Download a single file
- `getPackageJson(pkg)` -- Download and validate package.json
- `getTypeFiles(pkg)` -- Download all `.d.ts`, `.d.mts`, `.d.cts` files

**Live implementation:** `PackageFetcherLive` requires `HttpClient.HttpClient` from `@effect/platform`. It uses exponential backoff retry (3 attempts) and a 30-second timeout.

### TypeResolver

Resolves import specifiers to file paths using package.json metadata. This is pure logic with no I/O.

**Tag:** `"type-registry-effect/TypeResolver"`

**Interface methods:**

- `resolveImport(specifier, packageJson, pkg)` -- Resolve an import specifier to a file path
- `resolveMainEntry(packageJson, pkg)` -- Find the main type entry point
- `resolveTypeEntries(packageJson, pkg)` -- Find all type entry points
- `findTypeDefinition(jsFilePath, packageJson, pkg)` -- Map a `.js` file to its `.d.ts` counterpart

**Live implementation:** `TypeResolverLive` is a `Layer.succeed` -- it has no dependencies at all. Resolution strategies are applied in order:

1. package.json `exports` field (including conditional exports and wildcards)
2. package.json `typesVersions` field
3. package.json `types` or `typings` field
4. Conventional paths (`index.d.ts`, `index.d.mts`, etc.)

## Layer Composition

### TypeRegistryLive

The main composition layer merges all three service layers:

```typescript
const TypeRegistryLive: Layer<
  CacheService | PackageFetcher | TypeResolver,  // provides
  never,                                          // no construction errors
  FileSystem.FileSystem | HttpClient.HttpClient   // requires
> = Layer.mergeAll(CacheServiceLive, PackageFetcherLive, TypeResolverLive);
```

This layer provides all three services but still requires platform-specific `FileSystem` and `HttpClient` implementations. You must supply those yourself or use `NodeLayer`.

### NodeLayer

The Node.js convenience layer composes `TypeRegistryLive` with platform implementations:

```typescript
const NodeLayer = TypeRegistryLive.pipe(
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodeHttpClient.layerUndici),
);
```

`NodeLayer` is a fully closed layer -- it requires nothing from the context and provides all three services. This is what the Promise convenience API uses internally.

### Layer Dependency Diagram

```text
NodeLayer
  |
  +-- TypeRegistryLive
  |     |
  |     +-- CacheServiceLive -----> requires FileSystem.FileSystem
  |     +-- PackageFetcherLive ---> requires HttpClient.HttpClient
  |     +-- TypeResolverLive -----> requires nothing (pure logic)
  |
  +-- NodeFileSystem.layer -------> provides FileSystem.FileSystem
  +-- NodeHttpClient.layerUndici -> provides HttpClient.HttpClient
```

## Platform Abstraction

The library never imports `node:fs` or `node:http` directly in its service implementations (except for `CacheServiceLive` which uses `node:path` for path manipulation). Instead, it depends on `@effect/platform` abstractions:

- `FileSystem.FileSystem` -- Abstraction over file I/O (read, write, mkdir, stat, remove)
- `HttpClient.HttpClient` -- Abstraction over HTTP requests (get, post, etc.)

This means the library's core logic could work on any platform that provides these abstractions -- Node.js, Bun, Deno, or even a browser with appropriate implementations. In practice, `@effect/platform-node` is the only platform package currently available, but the architecture does not prevent others.

The `/node` entry point is the only file that imports from `@effect/platform-node` directly. If you use the main entry point (`type-registry-effect`), your code stays platform-agnostic.

## Type-Level Dependency Enforcement

Effect's type system ensures you cannot run a program without providing all required services. This happens at compile time, not runtime.

### How It Works

Every `TypeRegistry` function declares what services it needs in the `R` (requirements) position of `Effect<A, E, R>`:

```typescript
// hasCached needs CacheService
hasCached(pkg: PackageSpec): Effect<boolean, CacheError, CacheService>

// fetchAndCache needs CacheService AND PackageFetcher
fetchAndCache(pkg: PackageSpec): Effect<void, NetworkError | ParseError | CacheError, CacheService | PackageFetcher>

// resolveImport needs CacheService AND TypeResolver
resolveImport(pkg: PackageSpec, specifier: string): Effect<ResolvedModule, CacheError | ParseError | ResolutionError, CacheService | TypeResolver>
```

If you try to run a program without providing the required services, TypeScript produces a compile error:

```typescript
// This will NOT compile:
// Effect.runPromise(TypeRegistry.hasCached(pkg))
// Error: Type 'CacheService' is not assignable to type 'never'

// This WILL compile:
Effect.runPromise(Effect.provide(TypeRegistry.hasCached(pkg), NodeLayer))
```

### Why This Matters

Traditional dependency injection frameworks catch missing dependencies at runtime -- your tests pass but production crashes. With Effect's approach, the compiler prevents you from forgetting a dependency entirely. If it compiles, all services are provided.

This is especially valuable for this library because the platform layer requirements (`FileSystem`, `HttpClient`) are easy to forget. The type system makes the requirement explicit and impossible to miss.

## Data Flow

### Fetching and Caching a Package

```text
1. TypeRegistry.fetchAndCache(pkg)
   |
2. PackageFetcher.getPackageJson(pkg)
   |   HTTP GET https://cdn.jsdelivr.net/npm/{name}@{version}/package.json
   |   Validated with PackageJson Schema
   |
3. PackageFetcher.getTypeFiles(pkg)
   |   HTTP GET https://data.jsdelivr.com/v1/package/npm/{name}@{version}/flat
   |   Filter for .d.ts / .d.mts / .d.cts files
   |   Download each file from CDN
   |
4. CacheService.write(pkg, "package.json", content)
   CacheService.write(pkg, "lib/index.d.ts", content)
   ...
   |
5. CacheService.writeMetadata(pkg, { cachedAt, version, ttl })
```

### Building a VFS for Multiple Packages

```text
1. TypeRegistry.getVFS([pkg1, pkg2, pkg3])
   |
2. Effect.forEach with concurrency: 5
   |   For each package:
   |     a. CacheService.exists(pkg) -- check cache
   |     b. If missing: fetchAndCache(pkg) -- fetch from CDN
   |     c. CacheService.getVFS(pkg) -- read all files into Map
   |
3. Merge all per-package VFS maps into one combined VFS
   |   Keys: "node_modules/{name}/{file}"
   |   Values: file contents as strings
   |
4. Graceful degradation:
   |   If some packages fail, continue with successful ones
   |   Only fail if ALL packages fail
   |
5. Return combined VFS: Map<string, string>
```

## Related Documentation

- [Getting Started](../guides/getting-started.md) -- Installation and usage patterns
- [Advanced Usage](../guides/advanced-usage.md) -- Custom layers, error handling, testing
- [Caching Guide](../guides/caching.md) -- Cache configuration and management
