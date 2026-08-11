---
"type-registry-effect": patch
---

## Bug Fixes

* `@effected/xdg` and `@effected/tsconfig-json` are now declared optional peers. Both are reachable only through a single opt-in seam — `TypeCache.layerXdg` and `TsEnvironment` respectively — and each already loads lazily behind a dynamic import, but the manifest declared them as required. Consumers who never use those seams no longer get unmet-peer warnings on install.

## Dependencies

| Dependency              | Type           | Action  | From           | To             |
| ----------------------- | -------------- | ------- | -------------- | -------------- |
| @effect/platform-node   | peerDependency | updated | 4.0.0-beta.101 | 4.0.0-beta.107 |
| @effected/semver        | peerDependency | updated | ^0.3.0         | ^0.4.0         |
| @effected/store         | peerDependency | updated | ^0.1.1         | ^0.2.0         |
| @effected/tsconfig-json | peerDependency | updated | ^0.4.0         | ^0.5.0         |
| @effected/xdg           | peerDependency | updated | ^0.1.7         | ^0.2.0         |
| effect                  | peerDependency | updated | 4.0.0-beta.101 | 4.0.0-beta.107 |
