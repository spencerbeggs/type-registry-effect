# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

type-registry-effect is an Effect-TS library that fetches, caches, and resolves
TypeScript type definitions from npm packages via the jsDelivr CDN. It produces
virtual file systems (VFS) compatible with @typescript/vfs and Twoslash for
documentation tooling that needs type-aware code samples.

## Design Documentation

- `@./.claude/design/type-registry-effect/architecture.md` — service/layer architecture, service tag patterns, `TypeRegistryObserver`, platform abstraction, layer requirements
- `@./.claude/design/type-registry-effect/cache-optimization.md` — SQLite metadata store (xdg-effect `SqliteCache`), friendly on-disk tree, TTL/staleness, `prune` vs `remove`
- `@./.claude/design/type-registry-effect/observability.md` — opt-in `TypeRegistryObserver` / `RegistryEvent` channel (silent by default), metrics, fault tolerance

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run typecheck         # Type-check via Turbo
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
# Run a specific test file
pnpm vitest run __test__/TypeRegistry.unit.test.ts

# Run integration tests only
pnpm vitest run __test__/TypeRegistry.integration.test.ts
```

## Architecture

### Single-Package Library

- **Source**: `src/` — all library code
- **Tests**: `__test__/` — mirrors `src/` structure
- **Build**: Rslib with dual output (`dist/dev/`, `dist/npm/`)
- **Shared Configs**: `lib/configs/` (Biome, commitlint, lint-staged, etc.)

### Key Modules

- `src/TypeRegistry.ts` — namespace module with composable Effect programs
- `src/VirtualPackage.ts` — synthetic type packages from local declarations
- `src/services/` — service interfaces (`CacheService`, `PackageFetcher`, `TypeResolver`, `TypeRegistryObserver`); most use `Context.GenericTag` with interface/const merging
- `src/layers/` — live implementations (`CacheServiceLive`,
  `PackageFetcherLive`, `TypeResolverLive`, `TypeRegistryLive`)
- `src/schemas/` — Effect Schema types (`PackageSpec`, `CacheMetadata`,
  `PackageJson`, `FileTree`, `ResolvedModule`)
- `src/errors/` — `Data.TaggedError` types with `*Base` exports for DTS
  bundling
- `src/platforms/node.ts` — `NodeLayer` and Promise convenience wrappers

### Entry Points

- `type-registry-effect` (`src/index.ts`) — platform-agnostic Effect programs
- `type-registry-effect/node` (`src/node.ts`) — Node.js layer + Promise API

### Patterns

- Services use `Context.GenericTag` with interface/const declaration merging to avoid `_base` forgotten exports in DTS bundling. Exception: `TypeRegistryObserver` uses `Context.Tag` (it carries no DTS-bundled `*Base` value)
- `CacheMetadata` uses `Schema.Struct` with manual interface (not
  `Schema.Class`) for the same reason
- Error types use `Data.TaggedError` with exported `*Base` constants
- `src/index.ts` re-exports `TypeRegistry` and `VirtualPackage` via hand-written `export namespace` declarations with one `export import Member = Module.Member` alias per member — never `export * as` (the DTS bundler synthesizes a comment-less `X_d_exports` wrapper that cannot carry a TSDoc release tag, causing ae-missing-release-tag; a real namespace declaration preserves its `@public` tag)
- When adding an export to `src/TypeRegistry.ts` or `src/VirtualPackage.ts`, add a matching `export import` alias to the corresponding namespace in `src/index.ts`, or the member is silently missing from the public API
- Platform deps (`FileSystem`, `HttpClient`) resolved within layers, not in
  service interfaces
- `JSON.parse` calls wrapped with `Effect.try` for typed `ParseError`

### Code Quality

- **Biome**: Unified linting and formatting
- **Commitlint**: Enforces conventional commits with DCO signoff
- **Husky Hooks**:
  - `pre-commit`: Runs lint-staged
  - `commit-msg`: Validates commit message format
  - `pre-push`: Runs tests for affected files

### TypeScript Configuration

- Composite builds with project references
- Strict mode enabled
- ES2022/ES2023 targets
- Import extensions required (`.js` for ESM)

### Testing

- **Framework**: Vitest with v8 coverage
- **Pool**: Uses forks (not threads) for Effect-TS compatibility
- **Config**: `vitest.config.ts` with coverage thresholds (80% lines/statements,
  70% functions, 60% branches)

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
