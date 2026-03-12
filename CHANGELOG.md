# type-registry-effect

## 0.1.0

### Features

* [`97877fe`](https://github.com/spencerbeggs/pnpm-module-template/commit/97877fe11ced82a0fe7bfc621a79e6b1ea3403b0) Initial release of type-registry-effect as a first-class Effect library.

- Platform-agnostic architecture with `FileSystem` and `HttpClient` resolved within layers
- Three composable Effect services: `CacheService`, `PackageFetcher`, `TypeResolver`
- Namespace module pattern (`TypeRegistry.*`) for composable programs
- Disk-based caching with XDG Base Directory support and configurable TTL
- Type resolution from `package.json` exports, typesVersions, types/typings fields
- Structured logging via discriminated union `LogEventSchema`
- `VirtualPackage` utilities for synthetic type packages from local declarations
- Node.js convenience layer (`NodeLayer`) and Promise-returning wrappers via `type-registry-effect/node`
- Full TypeScript declaration bundling with dual entry points (`index`, `node`)
