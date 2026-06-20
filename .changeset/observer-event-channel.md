---
"type-registry-effect": minor
---

## Features

Adds a typed, opt-in event channel for programmatic consumers, replacing diagnostic logging as the way to observe registry operations.

* New `TypeRegistryObserver` service with a `RegistryEvent` tagged union (`VersionResolved`, `VersionResolveFailed`, `CacheHit`, `CacheStale`, `CacheMiss`, `FetchStart`, `FetchFailed`, `PackageLoaded`, `PackageLoadFailed`, `BatchStart`, `BatchComplete`).
* `layerCallback(fn)` for the low-friction subscription path, `layerNoop` for an explicit no-op, and `emitEvent` for internal emission. Emission is opt-in and adds no requirement to program signatures — it is a no-op unless an observer layer is provided.
* `PackageLoadFailed` carries a `kind` discriminator (`not-found`, `version-range`, `schema`, `json`, `network`, `unknown`) so consumers can react without parsing error strings. `FetchFailed` carries the HTTP status and a response body snippet.

## Bug Fixes

* HTTP requests now fail fast on a non-2xx status instead of feeding the error response body into `res.json` / `res.text`. Previously a 404 (for example an unpublished version or a version range the CDN rejects) surfaced as an opaque "JSON parse failed" error; it now fails with the real status and body.

## Refactoring

* Internal `Effect.log` / `Effect.logDebug` diagnostics were removed in favor of `RegistryEvent` emission. The `LogEventSchema` / `LogEvent` exports (which modeled the old log annotations) are deprecated and will be removed in a future major.
