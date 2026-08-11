# type-registry-effect

This repository is the workspace for [`type-registry-effect`](package/), an Effect library that fetches TypeScript declaration files from npm through the jsDelivr CDN, caches them on disk and assembles them into virtual file systems for `@typescript/vfs` and Twoslash. The published package lives in `package/`; the repository root is a private pnpm workspace that holds the shared toolchain (Biome, Turbo, Vitest, the commit hooks) and the community files.

## Packages

| Package | npm | Description |
| --- | --- | --- |
| [`type-registry-effect`](package/) | [![npm](https://img.shields.io/npm/v/type-registry-effect?label=npm&color=cb3837)](https://www.npmjs.com/package/type-registry-effect) | Fetch, cache and resolve npm type definitions as an Effect service, and build `@typescript/vfs` environments over the result. |

[`package/README.md`](package/README.md) is the canonical user-facing document. It covers the peer dependency contract, the quick start and the full list of exported services.

## Install

```bash
npm install type-registry-effect effect @effect/platform-node @effected/store @effected/semver
# or
pnpm add type-registry-effect effect @effect/platform-node @effected/store @effected/semver
```

`effect`, `@effect/platform-node`, `@effected/store` and `@effected/semver` are required peers. The optional peers, and the reasoning behind the split, are in the [package README](package/README.md).

## Documentation

The user-facing documentation ships with the package under [`package/docs/`](package/docs/):

- [Getting started](package/docs/01-getting-started.md) — install, peer dependencies, and the edge-wiring recipes for temporary and XDG-rooted caches.
- [Caching](package/docs/02-caching.md) — the two-plane cache, TTL and the stale-vs-miss ladder, pruning, and choosing a cache root.
- [Observability](package/docs/03-observability.md) — the `RegistryEvent` catalogue, wiring an observer, and the tracing spans each method opens.
- [Architecture](package/docs/04-architecture.md) — how the services compose, why composition happens at the edge, and the error model.
- [API reference](package/docs/05-api-reference.md) — every exported service, schema, helper and error.
- [Troubleshooting](package/docs/06-troubleshooting.md) — missing services, optional peers, cache permissions and CDN failures.

## Requirements

- Node.js >=24.11.0
- pnpm, at the exact version pinned in `packageManager` — run `corepack enable` and it is resolved for you

## Development

Every script below runs from the repository root and covers the whole workspace.

```bash
pnpm install
```

| Script | Description |
| --- | --- |
| `pnpm build` | Build the dev and prod outputs through Turbo |
| `pnpm test` | Run the test suite |
| `pnpm test:watch` | Run the test suite in watch mode |
| `pnpm test:coverage` | Run the test suite with a coverage report |
| `pnpm typecheck` | Type-check every workspace package through Turbo |
| `pnpm lint` | Check code with Biome |
| `pnpm lint:fix` | Apply Biome's safe fixes |
| `pnpm lint:md` | Lint markdown |

## Contributing

Local setup, the code conventions this package enforces and the commit format are documented in [CONTRIBUTING.md](CONTRIBUTING.md). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, follow [SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

[MIT](LICENSE)
