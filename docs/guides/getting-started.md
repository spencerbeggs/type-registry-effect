# Getting Started

This guide walks you through installing type-registry-effect, understanding its peer dependencies, and using it with three different patterns: Effect-first, Node.js convenience API, and Twoslash integration.

## Table of Contents

1. [Installation](#installation)
2. [Understanding Peer Dependencies](#understanding-peer-dependencies)
3. [Usage Pattern 1: Effect-First](#usage-pattern-1-effect-first)
4. [Usage Pattern 2: Node.js Convenience API](#usage-pattern-2-nodejs-convenience-api)
5. [Usage Pattern 3: Twoslash Integration](#usage-pattern-3-twoslash-integration)
6. [Core Concepts](#core-concepts)
7. [Next Steps](#next-steps)

## Installation

Install type-registry-effect and its required peer dependencies:

```bash
npm install type-registry-effect effect @effect/platform
```

The `effect` and `@effect/platform` packages are **required** peer dependencies. Their types appear in every public signature, so your project must have them installed.

### Optional Peer Dependencies

Depending on how you use the library, you may need additional packages:

```bash
# For the Node.js convenience API and NodeLayer
npm install @effect/platform-node

# For Twoslash / TypeScript VFS integration
npm install typescript @typescript/vfs
```

### When to Install What

**Effect-first consumers** who provide their own platform layers need only the required peers:

```bash
npm install type-registry-effect effect @effect/platform
```

**Node.js consumers** using the convenience API or `NodeLayer` also need the Node.js platform package:

```bash
npm install type-registry-effect effect @effect/platform @effect/platform-node
```

**Twoslash / TypeScript tooling consumers** need everything:

```bash
npm install type-registry-effect effect @effect/platform @effect/platform-node typescript @typescript/vfs
```

## Understanding Peer Dependencies

This library uses peer dependencies because the Effect ecosystem requires version alignment across packages. If your project already uses Effect, you want a single copy of `effect` and `@effect/platform` shared between your code and this library.

| Package | Required? | Why |
| --- | --- | --- |
| `effect` | Yes | Core Effect library. Types appear in all public signatures. |
| `@effect/platform` | Yes | Platform abstractions (`FileSystem`, `HttpClient`). Required by `TypeRegistryLive` layer type. |
| `@effect/platform-node` | Only for `/node` entry point | Provides `NodeFileSystem` and `NodeHttpClient` implementations. |
| `typescript` | Only for `createTypeScriptCache` | TypeScript compiler API used to build VFS environments. |
| `@typescript/vfs` | Only for `createTypeScriptCache` | Creates virtual TypeScript environments from VFS maps. |

The one bundled dependency, `semver-effect`, is used internally for version resolution and is not exposed in any public API.

## Usage Pattern 1: Effect-First

This is the primary API. Every function in the `TypeRegistry` namespace returns an `Effect` with typed errors and explicit service requirements.

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { TypeRegistryLive } from "type-registry-effect";
import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";

// Define packages to fetch
const zod = new PackageSpec({ name: "zod", version: "3.23.8" });
const tsPattern = new PackageSpec({ name: "ts-pattern", version: "5.6.0" });

// Build a program using TypeRegistry namespace functions
const program = Effect.gen(function* () {
  // Check if zod is already cached
  const isCached = yield* TypeRegistry.hasCached(zod);

  if (!isCached) {
    // Fetch and write to disk cache
    yield* TypeRegistry.fetchAndCache(zod, { ttl: 7 * 24 * 60 * 60 * 1000 });
  }

  // Get a combined VFS for multiple packages (auto-fetches if needed)
  const vfs = yield* TypeRegistry.getVFS([zod, tsPattern]);

  return vfs;
});

// Provide platform layers and run
const vfs = await program.pipe(
  Effect.provide(TypeRegistryLive),
  Effect.provide(NodeFileSystem.layer),
  Effect.provide(NodeHttpClient.layerUndici),
  Effect.runPromise,
);

console.log(`Loaded ${vfs.size} files into VFS`);
```

The TypeScript compiler ensures you cannot run the program without providing all required services. If you forget a layer, you get a compile-time error -- not a runtime crash.

## Usage Pattern 2: Node.js Convenience API

The `type-registry-effect/node` entry point provides `NodeLayer` (a pre-composed layer with Node.js platform implementations) and a Promise-based convenience API that hides Effect entirely.

### Using NodeLayer with Effect

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

const program = TypeRegistry.getVFS([
  new PackageSpec({ name: "zod", version: "3.23.8" }),
]);

// NodeLayer bundles TypeRegistryLive + NodeFileSystem + NodeHttpClient
const vfs = await Effect.runPromise(Effect.provide(program, NodeLayer));
```

### Using the Promise Convenience API

For consumers who do not want to work with Effect directly:

```typescript
import { PackageSpec } from "type-registry-effect";
import {
  hasCached,
  fetchAndCache,
  getVFS,
  resolveVersion,
} from "type-registry-effect/node";

const zod = new PackageSpec({ name: "zod", version: "3.23.8" });

// All functions return plain Promises
const isCached = await hasCached(zod);

if (!isCached) {
  await fetchAndCache(zod);
}

const vfs = await getVFS([zod]);
console.log(`VFS contains ${vfs.size} files`);

// Resolve a version tag to a specific version
const latest = await resolveVersion("zod", "latest");
console.log(`Latest zod version: ${latest}`);
```

## Usage Pattern 3: Twoslash Integration

The `createTypeScriptCache` function from the `/node` entry point builds a full TypeScript virtual environment suitable for Twoslash.

```typescript
import { PackageSpec } from "type-registry-effect";
import { createTypeScriptCache } from "type-registry-effect/node";
import ts from "typescript";

const packages = [
  new PackageSpec({ name: "zod", version: "3.23.8" }),
  new PackageSpec({ name: "@effect/schema", version: "0.79.0" }),
];

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
};

// Returns Map<string, VirtualTypeScriptEnvironment>
const cache = await createTypeScriptCache(packages, compilerOptions);

// The cache key is the stringified compiler options
const env = cache.get(JSON.stringify(compilerOptions));
// Use `env` with Twoslash or any TypeScript language service consumer
```

This function:

1. Fetches and caches type definitions for all specified packages
2. Adds TypeScript lib files from your local node_modules
3. Creates an FS-backed system that prioritizes VFS files over the real filesystem
4. Builds a `VirtualTypeScriptEnvironment` with all declaration files as root files

## Core Concepts

### PackageSpec

Every function that operates on a package takes a `PackageSpec` -- a tagged data class that identifies a package at a specific version:

```typescript
import { PackageSpec } from "type-registry-effect";

const pkg = new PackageSpec({ name: "zod", version: "3.23.8" });

console.log(pkg.toString()); // "zod@3.23.8"
console.log(pkg.name);       // "zod"
console.log(pkg.version);    // "3.23.8"
```

### VirtualFileSystem

The VFS is a `Map<string, string>` where keys are file paths prefixed with `node_modules/` and values are file contents:

```typescript
// Example VFS entries:
// "node_modules/zod/package.json" => "{ \"name\": \"zod\", ... }"
// "node_modules/zod/lib/index.d.ts" => "export declare ..."
```

This format is compatible with `@typescript/vfs` and Twoslash.

### VirtualPackage

For packages where you have declaration content already (for example, generated by API Extractor), use `VirtualPackage` to create VFS entries without fetching from a CDN:

```typescript
import { VirtualPackage } from "type-registry-effect";

// Single entry point
const vPkg = VirtualPackage.create("my-lib", "1.0.0", `
  export declare function greet(name: string): string;
`);

const vfs = vPkg.generateVfs();
// "node_modules/my-lib/package.json" => ...
// "node_modules/my-lib/index.d.ts" => ...
```

## Next Steps

- [Caching Guide](./caching.md) -- How the disk cache works, XDG directories, cache metadata
- [Advanced Usage](./advanced-usage.md) -- Custom layers, error handling, concurrent loading, testing with mocks
- [Architecture Overview](../architecture/overview.md) -- How the three services compose and why
- [Troubleshooting](./troubleshooting.md) -- Common issues with peer dependencies and missing layers
