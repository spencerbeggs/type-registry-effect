# Advanced Usage

This guide covers advanced usage patterns for `effect-type-registry`,
including direct service usage, Effect-TS patterns, and low-level APIs.

## Advanced TypeRegistry Methods

Beyond the basic `fetchAndCache` and `getVFS` methods, TypeRegistry provides
several advanced methods for fine-grained control.

### Import Resolution

Resolve import specifiers to file paths:

```typescript
import { TypeRegistry } from "effect-type-registry"

const registry = TypeRegistry.create()

// Resolve import specifier to file path
const resolved = await registry.resolveImport(
 { name: "@effect/cli", version: "0.73.0" },
 "./Command",
)
// => {
//   filePath: "dist/dts/Command.d.ts",
//   isTypeDefinition: true
// }
```

This is useful for:

- Building custom module resolution systems
- Understanding package exports structure
- Debugging import failures

### Type Entry Points

Get all type entry points for a package:

```typescript
const entries = await registry.getTypeEntries({
 name: "@effect/cli",
 version: "0.73.0",
})
// => [
//   { filePath: "dist/dts/index.d.ts", isTypeDefinition: true },
//   { filePath: "dist/dts/Command.d.ts", isTypeDefinition: true },
//   ...
// ]
```

This reveals:

- All exported modules from package.json `exports` field
- Legacy `types` or `typings` entry points
- Conditional exports for different environments

### Single Package VFS

Get VFS for a single package without auto-fetching:

```typescript
const pkgVfs = await registry.getPackageVFS(
 { name: "zod", version: "3.22.4" },
 { autoFetch: false }, // Throws if not cached
)
```

Options:

- `autoFetch: false` - Throw error if package not cached
- `autoFetch: true` (default) - Fetch package if not cached

## Using PackageFetcher Directly

The `PackageFetcher` service handles HTTP operations for fetching package
metadata and files. You can use it directly for custom integrations.

### PackageFetcher Basic Usage

```typescript
import {
 PackageFetcher,
 PackageFetcherLive,
} from "effect-type-registry"
import { NodeHttpClient } from "@effect/platform-node"
import * as Effect from "effect/Effect"

const program = Effect.gen(function* () {
 const fetcher = yield* PackageFetcher

 // Resolve version reference
 const version = yield* fetcher.resolveVersion("zod", "latest")
 // => "3.22.4"

 // Get package metadata
 const metadata = yield* fetcher.getVersions("zod")
 // => { tags: { latest: "3.22.4", ... }, versions: [...] }

 // Download package.json
 const packageJson = yield* fetcher.getPackageJson({
  name: "zod",
  version: "3.22.4",
 })

 // Get all type definition files
 const typeFiles = yield* fetcher.getTypeFiles({
  name: "zod",
  version: "3.22.4",
 })

 return typeFiles
})

const typeFiles = await program.pipe(
 Effect.provide(PackageFetcherLive),
 Effect.provide(NodeHttpClient.layerUndici),
 Effect.runPromise,
)
```

### Version Resolution

PackageFetcher can resolve various version specifiers:

```typescript
// Resolve tags
const latest = await fetcher.resolveVersion("zod", "latest")
const next = await fetcher.resolveVersion("zod", "next")

// Resolve exact versions
const exact = await fetcher.resolveVersion("zod", "3.22.4")

// Note: Semver range resolution not yet implemented
```

### File Operations

Get files from a package:

```typescript
// Get all type definition files (.d.ts, .d.mts, .d.cts)
const typeFiles = await fetcher.getTypeFiles({
 name: "@effect/schema",
 version: "0.90.0",
})

// Get package.json
const packageJson = await fetcher.getPackageJson({
 name: "@effect/schema",
 version: "0.90.0",
})
```

## Using TypeResolver Directly

The `TypeResolver` service handles module resolution logic based on
package.json configuration. This is useful for custom build tools or
module resolution systems.

### TypeResolver Basic Usage

```typescript
import { TypeResolver, TypeResolverLive } from "effect-type-registry"
import * as Effect from "effect/Effect"

const packageJson = {
 name: "@effect/cli",
 version: "0.73.0",
 types: "./dist/dts/index.d.ts",
 exports: {
  ".": {
   types: "./dist/dts/index.d.ts",
  },
  "./Command": {
   types: "./dist/dts/Command.d.ts",
  },
 },
}

const pkg = { name: "@effect/cli", version: "0.73.0" }

const program = Effect.gen(function* () {
 const resolver = yield* TypeResolver

 // Resolve main entry point
 const mainEntry = yield* resolver.resolveMainEntry(packageJson, pkg)
 // => {
 //   filePath: "dist/dts/index.d.ts",
 //   isTypeDefinition: true,
 //   ...
 // }

 // Resolve import specifier
 const commandModule = yield* resolver.resolveImport(
  "./Command",
  packageJson,
  pkg,
 )
 // => {
 //   filePath: "dist/dts/Command.d.ts",
 //   isTypeDefinition: true,
 //   ...
 // }

 // Get all type entry points
 const entries = yield* resolver.resolveTypeEntries(packageJson, pkg)
 // => [
 //   { filePath: "dist/dts/index.d.ts", ... },
 //   { filePath: "dist/dts/Command.d.ts", ... }
 // ]

 // Find type definition for a JS file
 const typeDef = yield* resolver.findTypeDefinition(
  "src/utils.js",
  packageJson,
  pkg,
 )
 // => {
 //   filePath: "src/utils.d.ts",
 //   isTypeDefinition: true,
 //   ...
 // }

 return entries
})

const entries = await Effect.runPromise(program)
```

### Resolution Strategies

TypeResolver implements several resolution strategies in order:

1. **package.json `exports` field** - Modern exports with conditional exports
2. **package.json `typesVersions` field** - TypeScript-specific version
   mappings
3. **package.json `types` or `typings` field** - Legacy type entry points
4. **Conventional paths** - `.d.ts`, `.ts`, `index.d.ts`, `index.ts`

### Handling Exports Maps

Complex exports maps are fully supported:

```typescript
const packageJson = {
 exports: {
  ".": {
   types: "./dist/index.d.ts",
   import: "./dist/index.mjs",
   require: "./dist/index.cjs",
  },
  "./utils": {
   types: "./dist/utils.d.ts",
   import: "./dist/utils.mjs",
  },
  "./internal/*": {
   types: "./dist/internal/*.d.ts",
  },
 },
}

// Resolves to "dist/index.d.ts"
await resolver.resolveImport(".", packageJson, pkg)

// Resolves to "dist/utils.d.ts"
await resolver.resolveImport("./utils", packageJson, pkg)

// Wildcard resolution: resolves to "dist/internal/helpers.d.ts"
await resolver.resolveImport("./internal/helpers", packageJson, pkg)
```

## XDG Base Directory Utilities

The package exports utilities for working with XDG Base Directory
specification paths:

```typescript
import {
 getDefaultCacheDir,
 getXdgCacheHome,
 getXdgConfigHome,
 getXdgDataHome,
} from "effect-type-registry"

// Get XDG cache directory ($XDG_CACHE_HOME or ~/.cache)
const cacheHome = getXdgCacheHome()

// Get XDG config directory ($XDG_CONFIG_HOME or ~/.config)
const configHome = getXdgConfigHome()

// Get XDG data directory ($XDG_DATA_HOME or ~/.local/share)
const dataHome = getXdgDataHome()

// Get default cache dir for effect-type-registry
const defaultCacheDir = getDefaultCacheDir()
// => $XDG_CACHE_HOME/effect-type-registry or
//    ~/.cache/effect-type-registry
```

### Custom Cache Directories

Use XDG utilities to build custom cache paths:

```typescript
import { getXdgCacheHome, TypeRegistry } from "effect-type-registry"
import { join } from "node:path"

// Custom cache directory following XDG conventions
const customCacheDir = join(getXdgCacheHome(), "my-docs-tool", "types")

const registry = TypeRegistry.create({
 cacheDir: customCacheDir,
})
```

## Effect-TS Patterns

If you're building Effect-TS applications, you can compose services
with your own Effect programs.

### Layer Composition

Compose TypeRegistry services with your own layers:

```typescript
import * as Layer from "effect/Layer"
import { CacheServiceLive, PackageFetcherLive } from "effect-type-registry"

const MyAppLayer = Layer.mergeAll(
 CacheServiceLive,
 PackageFetcherLive,
 MyCustomServiceLive,
)

const program = Effect.gen(function* () {
 const cache = yield* CacheService
 const myService = yield* MyCustomService

 // Use services together
})

await Effect.provide(program, MyAppLayer)
```

### Error Handling

Services use typed error channels for robust error handling:

```typescript
import * as Effect from "effect/Effect"
import { PackageFetcher } from "effect-type-registry"

const program = Effect.gen(function* () {
 const fetcher = yield* PackageFetcher

 const result = yield* fetcher.getPackageJson({
  name: "nonexistent-package",
  version: "1.0.0",
 }).pipe(
  Effect.catchTags({
   NetworkError: (error) =>
    Effect.succeed({ fallback: true }),
   NotFoundError: (error) =>
    Effect.fail(new Error("Package not found")),
  }),
 )
})
```

### Service Dependencies

Access underlying services through TypeRegistry:

```typescript
const registry = TypeRegistry.create()

// TypeRegistry internally uses:
// - CacheService for disk operations
// - PackageFetcher for HTTP operations
// - TypeResolver for import resolution
```

## Best Practices

1. **Use TypeRegistry for most use cases** - It provides a high-level API
   that handles service composition

2. **Use PackageFetcher directly** when you need custom HTTP retry logic
   or want to bypass caching

3. **Use TypeResolver directly** when you're building custom module
   resolution systems or need to process package.json programmatically

4. **Compose with Effect layers** when building Effect-TS applications
   that need type registry functionality

5. **Use XDG utilities** to follow cross-platform directory conventions

## Further Reading

- See `docs/architecture/overview.md` for service architecture details
- See `docs/guides/getting-started.md` for basic usage patterns
- See `.claude/design/effect-type-registry/observability.md` for
  observability design
