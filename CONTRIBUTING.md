# Contributing to type-registry-effect

Thanks for your interest in contributing. This document covers local setup, the development workflow, and the conventions the tooling enforces.

## Prerequisites

- Node.js >=24.11.0
- pnpm 11 (the repo pins an exact version through `packageManager`; run `corepack enable` to have it resolved automatically)

## Setup

```bash
git clone https://github.com/spencerbeggs/type-registry-effect.git
cd type-registry-effect
pnpm install
pnpm run build
pnpm run test
```

The repository vendors a read-only sparse submodule under `.repos/` pinning the Effect source at the version this package builds against. It is a reference for confirming what Effect actually exports; never edit it.

## Project structure

```text
type-registry-effect/
├── src/                  # Flat module layout, one public concern per file
│   └── internal/         # Non-public helpers
├── __test__/             # One test file per src/ module
│   └── e2e/              # Live-CDN suite, opt-in
├── docs/                 # User-facing documentation
├── lib/configs/          # Shared commitlint and lint-staged configs
└── savvy.build.ts        # Build entry point
```

## Scripts

| Script | Description |
| --- | --- |
| `pnpm run build` | Build both dev and prod outputs |
| `pnpm run test` | Run all tests |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with a coverage report |
| `pnpm run typecheck` | Type-check through Turbo |
| `pnpm run lint` | Check code with Biome |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run lint:md` | Lint markdown |

Run a single test file directly through Vitest:

```bash
pnpm vitest run __test__/TypeRegistry.test.ts
```

The end-to-end suite hits the live jsDelivr CDN and is skipped unless you opt in, so CI never depends on CDN availability:

```bash
TS_VFS_E2E=1 pnpm vitest run __test__/e2e/jsdelivr.e2e.test.ts
```

## Code conventions

The package is built on Effect v4 and does not accept v3 idioms.

- Services are `Context.Service` classes paired with an exported `*Shape` interface, with tag IDs namespaced `type-registry-effect/Name`.
- Errors are `Schema.TaggedErrorClass` classes carrying structured fields, with `cause` preserved rather than stringified.
- Layers are exposed as statics on the service class. Parameterized factories return a fresh layer per call, so bind the result to a const.
- This package builds no `FileSystem`, `Path`, `HttpClient` or `Cache` layer. Composition happens at the edge, in the consumer.
- Service methods are defined with `Effect.fn("Module.method")` so each opens a named span.
- Throwing calls such as `JSON.parse` are wrapped with `Effect.try` for typed failures.
- `src/index.ts` uses flat named re-exports, not namespace wrappers.

### Imports

```ts
// .js extensions on relative imports (ESM requirement)
import { PackageSpec } from "./PackageSpec.js";

// node: protocol for built-ins
import { tmpdir } from "node:os";

// separate type imports
import type { Vfs } from "./Vfs.js";
```

### TypeScript

Composite and incremental builds, strict mode, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`, targeting ES2025 with nodenext resolution.

## Tests

Vitest with `@effect/vitest`, running on forks rather than threads for Effect compatibility. Coverage uses the v8 provider with thresholds configured in `vitest.config.ts`.

Prefer swapping the metadata plane with an in-memory store layer over touching a real database file. New modules get a matching test file in `__test__/`.

## Commits

Commits must follow [Conventional Commits](https://conventionalcommits.org) and carry a DCO signoff. A `commit-msg` hook validates both, and a `pre-commit` hook runs lint-staged.

```text
feat: add version range resolution

Signed-off-by: Your Name <your.email@example.com>
```

Use `git commit -s` to add the signoff automatically.

## Changesets

User-visible changes need a changeset describing the change and its semver impact:

```bash
pnpm changeset
```

## Submitting changes

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes, with tests
3. Run `pnpm run test`, `pnpm run typecheck` and `pnpm run lint:fix`
4. Add a changeset if the change is user-visible
5. Commit with a conventional message and DCO signoff
6. Push and open a pull request

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
