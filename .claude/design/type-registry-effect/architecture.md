---
status: draft
module: type-registry-effect
category: architecture
created: 2026-03-12
updated: 2026-03-12
last-synced: 2026-03-12
completeness: 40
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
4. [Target Architecture](#target-architecture)
5. [Data Layer](#data-layer)
6. [Error Layer](#error-layer)
7. [Service Layer](#service-layer)
8. [Layer Composition](#layer-composition)
9. [Platform Abstraction](#platform-abstraction)
10. [Public API](#public-api)
11. [Testing Strategy](#testing-strategy)
12. [Migration Path](#migration-path)
13. [Related Documentation](#related-documentation)

---

## Overview

This document describes the refactoring of `type-registry-effect` from a
class-based wrapper around Effect programs into a first-class Effect library
with platform-agnostic architecture supporting both Node.js and browser
environments.

The library composes virtual TypeScript environments with automatic package
fetching, disk/browser caching, and version-aware type resolution. It is
designed for use with Twoslash-based documentation tooling and TypeScript
language service consumers.

### Design Principles

1. **Effect programs as values** -- expose composable `Effect<A, E, R>`
   programs, not Promise-returning methods
2. **Platform-agnostic core** -- business logic has zero platform
   dependencies; Node/browser support via swappable layers
3. **Typed errors** -- `Data.TaggedError` for every failure mode, enabling
   `catchTag`-based recovery
4. **Schema-validated data** -- runtime validation at system boundaries
   (CDN responses, cache reads) via Effect Schema
5. **Composable services** -- `Context.Tag`-based services with proper
   `Layer` implementations for dependency injection

### Reference Implementations

This design follows patterns established in two sibling packages:

- **semver-effect** -- `Data.TaggedClass` for domain types,
  `Data.TaggedError` for errors, `Context.GenericTag` + `Layer` for services,
  namespace modules for public API
- **runtime-resolver** -- multi-layer composition with `Layer.tap` for
  initialization, generic cache factories, Promise convenience API at package
  edge only

---

## Current State

### Anti-Pattern Summary

The current implementation has three critical issues that prevent Effect
composition:

1. **Class wrapper** -- `TypeRegistry` class wraps every Effect program in
   `async` methods that call `Effect.runPromise` internally. Users receive
   `Promise<T>` instead of `Effect<T, E, R>`, preventing composition with
   their own Effect programs.

2. **Ad-hoc layers** -- `runWithServices` (line 466-486 of TypeRegistry.ts)
   reconstructs the full layer stack on every method call. No way for
   consumers to customize or extend the service graph.

3. **Services without layers** -- `PackageFetcherLive` and `TypeResolverLive`
   are `Effect` values, not `Layer` values. This forces the use of
   `Effect.provideServiceEffect` instead of standard layer composition.

### Additional Issues

| Category | Issue | Impact |
| :------- | :---- | :----- |
| Errors | All errors are plain `Error`/`throw` | Cannot `catchTag`, no discrimination |
| Data | Plain TS interfaces, no runtime validation | Unsafe `JSON.parse(...) as T` everywhere |
| Logging | Manual callback-based event emission | Bypasses Effect structured logging |
| Platform | Hardcoded `node:path`, `NodeFileSystem`, `NodeHttpClient` | No browser support |
| Concurrency | `maxConcurrency` option defined but unused | No backpressure |
| Resources | No `acquireRelease` or `Scope` usage | No cleanup guarantees |

---

## Rationale

### Why Effect-First?

The library already uses Effect internally for every operation. The class
wrapper exists solely to present a Promise-based API. This:

- Prevents users from composing registry operations with their own Effects
- Forces eager execution (no lazy evaluation or cancellation)
- Duplicates layer construction on every call
- Makes testing harder (must test through Promise boundary)

By exposing Effect programs directly, consumers can:

- Compose registry operations into larger Effect pipelines
- Provide custom service implementations (mock fetchers, alternative caches)
- Control execution timing, cancellation, and concurrency
- Access structured error information via `catchTag`

### Why Platform-Agnostic?

The core operations -- fetching type definitions from jsDelivr, resolving
imports from package.json, building VFS maps -- are pure data transformations
that work identically in Node.js and browsers. Only two concerns are
platform-specific:

1. **Caching** -- filesystem (Node) vs IndexedDB/localStorage (browser)
2. **TypeScript environment** -- `createFSBackedSystem` (Node) vs
   `createSystem` (browser), plus lib file sourcing

Microsoft's `@typescript/vfs` already provides both paths. Effect's
`@effect/platform` provides `HttpClient` and `FileSystem` abstractions with
Node and browser implementations. The architecture maps naturally to
platform-specific layers.

---

## Target Architecture

### Dependency Graph

```text
Consumer code (Effect programs or Promise API)
         |
    TypeRegistry module (composable Effect programs)
         |
    +-----------+-----------+-----------+
    |           |           |           |
CacheService  PackageFetcher TypeResolver TypeScriptEnv
    |           |           |           |
    v           v           v           v
  Platform Layers (Node.js OR Browser)
```

### Directory Structure

```text
src/
  index.ts                    -- Public API (namespace exports)
  TypeRegistry.ts             -- Composable Effect programs (no class)
  VirtualPackage.ts           -- Virtual package builder

  schemas/
    PackageSpec.ts            -- Data.TaggedClass
    CacheMetadata.ts          -- Schema.Class (serializable)
    PackageJson.ts            -- Schema.Struct (validated parsing)
    FileTree.ts               -- Schema.Struct (CDN response)
    ResolvedModule.ts         -- Data.TaggedClass

  errors/
    CacheError.ts             -- Data.TaggedError
    NetworkError.ts           -- Data.TaggedError
    PackageNotFoundError.ts   -- Data.TaggedError
    ParseError.ts             -- Data.TaggedError
    ResolutionError.ts        -- Data.TaggedError
    TimeoutError.ts           -- Data.TaggedError

  services/
    CacheService.ts           -- Context.Tag + interface
    PackageFetcher.ts         -- Context.Tag + interface
    TypeResolver.ts           -- Context.Tag + interface
    TypeScriptEnv.ts          -- Context.Tag + interface (new)

  layers/
    CacheServiceLive.ts       -- Layer (platform-agnostic interface)
    PackageFetcherLive.ts     -- Layer (uses HttpClient)
    TypeResolverLive.ts       -- Layer (pure, no deps)
    TypeScriptEnvLive.ts      -- Layer (platform-specific)
    TypeRegistryLive.ts       -- Composed layer (all services)

  platforms/
    node.ts                   -- Node layers + Promise API
    browser.ts                -- Browser layers + Promise API
```

---

## Data Layer

### PackageSpec

Immutable domain type with structural equality. Used throughout the library
to identify a package at a specific version.

```typescript
// src/schemas/PackageSpec.ts
import { Data, Equal, Hash } from "effect"

const PackageSpecBase = Data.TaggedClass("PackageSpec")

export class PackageSpec extends PackageSpecBase<{
  readonly name: string
  readonly version: string
  readonly registry?: string
}> {
  toString(): string {
    return `${this.name}@${this.version}`
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString()
  }
}
```

### CacheMetadata

Schema.Class for serialization to/from cache storage. Validated on read.

```typescript
// src/schemas/CacheMetadata.ts
import { Schema } from "effect"

export class CacheMetadata extends Schema.Class<CacheMetadata>(
  "CacheMetadata"
)({
  version: Schema.String,
  cachedAt: Schema.Number,
  ttl: Schema.optional(Schema.Number),
}) {}
```

### PackageJson

Schema.Struct for validated parsing of CDN responses. Replaces unsafe
`JSON.parse(...) as PackageJson`.

```typescript
// src/schemas/PackageJson.ts
import { Schema } from "effect"

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
      value: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) })
    })
  ),
  dependencies: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  peerDependencies: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
})

export type PackageJson = Schema.Schema.Type<typeof PackageJson>
```

### FileTree (CDN Response)

```typescript
// src/schemas/FileTree.ts
import { Schema } from "effect"

export const FileTreeEntry = Schema.Struct({
  name: Schema.String,
  hash: Schema.String,
  time: Schema.String,
  size: Schema.Number,
})

export const FileTreeResponse = Schema.Struct({
  default: Schema.String,
  files: Schema.Array(FileTreeEntry),
})

export type FileTreeResponse = Schema.Schema.Type<typeof FileTreeResponse>
```

### ResolvedModule

```typescript
// src/schemas/ResolvedModule.ts
import { Data } from "effect"

const ResolvedModuleBase = Data.TaggedClass("ResolvedModule")

export class ResolvedModule extends ResolvedModuleBase<{
  readonly filePath: string
  readonly isTypeDefinition: boolean
  readonly package: PackageSpec
}> {}
```

---

## Error Layer

Every failure mode gets a `Data.TaggedError` with contextual fields.
Consumers use `catchTag` / `catchTags` for precise recovery. Each error
exports a `*Base` for DTS bundling compatibility with api-extractor.

```typescript
// src/errors/NetworkError.ts
import { Data } from "effect"

export const NetworkErrorBase = Data.TaggedError("NetworkError")

export class NetworkError extends NetworkErrorBase<{
  readonly url: string
  readonly status?: number
  readonly message: string
}> {}
```

```typescript
// src/errors/CacheError.ts
export const CacheErrorBase = Data.TaggedError("CacheError")

export class CacheError extends CacheErrorBase<{
  readonly operation: "read" | "write" | "delete" | "list"
  readonly path: string
  readonly message: string
}> {}
```

```typescript
// src/errors/PackageNotFoundError.ts
export const PackageNotFoundErrorBase = Data.TaggedError("PackageNotFoundError")

export class PackageNotFoundError extends PackageNotFoundErrorBase<{
  readonly name: string
  readonly version: string
  readonly message: string
}> {}
```

```typescript
// src/errors/ParseError.ts
export const ParseErrorBase = Data.TaggedError("ParseError")

export class ParseError extends ParseErrorBase<{
  readonly source: string
  readonly message: string
}> {}
```

```typescript
// src/errors/ResolutionError.ts
export const ResolutionErrorBase = Data.TaggedError("ResolutionError")

export class ResolutionError extends ResolutionErrorBase<{
  readonly package: string
  readonly specifier: string
  readonly message: string
}> {}
```

```typescript
// src/errors/TimeoutError.ts
export const TimeoutErrorBase = Data.TaggedError("TimeoutError")

export class TimeoutError extends TimeoutErrorBase<{
  readonly operation: string
  readonly duration: number
  readonly message: string
}> {}
```

### Error Union Type

```typescript
// src/errors/index.ts
export type TypeRegistryError =
  | NetworkError
  | CacheError
  | PackageNotFoundError
  | ParseError
  | ResolutionError
  | TimeoutError
```

### Consumer Usage

```typescript
import { Effect } from "effect"
import * as TypeRegistry from "type-registry-effect"

TypeRegistry.fetchAndCache(pkg).pipe(
  Effect.catchTags({
    NetworkError: (e) => Effect.log(`Network failed: ${e.url} (${e.status})`),
    CacheError: (e) => Effect.log(`Cache ${e.operation} failed: ${e.path}`),
    PackageNotFoundError: (e) => Effect.log(`${e.name}@${e.version} not found`),
  })
)
```

---

## Service Layer

Services use `Context.GenericTag` with the companion object pattern (matching
semver-effect and runtime-resolver conventions). Each service method returns
`Effect<A, E>` with typed errors -- no `HttpClient` or `FileSystem` in
method signatures since those are resolved within layers.

### CacheService

```typescript
// src/services/CacheService.ts
import type { Effect } from "effect"
import { Context } from "effect"

export interface CacheService {
  readonly exists: (pkg: PackageSpec) => Effect.Effect<boolean, CacheError>
  readonly read: (pkg: PackageSpec, filePath: string) => Effect.Effect<string, CacheError>
  readonly write: (pkg: PackageSpec, filePath: string, content: string) => Effect.Effect<void, CacheError>
  readonly listFiles: (pkg: PackageSpec) => Effect.Effect<ReadonlyArray<string>, CacheError>
  readonly readMetadata: (pkg: PackageSpec) => Effect.Effect<CacheMetadata, CacheError>
  readonly writeMetadata: (pkg: PackageSpec, metadata: CacheMetadata) => Effect.Effect<void, CacheError>
  readonly getVFS: (pkg: PackageSpec) => Effect.Effect<VirtualFileSystem, CacheError>
  readonly remove: (pkg: PackageSpec) => Effect.Effect<void, CacheError>
}

export const CacheService = Context.GenericTag<CacheService>("type-registry-effect/CacheService")
```

Note: `FileSystem.FileSystem` is no longer in method signatures. The layer
implementation closes over its platform dependency.

### PackageFetcher

```typescript
// src/services/PackageFetcher.ts
export interface PackageFetcher {
  readonly getVersions: (name: string) => Effect.Effect<PackageMetadata, NetworkError | ParseError>
  readonly resolveVersion: (name: string, ref: string) => Effect.Effect<string, NetworkError | PackageNotFoundError>
  readonly getFileTree: (pkg: PackageSpec) => Effect.Effect<FileTreeResponse, NetworkError | ParseError>
  readonly downloadFile: (pkg: PackageSpec, path: string) => Effect.Effect<string, NetworkError>
  readonly getPackageJson: (pkg: PackageSpec) => Effect.Effect<PackageJson, NetworkError | ParseError>
  readonly getTypeFiles: (pkg: PackageSpec) => Effect.Effect<Map<string, string>, NetworkError | ParseError>
}

export const PackageFetcher = Context.GenericTag<PackageFetcher>("type-registry-effect/PackageFetcher")
```

### TypeResolver

```typescript
// src/services/TypeResolver.ts
export interface TypeResolver {
  readonly resolveImport: (
    specifier: string,
    packageJson: PackageJson,
    pkg: PackageSpec,
  ) => Effect.Effect<ResolvedModule, ResolutionError>

  readonly resolveMainEntry: (
    packageJson: PackageJson,
    pkg: PackageSpec,
  ) => Effect.Effect<ResolvedModule, ResolutionError>

  readonly resolveTypeEntries: (
    packageJson: PackageJson,
    pkg: PackageSpec,
  ) => Effect.Effect<ReadonlyArray<ResolvedModule>, ResolutionError>
}

export const TypeResolver = Context.GenericTag<TypeResolver>("type-registry-effect/TypeResolver")
```

### TypeScriptEnv (New)

Abstracts the platform-specific TypeScript environment creation. This is the
key service for browser compatibility.

```typescript
// src/services/TypeScriptEnv.ts
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs"

export interface TypeScriptEnv {
  /** Create a VirtualTypeScriptEnvironment from a VFS map */
  readonly createEnvironment: (
    vfs: VirtualFileSystem,
    compilerOptions: import("typescript").CompilerOptions,
  ) => Effect.Effect<VirtualTypeScriptEnvironment, TypeScriptEnvError>

  /** Get default TypeScript lib files for given compiler options */
  readonly getLibFiles: (
    compilerOptions: import("typescript").CompilerOptions,
  ) => Effect.Effect<Map<string, string>, NetworkError>
}

export const TypeScriptEnv = Context.GenericTag<TypeScriptEnv>("type-registry-effect/TypeScriptEnv")
```

---

## Layer Composition

### PackageFetcherLive

Proper `Layer` instead of `Effect`. Uses Schema for response validation.

```typescript
// src/layers/PackageFetcherLive.ts
import { HttpClient } from "@effect/platform"
import { Layer, Effect, Schema } from "effect"

export const PackageFetcherLive: Layer.Layer<PackageFetcher, never, HttpClient.HttpClient> =
  Layer.effect(
    PackageFetcher,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient

      return PackageFetcher.of({
        getPackageJson: (pkg) =>
          Effect.gen(function* () {
            const response = yield* http.get(
              `${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}/package.json`
            ).pipe(
              Effect.flatMap((res) => res.json),
              Effect.timeout("30 seconds"),
              Effect.retry(retrySchedule),
              Effect.mapError((e) => new NetworkError({
                url: `${pkg.name}@${pkg.version}/package.json`,
                message: String(e),
              })),
            )

            return yield* Schema.decodeUnknown(PackageJson)(response).pipe(
              Effect.mapError((e) => new ParseError({
                source: `${pkg.name}@${pkg.version}/package.json`,
                message: `Schema validation failed: ${e.message}`,
              })),
            )
          }),
        // ... other methods
      })
    })
  )
```

### TypeResolverLive

Pure layer with no platform dependencies.

```typescript
// src/layers/TypeResolverLive.ts
export const TypeResolverLive: Layer.Layer<TypeResolver> =
  Layer.succeed(TypeResolver, TypeResolver.of({
    resolveImport: (specifier, packageJson, pkg) => /* ... */,
    resolveMainEntry: (packageJson, pkg) => /* ... */,
    resolveTypeEntries: (packageJson, pkg) => /* ... */,
  }))
```

### TypeRegistryLive (Composed)

Wires all services together. Platform-agnostic -- requires platform layers
to be provided by the consumer.

```typescript
// src/layers/TypeRegistryLive.ts
export const TypeRegistryLive: Layer.Layer<
  CacheService | PackageFetcher | TypeResolver | TypeScriptEnv,
  never,
  HttpClient.HttpClient | FileSystem.FileSystem
> = Layer.mergeAll(
  CacheServiceLive,
  PackageFetcherLive,
  TypeResolverLive,
  TypeScriptEnvLive,
)
```

---

## Platform Abstraction

### Node.js Platform

```typescript
// src/platforms/node.ts
import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node"
import { Layer, ManagedRuntime } from "effect"

/** Full Node.js layer stack */
export const NodeLayer = TypeRegistryLive.pipe(
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.provide(NodeTypeScriptEnvLive),
  Layer.provide(NodeCacheServiceLive),
)

/** ManagedRuntime for convenience API */
const runtime = ManagedRuntime.make(NodeLayer)

/** Promise-based convenience API for non-Effect consumers */
export const fetchAndCache = (pkg: PackageSpec): Promise<void> =>
  runtime.runPromise(TypeRegistry.fetchAndCache(pkg))

export const getVFS = (
  packages: ReadonlyArray<PackageSpec>,
): Promise<VirtualFileSystem> =>
  runtime.runPromise(TypeRegistry.getVFS(packages))

export const createTypeScriptCache = (
  packages: ReadonlyArray<PackageSpec>,
  compilerOptions: import("typescript").CompilerOptions,
): Promise<Map<string, VirtualTypeScriptEnvironment>> =>
  runtime.runPromise(TypeRegistry.createTypeScriptCache(packages, compilerOptions))
```

#### NodeCacheServiceLive

Uses `@effect/platform` FileSystem with XDG-compliant paths.

```typescript
// src/layers/node/NodeCacheServiceLive.ts
import { FileSystem } from "@effect/platform"

export const makeNodeCacheLayer = (baseDir?: string): Layer.Layer<CacheService, never, FileSystem.FileSystem> =>
  Layer.effect(
    CacheService,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const cacheDir = baseDir ?? getDefaultCacheDir()

      return CacheService.of({
        exists: (pkg) =>
          fs.exists(Path.join(cacheDir, `${pkg.name}@${pkg.version}`)).pipe(
            Effect.catchAll(() => Effect.succeed(false)),
          ),
        read: (pkg, filePath) =>
          fs.readFileString(Path.join(cacheDir, `${pkg}`, filePath)).pipe(
            Effect.mapError((e) => new CacheError({
              operation: "read",
              path: filePath,
              message: String(e),
            })),
          ),
        // ... other methods
      })
    })
  )

export const NodeCacheServiceLive = makeNodeCacheLayer()
```

#### NodeTypeScriptEnvLive

Uses `createFSBackedSystem` and `createDefaultMapFromNodeModules`.

```typescript
// src/layers/node/NodeTypeScriptEnvLive.ts
import {
  createDefaultMapFromNodeModules,
  createFSBackedSystem,
  createVirtualTypeScriptEnvironment,
} from "@typescript/vfs"
import * as ts from "typescript"

export const NodeTypeScriptEnvLive: Layer.Layer<TypeScriptEnv> =
  Layer.succeed(TypeScriptEnv, TypeScriptEnv.of({
    createEnvironment: (vfs, compilerOptions) =>
      Effect.sync(() => {
        const sys = createFSBackedSystem(vfs, process.cwd(), ts)
        const rootFiles = Array.from(vfs.keys()).filter(
          (p) => p.endsWith(".d.ts") || p.endsWith(".d.mts") || p.endsWith(".d.cts"),
        )
        return createVirtualTypeScriptEnvironment(sys, rootFiles, ts, compilerOptions)
      }),

    getLibFiles: (compilerOptions) =>
      Effect.sync(() => createDefaultMapFromNodeModules(compilerOptions, ts)),
  }))
```

### Browser Platform

```typescript
// src/platforms/browser.ts
import { BrowserHttpClient } from "@effect/platform-browser"
import { Layer, ManagedRuntime } from "effect"

/** Full browser layer stack */
export const BrowserLayer = TypeRegistryLive.pipe(
  Layer.provide(BrowserHttpClient.layerXMLHttpRequest),
  Layer.provide(BrowserTypeScriptEnvLive),
  Layer.provide(BrowserCacheServiceLive),
)

/** ManagedRuntime for convenience API */
const runtime = ManagedRuntime.make(BrowserLayer)

/** Promise-based convenience API */
export const fetchAndCache = (pkg: PackageSpec): Promise<void> =>
  runtime.runPromise(TypeRegistry.fetchAndCache(pkg))
// ... etc
```

#### BrowserCacheServiceLive

Uses IndexedDB for large VFS data, with localStorage fallback. Follows
the lzstring compression pattern from `@typescript/vfs`.

```typescript
// src/layers/browser/BrowserCacheServiceLive.ts
export const BrowserCacheServiceLive: Layer.Layer<CacheService> =
  Layer.effect(
    CacheService,
    Effect.gen(function* () {
      // Open IndexedDB database
      const db = yield* openDatabase("type-registry-cache", 1)

      return CacheService.of({
        exists: (pkg) =>
          Effect.tryPromise({
            try: () => db.get("packages", pkg.toString()),
            catch: (e) => new CacheError({
              operation: "read",
              path: pkg.toString(),
              message: String(e),
            }),
          }).pipe(Effect.map((result) => result !== undefined)),

        write: (pkg, filePath, content) =>
          Effect.tryPromise({
            try: () => db.put("files", content, `${pkg}/${filePath}`),
            catch: (e) => new CacheError({
              operation: "write",
              path: `${pkg}/${filePath}`,
              message: String(e),
            }),
          }).pipe(Effect.asVoid),

        // ... other methods using IndexedDB
      })
    })
  )
```

#### BrowserTypeScriptEnvLive

Uses `createSystem` (pure Map-based, no filesystem) and
`createDefaultMapFromCDN` for lib files. Follows the caching pattern from
`@typescript/vfs` with optional lzstring compression.

```typescript
// src/layers/browser/BrowserTypeScriptEnvLive.ts
import {
  createDefaultMapFromCDN,
  createSystem,
  createVirtualTypeScriptEnvironment,
} from "@typescript/vfs"
import * as ts from "typescript"

export const BrowserTypeScriptEnvLive: Layer.Layer<TypeScriptEnv> =
  Layer.succeed(TypeScriptEnv, TypeScriptEnv.of({
    createEnvironment: (vfs, compilerOptions) =>
      Effect.sync(() => {
        const sys = createSystem(vfs)
        const rootFiles = Array.from(vfs.keys()).filter(
          (p) => p.endsWith(".d.ts") || p.endsWith(".d.mts") || p.endsWith(".d.cts"),
        )
        return createVirtualTypeScriptEnvironment(sys, rootFiles, ts, compilerOptions)
      }),

    getLibFiles: (compilerOptions) =>
      Effect.tryPromise({
        try: () => createDefaultMapFromCDN(
          compilerOptions,
          ts.version,
          true,  // enable caching
          ts,
          // lzstring imported dynamically for compression
        ),
        catch: (e) => new NetworkError({
          url: "typescript CDN",
          message: `Failed to fetch lib files: ${String(e)}`,
        }),
      }),
  }))
```

### Package Exports Configuration

```json
{
  "exports": {
    ".": {
      "types": "./dist/npm/index.d.ts",
      "import": "./dist/npm/index.js"
    },
    "./node": {
      "types": "./dist/npm/platforms/node.d.ts",
      "import": "./dist/npm/platforms/node.js"
    },
    "./browser": {
      "types": "./dist/npm/platforms/browser.d.ts",
      "import": "./dist/npm/platforms/browser.js"
    }
  }
}
```

---

## Public API

### Core Module (Platform-Agnostic)

The main export exposes composable Effect programs and all types:

```typescript
// src/index.ts

// Namespace modules
export * as TypeRegistry from "./TypeRegistry.js"
export * as VirtualPackage from "./VirtualPackage.js"

// Data types
export { PackageSpec, PackageSpecBase } from "./schemas/PackageSpec.js"
export { CacheMetadata } from "./schemas/CacheMetadata.js"
export { PackageJson } from "./schemas/PackageJson.js"
export { ResolvedModule, ResolvedModuleBase } from "./schemas/ResolvedModule.js"

// Errors (with *Base for DTS bundling)
export { CacheError, CacheErrorBase } from "./errors/CacheError.js"
export { NetworkError, NetworkErrorBase } from "./errors/NetworkError.js"
export { PackageNotFoundError, PackageNotFoundErrorBase } from "./errors/PackageNotFoundError.js"
export { ParseError, ParseErrorBase } from "./errors/ParseError.js"
export { ResolutionError, ResolutionErrorBase } from "./errors/ResolutionError.js"
export { TimeoutError, TimeoutErrorBase } from "./errors/TimeoutError.js"
export type { TypeRegistryError } from "./errors/index.js"

// Services (Context.Tag definitions)
export { CacheService } from "./services/CacheService.js"
export { PackageFetcher } from "./services/PackageFetcher.js"
export { TypeResolver } from "./services/TypeResolver.js"
export { TypeScriptEnv } from "./services/TypeScriptEnv.js"

// Layers (composable building blocks)
export { PackageFetcherLive } from "./layers/PackageFetcherLive.js"
export { TypeResolverLive } from "./layers/TypeResolverLive.js"
export { TypeRegistryLive } from "./layers/TypeRegistryLive.js"

// Re-export VirtualTypeScriptEnvironment for consumers
export type { VirtualTypeScriptEnvironment } from "@typescript/vfs"
```

### TypeRegistry Namespace Module

Composable Effect programs -- the core API:

```typescript
// src/TypeRegistry.ts
import { Effect } from "effect"

/** Check if a package is cached */
export const hasCached = (pkg: PackageSpec): Effect.Effect<
  boolean,
  CacheError,
  CacheService
> =>
  Effect.gen(function* () {
    const cache = yield* CacheService
    return yield* cache.exists(pkg)
  })

/** Fetch and cache a package's type definitions */
export const fetchAndCache = (pkg: PackageSpec): Effect.Effect<
  void,
  NetworkError | ParseError | CacheError,
  CacheService | PackageFetcher
> =>
  Effect.gen(function* () {
    const cache = yield* CacheService
    const fetcher = yield* PackageFetcher

    const exists = yield* cache.exists(pkg)
    if (exists) {
      const metadata = yield* cache.readMetadata(pkg)
      if (metadata.ttl && (Date.now() - metadata.cachedAt) < metadata.ttl) {
        return
      }
    }

    const packageJson = yield* fetcher.getPackageJson(pkg)
    const typeFiles = yield* fetcher.getTypeFiles(pkg)

    yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2))
    yield* Effect.forEach(typeFiles, ([path, content]) => {
      const normalized = path.replace(/^\//, "")
      return normalized !== "package.json"
        ? cache.write(pkg, normalized, content)
        : Effect.void
    })

    yield* cache.writeMetadata(pkg, new CacheMetadata({
      version: pkg.version,
      cachedAt: Date.now(),
    }))
  })

/** Get combined VFS for multiple packages with graceful degradation */
export const getVFS = (
  packages: ReadonlyArray<PackageSpec>,
  options?: { autoFetch?: boolean },
): Effect.Effect<
  VirtualFileSystem,
  PackageNotFoundError,
  CacheService | PackageFetcher
> =>
  Effect.gen(function* () {
    const results = yield* Effect.forEach(
      packages,
      (pkg) => getPackageVFS(pkg, options).pipe(
        Effect.map((vfs) => ({ pkg, vfs, error: null as TypeRegistryError | null })),
        Effect.catchAll((error) =>
          Effect.succeed({ pkg, vfs: new Map() as VirtualFileSystem, error })
        ),
      ),
      { concurrency: 5 },
    )

    const failures = results.filter((r) => r.error !== null)
    if (failures.length === packages.length && packages.length > 0) {
      return yield* Effect.fail(new PackageNotFoundError({
        name: packages.map((p) => p.toString()).join(", "),
        version: "",
        message: `All ${packages.length} packages failed to load`,
      }))
    }

    const vfs: VirtualFileSystem = new Map()
    for (const { vfs: pkgVfs } of results) {
      for (const [path, content] of pkgVfs) {
        vfs.set(path, content)
      }
    }
    return vfs
  })

/** Create TypeScript environment cache for Twoslash */
export const createTypeScriptCache = (
  packages: ReadonlyArray<PackageSpec>,
  compilerOptions: import("typescript").CompilerOptions,
): Effect.Effect<
  Map<string, VirtualTypeScriptEnvironment>,
  TypeRegistryError,
  CacheService | PackageFetcher | TypeScriptEnv
> =>
  Effect.gen(function* () {
    const tsEnvService = yield* TypeScriptEnv

    const vfs = yield* getVFS(packages, { autoFetch: true })
    const libFiles = yield* tsEnvService.getLibFiles(compilerOptions)
    for (const [path, content] of libFiles) {
      vfs.set(path, content)
    }

    const env = yield* tsEnvService.createEnvironment(vfs, compilerOptions)

    const cacheKey = JSON.stringify(compilerOptions)
    const cache = new Map<string, VirtualTypeScriptEnvironment>()
    cache.set(cacheKey, env)
    return cache
  })
```

### Consumer Examples

**Effect consumer (full composition):**

```typescript
import { Effect } from "effect"
import * as TypeRegistry from "type-registry-effect"
import { NodeLayer } from "type-registry-effect/node"

const program = Effect.gen(function* () {
  const pkg = new TypeRegistry.PackageSpec({ name: "zod", version: "3.23.8" })
  yield* TypeRegistry.TypeRegistry.fetchAndCache(pkg)
  const vfs = yield* TypeRegistry.TypeRegistry.getVFS([pkg])
  return vfs
}).pipe(
  Effect.catchTag("NetworkError", (e) =>
    Effect.logError(`Network: ${e.message}`)
  ),
  Effect.provide(NodeLayer),
)

Effect.runPromise(program)
```

**Promise consumer (Node.js convenience):**

```typescript
import { fetchAndCache, getVFS } from "type-registry-effect/node"
import { PackageSpec } from "type-registry-effect"

const pkg = new PackageSpec({ name: "zod", version: "3.23.8" })
await fetchAndCache(pkg)
const vfs = await getVFS([pkg])
```

**Browser consumer:**

```typescript
import { createTypeScriptCache } from "type-registry-effect/browser"
import { PackageSpec } from "type-registry-effect"

const cache = await createTypeScriptCache(
  [new PackageSpec({ name: "zod", version: "3.23.8" })],
  { target: 99, module: 99, strict: false }
)
```

---

## Testing Strategy

### Test Layers

Following the patterns from semver-effect and runtime-resolver:

```typescript
// __test__/utils/TestLayers.ts
import { Layer, Effect } from "effect"

/** Mock PackageFetcher that reads from fixtures */
export const MockPackageFetcherLayer: Layer.Layer<PackageFetcher> =
  Layer.succeed(PackageFetcher, PackageFetcher.of({
    getPackageJson: (pkg) => Effect.sync(() => readFixture(pkg, "package.json")),
    getTypeFiles: (pkg) => Effect.sync(() => readFixtureTypeFiles(pkg)),
    resolveVersion: (name, ref) => Effect.succeed(ref),
    // ...
  }))

/** In-memory cache for tests */
export const InMemoryCacheLayer: Layer.Layer<CacheService> =
  Layer.effect(
    CacheService,
    Effect.gen(function* () {
      const store = new Map<string, string>()

      return CacheService.of({
        exists: (pkg) => Effect.succeed(store.has(`${pkg}/metadata`)),
        read: (pkg, path) => {
          const content = store.get(`${pkg}/${path}`)
          return content
            ? Effect.succeed(content)
            : Effect.fail(new CacheError({ operation: "read", path, message: "Not found" }))
        },
        write: (pkg, path, content) =>
          Effect.sync(() => { store.set(`${pkg}/${path}`, content) }),
        // ...
      })
    })
  )

/** Full test layer (no network, no filesystem) */
export const TestLayer = Layer.mergeAll(
  MockPackageFetcherLayer,
  InMemoryCacheLayer,
  TypeResolverLive,
)

/** Helper to run effects in tests */
export const runTest = <A, E>(effect: Effect.Effect<A, E, CacheService | PackageFetcher | TypeResolver>) =>
  Effect.runPromise(Effect.provide(effect, TestLayer))
```

### Test Structure

```typescript
// __test__/TypeRegistry.test.ts
import { Effect } from "effect"
import { runTest, TestLayer } from "./utils/TestLayers.js"

describe("fetchAndCache", () => {
  it("should fetch and cache a package", async () => {
    const pkg = new PackageSpec({ name: "zod", version: "3.22.4" })
    const result = await runTest(
      Effect.gen(function* () {
        yield* TypeRegistry.fetchAndCache(pkg)
        return yield* TypeRegistry.hasCached(pkg)
      })
    )
    expect(result).toBe(true)
  })

  it("should fail with NetworkError for unavailable package", async () => {
    const pkg = new PackageSpec({ name: "nonexistent", version: "1.0.0" })
    const error = await Effect.runPromise(
      TypeRegistry.fetchAndCache(pkg).pipe(
        Effect.provide(TestLayer),
        Effect.flip,  // flip to get the error
      )
    )
    expect(error._tag).toBe("NetworkError")
  })
})
```

---

## Migration Path

### Phase 1: Data & Errors

1. Create `src/schemas/` with `Data.TaggedClass` and `Schema` types
2. Create `src/errors/` with `Data.TaggedError` types
3. Update existing services to use new types internally
4. Build and test pass with existing API

### Phase 2: Service Refactoring

1. Convert `PackageFetcherLive` and `TypeResolverLive` from `Effect` to `Layer`
2. Add Schema validation to CDN response parsing
3. Replace `Error` with tagged errors in service methods
4. Remove `FileSystem.FileSystem` and `HttpClient.HttpClient` from service
   interface signatures (close over them in layers)
5. Build and test pass

### Phase 3: Remove TypeRegistry Class

1. Create `src/TypeRegistry.ts` as namespace module with Effect programs
2. Create `src/layers/TypeRegistryLive.ts` composed layer
3. Create `src/platforms/node.ts` with `NodeLayer` + Promise API
4. Update tests to use layer-based testing
5. Remove old `TypeRegistry` class
6. Build and test pass

### Phase 4: TypeScriptEnv Service

1. Create `TypeScriptEnv` service interface
2. Implement `NodeTypeScriptEnvLive`
3. Update `createTypeScriptCache` to use the service
4. Build and test pass

### Phase 5: Browser Support

1. Implement `BrowserCacheServiceLive` (IndexedDB)
2. Implement `BrowserTypeScriptEnvLive` (CDN lib files + `createSystem`)
3. Create `src/platforms/browser.ts` with `BrowserLayer` + Promise API
4. Add browser-specific tests
5. Configure package.json conditional exports

---

## Related Documentation

- **Observability:** `./observability.md` -- event system, metrics,
  fault tolerance patterns (to be updated for Effect logging integration)
- **Cache Optimization:** `./cache-optimization.md` -- performance
  characteristics (to be populated after refactoring)
- **Package README:** `README.md`
- **semver-effect:** `../semver-effect/` -- reference implementation for
  Data/Error/Service/Layer patterns
- **runtime-resolver:** `../runtime-resolver/` -- reference implementation
  for multi-layer composition and Promise convenience API

### External References

- Effect documentation: <https://effect.website/>
- Effect Schema: <https://effect.website/docs/schema/introduction>
- @typescript/vfs: <https://github.com/microsoft/TypeScript-Website/tree/v2/packages/typescript-vfs>
- jsDelivr API: <https://www.jsdelivr.com/docs/api>
- @effect/platform-browser: <https://github.com/Effect-TS/effect/tree/main/packages/platform-browser>
