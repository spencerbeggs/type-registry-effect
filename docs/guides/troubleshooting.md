# Troubleshooting

This guide covers common issues and solutions when using
`effect-type-registry`.

## Cache Permission Errors

If you see `EACCES: permission denied` errors when creating or accessing
the cache directory, the cache location isn't writable by your user.

```text
Error: EACCES: permission denied,
  mkdir '/home/user/.cache/effect-type-registry'
```

### Fix Directory Permissions

Create the cache directory with correct permissions:

```bash
mkdir -p ~/.cache/effect-type-registry
chmod 755 ~/.cache/effect-type-registry
```

### Use Custom Cache Directory

Specify a writable location:

```typescript
import { TypeRegistry } from "effect-type-registry"
import { tmpdir } from "node:os"
import { join } from "node:path"

const registry = TypeRegistry.create({
 cacheDir: join(tmpdir(), "my-app-types"),
})
```

### Set XDG_CACHE_HOME

Override the default cache location:

```bash
export XDG_CACHE_HOME=/tmp/cache
```

## Network Timeout Errors

Requests failing with timeout errors indicate network issues or slow
CDN response times.

```text
Error: Request timeout after 30000ms
```

### Increase Request Timeout

For large packages or slow networks:

```typescript
const registry = TypeRegistry.create({
 requestTimeout: 60000, // 60 seconds
})
```

### Verify CDN Connectivity

Test network access to the CDN:

```bash
curl -I https://cdn.jsdelivr.net/npm/zod@3.22.4/package.json
```

### Try Alternative CDN

Switch to unpkg if jsDelivr is unavailable:

```typescript
const registry = TypeRegistry.create({
 cdnProvider: "unpkg",
})
```

## Package Not Found Errors

HTTP 404 errors occur when packages or versions don't exist, or aren't
available on the CDN yet.

```text
Error: Package not found: @my-scope/package@1.0.0
```

### Verify Package Exists

Check the npm registry:

```bash
npm view @my-scope/package versions

# Check jsDelivr CDN
curl https://data.jsdelivr.com/v1/package/npm/@my-scope/package
```

### Wait for CDN Synchronization

Newly published packages take 5-10 minutes to sync to CDN. Increase retry
attempts for new packages:

```typescript
const registry = TypeRegistry.create({
 maxRetries: 5,
})
```

## Import Resolution Failures

When `resolveImport()` returns `null` or `isTypeDefinition: false`, the
package doesn't export the requested module.

```typescript
const resolved = await registry.resolveImport(
 { name: "my-package", version: "1.0.0" },
 "./utils",
)
// Returns: { filePath: null, isTypeDefinition: false }
```

### Check Available Exports

List all type entry points:

```typescript
const entries = await registry.getTypeEntries({
 name: "my-package",
 version: "1.0.0",
})

console.log("Available exports:", entries)
```

### Inspect Package Configuration

Download and examine package.json:

```bash
curl https://cdn.jsdelivr.net/npm/my-package@1.0.0/package.json | \
 jq .exports
```

Common configuration issues:

- Package uses legacy `main` field without `types`
- Exports field missing `types` condition
- Type definitions in different location than exports suggest

## Missing Type Definitions

Some npm packages don't include TypeScript definitions in their published
package.

### Check for Native Types

Verify if package includes type definitions:

```bash
npm view my-package types
npm view my-package typings
```

### Use DefinitelyTyped Packages

For packages without native types, fetch the corresponding @types package:

```typescript
const registry = TypeRegistry.create()

await registry.fetchAndCache({
 name: "@types/node",
 version: "18.0.0",
})
```

Note: Automatic @types/* fallback is planned for future versions.

## Cache Corruption

Interrupted downloads or disk errors can corrupt cached files, causing
JSON parsing errors.

```text
Error: Unexpected token in JSON
Error: Invalid package.json
```

### Clear Specific Package

Remove the corrupted package from cache:

```typescript
await registry.clearCache({
 name: "problematic-package",
 version: "1.0.0",
})
```

### Clear Entire Cache

Remove all cached packages:

```bash
rm -rf ~/.cache/effect-type-registry
```

### Find Incomplete Downloads

Check for zero-byte metadata files:

```bash
find ~/.cache/effect-type-registry -name ".metadata.json" -size 0
```

## Stale Cache

Package updates not reflected despite expired TTL, or cache persisting
too long.

### Reduce Cache TTL

Shorten time-to-live for faster updates:

```typescript
const registry = TypeRegistry.create({
 ttl: 24 * 60 * 60 * 1000, // 1 day instead of 7 days
})
```

### Force Package Refresh

Manually clear and re-fetch:

```typescript
await registry.clearCache({ name: "package", version: "1.0.0" })
await registry.fetchAndCache({ name: "package", version: "1.0.0" })
```

### Use Version Tags

Fetch latest versions automatically when cache expires:

```typescript
await registry.fetchAndCache({
 name: "my-package",
 version: "latest",
})
```

## Effect-TS Runtime Errors

Type errors or runtime errors related to Effect-TS indicate version
mismatches.

```text
TypeError: Effect.gen is not a function
TypeError: Cannot read property 'pipe' of undefined
```

### Check Package Versions

Verify Effect dependencies are installed:

```bash
pnpm list effect @effect/platform @effect/platform-node
```

### Install Matching Versions

Effect packages must have matching minor versions:

```bash
pnpm add effect@^3.19.14
pnpm add @effect/platform@^0.90.0
pnpm add @effect/platform-node@^0.90.0
```

Note: All @effect/* packages should use 0.90.x versions. Mismatched
versions cause runtime errors.

## High Memory Usage

Excessive memory consumption occurs when fetching many large packages
concurrently.

### Limit Concurrent Requests

Reduce parallel package fetches:

```typescript
const registry = TypeRegistry.create({
 maxConcurrency: 2, // Fetch 2 packages at a time instead of 5
})
```

### Batch Package Operations

Process packages in smaller groups:

```typescript
const packages = [/* 100 packages */]

// Fetch in batches of 10
for (let i = 0; i < packages.length; i += 10) {
 const batch = packages.slice(i, i + 10)
 await registry.getVFS(batch)
}
```

## Debugging Techniques

### Enable Verbose Logging

Log all events for detailed diagnostics:

```typescript
import { TypeRegistry, type LogEvent } from "effect-type-registry"

const registry = TypeRegistry.create({
 onLogEvent: (event: LogEvent) => {
  console.log(JSON.stringify(event, null, 2))
 },
})
```

### Filter Event Levels

Show only errors and warnings:

```typescript
const registry = TypeRegistry.create({
 onLogEvent: (event) => {
  if (event.level === "error" || event.level === "warn") {
   console.error(`[${event.event}] ${event.message}`, event.data)
  }
 },
})
```

### Inspect Cache Contents

List all cached packages:

```bash
ls -lh ~/.cache/effect-type-registry
```

View specific package structure:

```bash
tree ~/.cache/effect-type-registry/@effect/cli@0.73.0
```

Read metadata file:

```bash
cat ~/.cache/effect-type-registry/@effect/cli@0.73.0/.metadata.json
```

### Validate Package Configuration

Download and inspect package.json:

```bash
curl https://cdn.jsdelivr.net/npm/my-package@1.0.0/package.json | \
 jq '.exports, .types, .typings, .typesVersions'
```

### Test with Minimal Example

Create isolated reproduction:

```typescript
import { TypeRegistry } from "effect-type-registry"

const registry = TypeRegistry.create({
 onLogEvent: (e) => console.log(e.message),
})

try {
 const result = await registry.fetchAndCache({
  name: "zod",
  version: "3.22.4",
 })
 console.log("Success:", result)
} catch (error) {
 console.error("Failed:", error)
}
```

## Getting Help

If your issue isn't covered here:

1. Check package exports with `getTypeEntries()`
2. Enable debug logging with `onLogEvent`
3. Clear cache to rule out corruption
4. Verify CDN access with curl/wget
5. Report issue with:
   - Package name and version
   - Error message and stack trace
   - Debug logs from `onLogEvent`
   - Environment (Node.js version, OS)

## Related Documentation

- [Caching Guide](./caching.md) - Cache management details
- [Observability Guide](./observability.md) - Logging and event handling
- [Advanced Usage Guide](./advanced-usage.md) - Custom configurations
