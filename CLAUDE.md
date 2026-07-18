# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

type-registry-effect is an Effect-TS library that fetches, caches, and resolves
TypeScript type definitions from npm packages via the jsDelivr CDN. It produces
virtual file systems (VFS) compatible with @typescript/vfs and Twoslash for
documentation tooling that needs type-aware code samples.

Built on **Effect v4** (`4.0.0-beta.98`). Do not apply v3 idioms — see Patterns.

## Design Documentation

- `@./.claude/design/type-registry-effect/architecture.md` — flat module layout, `Context.Service` services and `*Shape` interfaces, `Schema.TaggedErrorClass` error model, edge-wired composition, `TsEnvironment` seam, hardening limits
- `@./.claude/design/type-registry-effect/cache-optimization.md` — two-plane cache (`@effected/store` `Cache` metadata + on-disk files), `TypeCache.layer` / `layerXdg`, stale-vs-miss ladder, prune vs remove, `Cache.layerTest()` testing
- `@./.claude/design/type-registry-effect/observability.md` — opt-in `RegistryObserver` / `RegistryEvent` channel (silent by default), 11-variant event catalogue, `Effect.fn` span tracing, fault tolerance

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:md           # Lint markdown
pnpm run typecheck         # Type-check via Turbo (tsc --noEmit)
pnpm run test              # Run all tests
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with coverage report
```

### Building

```bash
pnpm run build             # Build all outputs (dev + prod)
pnpm run build:dev         # Build development output only
pnpm run build:prod        # Build production/npm output only
```

### Running a Single Test

```bash
pnpm vitest run __test__/TypeRegistry.test.ts

# E2E suite hits live jsDelivr and is skipped unless opted in
TS_VFS_E2E=1 pnpm vitest run __test__/e2e/jsdelivr.e2e.test.ts
```

## Architecture

### Single-Package Library

- **Source**: `src/` — flat module layout, one public concern per file
- **Tests**: `__test__/` — one test file per `src/` module
- **Build**: `@savvy-web/bundler` via `savvy.build.ts`, dual output
  (`dist/dev/`, `dist/npm/`); publishes from `dist/dev/pkg`
- **Shared Configs**: `lib/configs/` (commitlint, lint-staged)

### Key Modules

- `src/TypeRegistry.ts` — `TypeRegistry` service, the facade over cache +
  fetcher (`getVfs`, `getPackageVfs`, `fetchAndCache`, `resolveVersion`,
  `clearCache`)
- `src/TypeCache.ts` — `TypeCache` service, two-plane cache with
  `layer({ cacheDir })` and `layerXdg({ namespace })` statics
- `src/PackageFetcher.ts` — `PackageFetcher` service, jsDelivr-backed; requires
  `HttpClient`
- `src/RegistryEvent.ts` — `RegistryEvent` schema union + `RegistryObserver`
  service with `layerCallback`
- `src/TypeResolver.ts` — static resolution helpers over `PackageManifest`
- `src/TsEnvironment.ts` — the only module touching the optional `typescript` /
  `@typescript/vfs` peers, loaded lazily inside `TsEnvironment.make`
- `src/PackageSpec.ts`, `src/Vfs.ts`, `src/VirtualPackage.ts` — domain types and
  VFS helpers (`mergeVfs`, `prefixVfs`)
- `src/internal/` — non-public: `jsdelivr.ts` (URLs, response schemas),
  `resolution.ts` (path/exports logic), `limits.ts` (hardening constants)

### Entry Points

Exports are `.` (`src/index.ts`) and `./package.json` only. There is **no**
`./node` entry point — consumers wire platform layers at the edge.

### Patterns

- **Services**: `Context.Service<Self, Shape>()("type-registry-effect/Name")`
  class form, paired with an exported `*Shape` interface. Tag IDs are namespaced
  (`type-registry-effect/TypeCache`, `/TypeRegistry`, `/PackageFetcher`,
  `/RegistryObserver`). Do NOT reintroduce v3's `Context.GenericTag`
  interface/const merging.
- **Errors**: `Schema.TaggedErrorClass<Self>()("Name", { ...fields })`. No
  `Data.TaggedError`, no `*Base` exports.
- **Layers**: exposed as statics on the service class (`TypeRegistry.layer`,
  `PackageFetcher.layer`, `TypeCache.layer`/`layerXdg`). Parameterized factories
  return a fresh layer per call — bind to a `const` and provide that, or two
  provide sites mint two caches.
- **Composition happens at the edge**: this package never builds
  `FileSystem`/`Path`/`HttpClient`/`Cache` layers. Consumers provide them (see
  `__test__/e2e/jsdelivr.e2e.test.ts` for the canonical wiring).
- **index.ts uses flat named re-exports** — no `export * as X` namespace
  wrappers. `savvy.build.ts` suppresses only `ae-forgotten-export` for the
  `_base` pattern (Effect's synthesized intermediate classes); the former
  `_d_exports` suppression is gone and should not return.
- **Tracing**: service methods are defined with `Effect.fn("Module.method")`;
  keep new methods consistent.
- `JSON.parse` and other throwing calls wrapped with `Effect.try` for typed
  failures.

### Effect v4 Source Authority

`.repos/effect-smol` is a read-only sparse submodule pinned to
`effect@4.0.0-beta.98` (manifest: `.repos/config.json`). Consult it — including
`MIGRATION.md` and `migration/` — to confirm what v4 actually exports before
guessing or porting v3 idioms. Never edit it.

### Dependencies

- `effect` and `@effect/platform-node` come from the `effect` / `effectPeers`
  pnpm catalogs
- `@effected/semver`, `@effected/store`, `@effected/xdg` (replaced v3's
  `semver-effect` / `xdg-effect`)
- `typescript` pinned to `^6.0.3` — tsgo 7.x lacks the compiler API
  `TsEnvironment` needs
- `typescript` and `@typescript/vfs` are **optional** peers

### Code Quality

- **Biome**: Unified linting and formatting
- **Commitlint**: Enforces conventional commits with DCO signoff
- **Husky Hooks**: `pre-commit` (lint-staged), `commit-msg` (commitlint)

### TypeScript Configuration

- Extends `@savvy-web/bundler/tsconfig/ecma.json`
- Composite + incremental, strict, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`
- Target ES2025, `module`/`moduleResolution` nodenext
- Import extensions required (`.js` for ESM)

### Testing

- **Framework**: Vitest with `@effect/vitest` and `@vitest-agent/plugin`
- **Pool**: Uses forks (not threads) for Effect-TS compatibility
- **Coverage**: v8 provider; thresholds come from
  `AgentPlugin.COVERAGE_LEVELS.standard` in `vitest.config.ts`
- **E2E**: `__test__/e2e/` gated behind `TS_VFS_E2E=1`; hits live jsDelivr
- Swap the metadata plane with `Cache.layerTest()` instead of touching a real
  database file

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins
- Separate type imports: `import type { Foo } from './bar.js'`

### Commits

All commits require:

1. Conventional commit format (feat, fix, chore, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`

### Publishing

Packages publish to both GitHub Packages and npm with provenance.
