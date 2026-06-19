---
"type-registry-effect": patch
---

## Bug Fixes

* Allow `null` for the `default` field in the jsDelivr flat file-tree response schema. Some packages (for example `ink`) report `default: null`, which previously failed schema validation and prevented their type definitions from loading. The field is metadata only — loading consumes `files`, never `default`.
