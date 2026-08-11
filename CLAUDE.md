# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

type-registry-effect is an Effect-TS library that fetches, caches, and resolves
TypeScript type definitions from npm packages via the jsDelivr CDN. It produces
virtual file systems (VFS) compatible with @typescript/vfs and Twoslash for
documentation tooling that needs type-aware code samples.

Built on **Effect v4** (`4.0.0-beta.107`). Do not apply v3 idioms — see
Patterns.

## Design Documentation

- `@./.claude/design/type-registry-effect/architecture.md` — flat module layout, `Context.Service` services and `*Shape` interfaces, `Schema.TaggedError` error model, edge-wired composition, `TsEnvironment` seam, hardening limits, why the install contract is four peers
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
pnpm run build             # Turbo: build:dev + build:prod in package/
```

`build:dev`, `build:prod` and `types:check` are **package** scripts
(`package/package.json`), not root scripts. Invoke them through Turbo from the
root (`pnpm run build`, `pnpm run typecheck`) or run them inside `package/`.

### Running a Single Test

Vitest config and setup stay at the root and discover `package/__test__/**`, so
run these from the repo root:

```bash
pnpm vitest run package/__test__/TypeRegistry.test.ts

# E2E suite hits live jsDelivr and is skipped unless opted in
TS_VFS_E2E=1 pnpm vitest run package/__test__/e2e/jsdelivr.e2e.test.ts
```

## Architecture

### Workspace Root + One Package

- **Workspace root**: private and never published
  (`@spencerbeggs/type-registry-effect`, `0.0.0`, `private: true`). Holds only
  the shared toolchain devDependencies
  (`@savvy-web/silk`, `@vitest-agent/plugin`), `lib/configs/` (commitlint,
  lint-staged, markdownlint), `biome.jsonc`, `turbo.json`, `vitest.config.ts`,
  `vitest.setup.ts`, `tsconfig.json`, and the community files.
  `pnpm-workspace.yaml` lists exactly one member: `package`.
- **Published package**: `package/` — `type-registry-effect` (2.3.2), the only
  publishable workspace member. Everything below is relative to it.
- **Source**: `package/src/` — flat module layout, one public concern per file
- **Tests**: `package/__test__/` — one test file per `src/` module
- **User docs**: `package/docs/`
- **Build**: `@savvy-web/bundler` via `package/savvy.build.ts`, dual output
  (`package/dist/dev/`, `package/dist/prod/`)

**Why the split** (do not undo it): the `@vitest-agent/*` toolchain packages pin
`effect` `4.0.0-beta.101` as an exact **direct** dependency, while the library
needs `4.0.0-beta.107`. Every `@effected/*` package declares `effect` as a
**peer**, and peers resolve from the importer's scope — so with the toolchain
and the library in one closure, `@effected/*` artifacts built for one beta were
handed the other beta's core and threw `Schema.TaggedErrorClass is not a
function` (or its mirror, `Schema.TaggedError is not a function`) at import.
Toolchain at the root, library in `package/` puts them in separate resolution
scopes. pnpm's cross-closure peer warnings are expected and cosmetic — do NOT
"fix" them with `overrides:`, a `.pnpmfile.cjs` retarget, or `pnpm patch` shims;
that reintroduces the crash.

### Key Modules

- `package/src/TypeRegistry.ts` — `TypeRegistry` service, the facade over cache
  and fetcher (`getVfs`, `getPackageVfs`, `fetchAndCache`, `resolveVersion`,
  `clearCache`)
- `package/src/TypeCache.ts` — `TypeCache` service, two-plane cache with
  `layer({ cacheDir })` and `layerXdg({ namespace })` statics
- `package/src/PackageFetcher.ts` — `PackageFetcher` service, jsDelivr-backed;
  requires `HttpClient`
- `package/src/RegistryEvent.ts` — `RegistryEvent` schema union +
  `RegistryObserver` service with `layerCallback`
- `package/src/TypeResolver.ts` — static resolution helpers over
  `PackageManifest`
- `package/src/TsEnvironment.ts` — touches the optional `typescript` /
  `@typescript/vfs` / `@effected/tsconfig-json` peers. All three load lazily in
  one `Promise.all` inside `TsEnvironment.make`.

**Optional-peer import invariant** (applies to every optional peer, in every
module): keep the runtime values behind a dynamic `import()`. `index.ts`
re-exports `TsEnvironment` and `TypeCache` statically, so a static *value*
import makes every entry-point consumer resolve the peer eagerly and turns an
omitted optional peer into `ERR_MODULE_NOT_FOUND` on
`import("type-registry-effect")` — even for consumers who never touch the seam
that needs it. Type-only imports are fine; they erase. The two live sites are
`TsEnvironment.make` (`Promise.all`) and `TypeCache.layerXdg`
(`@effected/xdg`). Verify with a Node resolve hook that makes the peer
unresolvable, not by reading source — the build and tests will not catch it,
because every optional peer is also a devDependency.

- `package/src/PackageSpec.ts`, `package/src/Vfs.ts`,
  `package/src/VirtualPackage.ts` — domain types and VFS helpers (`mergeVfs`,
  `prefixVfs`)
- `package/src/internal/` — non-public: `jsdelivr.ts` (URLs, response
  schemas), `resolution.ts` (path/exports logic), `limits.ts` (hardening
  constants)

### Entry Points

Exports are `.` (`package/src/index.ts`) and `./package.json` only. There is
**no** `./node` entry point — consumers wire platform layers at the edge.

### Patterns

- **Services**: `Context.Service<Self, Shape>()("type-registry-effect/Name")`
  class form, paired with an exported `*Shape` interface. Tag IDs are namespaced
  (`type-registry-effect/TypeCache`, `/TypeRegistry`, `/PackageFetcher`,
  `/RegistryObserver`). Do NOT reintroduce v3's `Context.GenericTag`
  interface/const merging.
- **Errors**: `Schema.TaggedError<Self>()("Name", { ...fields })`. No
  `Data.TaggedError`, no `*Base` exports. beta.107 renamed
  `Schema.TaggedErrorClass` back to `Schema.TaggedError` — identical curried
  shape; the old name throws `TaggedErrorClass is not a function` at import.
- **Layers**: exposed as statics on the service class (`TypeRegistry.layer`,
  `PackageFetcher.layer`, `TypeCache.layer`/`layerXdg`). Parameterized factories
  return a fresh layer per call — bind to a `const` and provide that, or two
  provide sites mint two caches.
- **Composition happens at the edge**: this package never builds
  `FileSystem`/`Path`/`HttpClient`/`Cache` layers. Consumers provide them (see
  `package/__test__/e2e/jsdelivr.e2e.test.ts` for the canonical wiring).
- **index.ts uses flat named re-exports** — no `export * as X` namespace
  wrappers. `package/savvy.build.ts` suppresses only `ae-forgotten-export` for
  the `_base` pattern (Effect's synthesized intermediate classes); the former
  `_d_exports` suppression is gone and should not return.
- **Tracing**: service methods are defined with `Effect.fn("Module.method")`;
  keep new methods consistent.
- `JSON.parse` and other throwing calls wrapped with `Effect.try` for typed
  failures.

### Effect v4 Source Authority

`.repos/effect` is a read-only sparse submodule pinned to
`effect@4.0.0-beta.107` (manifest: `.repos/config.json`). Consult it —
including `MIGRATION.md`, `migration/`, and `packages/vitest` for the
`@effect/vitest` reference implementation — to confirm what v4 actually exports
before guessing or porting v3 idioms. Never edit it.

It vendors the main **Effect-TS/effect** monorepo, not effect-smol: v4
development moved back there on 2026-07-19 when effect-smol was archived, and
the layout is unchanged. The directory was renamed from `effect-smol` to
`effect` precisely so the archived project's name does not mislead agents.
Services and tags live in `Context.ts`; there is no `ServiceMap.ts`. Keep the
pin matching the installed `effect`; on any disagreement `node_modules` wins.

### Dependencies

Classification is two-tier. Apply **both**, in order, before adding anything.

1. **Resolution safety decides peer vs dependency.** Anything that itself
   declares `effect` as a peer must be a peer here — never a `dependencies`
   entry. Every `@effected/*` package exact-pins `effect`. A `dependencies`
   entry creates a second, nested resolution site for that peer, which can
   resolve to a different `effect` beta than the consumer's and strand the
   artifact at import (`Schema.TaggedErrorClass is not a function`). A peer —
   required *or* optional — resolves in the consumer's single closure instead.
   Optionality does not create a second site; it only means the consumer need
   not install it.
2. **Then the signature rule decides required vs optional**: if it appears in
   an exported signature it is required; if it is reachable only through one
   opt-in seam it is optional.

- **Required peers (four)**: `effect`, `@effect/platform-node` (both
  `catalog:effect:peers`), `@effected/store`, and `@effected/semver`. `Cache`
  from `@effected/store` sits in the `R` channel of both `TypeCache` layer
  factories, so it must stay a peer — a duplicate copy mints a second `Context`
  tag identity and layer resolution silently fails. `@effected/semver` is used
  only inside the body of `TypeRegistry.resolveVersion` and in no exported
  signature, so rule 2 alone would make it a dependency; rule 1 overrides and
  keeps it a peer.
- **Optional peers (four)**: `@effected/xdg` (only in `TypeCache.layerXdg`'s
  signature), `@effected/tsconfig-json` (only in `TsEnvironmentOptions`),
  `@typescript/vfs`, and `typescript`. Each is reachable only through one
  opt-in seam. Do not add an optional peer without confirming its module load
  is lazy — see the optional-peer import invariant above.
- **No `dependencies` entries.** The published manifest ships none.
- `@effected/tsconfig-json` supplies `CompilerOptions` and `TsEnumCodec`.
  `TsEnvironmentOptions.compilerOptions` is `CompilerOptions.Type` — tsconfig
  JSON form (`{ target: "es2022" }`), converted to the compiler's numeric enums
  internally via `TsEnumCodec.encodeCompilerOptions`. The `CompilerOptions`
  import is type-only; `TsEnumCodec` is a runtime value and must stay lazy.
  `package/src/` and `package/__test__/` have **no** compile-time dependency on
  the `typescript` package.
- Dev `typescript` is `catalog:build` (7.0.2, native tsc) — what `types:check`
  runs. TS 7 ships no JS compiler API, so the classic compiler arrives as the
  dev-only npm alias `typescript-classic` (`npm:typescript@^6.0.3`), wired into
  tests by vitest `resolve.alias` (`typescript` → `typescript-classic`). The
  `typescript` peer stays `^6.0.3` and optional — runtime-only, for consumers
  calling `TsEnvironment.make`.

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
  `AgentPlugin.COVERAGE_LEVELS.standard`, `coverageTargets` from `strict` (see
  `vitest.config.ts`)
- **E2E**: `package/__test__/e2e/` gated behind `TS_VFS_E2E=1`; hits live
  jsDelivr
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
