---
status: current
module: type-registry-effect
category: architecture
created: 2026-03-12
updated: 2026-06-19
last-synced: 2026-06-19
completeness: 90
related:
  - ./observability.md
  - ./cache-optimization.md
dependencies: []
---

# Architecture: Effect-First Type Registry

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Implementation Status](#implementation-status)
5. [Data Layer](#data-layer)
6. [Error Layer](#error-layer)
7. [Service Layer](#service-layer)
8. [Layer Composition](#layer-composition)
9. [Platform Support](#platform-support)
10. [Public API](#public-api)
11. [Testing Strategy](#testing-strategy)
12. [Future Work](#future-work)
13. [Related Documentation](#related-documentation)

---

## Overview

This document describes `type-registry-effect`, an Effect-first library for
composing virtual TypeScript environments with automatic package fetching,
disk caching, and version-aware type resolution. It is designed for use with
Twoslash-based documentation tooling and TypeScript language service consumers.

The library exposes composable `Effect<A, E, R>` programs as its primary API,
with a Promise-based convenience API for non-Effect consumers. Platform
dependencies (`FileSystem`, `HttpClient`) are resolved within layer
implementations, keeping service interfaces platform-agnostic.

### Design Principles

1. **Effect programs as values** -- expose composable `Effect<A, E, R>`
   programs, not Promise-returning methods
2. **Platform-agnostic service interfaces** -- business logic has zero platform
   dependencies; Node/browser support via swappable layers
3. **Typed errors** -- `Data.TaggedError` for every failure mode, enabling
   `catchTag`-based recovery
4. **Schema-validated data** -- runtime validation at system boundaries
   (CDN responses, cache reads) via Effect Schema
5. **Composable services** -- `Context.GenericTag` with interface/const
   declaration merging for dependency injection (avoids DTS `_base` issues
   that occur with the `Context.Tag` class pattern)
6. **Interface/const declaration merging** -- each service uses a single name
   (`CacheService`, `PackageFetcher`, `TypeResolver`) for both the TypeScript
   interface and the `Context.GenericTag` constant, eliminating the need for
   separate `*Shape` interfaces
7. **`*Base` exports for DTS bundling** -- error and data class base values
   are exported for api-extractor compatibility

Exception: `TypeRegistryObserver` (the opt-in event service, see
`src/services/TypeRegistryObserver.ts`) uses the `Context.Tag` **class**
pattern with a separate `TypeRegistryObserverShape` interface, not the
`GenericTag` merge. This is safe here because the observer is consumed via
`Effect.serviceOption` (it never appears in a public effect signature whose
DTS would surface the `_base`), and the class form gives the tag a clean
public surface. The three core services keep the `GenericTag` pattern.

### Key Dependencies

- **effect** -- core Effect runtime, Context, Layer, Schema, Data
- **@effect/platform** -- `FileSystem`, `HttpClient`, `Path` abstractions
- **@effect/platform-node** -- Node.js implementations of platform services
- **@typescript/vfs** -- virtual TypeScript environments
- **xdg-effect** -- `AppDirs` (XDG path resolution) and `SqliteCache` (SQLite
  metadata store)
- **@effect/sql-sqlite-node** -- SQLite driver backing `SqliteCache`
- **semver-effect** -- declared as a runtime dependency but not yet used in
  source (version resolution)

---

## Current State

The library has been refactored from a class-based wrapper around Effect
programs into a first-class Effect library. The previous `TypeRegistry` class
that wrapped every Effect program in `async` methods calling
`Effect.runPromise` has been replaced with a namespace module exposing
composable Effect programs.

### What Has Been Completed

- Data layer: `Data.TaggedClass` types in `src/schemas/` (`PackageSpec`,
  `ResolvedModule`); `Schema.Struct` with manual interface for `CacheMetadata`
- Error layer: `Data.TaggedError` types with `*Base` exports in `src/errors/`
- Service interfaces using `Context.GenericTag` with interface/const
  declaration merging (NOT `Context.Tag` class pattern, NOT `*Shape` naming),
  with the documented `TypeRegistryObserver` exception
- Layer implementations: `CacheServiceLive`, `PackageFetcherLive`,
  `TypeResolverLive`
- Composed `TypeRegistryLive` layer
- `TypeRegistry` namespace module with composable Effect programs
- Node.js platform layer (`type-registry-effect/node`) with `NodeLayer`
  (fully closed) and Promise-returning wrappers
- `VirtualPackage` utility class for transient VFS generation
- Typed event channel (`TypeRegistryObserver` / `RegistryEvent`) -- opt-in,
  zero-cost by default; the library is silent by default. See
  `observability.md`.
- SQLite-backed cache metadata via xdg-effect `SqliteCache`, with native
  TTL/expiry and a `prune` operation. See `cache-optimization.md`.
- Effect Metrics module (`src/metrics.ts`) with counters and timer
  histograms actively tracked in TypeRegistry programs
- Comprehensive test suite (unit, integration, schema, layer, events,
  and metrics tests)

### What Is Not Yet Implemented

- `TypeScriptEnv` service (planned for Phase 4)
- Browser platform support (planned for Phase 5)
- `semver-effect` integration in version resolution (dependency declared but
  not yet used in source)

The legacy `Effect.log` + `LogEventSchema` annotation system has been
removed as the diagnostics surface; `LogEventSchema` / `LogEvent` remain
exported but `@deprecated` (removal deferred to a future major).

---

## Rationale

### Why Effect-First?

The library uses Effect internally for every operation. By exposing Effect
programs directly, consumers can:

- Compose registry operations into larger Effect pipelines
- Provide custom service implementations (mock fetchers, alternative caches)
- Control execution timing, cancellation, and concurrency
- Access structured error information via `catchTag`

### Why Platform-Agnostic Service Interfaces?

The core operations -- fetching type definitions from jsDelivr, resolving
imports from package.json, building VFS maps -- are pure data transformations.
Only caching (filesystem vs IndexedDB) and TypeScript environment creation
are platform-specific.

Service interfaces contain no `HttpClient` or `FileSystem` in their method
signatures. Platform dependencies are resolved within layer implementations
via `Effect.gen`, keeping the interface contracts clean.

---

## Implementation Status

### Phase 1: Data & Errors -- COMPLETE

- `src/schemas/PackageSpec.ts` -- `Data.TaggedClass` with structural equality
- `src/schemas/CacheMetadata.ts` -- `Schema.Struct` with manually defined
  `interface CacheMetadata` (NOT `Schema.Class`, to avoid DTS bundling issues)
- `src/schemas/PackageJson.ts` -- `Schema.Struct` for validated CDN parsing
- `src/schemas/FileTree.ts` -- `Schema.Struct` for jsDelivr file tree response
- `src/schemas/ResolvedModule.ts` -- `Data.TaggedClass` for resolution results
- `src/errors/*.ts` -- `Data.TaggedError` types with `*Base` exports

### Phase 2: Service Refactoring -- COMPLETE

- Services use `Context.GenericTag` with interface/const declaration merging
  (e.g. `interface CacheService { ... }` + `const CacheService = Context.GenericTag<CacheService>(...)`)
  -- NOT the `Context.Tag` class pattern, to eliminate `_base` forgotten
  exports in DTS bundling
- `PackageFetcherLive` and `TypeResolverLive` are proper `Layer` values
- Schema validation applied to CDN response parsing
- `FileSystem` and `HttpClient` resolved within layers, not in interfaces

### Phase 3: Remove TypeRegistry Class -- COMPLETE

- `src/TypeRegistry.ts` is a namespace module with composable Effect programs
- `src/layers/TypeRegistryLive.ts` composes all three service layers
- `src/platforms/node.ts` provides `NodeLayer` + Promise convenience API
- Old `TypeRegistry` class removed
- Layer-based testing in place

### Phase 4: TypeScriptEnv Service -- PLANNED

Not yet implemented. Currently, TypeScript environment creation is handled
directly in `src/platforms/node.ts` via the `createTypeScriptCache` function,
which uses `@typescript/vfs` APIs (`createFSBackedSystem`,
`createDefaultMapFromNodeModules`, `createVirtualTypeScriptEnvironment`)
inline rather than through a service abstraction.

Planned work:

1. Create `TypeScriptEnv` service interface
2. Implement `NodeTypeScriptEnvLive`
3. Update `createTypeScriptCache` to use the service
4. Add `TypeScriptEnv` to `TypeRegistryLive` composed layer

### Phase 5: Browser Support -- PLANNED

Not yet implemented. Requires Phase 4 completion first.

Planned work:

1. Implement `BrowserCacheServiceLive` (IndexedDB)
2. Implement `BrowserTypeScriptEnvLive` (CDN lib files + `createSystem`)
3. Create `src/platforms/browser.ts` with `BrowserLayer` + Promise API
4. Add browser-specific tests
5. Configure package.json conditional exports

---

## Data Layer

### PackageSpec

Immutable domain type with structural equality. Used throughout the library
to identify a package at a specific version.

```typescript
// src/schemas/PackageSpec.ts
import { Data } from "effect";

/** @internal */
export const PackageSpecBase = Data.TaggedClass("PackageSpec");

export class PackageSpec extends PackageSpecBase<{
  readonly name: string;
  readonly version: string;
  readonly registry?: string;
}> {
  toString(): string {
    return `${this.name}@${this.version}`;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}
```

### CacheMetadata

`Schema.Struct` with a manually defined `interface` for serialization to/from
cache storage. Uses interface/const declaration merging (same pattern as
services) rather than `Schema.Class` to avoid DTS bundling issues.

```typescript
// src/schemas/CacheMetadata.ts
import { Schema } from "effect";

export interface CacheMetadata {
  readonly version: string;
  readonly cachedAt: number;
  readonly ttl?: number | undefined;
}

export const CacheMetadata: Schema.Schema<CacheMetadata> = Schema.Struct({
  version: Schema.String,
  cachedAt: Schema.Number,
  ttl: Schema.optional(Schema.Number),
});
```

### PackageJson

Schema.Struct for validated parsing of CDN responses. Includes
`devDependencies` in addition to the standard fields.

```typescript
// src/schemas/PackageJson.ts
import { Schema } from "effect";

export const PackageJson = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  types: Schema.optional(Schema.String),
  typings: Schema.optional(Schema.String),
  main: Schema.optional(Schema.String),
  module: Schema.optional(Schema.String),
  exports: Schema.optional(
    Schema.Union(
      Schema.String,
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    )
  ),
  typesVersions: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Record({
        key: Schema.String,
        value: Schema.Array(Schema.String),
      }),
    })
  ),
  dependencies: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String })
  ),
  peerDependencies: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String })
  ),
  devDependencies: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String })
  ),
});

export type PackageJson = Schema.Schema.Type<typeof PackageJson>;
```

### FileTree (CDN Response)

```typescript
// src/schemas/FileTree.ts
import { Schema } from "effect";

export const FileTreeEntry = Schema.Struct({
  name: Schema.String,
  hash: Schema.String,
  time: Schema.String,
  size: Schema.Number,
});

export type FileTreeEntry = Schema.Schema.Type<typeof FileTreeEntry>;

export const FileTreeResponse = Schema.Struct({
  default: Schema.String,
  files: Schema.Array(FileTreeEntry),
});

export type FileTreeResponse = Schema.Schema.Type<typeof FileTreeResponse>;
```

### ResolvedModule

```typescript
// src/schemas/ResolvedModule.ts
import { Data } from "effect";
import type { PackageSpec } from "./PackageSpec.js";

/** @internal */
export const ResolvedModuleBase = Data.TaggedClass("ResolvedModule");

export class ResolvedModule extends ResolvedModuleBase<{
  readonly filePath: string;
  readonly isTypeDefinition: boolean;
  readonly package: PackageSpec;
}> {}
```

---

## Error Layer

Every failure mode gets a `Data.TaggedError` with contextual fields.
Consumers use `catchTag` / `catchTags` for precise recovery. Each error
exports a `*Base` value for DTS bundling compatibility with api-extractor.

```typescript
// src/errors/CacheError.ts
import { Data } from "effect";

/** @internal */
export const CacheErrorBase = Data.TaggedError("CacheError");

export class CacheError extends CacheErrorBase<{
  readonly operation: "read" | "write" | "delete" | "list";
  readonly path: string;
  readonly message: string;
}> {}
```

```typescript
// src/errors/NetworkError.ts
/** @internal */
export const NetworkErrorBase = Data.TaggedError("NetworkError");

export class NetworkError extends NetworkErrorBase<{
  readonly url: string;
  readonly status?: number;
  readonly message: string;
}> {}
```

```typescript
// src/errors/PackageNotFoundError.ts
/** @internal */
export const PackageNotFoundErrorBase = Data.TaggedError("PackageNotFoundError");

export class PackageNotFoundError extends PackageNotFoundErrorBase<{
  readonly name: string;
  readonly version: string;
  readonly message: string;
}> {}
```

```typescript
// src/errors/ParseError.ts
/** @internal */
export const ParseErrorBase = Data.TaggedError("ParseError");

export class ParseError extends ParseErrorBase<{
  readonly source: string;
  readonly message: string;
}> {}
```

```typescript
// src/errors/ResolutionError.ts
/** @internal */
export const ResolutionErrorBase = Data.TaggedError("ResolutionError");

export class ResolutionError extends ResolutionErrorBase<{
  readonly package: string;
  readonly specifier: string;
  readonly message: string;
}> {}
```

```typescript
// src/errors/TimeoutError.ts
/** @internal */
export const TimeoutErrorBase = Data.TaggedError("TimeoutError");

export class TimeoutError extends TimeoutErrorBase<{
  readonly operation: string;
  readonly duration: number;
  readonly message: string;
}> {}
```

### Error Union Type

The `src/errors/` barrel was removed; the union is now defined in
`src/index.ts`:

```typescript
// src/index.ts
export type TypeRegistryError =
  | CacheError
  | NetworkError
  | PackageNotFoundError
  | ParseError
  | ResolutionError
  | TimeoutError;
```

### Consumer Usage

```typescript
import { Effect } from "effect";
import * as TypeRegistry from "type-registry-effect";

TypeRegistry.TypeRegistry.fetchAndCache(pkg).pipe(
  Effect.catchTags({
    NetworkError: (e) => Effect.log(`Network failed: ${e.url} (${e.status})`),
    CacheError: (e) => Effect.log(`Cache ${e.operation} failed: ${e.path}`),
    PackageNotFoundError: (e) =>
      Effect.log(`${e.name}@${e.version} not found`),
  })
);
```

---

## Service Layer

Services use `Context.GenericTag` with **interface/const declaration merging**.
Each service file defines an `interface` with the service methods and a `const`
of the same name created via `Context.GenericTag<Interface>(identifier)`. This
pattern was chosen over the `Context.Tag` class pattern to eliminate `_base`
forgotten exports in DTS bundling. There are no separate `*Shape` interfaces
for the three core services (the opt-in `TypeRegistryObserver` is a
deliberate exception -- see below).

Method signatures return `Effect<A, E>` with typed errors -- no `HttpClient` or
`FileSystem` in method signatures since those are resolved within layers.

### CacheService

See `src/services/CacheService.ts` for the full interface. The load-bearing
points (some are breaking changes from the pre-SQLite cache):

- `readMetadata` returns `Effect<Option<CacheMetadata>, CacheError>` --
  `None` when the entry is absent or its TTL has expired (expiry evicts on
  read). This is the signal `getPackageVFS` uses to distinguish a hit from a
  stale entry.
- `prune: Effect<CachePruneResult, CacheError>` -- evicts every expired
  metadata entry and deletes its on-disk directory. `CachePruneResult` is
  `{ count, removed: ReadonlyArray<{ name, version }> }`.
- `remove` deletes both the on-disk files and the metadata entry.

The remaining methods (`exists`, `read`, `write`, `listFiles`,
`writeMetadata`, `getVFS`) are unchanged in shape. See
`cache-optimization.md` for the storage design behind these signatures.

### PackageFetcher

```typescript
// src/services/PackageFetcher.ts
export interface PackageMetadata {
  readonly versions: string[];
  readonly tags: Record<string, string>;
}

export interface PackageFetcher {
  readonly getVersions: (
    name: string,
  ) => Effect.Effect<PackageMetadata, NetworkError | ParseError>;
  readonly resolveVersion: (
    name: string,
    ref: string,
  ) => Effect.Effect<string, NetworkError | PackageNotFoundError>;
  readonly getFileTree: (
    pkg: PackageSpec,
  ) => Effect.Effect<FileTreeResponse, NetworkError | ParseError>;
  readonly downloadFile: (
    pkg: PackageSpec,
    path: string,
  ) => Effect.Effect<string, NetworkError>;
  readonly getPackageJson: (
    pkg: PackageSpec,
  ) => Effect.Effect<PackageJson, NetworkError | ParseError>;
  readonly getTypeFiles: (
    pkg: PackageSpec,
  ) => Effect.Effect<Map<string, string>, NetworkError | ParseError>;
}

export const PackageFetcher = Context.GenericTag<PackageFetcher>(
  "type-registry-effect/PackageFetcher"
);
```

The `PackageFetcher` module also exports constants (`JSDELIVR_DATA_API`,
`JSDELIVR_CDN`, `TYPE_FILE_PATTERN`), the `NODE_BUILTINS` set, and a
`normalizeModuleName` helper function used by the layer implementation.

### TypeResolver

```typescript
// src/services/TypeResolver.ts
export interface TypeResolver {
  readonly resolveImport: (
    specifier: string,
    packageJson: PackageJson,
    pkg: PackageSpec,
  ) => Effect.Effect<ResolvedModule, ResolutionError>;

  readonly resolveMainEntry: (
    packageJson: PackageJson,
    pkg: PackageSpec,
  ) => Effect.Effect<ResolvedModule, ResolutionError>;

  readonly resolveTypeEntries: (
    packageJson: PackageJson,
    pkg: PackageSpec,
  ) => Effect.Effect<ReadonlyArray<ResolvedModule>, ResolutionError>;

  readonly findTypeDefinition: (
    jsFilePath: string,
    packageJson: PackageJson,
    pkg: PackageSpec,
  ) => Effect.Effect<ResolvedModule | null, ResolutionError>;
}

export const TypeResolver = Context.GenericTag<TypeResolver>(
  "type-registry-effect/TypeResolver"
);
```

Note: `findTypeDefinition` maps JS file paths to their corresponding `.d.ts`
counterparts.

### TypeRegistryObserver

An opt-in event service for programmatic consumers, defined in
`src/services/TypeRegistryObserver.ts`. Unlike the three core services it is
**not** part of `TypeRegistryLive` and is never required by a program's
signature -- internal call sites emit through `emitEvent`, which resolves it
via `Effect.serviceOption` (no-op unless a layer is provided). It uses the
`Context.Tag` class pattern (the documented exception to principle 5/6). See
`observability.md` for the full event model.

---

## Layer Composition

### CacheServiceLive

Disk cache for type definition files, with per-package metadata in an
xdg-effect `SqliteCache`. Files live under `<cacheRoot>/<name>/<version>/...`
and use the Effect `Path` service throughout (no `node:path`). See
`cache-optimization.md` for the storage design and `src/layers/CacheServiceLive.ts`
for the implementation.

The layer requirements changed with the SQLite migration:

- `makeNodeCacheLayer(baseDir)` -- requires `FileSystem | SqliteCache |
  Path.Path`. `baseDir` is now required (the old hand-rolled XDG default and
  `getDefaultCacheDir` were removed). Pair it with `SqliteCache.Test()` for
  tests.
- `CacheServiceLive` -- requires `FileSystem | SqliteCache | AppDirs |
  Path.Path`; it resolves the cache root from `AppDirs`.

### PackageFetcherLive

Uses `@effect/platform` HttpClient with Schema validation, retry schedules,
and timeout. The HttpClient dependency is resolved within the layer via
`Effect.gen`.

A shared `getFileTree` helper is extracted within the layer closure and reused
by the `getFileTree` service method and `getTypeFiles` (which delegates to it
to obtain the file listing before filtering for type definitions).

`JSON.parse` calls are wrapped with `Effect.try` to produce typed `ParseError`
values rather than throwing untyped exceptions.

```typescript
// src/layers/PackageFetcherLive.ts
export const PackageFetcherLive: Layer.Layer<
  PackageFetcher, never, HttpClient.HttpClient
> = Layer.effect(PackageFetcher, Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  // fetchJson/fetchText helpers with retry + timeout

  // Shared helper reused by getFileTree and getTypeFiles
  const getFileTree = (pkg: PackageSpec) => /* ... */;

  return { /* PackageFetcher implementation */ };
}));
```

### TypeResolverLive

Pure layer with no platform dependencies. Uses `Layer.succeed` directly.

The `isTypeDefinition` helper uses `String.prototype.endsWith` checks
(`.d.ts`, `.d.mts`, `.d.cts`) rather than `Path.extname` to correctly handle
multi-segment extensions.

```typescript
// src/layers/TypeResolverLive.ts
function isTypeDefinition(filePath: string): boolean {
  return filePath.endsWith(".d.ts")
    || filePath.endsWith(".d.mts")
    || filePath.endsWith(".d.cts");
}

export const TypeResolverLive: Layer.Layer<TypeResolver> =
  Layer.succeed(TypeResolver, {
    resolveImport: (specifier, packageJson, pkg) => /* ... */,
    resolveMainEntry: (packageJson, pkg) => /* ... */,
    resolveTypeEntries: (packageJson, pkg) => /* ... */,
    findTypeDefinition: (jsFilePath, _packageJson, pkg) => /* ... */,
  });
```

### TypeRegistryLive (Composed)

Merges all three service layers. Its requirements grew with the SQLite cache
and the `Path` service:

```typescript
// src/layers/TypeRegistryLive.ts
export const TypeRegistryLive: Layer.Layer<
  CacheService | PackageFetcher | TypeResolver,
  never,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | AppDirs | SqliteCache
> = Layer.mergeAll(CacheServiceLive, PackageFetcherLive, TypeResolverLive);
```

Note: `TypeScriptEnv` is not included in `TypeRegistryLive` since it has not
been implemented yet (see Phase 4 in Implementation Status).

---

## Platform Support

### Node.js Platform -- IMPLEMENTED

`NodeLayer` (`src/platforms/node.ts`) composes `TypeRegistryLive` with the
infrastructure the SQLite cache needs. It provides `AppDirs` (xdg-effect
`XdgLive` configured with the `type-registry-effect` namespace) plus
`SqliteCache.XdgLive({ filename: "metadata.db" })`, then the Node platform
layers `NodeFileSystem`, `NodePath` and `NodeHttpClient`. The result is a
fully-closed layer with no remaining `R` requirements. See
`cache-optimization.md` for the `AppDirs` cache-root resolution quirk.

The Node platform module also provides a Promise convenience API that wraps
TypeRegistry namespace functions:

- `hasCached(pkg)` -- check if a package is cached
- `fetchAndCache(pkg, options?)` -- fetch and cache type definitions
- `getVFS(packages, options?)` -- get combined VFS for multiple packages
- `resolveVersion(name, ref)` -- resolve version reference
- `pruneCache()` -- prune expired packages from the cache
- `createTypeScriptCache(packages, compilerOptions)` -- create TypeScript
  virtual environment (uses `@typescript/vfs` directly, not via a service)

The `createTypeScriptCache` function currently uses `@typescript/vfs` APIs
(`createFSBackedSystem`, `createDefaultMapFromNodeModules`,
`createVirtualTypeScriptEnvironment`) inline rather than through a
`TypeScriptEnv` service abstraction. This is planned for Phase 4.

### Browser Platform -- PLANNED

Not yet implemented. See Phase 5 in Implementation Status.

---

## Public API

### Core Module

See `src/index.ts` for the authoritative export list. It exposes the
`TypeRegistry` and `VirtualPackage` namespaces, the schemas, the error types
(with their `*Base` constants for DTS bundling), the service tags, the layers,
the metrics and the observer channel. Notable points that affect consumers:

- **Barrels removed.** `src/errors/index.ts` and `src/schemas/index.ts` are
  gone; only the entry points (`src/index.ts`, `src/node.ts`) re-export. The
  `TypeRegistryError` union is now defined in `src/index.ts` itself.
- **Observer channel exported:** `TypeRegistryObserver`,
  `TypeRegistryObserverShape`, `RegistryEvent`, `emitEvent`, `layerCallback`,
  `layerNoop` (from `src/services/TypeRegistryObserver.js`).
- **Cache additions exported:** `CachePruneResult` (and `pruneCache` via the
  `TypeRegistry` namespace).
- **`getDefaultCacheDir` removed** along with `src/utils/xdg.ts` (breaking) --
  cache-root resolution now lives behind `AppDirs`.
- **`LogEventSchema` / `LogEvent` still exported but `@deprecated`** -- the
  legacy log-annotation surface, superseded by the observer channel.

`*Base` exports for both schemas and errors are exported directly from the
main entry point for DTS bundling compatibility.

### Node Entry Point

The `type-registry-effect/node` entry point (`src/node.ts`) provides:

- `NodeLayer` -- fully closed layer (no remaining `R` requirements)
- Promise-returning wrappers: `hasCached`, `fetchAndCache`, `getVFS`,
  `resolveVersion`, `createTypeScriptCache`
- Re-exports of `*Base` constants and types needed for DTS bundling
- Re-exports of service tags and schema types referenced by service interfaces

### TypeRegistry Namespace Module

`TypeRegistry` is a namespace module of pure functions (not a class). Each
function returns a composable `Effect<A, E, R>`:

- `hasCached(pkg)` -- check if a package is cached
- `fetchAndCache(pkg, options?)` -- fetch and cache type definitions
- `getPackageVFS(pkg, options?)` -- get VFS for a single package
- `getVFS(packages, options?)` -- get combined VFS for multiple packages
  (concurrent with limit of 5, graceful degradation on per-package failures)
- `resolveImport(pkg, specifier)` -- resolve an import specifier
- `getTypeEntries(pkg)` -- get all type entry points
- `resolveVersion(name, ref)` -- resolve a version reference
- `clearCache(pkg)` -- remove a package from cache
- `pruneCache()` -- evict every expired package and return a
  `CachePruneResult`

Implementation note: `JSON.parse` calls in `resolveImport` and `getTypeEntries`
are wrapped with `Effect.try` to produce typed `ParseError` values rather than
throwing untyped exceptions.

### VirtualPackage

`VirtualPackage` is a class for generating transient VFS entries from
declaration content (not cached, not an Effect service). Supports single-entry
and multi-entry packages:

- `VirtualPackage.create(name, version, declarations)` -- single entry
- `VirtualPackage.createMultiEntry(name, version, entries)` -- multiple entries
- `VirtualPackage.fromFile(name, version, filePath)` -- load from disk; now
  returns `Effect<VirtualPackage, PlatformError, FileSystem>` (previously a
  synchronous `readFileSync`), removing the last `node:fs` from the
  platform-agnostic entry point
- `instance.generateVfs()` -- produce VFS map

### Consumer Examples

**Effect consumer (full composition):**

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

const program = Effect.gen(function* () {
  const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
  yield* TypeRegistry.fetchAndCache(pkg);
  const vfs = yield* TypeRegistry.getVFS([pkg]);
  return vfs;
}).pipe(
  Effect.catchTag("NetworkError", (e) =>
    Effect.logError(`Network: ${e.message}`)
  ),
  Effect.provide(NodeLayer),
);

Effect.runPromise(program);
```

**Promise consumer (Node.js convenience):**

```typescript
import { fetchAndCache, getVFS } from "type-registry-effect/node";
import { PackageSpec } from "type-registry-effect";

const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });
await fetchAndCache(pkg);
const vfs = await getVFS([pkg]);
```

---

## Testing Strategy

The test suite includes unit tests, integration tests, schema tests, layer
tests, and error tests. Tests use layer-based dependency injection with
`Effect.provide`.

### Directory Structure

```text
__test__/
  PackageFetcher.test.ts       -- PackageFetcher layer tests
  VirtualPackage.test.ts       -- VirtualPackage utility tests
  CacheService.test.ts         -- CacheService tests
  TypeResolver.test.ts         -- TypeResolver layer tests
  TypeRegistry.unit.test.ts    -- TypeRegistry namespace unit tests
  TypeRegistry.events.test.ts  -- observer event channel tests
  TypeRegistry.integration.test.ts -- Integration tests (live network)
  events.test.ts               -- deprecated LogEventSchema tests
  metrics.test.ts              -- Effect Metrics tests
  schemas/
    PackageSpec.test.ts
    CacheMetadata.test.ts
    FileTree.test.ts
    PackageJson.test.ts
    ResolvedModule.test.ts
  errors/
    errors.test.ts
  layers/
    CacheServiceLive.test.ts
  services/
    TypeRegistryObserver.test.ts
  fixtures/                    -- Test fixture packages
    zod/
    ts-pattern/
    @effect/schema/
```

### Test Patterns

Tests follow the layer-based testing pattern: mock services are provided via
`Layer.succeed` or `Layer.effect`, then composed with real layers under test.

```typescript
// Example: unit test with mock services
const program = TypeRegistry.fetchAndCache(pkg).pipe(
  Effect.provide(Layer.mergeAll(MockCacheLayer, MockFetcherLayer)),
);
await Effect.runPromise(program);
```

---

## Future Work

### Phase 4: TypeScriptEnv Service (Planned)

Abstract the TypeScript environment creation behind a service interface to
enable browser support and testability:

- Create `TypeScriptEnv` service with `Context.GenericTag` + interface/const
  declaration merging (consistent with existing service pattern)
- Implement `NodeTypeScriptEnvLive` (uses `createFSBackedSystem` +
  `createDefaultMapFromNodeModules`)
- Refactor `createTypeScriptCache` from inline `@typescript/vfs` usage to
  service-based
- Add `TypeScriptEnv` to `TypeRegistryLive` composed layer

### Phase 5: Browser Support (Planned)

Requires Phase 4 completion:

- `BrowserCacheServiceLive` using IndexedDB
- `BrowserTypeScriptEnvLive` using `createSystem` + `createDefaultMapFromCDN`
- `src/platforms/browser.ts` with `BrowserLayer` + Promise API
- Package exports: `./browser` entry point

### semver-effect Integration (Planned)

The `semver-effect` package is declared as a runtime dependency but is not yet
used in source code. Planned integration points:

- Replace raw string-based version resolution in `PackageFetcher.resolveVersion`
  with `semver-effect` operations
- Use semver range parsing and satisfaction checking for version matching

### Observability -- COMPLETE (typed event channel)

Diagnostics flow through the opt-in `TypeRegistryObserver` / `RegistryEvent`
channel and the Effect Metrics module (`src/metrics.ts`). The library is
silent by default. The earlier `Effect.log` + `LogEventSchema` annotation
system has been removed as the diagnostics surface (`LogEventSchema` /
`LogEvent` remain exported but `@deprecated`). See `observability.md` for
full details.

---

## Related Documentation

- **Observability:** `./observability.md` -- event system, metrics,
  fault tolerance patterns
- **Cache Optimization:** `./cache-optimization.md` -- performance
  characteristics
- **Package README:** `README.md`

### External References

- Effect documentation: <https://effect.website/>
- Effect Schema: <https://effect.website/docs/schema/introduction>
- @typescript/vfs: <https://github.com/microsoft/TypeScript-Website/tree/v2/packages/typescript-vfs>
- jsDelivr API: <https://www.jsdelivr.com/docs/api>
