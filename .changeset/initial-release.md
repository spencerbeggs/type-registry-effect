---
"type-registry-effect": minor
---

## Features

Initial release of type-registry-effect as a first-class Effect library.

- Platform-agnostic architecture with `FileSystem` and `HttpClient` resolved within layers
- Three composable Effect services: `CacheService`, `PackageFetcher`, `TypeResolver`
- Namespace module pattern (`TypeRegistry.*`) for composable programs
- Disk-based caching with XDG Base Directory support and configurable TTL
- Type resolution from `package.json` exports, typesVersions, types/typings fields
- Structured logging via discriminated union `LogEventSchema`
- `VirtualPackage` utilities for synthetic type packages from local declarations
- Node.js convenience layer (`NodeLayer`) and Promise-returning wrappers via `type-registry-effect/node`
- Full TypeScript declaration bundling with dual entry points (`index`, `node`)
