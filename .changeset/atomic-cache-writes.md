---
"type-registry-effect": minor
---

## Features

* `TypeCache` gains `writePackage(pkg, files)`, which writes a package's entire file set atomically. It stages every file in a `.staging-<version>` sibling of the live cache directory, then promotes it in a single same-filesystem `rename`, so a reader sees either the package's previous complete state or its new complete state — never a half-written mixture. Because the whole directory is replaced rather than merged, obsolete files left over from a larger previous version are dropped. The existing single-file `write` remains as a low-level primitive.

## Bug Fixes

* A crash or IO failure part-way through caching a package no longer leaves a partial directory that the stale-vs-miss ladder serves as usable stale data. `TypeRegistry.fetchAndCache` now assembles the complete file set and commits it through the atomic `writePackage`, so an interrupted fetch leaves the prior complete directory intact (or, on a first fetch, no directory at all — a clean miss that self-heals).
* Concurrent batch fetches (`getVfs`) no longer serialize on the cache mutation lock. Network fetches now run outside the lock; only the commit — the atomic directory promotion plus the metadata write — is serialized, so uncached packages in a batch are fetched in parallel while `clearCache`/`pruneCache` stay mutually exclusive with a commit.
