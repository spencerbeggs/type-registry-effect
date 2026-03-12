# Advanced Usage

This guide covers custom layers, error handling, import resolution,
testing with mock services, and Twoslash integration.

## Custom layers

The default `NodeLayer` wires all services with `NodeFileSystem` and
`NodeHttpClient`. You can replace individual layers for custom behavior.

### Custom cache directory

Use `makeNodeCacheLayer` to specify a cache directory:

```typescript
import { Effect, Layer } from "effect";
import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import {
  TypeRegistry,
  PackageSpec,
  makeNodeCacheLayer,
  PackageFetcherLive,
  TypeResolverLive,
} from "type-registry-effect";

const CustomLayer = Layer.mergeAll(
  makeNodeCacheLayer("/tmp/my-types-cache"),
  PackageFetcherLive,
  TypeResolverLive,
).pipe(
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodeHttpClient.layerUndici),
);

const program = TypeRegistry.getVFS([
  new PackageSpec({ name: "zod", version: "3.23.8" }),
]);

const vfs = await Effect.runPromise(Effect.provide(program, CustomLayer));
```

### Replacing a service entirely

Every service is a `Context.GenericTag` with interface/const declaration
merging. Provide your own implementation via `Layer.succeed`:

```typescript
import { Layer, Effect } from "effect";
import { CacheService, CacheError } from "type-registry-effect";

const InMemoryCache = Layer.succeed(CacheService, {
  exists: () => Effect.succeed(false),
  read: () => Effect.fail(new CacheError({ operation: "read", path: "", message: "not implemented" })),
  write: () => Effect.void,
  listFiles: () => Effect.succeed([]),
  readMetadata: () => Effect.fail(new CacheError({ operation: "read", path: "", message: "no metadata" })),
  writeMetadata: () => Effect.void,
  getVFS: () => Effect.succeed(new Map()),
  remove: () => Effect.void,
} satisfies CacheService);
```

## Error handling

Every `TypeRegistry` function declares its error type in the `E`
position. Use `Effect.catchTag` to handle specific errors:

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";

const program = TypeRegistry.fetchAndCache(
  new PackageSpec({ name: "nonexistent", version: "1.0.0" }),
).pipe(
  Effect.catchTag("NetworkError", (err) =>
    Effect.logWarning(`Network issue: ${err.message}`),
  ),
  Effect.catchTag("ParseError", (err) =>
    Effect.logWarning(`CDN returned invalid data: ${err.message}`),
  ),
  Effect.catchTag("CacheError", (err) =>
    Effect.logWarning(`Disk write failed: ${err.message}`),
  ),
);
```

### Error types

| Tag | When it occurs |
| --- | --- |
| `CacheError` | Disk read/write failure |
| `NetworkError` | HTTP request failure or timeout |
| `PackageNotFoundError` | Package or version does not exist on CDN |
| `ParseError` | CDN response is not valid JSON or schema validation fails |
| `ResolutionError` | Import specifier cannot be resolved from package.json |
| `TimeoutError` | Operation exceeded time limit |

All errors extend `Data.TaggedError` and carry a `_tag` field for
pattern matching.

## Import resolution

Resolve import specifiers against a cached package's `exports` and
`typesVersions` fields:

```typescript
import { Effect } from "effect";
import { TypeRegistry, PackageSpec } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";

const program = Effect.gen(function* () {
  const pkg = new PackageSpec({ name: "@effect/cli", version: "0.73.0" });
  yield* TypeRegistry.fetchAndCache(pkg);

  // Resolve a single import
  const resolved = yield* TypeRegistry.resolveImport(pkg, "./Command");
  console.log(resolved.filePath); // e.g., "dist/dts/Command.d.ts"

  // Get all type entry points
  const entries = yield* TypeRegistry.getTypeEntries(pkg);
  for (const entry of entries) {
    console.log(entry.filePath);
  }
});

await Effect.runPromise(Effect.provide(program, NodeLayer));
```

## Testing with mock layers

Services are injected via layers, making it straightforward to test
without network or disk access:

```typescript
import { Effect, Layer } from "effect";
import {
  TypeRegistry,
  PackageSpec,
  PackageFetcher,
  CacheService,
  CacheError,
  TypeResolver,
  TypeResolverLive,
} from "type-registry-effect";

// Inline mock for PackageFetcher
const MockFetcher = Layer.succeed(PackageFetcher, {
  getPackageJson: () =>
    Effect.succeed({ name: "mock", version: "1.0.0" }),
  getTypeFiles: () =>
    Effect.succeed(new Map([["index.d.ts", "export declare const x: number;"]])),
  resolveVersion: (_name, _ref) =>
    Effect.succeed("1.0.0"),
});

// Inline mock for CacheService
const MockCache = Layer.succeed(CacheService, {
  exists: () => Effect.succeed(false),
  read: () => Effect.fail(new CacheError({ operation: "read", path: "", message: "not cached" })),
  write: () => Effect.void,
  listFiles: () => Effect.succeed([]),
  readMetadata: () => Effect.fail(new CacheError({ operation: "read", path: "", message: "no metadata" })),
  writeMetadata: () => Effect.void,
  getVFS: () => Effect.succeed(new Map([
    ["node_modules/mock/index.d.ts", "export declare const x: number;"],
  ])),
  remove: () => Effect.void,
});

const TestLayer = Layer.mergeAll(MockFetcher, MockCache, TypeResolverLive);

// Run tests against the mock layer
const vfs = await Effect.runPromise(
  Effect.provide(
    TypeRegistry.getVFS([new PackageSpec({ name: "mock", version: "1.0.0" })]),
    TestLayer,
  ),
);
```

## Twoslash integration

Use `createTypeScriptCache` from the Node.js entry point to build a
virtual TypeScript environment for Twoslash:

```typescript
import * as ts from "typescript";
import { PackageSpec } from "type-registry-effect";
import { createTypeScriptCache } from "type-registry-effect/node";

const packages = [
  new PackageSpec({ name: "zod", version: "3.23.8" }),
  new PackageSpec({ name: "@effect/schema", version: "0.79.0" }),
];

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
};

// Returns Map<string, VirtualTypeScriptEnvironment>
const cache = await createTypeScriptCache(packages, compilerOptions);
```

This requires the optional `typescript` and `@typescript/vfs` peer
dependencies.

## Concurrent package loading

`TypeRegistry.getVFS` fetches up to 5 packages concurrently and
continues on partial failures. If some packages fail, the VFS still
contains the successful ones. It only fails when ALL packages fail:

```typescript
const vfs = yield* TypeRegistry.getVFS([
  new PackageSpec({ name: "zod", version: "3.23.8" }),
  new PackageSpec({ name: "nonexistent", version: "0.0.0" }),
  new PackageSpec({ name: "@effect/schema", version: "0.79.0" }),
]);
// vfs contains zod + @effect/schema files; nonexistent is silently skipped
```

## Version resolution

Resolve semver ranges, tags, and `latest` to specific versions:

```typescript
import { TypeRegistry } from "type-registry-effect";

const version = yield* TypeRegistry.resolveVersion("zod", "latest");
// => "3.23.8"

const range = yield* TypeRegistry.resolveVersion("zod", "^3.0.0");
// => "3.23.8" (highest matching)
```

This calls the jsDelivr API and uses the `semver-effect` library for
range resolution.
