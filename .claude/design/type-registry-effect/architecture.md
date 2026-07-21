---
status: current
module: type-registry-effect
category: architecture
created: 2026-03-12
updated: 2026-07-21
last-synced: 2026-07-21
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
4. [Module Layout](#module-layout)
5. [Domain Types](#domain-types)
6. [Error Model](#error-model)
7. [Services and Layers](#services-and-layers)
8. [Composition](#composition)
9. [TypeScript Environment Seam](#typescript-environment-seam)
10. [Public API](#public-api)
11. [Hardening](#hardening)
12. [Testing Strategy](#testing-strategy)
13. [Future Work](#future-work)
14. [Related Documentation](#related-documentation)

---

## Overview

`type-registry-effect` is an Effect v4 library for composing virtual TypeScript environments with automatic
package fetching, disk caching and version-aware type resolution. It targets Twoslash-style documentation
tooling and TypeScript language-service consumers.

The currency of the library is the `Vfs` — a `Map<string, string>` of `node_modules/<name>/<path>` keys to file
contents. Everything either produces a `Vfs` (`TypeRegistry`, `VirtualPackage`) or consumes one
(`TsEnvironment`).

### Design Principles

1. **Services, not floating functions** — `TypeRegistry` is a service you `yield*`, so consumers compose it
   directly instead of re-wrapping a namespace of free functions in a service of their own.
2. **`Context.Service` class form** — every service is a class extending `Context.Service<Self, Shape>()(id)`
   with a separate `*Shape` interface and layer statics on the class.
3. **Schema-backed typed errors** — failures are `Schema.TaggedErrorClass` types carrying structured fields
   (`status`, `kind`, `operation`) and a `Schema.Defect()` `cause`; nothing is flattened to a message string
   and nothing is classified by substring matching.
4. **Honest signatures** — per-method error unions stay precise; a total function does not declare an error
   channel it cannot raise, and absence is `Option.none()` rather than a fabricated fallback.
5. **Platform dependencies inside layers** — `FileSystem`, `Path` and `HttpClient` are layer requirements, never
   parameters in a service method signature.
6. **Bounded untrusted input** — CDN file trees and manifests are hostile data; every recursive walk, wildcard
   pattern, path join and download budget is capped (see [Hardening](#hardening)).

### Key Dependencies

Required peers — three, all of them things a consumer must be able to share a single copy of:

- **effect** `4.0.0-beta.99` — runtime, `Context`, `Layer`, `Schema`, `FileSystem`, `Path`, and
  `effect/unstable/http` for `HttpClient`
- **@effect/platform-node** — Node implementations of the platform services (test and consumer wiring)
- **@effected/store** — `Cache`, the SQLite-backed metadata plane with native TTL and prune

Optional peers — reachable only through a specific opt-in seam, so a consumer that never touches that seam
never installs them:

- **@effected/xdg** — `AppDirs`, XDG cache-directory resolution; only in `TypeCache.layerXdg`'s signature
- **@effected/tsconfig-json** — `CompilerOptions` (tsconfig JSON form) and `TsEnumCodec`, which converts
  JSON-form enum fields to the compiler's numeric enums; only reachable through `TsEnvironment`
- **@typescript/vfs** + **typescript** — loaded lazily and only by `TsEnvironment`

Bundled dependency:

- **@effected/semver** — `Range` / `SemVer` for local version resolution. A plain `dependencies` entry, not a
  peer: it is an implementation detail that never reaches the consumer (see
  [Why the install contract is three peers](#why-the-install-contract-is-three-peers)).

`src/` has no compile-time dependency on the `typescript` package. `TsEnvironment` types its
`compilerOptions` as `CompilerOptions.Type` from `@effected/tsconfig-json` and imports the compiler only as a
runtime value, so the public surface does not vary with the installed TypeScript.

The `typescript` **peer** stays `^6.0.3` and optional: TypeScript 7.x/tsgo is a native binary that ships no JS
compiler API, so a consumer calling `TsEnvironment.make` must supply a classic compiler at runtime. The **dev**
dependency is the shared catalog's `catalog:silk` (7.0.2, native tsc), which satisfies the `@savvy-web/bundler`
`^7` peer; the classic compiler needed by the `TsEnvironment` tests arrives through the dev-only npm alias
`typescript-classic` (`npm:typescript@^6.0.3`) and a Vitest `resolve.alias` — see
[Testing Strategy](#testing-strategy).

---

## Current State

The library is a complete Effect v4 rewrite of the v3 service/layer/error/schema split. The rewrite was
developed in the `spencerbeggs/effected` monorepo as `@effected/ts-vfs`, approved there, and transferred back
into this standalone repo.

### What Exists

- Flat module layout: one public concern per file in `src/`, with `src/internal/` for shared machinery.
- Three services — `TypeCache`, `PackageFetcher`, `TypeRegistry` — plus the opt-in `RegistryObserver`.
- Two static classes with no service ceremony: `TypeResolver` (pure resolution) and `TsEnvironment` (the
  `@typescript/vfs` seam).
- Local version resolution through `@effected/semver`, replacing v3's parsing of CDN error prose.
- Metadata caching on `@effected/store`'s `Cache` with native TTL, evict-on-read expiry and bulk prune.
- Typed progress events (`RegistryEvent` / `RegistryObserver`), opt-in and silent by default.
- Spans on every public operation via `Effect.fn("<Service>.<method>")` / `Effect.withSpan`.
- Test suites per module plus a self-gated live-CDN e2e suite: 88 passing, 1 skipped (the gated e2e).
- `.repos/effect-smol` vendored as a sparse, read-only git submodule pinned to `effect@4.0.0-beta.99` — the
  authority on what v4 actually exports, with the v3→v4 migration notes and the `@effect/vitest` reference
  implementation. Vendored from the main `Effect-TS/effect` monorepo since 2026-07-19, when `effect-smol` was
  archived and v4 development moved back; the layout is the same upstream, so the `.repos/` directory name is
  deliberately unchanged.

### What Changed from v3

- `src/errors/`, `src/layers/`, `src/services/`, `src/schemas/`, `src/platforms/node.ts`, `src/events.ts`,
  `src/metrics.ts` and `src/node.ts` are all deleted.
- The `./node` entry point is **gone**. Package exports are `.` and `./package.json`. There is no Promise
  convenience API and no pre-composed `NodeLayer`; consumers compose platform layers at the edge.
- The Effect Metrics module is gone — see `observability.md`.
- `Context.GenericTag` with interface/const merging is replaced by the `Context.Service` class form.
- `Data.TaggedError` is replaced by `Schema.TaggedErrorClass`.
- `savvy.build.ts` dropped the `ae-missing-release-tag` / `_d_exports` suppression: `src/index.ts` now uses flat
  named re-exports instead of `export * as`. The `ae-forgotten-export` / `_base` suppression stays, because the
  `Context.Service` and `Schema` class factories still synthesize anonymous base classes.

### What Is Not Implemented

- Browser platform support (no IndexedDB cache, no CDN lib-file environment).
- Circuit breaking, rate limiting and request deduplication for CDN traffic.
- Any published-compat contract with v3 on-disk or metadata layouts — nothing was published, so none is owed.

---

## Rationale

### Why a service instead of a namespace

v3 exposed `TypeRegistry` as a module of free functions returning `Effect<A, E, R>`. Every real consumer — the
rspress integration first among them — immediately wrapped that namespace in a service of its own so it could
be injected and mocked. Collapsing the cache, fetcher and resolver behind one `Context.Service` makes
`yield* TypeRegistry` the composition point and removes the wrapper consumers were writing anyway. Per-method
error unions stay precise, so nothing is lost to the facade.

### Why structured errors instead of message strings

v3 folded HTTP status into an error message and then substring-matched `"404"` back out of it;
`classifyLoadError` matched over stringified errors, and `VersionNotFoundError` was detected by matching CDN
error prose. Those are string contracts with a CDN. The v4 errors carry `status`, `kind` and `operation` as
structured fields with the underlying failure preserved in a `Schema.Defect()` `cause`, so `classify` in
`TypeRegistry.ts` branches on typed data only.

### Why pure statics for the resolver

`TypeResolver` in v3 was a service behind `Layer.succeed` over stateless functions, and it declared a
`ResolutionError` its total implementation could never raise. Both were ceremony. The v4 resolver is a class of
static pure functions with `Option` returns where the manifest genuinely offers no evidence.

### Why the optional peers are lazy

`typescript` and `@typescript/vfs` are heavy and irrelevant to consumers that only want a `Vfs`. `TsEnvironment`
is the only module that touches them and imports them inside `make`, so a missing peer is a typed
`TsEnvironmentError` rather than an import-time crash, and a consumer that never calls it never loads the
compiler.

The laziness is not a nicety, it is what makes the `optional` flag true. `index.ts` re-exports both
`TsEnvironment` and `TypeCache` statically, so ESM resolves the whole entry graph before any module body runs:
a static *value* import of an optional peer makes every consumer of the package entry point resolve it, and
omitting it yields `ERR_MODULE_NOT_FOUND` rather than the typed error the seam promises. That applies to
`@effected/xdg` in `TypeCache.layerXdg` exactly as it does to the `TsEnvironment` trio. `layerXdg` is the one
case where the import failure cannot surface as a typed error — `AppDirsError` is its own error channel, and
the class lives in the module that failed to load — so the failure is a defect. That is sound rather than a
compromise: `AppDirs` sits in the layer's `R` channel, and a consumer can only satisfy that requirement by
importing `@effected/xdg` themselves, so a caller who reaches `layerXdg` definitionally has the package.

Two properties of this trap are worth recording, because both defeat the obvious checks. Neither the build nor
the test suite catches an eager optional-peer import, since every optional peer is also a devDependency and so
always resolvable in-repo. And reading the source is not sufficient either — the question is what the *shipped*
module graph does. The check that actually settles it is a Node resolve hook that makes the peer unresolvable,
run against `dist/`, asserting that importing the entry point still succeeds.

Laziness at runtime is only half of it: the seam also carries no compile-time dependency on `typescript`.
Typing `compilerOptions` as `@effected/tsconfig-json`'s `CompilerOptions.Type` instead of `ts.CompilerOptions`
means the declarations this package emits never reference the compiler, so the published types build and
resolve whether or not a consumer has a classic TypeScript installed — and the repo itself can typecheck under
7.x/tsgo while the tests run against a 6.x compiler.

### Why the install contract is three peers

A dependency is a peer here for exactly one reason: **tag identity**. Effect resolves services by `Context.Key`
identity, so two copies of a package in the tree mint two distinct keys, and a consumer's layer silently fails
to satisfy this package's requirement — a wiring failure that reads as a type error about a requirement the
consumer believes it already provided. Peer-declaring the package makes the package manager dedupe it.

That test sorts the tree three ways:

- **Peer, required** — the type appears in the `R` channel of something every consumer must build. `Cache` is
  in the requirements of *both* `TypeCache` layer factories, so `@effected/store` is unavoidable and
  dedupe-critical.
- **Peer, optional** — same identity argument, but reachable only through one opt-in seam. `AppDirs` /
  `AppDirsError` appear only in `TypeCache.layerXdg`'s signature, so a consumer on
  `TypeCache.layer({ cacheDir })` never needs `@effected/xdg`; it stays a peer rather than becoming a
  dependency precisely because when it *is* used, the consumer supplies the `AppDirs` layer and the two copies
  would not match. `@effected/tsconfig-json` is the same shape behind `TsEnvironment`.
- **Plain dependency** — nothing of it reaches the consumer. `@effected/semver`'s `Range` / `SemVer` are used
  only inside the body of `TypeRegistry.resolveVersion`, which is typed
  `(name: string, ref: string) => Effect<string, FetchError | VersionNotFoundError>`: no semver type in the
  `R` channel, none in the return, and `Range.parse` failures are mapped to this package's own
  `VersionNotFoundError`. A second copy in the tree would be harmless, so making the consumer install it is
  cost with no contract behind it.

The net is a required peer set of three — `effect`, `@effect/platform-node`, `@effected/store` — down from
seven. The rule generalizes: **if it is in a signature, it is a peer; if it is only in a function body, it is a
dependency.** Before moving anything across that line, check whether its types appear in an exported signature.

---

## Module Layout

```text
src/
  index.ts              # flat named re-exports — the entire public surface
  PackageSpec.ts        # name@version identity, cache keys, specifier normalization
  Vfs.ts                # the Vfs type, mergeVfs, prefixVfs
  PackageFetcher.ts     # jsDelivr client service + FetchError/PackageNotFoundError/VersionNotFoundError
  TypeCache.ts          # two-plane cache service + TypeCacheMetadata/TypeCacheError
  TypeResolver.ts       # pure package.json -> declaration-file resolution + ResolvedModule
  TypeRegistry.ts       # the facade service + BatchLoadError
  RegistryEvent.ts      # the event union, the observer service, the internal emit helper
  TsEnvironment.ts      # the @typescript/vfs seam
  VirtualPackage.ts     # synthetic packages from local declarations
  internal/
    jsdelivr.ts         # CDN URLs and response schemas
    limits.ts           # hardening caps (nesting, wildcards, file/byte budgets)
    resolution.ts       # exports/typesVersions walking, path safety, wildcard compilation
```

---

## Domain Types

### PackageSpec

`Schema.Class` identifying a package at a version **reference** — exact, range or dist-tag — pinned later by
`TypeRegistry.resolveVersion`. Construct with `PackageSpec.make({ name, version })` or
`PackageSpec.fromString("zod@3.23.8")`; never `new`.

Both fields are pattern-checked to be single safe path segments (no separators, `@`, whitespace, or `:` / `?` /
`#`) so neither can escape a cache directory when joined into a path or truncate a CDN URL. Beyond that,
validation is deliberately lenient — the CDN serves every historical malformation npm ever published.

Statics: `fromString`, `normalizeSpecifier` (import specifier → package name, with `node:` and Node built-in
subpaths folding to `"node"`), `parseCacheKey`. Members: `toString()` (`name@version`) and `cacheKey`
(`@scope:name:version` or `name:version`).

### Vfs

```typescript
export type Vfs = Map<string, string>;
export type VirtualFileSystem = Vfs; // v3 alias kept for the consumer migration
```

`mergeVfs(...maps)` merges left to right, later entries winning. `prefixVfs(name, entries)` prefixes paths with
`node_modules/<name>/`.

### PackageManifest

A `Schema.Struct` in `PackageFetcher.ts` covering only the fields resolution reads, every one optional. It is
deliberately **not** `@effected/package-json`: that package validates strictly (branded names, SPDX licenses)
and these manifests come off a CDN. `exports` accepts a string, a conditions/subpath record, or a Node fallback
array — arrays are legal at the top level and nested.

### TypeCacheMetadata

`Schema.Class` of `version`, `cachedAt` (`DateTimeUtcFromString`) and optional `ttl` (`DurationFromMillis`),
stored JSON-encoded in the metadata plane. See `cache-optimization.md`.

### ResolvedModule

`Schema.Class` of `filePath` (relative, no `./`), `isTypeDefinition` and the owning `package`.

### VirtualPackage

`Schema.Class` producing a transient synthetic package — a generated `package.json` plus entry files — for
declarations you already have locally (API Extractor output, ambient declarations). Never persisted to the disk
cache. Deliberately subclass-friendly, because the rspress consumer extends it.

- `create(name, version, declarations)` — single `index.d.ts` entry, manifest uses `types`
- `createMultiEntry(name, version, entries)` — one `.d.ts` per entry, manifest uses an `exports` map
- `fromFile(name, version, filePath)` — reads through the `FileSystem` service; `PlatformError` surfaces typed
- `toVfs()` — the `Vfs`, keys prefixed `node_modules/<name>/`

An empty entry set, or entry names that collide after extension normalization, are wiring defects and throw.

---

## Error Model

Every failure is a `Schema.TaggedErrorClass` with a `message` getter derived from its fields.

| Error | Fields | Raised by |
| --- | --- | --- |
| `FetchError` | `url`, `status?`, `kind` (`transport` \| `status` \| `body` \| `schema`), `cause` | `PackageFetcher` |
| `PackageNotFoundError` | `name`, `version` | 404 promotion; `getPackageVfs` miss with `autoFetch: false` |
| `VersionNotFoundError` | `name`, `ref`, `available` (bounded sample) | `TypeRegistry.resolveVersion` |
| `TypeCacheError` | `operation`, `path`, `cause` | `TypeCache` |
| `BatchLoadError` | `failures: [{ name, version, error }]` | `TypeRegistry.getVfs` when **every** package fails |
| `TsEnvironmentError` | `cause` | `TsEnvironment.make`, including missing optional peers |

`cause` is always `Schema.Defect()`, so a `PlatformError`, the store's `CacheError` or a `SchemaError` is
preserved structurally rather than stringified. `BatchLoadError` replaces v3's abuse of `PackageNotFoundError`
for batch failure (comma-joined `name`, empty `version`).

The 404 → `PackageNotFoundError` promotion happens on the typed `FetchError.status` field, at the fetcher
boundary, via a single `promote404` helper.

---

## Services and Layers

### TypeCache

`Context.Service` at `type-registry-effect/TypeCache`. A two-plane cache: files on disk under
`<cacheDir>/<name>/<version>/`, metadata in `@effected/store`'s `Cache`. Methods: `exists`, `read`, `write`,
`writePackage`, `listFiles`, `readMetadata`, `writeMetadata`, `getVfs`, `remove`, `prune`. `writePackage` is the
atomic whole-package commit path (stage-then-`rename`) the registry uses; `write` is the low-level single-file
primitive that does not guard completeness. See `cache-optimization.md`.

Layer statics are **parameterized factories** — bind the built layer to a `const` and provide that, or two
provide sites mint two caches:

- `TypeCache.layer({ cacheDir })` — requires `Cache | FileSystem | Path`. A relative `cacheDir` is developer
  wiring and dies at layer construction.
- `TypeCache.layerXdg({ namespace? })` — requires `Cache | AppDirs | FileSystem | Path`, roots the cache at
  `<AppDirs cache>/<namespace>` (default `ts-vfs`) via `AppDirs.ensureCache`. A namespace that is not a single
  path component dies at construction.

This package never builds the store layer itself; the consumer provides `Cache.layerSqlite` (or `layerTest`).
See `cache-optimization.md`.

### PackageFetcher

`Context.Service` at `type-registry-effect/PackageFetcher`. The jsDelivr client. Methods: `getVersions`,
`getFileTree`, `downloadFile`, `getPackageJson`, `getTypeFiles`.

`PackageFetcher.layer` requires only `HttpClient`. Requests time out at 30 s; transport and timeout failures
retry up to 3 times with exponential back-off from 100 ms; non-2xx responses are not transient, fail fast with
a typed status, and emit a `FetchFailed` event with a body snippet. A second registry backend, if one ever
appears, arrives as another layer for this service — the service seam is the extension point.

### TypeRegistry

`Context.Service` at `type-registry-effect/TypeRegistry`, the facade. `TypeRegistry.layer` requires
`TypeCache | PackageFetcher`.

| Method | Result | Errors |
| --- | --- | --- |
| `hasCached(pkg)` | `boolean` | `TypeCacheError` |
| `fetchAndCache(pkg, { ttl? })` | `void` | `FetchError \| PackageNotFoundError \| TypeCacheError` |
| `getPackageVfs(pkg, options?)` | `Vfs` | `FetchError \| PackageNotFoundError \| TypeCacheError` |
| `getVfs(packages, options?)` | `Vfs` | `BatchLoadError` |
| `resolveImport(pkg, specifier)` | `Option<ResolvedModule>` | `TypeCacheError \| FetchError` |
| `getTypeEntries(pkg)` | `ReadonlyArray<ResolvedModule>` | `TypeCacheError \| FetchError` |
| `resolveVersion(name, ref)` | `string` | `FetchError \| VersionNotFoundError` |
| `clearCache(pkg)` | `void` | `TypeCacheError` |
| `pruneCache` | `CachePruneResult` | `TypeCacheError` |

`PackageVfsOptions` is `{ autoFetch?: boolean (default true); ttl?: Duration }`.

Two behaviours are load-bearing:

- **Commit serialization.** A `Semaphore` of 1 serializes the cache *commit* — `fetchAndCache`'s `writePackage` promotion plus its metadata write — together with `clearCache` and `pruneCache`, so a `clearCache` cannot land between a fetch's files and its metadata and strand live metadata with no files. The network fetches (`getPackageJson`, `getTypeFiles`) run *outside* the lock, so a concurrency-limited batch fetches uncached packages in parallel and only the fast local-disk commits serialize. A single global semaphore, not per-package keyed locks, is a deliberate choice. This guards fibers in *this* runtime only; cross-process races on a shared cache directory are out of scope, with the both-planes hit check as the backstop.
- **Best-effort batching.** `getVfs` loads at concurrency 5, accumulates per-package failures, emits
  `PackageLoadFailed` for each and merges the survivors. It fails — with a structured `BatchLoadError` — only
  when every package fails. An empty array yields an empty `Vfs`, not an error.

`resolveVersion` resolves locally: dist-tag through the CDN's tag map, then exact match against the published
list, then a `@effected/semver` range with `Range.maxSatisfying`. There is no CDN `/resolve` call and no error
prose to parse.

### TypeResolver

Not a service — a class of static pure functions over an already-fetched manifest. `resolveImport` walks
`exports` (`types`, then `import`/`default`, fallback arrays in order), then `typesVersions["*"]` (exact, then
bounded wildcards), then — for the root specifier only — top-level `types`/`typings`, returning `Option.none()`
when nothing offers evidence. `resolveMainEntry` is total by the documented `index.d.ts` convention floor.
`resolveTypeEntries` enumerates the main entry plus each non-wildcard `exports` subpath with a types condition,
deduplicated by path. `findTypeDefinition` maps a JS path to its declaration counterpart
(`.js` → `.d.ts`, `.mjs` → `.d.mts`, `.cjs` → `.d.cts`).

`RegistryObserver` is documented in `observability.md`.

---

## Composition

There is no pre-composed platform layer. Consumers compose at the edge, which is what makes the metadata plane
swappable in tests:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Cache } from "@effected/store";
import { Layer, Path } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { PackageFetcher, TypeCache, TypeRegistry } from "type-registry-effect";

const TypeCacheLayer = TypeCache.layerXdg(); // bind parameterized factories to a const

const AppLayer = TypeRegistry.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(TypeCacheLayer, PackageFetcher.layer)),
  Layer.provide(Layer.mergeAll(Cache.layerSqlite(...), NodeFileSystem.layer, Path.layer, FetchHttpClient.layer)),
);
```

Tests swap `Cache.layerSqlite` for `Cache.layerTest()` (`:memory:`) and `layerXdg` for
`TypeCache.layer({ cacheDir })` over a temp directory. No real database file is needed.

---

## TypeScript Environment Seam

`TsEnvironment.make({ vfs, compilerOptions, projectRoot? })` returns
`Effect<VirtualTypeScriptEnvironment, TsEnvironmentError>`. It lazily imports `typescript` and
`@typescript/vfs`, builds a system map from `createDefaultMapFromNodeModules` plus the `Vfs`, and calls
`createFSBackedSystem` + `createVirtualTypeScriptEnvironment`.

`compilerOptions` is `CompilerOptions.Type` — tsconfig JSON form, `{ target: "es2022" }` rather than
`ts.ScriptTarget.ES2022`. `TsEnumCodec.encodeCompilerOptions` converts the enum-valued fields to the compiler's
numeric enums inside `make`, which is the only place the two representations meet. This is what keeps
`TsEnvironmentOptions` free of `import type * as ts`: consumers author options as data, and the numeric
encoding is an implementation detail of the seam.

Three documented consequences:

- VFS paths are re-rooted under `projectRoot` (default `process.cwd()`, which v3 hardcoded). Bare
  `node_modules/…` keys do not resolve — probed against `@typescript/vfs` 1.6.x.
- The `lib.*.d.ts` directory is derived from the compiler module that actually loaded, via
  `ts.sys.getExecutingFilePath()`, and passed explicitly as `tsLibDirectory` to
  `createDefaultMapFromNodeModules` and `createFSBackedSystem`. The `@typescript/vfs` default resolves lib
  files through `require.resolve("typescript")`, which diverges from the loaded module when the classic
  compiler is installed under an npm alias. `sys` is reached structurally (optional chaining on an inline
  type) because the installed `typescript` declarations may be the native tsc's version-only stub, which
  types none of the compiler API the runtime module actually provides.
- `createDefaultMapFromNodeModules` and `createFSBackedSystem` read the real filesystem through TypeScript's own
  `sys`, outside the Effect `FileSystem` service. This is accepted and is why this module is the integrated-tier
  surface of the package.

There is no cache map: v3's `createTypeScriptCache` returned a one-entry `Map` keyed by
`JSON.stringify(compilerOptions)`. A consumer wanting keyed reuse holds its own map.
`VirtualTypeScriptEnvironment` is deliberately not re-exported — import the type from `@typescript/vfs`, which
consumers of this module already declare.

---

## Public API

`src/index.ts` is flat named re-exports and is the authoritative list. Grouped:

- **Identity and currency:** `PackageSpec`; `Vfs`, `VirtualFileSystem`, `mergeVfs`, `prefixVfs`
- **Services:** `TypeRegistry` / `TypeRegistryShape`, `TypeCache` / `TypeCacheShape`, `PackageFetcher` /
  `PackageFetcherShape`, `RegistryObserver` / `RegistryObserverShape`
- **Statics:** `TypeResolver`, `TsEnvironment`, `VirtualPackage`
- **Data:** `PackageManifest`, `PackageVersions`, `TypeCacheMetadata`, `ResolvedModule`, `RegistryEvent`,
  `CachePruneResult`, `PackageVfsOptions`, `TsEnvironmentOptions`
- **Errors:** `FetchError`, `PackageNotFoundError`, `VersionNotFoundError`, `TypeCacheError`, `BatchLoadError`,
  `TsEnvironmentError`

```typescript
import { Effect } from "effect";
import { PackageSpec, TypeRegistry } from "type-registry-effect";

const program = Effect.gen(function* () {
  const registry = yield* TypeRegistry;
  const version = yield* registry.resolveVersion("zod", "^3.23.0");
  return yield* registry.getVfs([PackageSpec.make({ name: "zod", version })]);
}).pipe(Effect.provide(AppLayer));
```

---

## Hardening

Every input from the CDN — file trees, manifests, `exports` and `typesVersions` maps — is untrusted. The caps
live in `src/internal/limits.ts` so every recursive surface imports the same constant:

- `MAX_NESTING_DEPTH` (256) — every recursive walk over untrusted collections.
- `MAX_WILDCARDS_PER_PATTERN` (1) — npm semantics use exactly one `*`; past the bound a pattern simply does not
  match, rather than compiling to a catastrophically backtracking regex.
- `MAX_TYPE_FILES_PER_PACKAGE` (5,000) and `MAX_TYPE_BYTES_PER_PACKAGE` (64 MiB) — the materialization budget.
  The file tree's declared sizes are pre-checked before a single download starts, with cumulative accounting of
  actual UTF-8 bytes as bodies land in case the declared sizes lie. Because the check runs after each body, the
  budget can transiently overshoot by at most concurrency × one body; full streaming enforcement is out of
  scope.

Path safety is enforced at both ends by `isSafeRelativePath`: absolute paths, Windows drive letters and `..`
segments are rejected before `TypeCache` joins a CDN tree path under the cache root, and before a manifest path
becomes a `ResolvedModule` that could reach a download URL. Untrusted keys are only read through
`Object.hasOwn`, and wildcard substitution builds results with `Object.create(null)` while skipping
`__proto__` / `constructor` / `prototype` — v3 had a live prototype-pollution defect here. `resolveVersion`
guards its dist-tag lookup the same way, so a `ref` of `"constructor"` cannot resolve to an inherited function.

---

## Testing Strategy

```text
__test__/
  PackageSpec.test.ts      TypeCache.test.ts      TypeRegistry.test.ts
  PackageFetcher.test.ts   TypeResolver.test.ts   VirtualPackage.test.ts
  RegistryEvent.test.ts    TsEnvironment.test.ts
  e2e/jsdelivr.e2e.test.ts
  fixtures/
```

One suite per public module, using `@effect/vitest` (`layer`, `it.effect`, `it.live`). Layer-based injection
throughout: `Cache.layerTest()` for the metadata plane, `TypeCache.layer({ cacheDir })` over a temp directory
for files, `FileSystem.layerNoop` to force IO failures into `TypeCacheError`, and `Layer.build` under
`Effect.exit` to assert that wiring defects (relative `cacheDir`, bad namespace) die.

`__test__/e2e/jsdelivr.e2e.test.ts` hits the live CDN and is self-gated behind `TS_VFS_E2E=1`, so CI never
depends on CDN availability.

The `TsEnvironment` suite needs a compiler with a JS API, which the catalog `typescript` (7.x, native tsc) is
not. `vitest.config.ts` therefore declares `resolve.alias` mapping `typescript` to the dev-only
`typescript-classic` alias package (`npm:typescript@^6.0.3`), so the repo builds and typechecks against the
catalog compiler while tests exercise the classic one. This aliasing is why `TsEnvironment.make` derives its
lib directory from the loaded module rather than trusting `require.resolve("typescript")`.

Vitest runs on forks (not threads) for Effect compatibility, with coverage thresholds of 80% lines/statements,
70% functions, 60% branches.

---

## Future Work

- **Browser platform.** An IndexedDB-backed `TypeCache` layer and a `TsEnvironment` variant using
  `createSystem` + `createDefaultMapFromCDN`, behind a `./browser` conditional export. The service seams are
  already in the right place; nothing in `TypeRegistry`, `PackageFetcher` or `TypeResolver` would change.
- **CDN resilience.** Circuit breaking, rate limiting, adaptive timeouts and request deduplication.
- **Streaming download budget.** Enforce `MAX_TYPE_BYTES_PER_PACKAGE` during body reads rather than after each
  body, removing the bounded overshoot.
- **Cross-process cache safety.** The mutation semaphore is per-runtime; a shared cache directory across
  processes has no lock.

---

## Related Documentation

- **Cache:** `./cache-optimization.md` — two-plane storage, metadata keys, TTL, staleness, prune and removal
  ordering
- **Observability:** `./observability.md` — the event channel, spans, fault tolerance
- **Package README:** `README.md`

### External References

- Effect v4 source (vendored, read-only): `.repos/effect-smol` @ `effect@4.0.0-beta.99` (checkout of
  `Effect-TS/effect`; directory name kept from the archived `effect-smol` repo)
- Effect documentation: <https://effect.website/>
- @typescript/vfs: <https://github.com/microsoft/TypeScript-Website/tree/v2/packages/typescript-vfs>
- jsDelivr API: <https://www.jsdelivr.com/docs/api>
