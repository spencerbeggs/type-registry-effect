---
"type-registry-effect": major
---

## Breaking Changes

Ground-up rewrite on **Effect v4** (`4.0.0-beta.98`), replacing the Effect v3
implementation. Effect v3 is no longer supported.

- **`type-registry-effect/node` entry point removed.** There is now a single
  `.` export. `NodeLayer`, `createTypeScriptCache`, the `fetchAndCache`
  convenience wrapper, and the Promise-returning API are gone — consumers wire
  platform layers (for example `NodeHttpClient`, `NodeFileSystem` from
  `@effect/platform-node`) at the edge themselves. `./package.json` is now
  also an explicit export.
- **New flat public API.** `TypeRegistry` (facade: `getVfs`, `getPackageVfs`,
  `fetchAndCache`, `resolveVersion`, `clearCache`), `TypeCache` (two-plane
  cache with `layer({ cacheDir })` / `layerXdg({ namespace })` statics),
  `PackageFetcher`, `TypeResolver`, `TsEnvironment` (lazily loads the optional
  `typescript` / `@typescript/vfs` peers), `PackageSpec`, `Vfs` (`mergeVfs`,
  `prefixVfs`), `VirtualPackage`, and `RegistryEvent` / `RegistryObserver`.
  The v3 names `CacheService`, `CacheServiceLive`, `TypeRegistryLive`,
  `TypeResolverLive`, `TypeRegistryObserver`, and `NodeLayer` are gone.
- **Services are `Context.Service` classes** with namespaced tag IDs
  (`type-registry-effect/TypeCache`, `/TypeRegistry`, `/PackageFetcher`,
  `/RegistryObserver`), each paired with an exported `*Shape` interface.
  Layers are statics on the service class rather than separate exports.
- **Errors are `Schema.TaggedErrorClass`** (`FetchError`,
  `PackageNotFoundError`, `VersionNotFoundError`, `TypeCacheError`,
  `BatchLoadError`, `TsEnvironmentError`). The v3 `Data.TaggedError` error
  types and their `*Base` exports are gone.
- **Metrics module removed.** Observability is now the opt-in
  `RegistryObserver` / `RegistryEvent` channel — 11 typed event variants,
  silent by default — plus `Effect.fn` span tracing on service methods.
- **Hardening.** New input limits and path-safety checks
  (safe relative paths, prototype-pollution guards) reject malformed input as
  typed errors instead of failing unpredictably deeper in the pipeline.

## Dependencies

| Dependency               | Type           | Action  | From        | To              |
| ------------------------ | -------------- | ------- | ----------- | --------------- |
| `effect`                 | peerDependency | updated | ^3.21.4     | 4.0.0-beta.98   |
| `semver-effect`          | dependency     | removed | ^0.3.1      | —               |
| `xdg-effect`             | dependency     | removed | ^2.1.1      | —               |
| `@effected/semver`       | peerDependency | added   | —           | ^0.1.0          |
| `@effected/store`        | peerDependency | added   | —           | ^0.1.0          |
| `@effected/xdg`          | peerDependency | added   | —           | ^0.1.3          |
| `typescript`             | peerDependency | updated | ^7.0.2      | ^6.0.3          |
| `@effect/platform`       | peerDependency | removed | ^0.96.2     | —               |
| `@effect/sql`            | peerDependency | removed | ^0.51.1     | —               |
| `@effect/sql-sqlite-node`| peerDependency | removed | ^0.52.0     | —               |
| `@effect/platform-node`  | peerDependency | updated | ^0.107.0    | 4.0.0-beta.98   |

`typescript` is pinned to `^6.0.3` — tsgo 7.x lacks the compiler API
`TsEnvironment` needs. `typescript` and `@typescript/vfs` are now optional
peers: consumers that never call `TsEnvironment` don't need either installed.
