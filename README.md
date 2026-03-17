# type-registry-effect

[![npm version](https://img.shields.io/npm/v/type-registry-effect)](https://www.npmjs.com/package/type-registry-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Fetch, cache, and resolve TypeScript type definitions from npm packages for use with Twoslash and other documentation tooling that needs type-aware code samples.

## Features

- Composable Effect programs with typed errors and explicit service requirements
- Disk-based caching with XDG Base Directory compliance and TTL support
- Virtual file system generation compatible with @typescript/vfs and Twoslash
- Module resolution via package.json exports, typesVersions, and legacy fields
- Concurrent package loading with graceful degradation on partial failures
- Built-in Effect Metrics (counters and timers) for cache hits, load durations, and batch operations

## Installation

```bash
npm install type-registry-effect effect @effect/platform
```

See [docs/guides/getting-started.md](./docs/guides/getting-started.md) for peer dependency details.

## Quick Start

```typescript
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";
import { Effect } from "effect";

const program = TypeRegistry.getVFS([
  new PackageSpec({ name: "zod", version: "3.23.8" }),
  new PackageSpec({ name: "@effect/schema", version: "0.79.0" }),
]);

const vfs = await Effect.runPromise(Effect.provide(program, NodeLayer));
```

## Documentation

For detailed guides, architecture, and API reference, see [docs/](./docs/).

## License

[MIT](LICENSE)
