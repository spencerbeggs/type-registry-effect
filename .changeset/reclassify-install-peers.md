---
"type-registry-effect": minor
---

## Dependencies

| Dependency                | Type           | Action  | From   | To     |
| ------------------------- | -------------- | ------- | ------ | ------ |
| `@effected/semver`        | peerDependency | removed | ^0.1.0 | —      |
| `@effected/semver`        | dependency     | added   | —      | ^0.1.1 |
| `@effected/xdg`           | peerDependency | updated | ^0.1.3 | ^0.1.3 |
| `@effected/tsconfig-json` | peerDependency | updated | ^0.2.3 | ^0.2.3 |

## Maintenance

Shrunk the required install contract from seven peers to three: `effect`,
`@effect/platform-node`, and `@effected/store`.

- **`@effected/semver` is no longer a peer.** It moved to a regular
  `dependencies` entry (`^0.1.1`) — `Range`/`SemVer` are used only inside
  `TypeRegistry.resolveVersion`'s body and never appear in an exported
  signature, so consumers no longer install it themselves.
- **`@effected/xdg` and `@effected/tsconfig-json` are now optional peers**
  (`peerDependenciesMeta` gains `optional: true` for both; their required
  version ranges are unchanged). `AppDirs`/`AppDirsError` appear only in
  `TypeCache.layerXdg`'s signature, and `CompilerOptions`/`TsEnumCodec` only
  through `TsEnvironment.make`. A consumer on `TypeCache.layer({ cacheDir })`
  who never touches `TsEnvironment` no longer needs either installed.
- **`@effected/store` remains a required peer** — `Cache` sits in the `R`
  channel of both `TypeCache` layer factories, so a duplicate copy would mint
  a second `Context` tag identity and break layer resolution.

Existing consumers who keep all seven packages installed see no behavior
change.

## Bug Fixes

- `src/TsEnvironment.ts` now loads `@effected/tsconfig-json` lazily, inside
  the same dynamic `Promise.all` as the `typescript` and `@typescript/vfs`
  peers, instead of as a static value import. Because `index.ts` re-exports
  `TsEnvironment` statically, the eager import would have made omitting the
  now-optional `@effected/tsconfig-json` peer throw `ERR_MODULE_NOT_FOUND` on
  package import instead of surfacing a typed `TsEnvironmentError` from
  `TsEnvironment.make`.
