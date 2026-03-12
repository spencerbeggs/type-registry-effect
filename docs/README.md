# type-registry-effect Documentation

## What This Library Does

type-registry-effect fetches TypeScript type definitions from the jsDelivr CDN, caches them to disk, resolves module imports from package.json exports and typesVersions fields, and builds virtual file systems (VFS) for use with @typescript/vfs and Twoslash. It is designed for documentation tooling that needs type-aware code samples.

The library exposes composable `Effect` programs -- not a class with methods. Every function returns an `Effect<A, E, R>` with typed errors and explicit service requirements that the TypeScript compiler enforces at build time.

## Who This Is For

- Documentation site authors who use Twoslash for interactive TypeScript code blocks
- Build tool developers who need to resolve and bundle type definitions
- TypeScript developers familiar with Effect who want composable, testable type-fetching programs
- TypeScript developers new to Effect who want a Node.js convenience API

## Guides

Step-by-step instructions for common tasks:

- [Getting Started](./guides/getting-started.md) -- Installation, peer dependencies, and three usage patterns
- [Caching](./guides/caching.md) -- Cache configuration, XDG directories, and CacheMetadata
- [Advanced Usage](./guides/advanced-usage.md) -- Custom layers, error handling, concurrent loading, and testing
- [Observability](./guides/observability.md) -- Event system (note: being redesigned for Effect logging)
- [Troubleshooting](./guides/troubleshooting.md) -- Peer dependency mismatches, missing layers, and typed errors

## Architecture

Understanding the service and layer design:

- [Architecture Overview](./architecture/overview.md) -- Service/Layer diagram, platform abstraction, and type-level dependency enforcement

## Quick Reference

| Entry Point | What It Provides |
| --- | --- |
| `type-registry-effect` | Platform-agnostic Effect programs, schemas, errors, services, layers |
| `type-registry-effect/node` | `NodeLayer` (Node.js platform layer) and Promise convenience API |
