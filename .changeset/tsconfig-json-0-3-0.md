---
"type-registry-effect": patch
---

## Refactoring

* Now compatible with `@effected/tsconfig-json` `0.3.0`: its `TsEnumCodec.encodeCompilerOptions` returns a structural `ProgrammaticCompilerOptions` type, so `TsEnvironment.make` drops the workaround cast to `@typescript/vfs`'s parameter type. The optional peer range widens from `^0.2.7` to `^0.2.7 || ^0.3.0`; the change is types-only, so `0.2.7` still resolves at runtime.
