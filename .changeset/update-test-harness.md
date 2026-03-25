---
"type-registry-effect": patch
---

## Dependencies

| Dependency | Type | Action | From | To |
| :--- | :--- | :--- | :--- | :--- |
| @savvy-web/vitest | devDependency | updated | 0.2.2 | 1.0.0 |
| @savvy-web/rslib-builder | devDependency | updated | 0.18.3 | 0.19.0 |
| @savvy-web/changesets | devDependency | updated | 0.5.3 | 0.6.0 |
| semver-effect | dependency | updated | 0.1.0 | 0.2.0 |
| @savvy-web/pnpm-plugin-silk | config | updated | 0.9.0 | 0.10.0 |

## Tests

Added branch coverage tests for `TypeResolverLive` to meet stricter coverage thresholds in `@savvy-web/vitest` v1.0.0 (branches: 60% → 75%).

## Build System

Simplified `vitest.config.ts` to use `VitestConfig.create()` zero-config defaults.
