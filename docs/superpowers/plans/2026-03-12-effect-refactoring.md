# Effect-First Type Registry Refactoring (Phases 1-3)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor type-registry-effect from a class-based wrapper into a
first-class Effect library with composable programs, typed errors, and proper
Layer composition.

**Architecture:** Convert plain TS interfaces to Data.TaggedClass/Schema types,
replace Error/throw with Data.TaggedError, convert services to proper
Context.GenericTag + Layer pattern, and replace the TypeRegistry class with a
namespace module of composable Effect programs. Use semver-effect as a
dependency for version resolution.

**Tech Stack:** Effect (Data, Schema, Context, Layer), semver-effect,
@effect/platform, @effect/platform-node, vitest

---

## File Structure

### New Files to Create

```text
src/schemas/PackageSpec.ts          -- Data.TaggedClass (immutable domain type)
src/schemas/CacheMetadata.ts        -- Schema.Class (serializable to/from cache)
src/schemas/PackageJson.ts          -- Schema.Struct (validated CDN parsing)
src/schemas/FileTree.ts             -- Schema.Struct (jsDelivr response)
src/schemas/ResolvedModule.ts       -- Data.TaggedClass
src/schemas/index.ts                -- Re-exports

src/errors/NetworkError.ts          -- Data.TaggedError
src/errors/CacheError.ts            -- Data.TaggedError
src/errors/PackageNotFoundError.ts  -- Data.TaggedError
src/errors/ParseError.ts            -- Data.TaggedError
src/errors/ResolutionError.ts       -- Data.TaggedError
src/errors/TimeoutError.ts          -- Data.TaggedError
src/errors/index.ts                 -- Re-exports + union type

src/layers/PackageFetcherLive.ts    -- Layer.effect (closes over HttpClient)
src/layers/TypeResolverLive.ts      -- Layer.succeed (pure, no deps)
src/layers/CacheServiceLive.ts      -- Layer.effect (closes over FileSystem)
src/layers/TypeRegistryLive.ts      -- Layer.mergeAll (composed)

src/platforms/node.ts               -- NodeLayer + Promise convenience API

__test__/utils/TestLayers.ts        -- MockPackageFetcher + InMemoryCache
```

### Files to Modify

```text
src/services/CacheService.ts        -- Remove FileSystem from signatures
src/services/PackageFetcher.ts      -- Remove HttpClient from signatures
src/services/TypeResolver.ts        -- Use typed errors
src/TypeRegistry.ts                 -- Convert from class to namespace module
src/index.ts                        -- Update exports
src/events.ts                       -- Keep as-is (already Schema-based)
src/VirtualPackage.ts               -- Minor: use new PackageSpec type
package.json                        -- Add semver-effect dependency
```

### Files to Delete

```text
src/types.ts                        -- Replaced by schemas/ + errors/
src/Logger.ts                       -- Redundant (Effect logging)
```

---

## Chunk 1: Data Layer (Schemas)

### Task 1: Add semver-effect dependency

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install semver-effect**

```bash
pnpm add semver-effect
```

- [ ] **Step 2: Verify installation**

```bash
pnpm ls semver-effect
```

Expected: semver-effect listed in dependencies

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add semver-effect dependency

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Create PackageSpec data type

**Files:**

- Create: `src/schemas/PackageSpec.ts`
- Test: `__test__/schemas/PackageSpec.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __test__/schemas/PackageSpec.test.ts
import { Equal } from "effect";
import { describe, expect, it } from "vitest";
import { PackageSpec } from "../src/schemas/PackageSpec.js";

describe("PackageSpec", () => {
 it("should create with name and version", () => {
  const spec = new PackageSpec({ name: "zod", version: "3.22.4" });
  expect(spec.name).toBe("zod");
  expect(spec.version).toBe("3.22.4");
  expect(spec._tag).toBe("PackageSpec");
 });

 it("should support structural equality", () => {
  const a = new PackageSpec({ name: "zod", version: "3.22.4" });
  const b = new PackageSpec({ name: "zod", version: "3.22.4" });
  expect(Equal.equals(a, b)).toBe(true);
 });

 it("should not equal different specs", () => {
  const a = new PackageSpec({ name: "zod", version: "3.22.4" });
  const b = new PackageSpec({ name: "zod", version: "3.23.0" });
  expect(Equal.equals(a, b)).toBe(false);
 });

 it("should have a toString method", () => {
  const spec = new PackageSpec({ name: "zod", version: "3.22.4" });
  expect(spec.toString()).toBe("zod@3.22.4");
 });

 it("should handle scoped packages", () => {
  const spec = new PackageSpec({ name: "@effect/schema", version: "0.68.0" });
  expect(spec.toString()).toBe("@effect/schema@0.68.0");
 });

 it("should support optional registry field", () => {
  const spec = new PackageSpec({
   name: "zod",
   version: "3.22.4",
   registry: "https://npm.pkg.github.com",
  });
  expect(spec.registry).toBe("https://npm.pkg.github.com");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run __test__/schemas/PackageSpec.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/schemas/PackageSpec.ts
import { Data } from "effect";

/** @internal */
export const PackageSpecBase = Data.TaggedClass("PackageSpec");

/**
 * Immutable domain type identifying a package at a specific version.
 * Implements structural equality via Effect's Data.TaggedClass.
 *
 * @example
 * ```typescript
 * const spec = new PackageSpec({ name: "zod", version: "3.23.8" });
 * console.log(spec.toString()); // "zod@3.23.8"
 * ```
 */
export class PackageSpec extends PackageSpecBase<{
 readonly name: string;
 readonly version: string;
 readonly registry?: string;
}> {
 toString(): string {
  return `${this.name}@${this.version}`;
 }

 [Symbol.for("nodejs.util.inspect.custom")](): string {
  return this.toString();
 }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run __test__/schemas/PackageSpec.test.ts
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/schemas/PackageSpec.ts __test__/schemas/PackageSpec.test.ts
git commit -m "feat: add PackageSpec Data.TaggedClass

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: Create CacheMetadata schema

**Files:**

- Create: `src/schemas/CacheMetadata.ts`
- Test: `__test__/schemas/CacheMetadata.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __test__/schemas/CacheMetadata.test.ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CacheMetadata } from "../src/schemas/CacheMetadata.js";

describe("CacheMetadata", () => {
 it("should create with required fields", () => {
  const meta = new CacheMetadata({
   version: "3.22.4",
   cachedAt: 1705334400000,
  });
  expect(meta.version).toBe("3.22.4");
  expect(meta.cachedAt).toBe(1705334400000);
  expect(meta.ttl).toBeUndefined();
 });

 it("should create with optional ttl", () => {
  const meta = new CacheMetadata({
   version: "3.22.4",
   cachedAt: 1705334400000,
   ttl: 604800000,
  });
  expect(meta.ttl).toBe(604800000);
 });

 it("should encode to JSON-safe object", () => {
  const meta = new CacheMetadata({
   version: "3.22.4",
   cachedAt: 1705334400000,
  });
  const encoded = Schema.encodeSync(CacheMetadata)(meta);
  expect(encoded).toEqual({
   version: "3.22.4",
   cachedAt: 1705334400000,
  });
 });

 it("should decode from unknown object", () => {
  const decoded = Schema.decodeUnknownSync(CacheMetadata)({
   version: "3.22.4",
   cachedAt: 1705334400000,
   ttl: 604800000,
  });
  expect(decoded).toBeInstanceOf(CacheMetadata);
  expect(decoded.version).toBe("3.22.4");
 });

 it("should reject invalid data", () => {
  expect(() =>
   Schema.decodeUnknownSync(CacheMetadata)({
    version: 123,
    cachedAt: "not a number",
   }),
  ).toThrow();
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run __test__/schemas/CacheMetadata.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/schemas/CacheMetadata.ts
import { Schema } from "effect";

/**
 * Schema.Class for cache metadata. Supports encode/decode for
 * serialization to/from cache storage with runtime validation.
 */
export class CacheMetadata extends Schema.Class<CacheMetadata>("CacheMetadata")({
 version: Schema.String,
 cachedAt: Schema.Number,
 ttl: Schema.optional(Schema.Number),
}) {}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run __test__/schemas/CacheMetadata.test.ts
```

Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/schemas/CacheMetadata.ts __test__/schemas/CacheMetadata.test.ts
git commit -m "feat: add CacheMetadata Schema.Class

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Create PackageJson schema

**Files:**

- Create: `src/schemas/PackageJson.ts`
- Test: `__test__/schemas/PackageJson.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __test__/schemas/PackageJson.test.ts
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PackageJson } from "../src/schemas/PackageJson.js";

describe("PackageJson", () => {
 it("should decode a minimal package.json", () => {
  const result = Schema.decodeUnknownSync(PackageJson)({
   name: "zod",
   version: "3.22.4",
  });
  expect(result.name).toBe("zod");
  expect(result.version).toBe("3.22.4");
 });

 it("should decode with types field", () => {
  const result = Schema.decodeUnknownSync(PackageJson)({
   name: "zod",
   version: "3.22.4",
   types: "./lib/index.d.ts",
  });
  expect(result.types).toBe("./lib/index.d.ts");
 });

 it("should decode with exports field (string)", () => {
  const result = Schema.decodeUnknownSync(PackageJson)({
   name: "zod",
   version: "3.22.4",
   exports: "./lib/index.js",
  });
  expect(result.exports).toBe("./lib/index.js");
 });

 it("should decode with exports field (object)", () => {
  const result = Schema.decodeUnknownSync(PackageJson)({
   name: "zod",
   version: "3.22.4",
   exports: {
    ".": { types: "./lib/index.d.ts", import: "./lib/index.js" },
   },
  });
  expect(result.exports).toBeDefined();
 });

 it("should reject missing required fields", () => {
  expect(() =>
   Schema.decodeUnknownSync(PackageJson)({
    name: "zod",
   }),
  ).toThrow();
 });

 it("should allow extra fields (passthrough)", () => {
  const result = Schema.decodeUnknownSync(PackageJson)({
   name: "zod",
   version: "3.22.4",
   description: "TypeScript-first schema validation",
   license: "MIT",
  });
  expect(result.name).toBe("zod");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run __test__/schemas/PackageJson.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/schemas/PackageJson.ts
import { Schema } from "effect";

/**
 * Schema for package.json files fetched from CDN.
 * Validates required fields while allowing extra fields to pass through.
 */
export const PackageJson = Schema.Struct({
 name: Schema.String,
 version: Schema.String,
 types: Schema.optional(Schema.String),
 typings: Schema.optional(Schema.String),
 main: Schema.optional(Schema.String),
 module: Schema.optional(Schema.String),
 exports: Schema.optional(
  Schema.Union(Schema.String, Schema.Record({ key: Schema.String, value: Schema.Unknown })),
 ),
 typesVersions: Schema.optional(
  Schema.Record({
   key: Schema.String,
   value: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
  }),
 ),
 dependencies: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
 peerDependencies: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
 devDependencies: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

export type PackageJson = Schema.Schema.Type<typeof PackageJson>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run __test__/schemas/PackageJson.test.ts
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/schemas/PackageJson.ts __test__/schemas/PackageJson.test.ts
git commit -m "feat: add PackageJson Schema.Struct with validation

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 5: Create FileTree and ResolvedModule schemas

**Files:**

- Create: `src/schemas/FileTree.ts`
- Create: `src/schemas/ResolvedModule.ts`
- Create: `src/schemas/index.ts`
- Test: `__test__/schemas/FileTree.test.ts`
- Test: `__test__/schemas/ResolvedModule.test.ts`

- [ ] **Step 1: Write failing tests for FileTree**

```typescript
// __test__/schemas/FileTree.test.ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { FileTreeResponse } from "../src/schemas/FileTree.js";

describe("FileTreeResponse", () => {
 it("should decode a valid jsDelivr response", () => {
  const result = Schema.decodeUnknownSync(FileTreeResponse)({
   default: "/lib/index.js",
   files: [
    { name: "/lib/index.d.ts", hash: "abc123", time: "2024-01-01T00:00:00Z", size: 1234 },
    { name: "/lib/types.d.ts", hash: "def456", time: "2024-01-01T00:00:00Z", size: 5678 },
   ],
  });
  expect(result.default).toBe("/lib/index.js");
  expect(result.files).toHaveLength(2);
  expect(result.files[0].name).toBe("/lib/index.d.ts");
 });

 it("should reject invalid response", () => {
  expect(() =>
   Schema.decodeUnknownSync(FileTreeResponse)({
    files: "not an array",
   }),
  ).toThrow();
 });
});
```

- [ ] **Step 2: Write failing tests for ResolvedModule**

```typescript
// __test__/schemas/ResolvedModule.test.ts
import { Equal } from "effect";
import { describe, expect, it } from "vitest";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import { ResolvedModule } from "../src/schemas/ResolvedModule.js";

describe("ResolvedModule", () => {
 it("should create with required fields", () => {
  const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
  const mod = new ResolvedModule({
   filePath: "lib/index.d.ts",
   isTypeDefinition: true,
   package: pkg,
  });
  expect(mod.filePath).toBe("lib/index.d.ts");
  expect(mod.isTypeDefinition).toBe(true);
  expect(mod._tag).toBe("ResolvedModule");
 });

 it("should support structural equality", () => {
  const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
  const a = new ResolvedModule({ filePath: "lib/index.d.ts", isTypeDefinition: true, package: pkg });
  const b = new ResolvedModule({ filePath: "lib/index.d.ts", isTypeDefinition: true, package: pkg });
  expect(Equal.equals(a, b)).toBe(true);
 });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run __test__/schemas/FileTree.test.ts __test__/schemas/ResolvedModule.test.ts
```

Expected: FAIL — modules not found

- [ ] **Step 4: Write FileTree implementation**

```typescript
// src/schemas/FileTree.ts
import { Schema } from "effect";

/**
 * A single file entry from the jsDelivr flat file tree API.
 */
export const FileTreeEntry = Schema.Struct({
 name: Schema.String,
 hash: Schema.String,
 time: Schema.String,
 size: Schema.Number,
});

export type FileTreeEntry = Schema.Schema.Type<typeof FileTreeEntry>;

/**
 * Response from jsDelivr's `/v1/package/npm/{name}@{version}/flat` endpoint.
 */
export const FileTreeResponse = Schema.Struct({
 default: Schema.String,
 files: Schema.Array(FileTreeEntry),
});

export type FileTreeResponse = Schema.Schema.Type<typeof FileTreeResponse>;
```

- [ ] **Step 5: Write ResolvedModule implementation**

```typescript
// src/schemas/ResolvedModule.ts
import { Data } from "effect";
import type { PackageSpec } from "./PackageSpec.js";

/** @internal */
export const ResolvedModuleBase = Data.TaggedClass("ResolvedModule");

/**
 * A resolved module path within a package.
 * Tracks whether the path points to a type definition file.
 */
export class ResolvedModule extends ResolvedModuleBase<{
 readonly filePath: string;
 readonly isTypeDefinition: boolean;
 readonly package: PackageSpec;
}> {}
```

- [ ] **Step 6: Write schemas index**

```typescript
// src/schemas/index.ts
export { CacheMetadata } from "./CacheMetadata.js";
export { FileTreeEntry, FileTreeResponse } from "./FileTree.js";
export { PackageJson } from "./PackageJson.js";
export { PackageSpec, PackageSpecBase } from "./PackageSpec.js";
export { ResolvedModule, ResolvedModuleBase } from "./ResolvedModule.js";
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm vitest run __test__/schemas/
```

Expected: PASS (all schema tests)

- [ ] **Step 8: Commit**

```bash
git add src/schemas/ __test__/schemas/
git commit -m "feat: add FileTree, ResolvedModule schemas and index

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 2: Error Layer

### Task 6: Create all error types

**Files:**

- Create: `src/errors/NetworkError.ts`
- Create: `src/errors/CacheError.ts`
- Create: `src/errors/PackageNotFoundError.ts`
- Create: `src/errors/ParseError.ts`
- Create: `src/errors/ResolutionError.ts`
- Create: `src/errors/TimeoutError.ts`
- Create: `src/errors/index.ts`
- Test: `__test__/errors/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __test__/errors/errors.test.ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { CacheError } from "../src/errors/CacheError.js";
import { NetworkError } from "../src/errors/NetworkError.js";
import { PackageNotFoundError } from "../src/errors/PackageNotFoundError.js";
import { ParseError } from "../src/errors/ParseError.js";
import { ResolutionError } from "../src/errors/ResolutionError.js";
import { TimeoutError } from "../src/errors/TimeoutError.js";

describe("Tagged Errors", () => {
 it("NetworkError should have correct _tag", () => {
  const err = new NetworkError({ url: "https://cdn.jsdelivr.net", message: "Connection refused" });
  expect(err._tag).toBe("NetworkError");
  expect(err.url).toBe("https://cdn.jsdelivr.net");
  expect(err.message).toBe("Connection refused");
 });

 it("NetworkError should have optional status", () => {
  const err = new NetworkError({ url: "https://cdn.jsdelivr.net", status: 404, message: "Not found" });
  expect(err.status).toBe(404);
 });

 it("CacheError should have correct _tag", () => {
  const err = new CacheError({ operation: "read", path: "/cache/zod", message: "ENOENT" });
  expect(err._tag).toBe("CacheError");
  expect(err.operation).toBe("read");
 });

 it("PackageNotFoundError should have correct _tag", () => {
  const err = new PackageNotFoundError({ name: "nonexistent", version: "1.0.0", message: "Not found" });
  expect(err._tag).toBe("PackageNotFoundError");
 });

 it("ParseError should have correct _tag", () => {
  const err = new ParseError({ source: "package.json", message: "Invalid JSON" });
  expect(err._tag).toBe("ParseError");
 });

 it("ResolutionError should have correct _tag", () => {
  const err = new ResolutionError({ package: "zod", specifier: "./deep", message: "Not found" });
  expect(err._tag).toBe("ResolutionError");
 });

 it("TimeoutError should have correct _tag", () => {
  const err = new TimeoutError({ operation: "fetch", duration: 30000, message: "Timed out" });
  expect(err._tag).toBe("TimeoutError");
 });

 it("should be catchable by tag in Effect", async () => {
  const program = Effect.fail(
   new NetworkError({ url: "https://cdn.jsdelivr.net", message: "fail" }),
  ).pipe(
   Effect.catchTag("NetworkError", (e) => Effect.succeed(`caught: ${e.url}`)),
  );
  const result = await Effect.runPromise(program);
  expect(result).toBe("caught: https://cdn.jsdelivr.net");
 });

 it("should support catchTags for multiple error types", async () => {
  const program = Effect.fail(
   new CacheError({ operation: "write", path: "/cache", message: "ENOSPC" }),
  ).pipe(
   Effect.catchTags({
    NetworkError: (e) => Effect.succeed(`network: ${e.url}`),
    CacheError: (e) => Effect.succeed(`cache: ${e.operation}`),
   }),
  );
  const result = await Effect.runPromise(program);
  expect(result).toBe("cache: write");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run __test__/errors/errors.test.ts
```

Expected: FAIL — modules not found

- [ ] **Step 3: Write NetworkError**

```typescript
// src/errors/NetworkError.ts
import { Data } from "effect";

/** @internal */
export const NetworkErrorBase = Data.TaggedError("NetworkError");

/**
 * HTTP or network-level failure when communicating with CDN.
 */
export class NetworkError extends NetworkErrorBase<{
 readonly url: string;
 readonly status?: number;
 readonly message: string;
}> {}
```

- [ ] **Step 4: Write CacheError**

```typescript
// src/errors/CacheError.ts
import { Data } from "effect";

/** @internal */
export const CacheErrorBase = Data.TaggedError("CacheError");

/**
 * Failure during cache read, write, or delete operations.
 */
export class CacheError extends CacheErrorBase<{
 readonly operation: "read" | "write" | "delete" | "list";
 readonly path: string;
 readonly message: string;
}> {}
```

- [ ] **Step 5: Write PackageNotFoundError**

```typescript
// src/errors/PackageNotFoundError.ts
import { Data } from "effect";

/** @internal */
export const PackageNotFoundErrorBase = Data.TaggedError("PackageNotFoundError");

/**
 * Package does not exist on the registry or no version matches.
 */
export class PackageNotFoundError extends PackageNotFoundErrorBase<{
 readonly name: string;
 readonly version: string;
 readonly message: string;
}> {}
```

- [ ] **Step 6: Write ParseError**

```typescript
// src/errors/ParseError.ts
import { Data } from "effect";

/** @internal */
export const ParseErrorBase = Data.TaggedError("ParseError");

/**
 * Schema validation or JSON parsing failure.
 */
export class ParseError extends ParseErrorBase<{
 readonly source: string;
 readonly message: string;
}> {}
```

- [ ] **Step 7: Write ResolutionError**

```typescript
// src/errors/ResolutionError.ts
import { Data } from "effect";

/** @internal */
export const ResolutionErrorBase = Data.TaggedError("ResolutionError");

/**
 * Failed to resolve an import specifier within a package.
 */
export class ResolutionError extends ResolutionErrorBase<{
 readonly package: string;
 readonly specifier: string;
 readonly message: string;
}> {}
```

- [ ] **Step 8: Write TimeoutError**

```typescript
// src/errors/TimeoutError.ts
import { Data } from "effect";

/** @internal */
export const TimeoutErrorBase = Data.TaggedError("TimeoutError");

/**
 * Operation exceeded configured timeout.
 */
export class TimeoutError extends TimeoutErrorBase<{
 readonly operation: string;
 readonly duration: number;
 readonly message: string;
}> {}
```

- [ ] **Step 9: Write errors index**

```typescript
// src/errors/index.ts
export { CacheError, CacheErrorBase } from "./CacheError.js";
export { NetworkError, NetworkErrorBase } from "./NetworkError.js";
export { PackageNotFoundError, PackageNotFoundErrorBase } from "./PackageNotFoundError.js";
export { ParseError, ParseErrorBase } from "./ParseError.js";
export { ResolutionError, ResolutionErrorBase } from "./ResolutionError.js";
export { TimeoutError, TimeoutErrorBase } from "./TimeoutError.js";

/**
 * Union of all typed errors that TypeRegistry operations can fail with.
 */
export type TypeRegistryError =
 | CacheError
 | NetworkError
 | PackageNotFoundError
 | ParseError
 | ResolutionError
 | TimeoutError;
```

- [ ] **Step 10: Run test to verify it passes**

```bash
pnpm vitest run __test__/errors/errors.test.ts
```

Expected: PASS (all 9 tests)

- [ ] **Step 11: Commit**

```bash
git add src/errors/ __test__/errors/
git commit -m "feat: add Data.TaggedError types for all failure modes

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 3: Service Refactoring

### Task 7: Refactor CacheService interface

Remove `FileSystem.FileSystem` from method signatures. The layer implementation
will close over the filesystem dependency instead of exposing it in the
interface.

**Files:**

- Modify: `src/services/CacheService.ts`

- [ ] **Step 1: Rewrite CacheService interface and tag**

Replace the entire file content. The interface methods now return
`Effect.Effect<A, CacheError>` instead of `Effect.Effect<A, Error, FileSystem.FileSystem>`.
Remove the `CacheServiceImpl` class and `CacheServiceLive` layer — those move
to `src/layers/CacheServiceLive.ts` in Task 10.

```typescript
// src/services/CacheService.ts
import type { Effect } from "effect";
import { Context } from "effect";
import type { CacheError } from "../errors/CacheError.js";
import type { CacheMetadata } from "../schemas/CacheMetadata.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";

/** Virtual file system mapping file paths to content */
export type VirtualFileSystem = Map<string, string>;

/**
 * Cache service for managing disk-based type definition storage.
 * Platform dependencies (FileSystem) are resolved within the layer,
 * not exposed in the interface.
 */
export interface CacheService {
 readonly exists: (pkg: PackageSpec) => Effect.Effect<boolean, CacheError>;
 readonly read: (pkg: PackageSpec, filePath: string) => Effect.Effect<string, CacheError>;
 readonly write: (pkg: PackageSpec, filePath: string, content: string) => Effect.Effect<void, CacheError>;
 readonly listFiles: (pkg: PackageSpec) => Effect.Effect<ReadonlyArray<string>, CacheError>;
 readonly readMetadata: (pkg: PackageSpec) => Effect.Effect<CacheMetadata, CacheError>;
 readonly writeMetadata: (pkg: PackageSpec, metadata: CacheMetadata) => Effect.Effect<void, CacheError>;
 readonly getVFS: (pkg: PackageSpec) => Effect.Effect<VirtualFileSystem, CacheError>;
 readonly remove: (pkg: PackageSpec) => Effect.Effect<void, CacheError>;
}

/**
 * Cache service tag for dependency injection.
 */
export const CacheService = Context.GenericTag<CacheService>("type-registry-effect/CacheService");
```

- [ ] **Step 2: Verify typecheck passes for just this file**

```bash
pnpm tsgo --noEmit src/services/CacheService.ts
```

Note: Other files importing the old signatures will now fail typecheck.
That is expected and will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/services/CacheService.ts
git commit -m "refactor: clean CacheService interface (remove FileSystem from signatures)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 8: Refactor PackageFetcher interface

Remove `HttpClient.HttpClient` from method signatures and use typed errors.

**Files:**

- Modify: `src/services/PackageFetcher.ts`

- [ ] **Step 1: Rewrite PackageFetcher interface, tag, and utility exports**

Keep the `normalizeModuleName` utility function and constants (they are used
by tests). Remove `PackageFetcherImpl` class and `PackageFetcherLive` — those
move to `src/layers/PackageFetcherLive.ts` in Task 11.

```typescript
// src/services/PackageFetcher.ts
import type { Effect } from "effect";
import { Context } from "effect";
import type { NetworkError } from "../errors/NetworkError.js";
import type { PackageNotFoundError } from "../errors/PackageNotFoundError.js";
import type { ParseError } from "../errors/ParseError.js";
import type { FileTreeResponse } from "../schemas/FileTree.js";
import type { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";

/**
 * Package metadata from jsDelivr.
 */
export interface PackageMetadata {
 readonly versions: string[];
 readonly tags: Record<string, string>;
}

/**
 * PackageFetcher service for downloading type definitions from CDN.
 * Platform dependencies (HttpClient) are resolved within the layer.
 */
export interface PackageFetcher {
 readonly getVersions: (name: string) => Effect.Effect<PackageMetadata, NetworkError | ParseError>;
 readonly resolveVersion: (name: string, ref: string) => Effect.Effect<string, NetworkError | PackageNotFoundError>;
 readonly getFileTree: (pkg: PackageSpec) => Effect.Effect<FileTreeResponse, NetworkError | ParseError>;
 readonly downloadFile: (pkg: PackageSpec, path: string) => Effect.Effect<string, NetworkError>;
 readonly getPackageJson: (pkg: PackageSpec) => Effect.Effect<PackageJson, NetworkError | ParseError>;
 readonly getTypeFiles: (pkg: PackageSpec) => Effect.Effect<Map<string, string>, NetworkError | ParseError>;
}

/**
 * PackageFetcher service tag for dependency injection.
 */
export const PackageFetcher = Context.GenericTag<PackageFetcher>("type-registry-effect/PackageFetcher");

// ── Constants ───────────────────────────────────────────────────────────────

/** jsDelivr data API base URL */
export const JSDELIVR_DATA_API = "https://data.jsdelivr.com/v1";

/** jsDelivr CDN base URL */
export const JSDELIVR_CDN = "https://cdn.jsdelivr.net";

/** Type definition file pattern */
export const TYPE_FILE_PATTERN = /\.d\.([^.]+\.)?[cm]?ts$/i;

/**
 * Built-in Node.js modules that don't need fetching.
 */
export const NODE_BUILTINS: Set<string> = new Set([
 "assert", "async_hooks", "buffer", "child_process", "cluster",
 "console", "constants", "crypto", "dgram", "diagnostics_channel",
 "dns", "domain", "events", "fs", "http", "http2", "https",
 "inspector", "module", "net", "os", "path", "perf_hooks",
 "process", "punycode", "querystring", "readline", "repl",
 "stream", "string_decoder", "timers", "tls", "trace_events",
 "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
 "fs/promises", "stream/web", "stream/consumers", "timers/promises", "dns/promises",
]);

/**
 * Normalize module name (handle scoped packages, node: prefix, subpaths).
 */
export function normalizeModuleName(moduleSpecifier: string): string {
 if (moduleSpecifier.startsWith("node:")) return "node";
 if (NODE_BUILTINS.has(moduleSpecifier)) return "node";
 if (moduleSpecifier.startsWith("@")) {
  const parts = moduleSpecifier.split("/");
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return moduleSpecifier;
 }
 const firstSlash = moduleSpecifier.indexOf("/");
 if (firstSlash === -1) return moduleSpecifier;
 return moduleSpecifier.slice(0, firstSlash);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/PackageFetcher.ts
git commit -m "refactor: clean PackageFetcher interface (remove HttpClient from signatures)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 9: Refactor TypeResolver interface

Use typed errors instead of plain `Error`.

**Files:**

- Modify: `src/services/TypeResolver.ts`

- [ ] **Step 1: Rewrite TypeResolver interface and tag**

Keep the `TypeResolverImpl` class logic (it moves to
`src/layers/TypeResolverLive.ts` in Task 12). For now, update only the
interface and tag to use new types.

```typescript
// src/services/TypeResolver.ts
import type { Effect } from "effect";
import { Context } from "effect";
import type { ResolutionError } from "../errors/ResolutionError.js";
import type { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import type { ResolvedModule } from "../schemas/ResolvedModule.js";

/**
 * TypeResolver service for resolving module imports and type definitions.
 * Pure logic — no platform dependencies.
 */
export interface TypeResolver {
 readonly resolveImport: (
  specifier: string,
  packageJson: PackageJson,
  pkg: PackageSpec,
 ) => Effect.Effect<ResolvedModule, ResolutionError>;

 readonly resolveMainEntry: (
  packageJson: PackageJson,
  pkg: PackageSpec,
 ) => Effect.Effect<ResolvedModule, ResolutionError>;

 readonly resolveTypeEntries: (
  packageJson: PackageJson,
  pkg: PackageSpec,
 ) => Effect.Effect<ReadonlyArray<ResolvedModule>, ResolutionError>;

 readonly findTypeDefinition: (
  jsFilePath: string,
  packageJson: PackageJson,
  pkg: PackageSpec,
 ) => Effect.Effect<ResolvedModule | null, ResolutionError>;
}

/**
 * TypeResolver service tag for dependency injection.
 */
export const TypeResolver = Context.GenericTag<TypeResolver>("type-registry-effect/TypeResolver");
```

- [ ] **Step 2: Commit**

```bash
git add src/services/TypeResolver.ts
git commit -m "refactor: clean TypeResolver interface (typed errors)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 10: Create CacheServiceLive layer

Move the `CacheServiceImpl` logic from the old `CacheService.ts` into a proper
`Layer.effect` that closes over `FileSystem.FileSystem`.

**Files:**

- Create: `src/layers/CacheServiceLive.ts`
- Test: `__test__/layers/CacheServiceLive.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __test__/layers/CacheServiceLive.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheService } from "../../src/services/CacheService.js";
import { CacheMetadata } from "../../src/schemas/CacheMetadata.js";
import { PackageSpec } from "../../src/schemas/PackageSpec.js";
import { makeNodeCacheLayer } from "../../src/layers/CacheServiceLive.js";

describe("CacheServiceLive", () => {
 let tempDir: string;
 let testLayer: Layer.Layer<CacheService>;

 beforeEach(() => {
  tempDir = mkdtempSync(Path.join(tmpdir(), "cache-test-"));
  testLayer = makeNodeCacheLayer(tempDir).pipe(Layer.provide(NodeFileSystem.layer));
 });

 afterEach(() => {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
 });

 const run = <A, E>(effect: Effect.Effect<A, E, CacheService>) =>
  Effect.runPromise(Effect.provide(effect, testLayer));

 it("should report non-existent package as not cached", async () => {
  const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
  const result = await run(
   Effect.gen(function* () {
    const cache = yield* CacheService;
    return yield* cache.exists(pkg);
   }),
  );
  expect(result).toBe(false);
 });

 it("should write and read a file", async () => {
  const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
  const result = await run(
   Effect.gen(function* () {
    const cache = yield* CacheService;
    yield* cache.write(pkg, "index.d.ts", "export declare const z: any;");
    return yield* cache.read(pkg, "index.d.ts");
   }),
  );
  expect(result).toBe("export declare const z: any;");
 });

 it("should write and read metadata", async () => {
  const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
  const meta = new CacheMetadata({ version: "3.22.4", cachedAt: Date.now() });
  const result = await run(
   Effect.gen(function* () {
    const cache = yield* CacheService;
    yield* cache.writeMetadata(pkg, meta);
    return yield* cache.readMetadata(pkg);
   }),
  );
  expect(result).toBeInstanceOf(CacheMetadata);
  expect(result.version).toBe("3.22.4");
 });

 it("should generate VFS with node_modules prefix", async () => {
  const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
  const meta = new CacheMetadata({ version: "3.22.4", cachedAt: Date.now() });
  const result = await run(
   Effect.gen(function* () {
    const cache = yield* CacheService;
    yield* cache.write(pkg, "package.json", '{"name":"zod"}');
    yield* cache.write(pkg, "index.d.ts", "export declare const z: any;");
    yield* cache.writeMetadata(pkg, meta);
    return yield* cache.getVFS(pkg);
   }),
  );
  expect(result.has("node_modules/zod/package.json")).toBe(true);
  expect(result.has("node_modules/zod/index.d.ts")).toBe(true);
 });

 it("should remove a cached package", async () => {
  const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
  const meta = new CacheMetadata({ version: "3.22.4", cachedAt: Date.now() });
  const result = await run(
   Effect.gen(function* () {
    const cache = yield* CacheService;
    yield* cache.write(pkg, "index.d.ts", "content");
    yield* cache.writeMetadata(pkg, meta);
    yield* cache.remove(pkg);
    return yield* cache.exists(pkg);
   }),
  );
  expect(result).toBe(false);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run __test__/layers/CacheServiceLive.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/layers/CacheServiceLive.ts
import * as Path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import { CacheError } from "../errors/CacheError.js";
import { CacheMetadata } from "../schemas/CacheMetadata.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import { CacheService } from "../services/CacheService.js";
import { getDefaultCacheDir } from "../utils/xdg.js";

const pkgDir = (baseDir: string, pkg: PackageSpec): string =>
 Path.join(baseDir, `${pkg.name}@${pkg.version}`);

const mapToCacheError = (operation: "read" | "write" | "delete" | "list", path: string) =>
 (error: unknown) => new CacheError({ operation, path, message: String(error) });

/**
 * Create a CacheService layer backed by the filesystem.
 * Closes over FileSystem.FileSystem — consumers provide the platform layer.
 */
export const makeNodeCacheLayer = (
 baseDir?: string,
): Layer.Layer<CacheService, never, FileSystem.FileSystem> =>
 Layer.effect(
  CacheService,
  Effect.gen(function* () {
   const fs = yield* FileSystem.FileSystem;
   const cacheDir = baseDir ?? getDefaultCacheDir();

   return CacheService.of({
    exists: (pkg) =>
     fs.exists(pkgDir(cacheDir, pkg)).pipe(
      Effect.catchAll(() => Effect.succeed(false)),
     ),

    read: (pkg, filePath) => {
     const fullPath = Path.join(pkgDir(cacheDir, pkg), filePath);
     return fs.readFileString(fullPath).pipe(
      Effect.mapError(mapToCacheError("read", fullPath)),
     );
    },

    write: (pkg, filePath, content) => {
     const fullPath = Path.join(pkgDir(cacheDir, pkg), filePath);
     const dirPath = Path.dirname(fullPath);
     return Effect.gen(function* () {
      yield* fs.makeDirectory(dirPath, { recursive: true }).pipe(
       Effect.mapError(mapToCacheError("write", dirPath)),
      );
      yield* fs.writeFileString(fullPath, content).pipe(
       Effect.mapError(mapToCacheError("write", fullPath)),
      );
     });
    },

    listFiles: (pkg) => {
     const cachePath = pkgDir(cacheDir, pkg);
     const listRecursive = (dir: string): Effect.Effect<string[], CacheError, never> =>
      Effect.gen(function* () {
       const entries = yield* fs.readDirectory(dir).pipe(
        Effect.mapError(mapToCacheError("list", dir)),
       );
       const files: string[] = [];
       for (const entry of entries) {
        const fullPath = Path.join(dir, entry);
        const stat = yield* fs.stat(fullPath).pipe(
         Effect.mapError(mapToCacheError("list", fullPath)),
        );
        if (stat.type === "Directory") {
         const subFiles = yield* listRecursive(fullPath);
         files.push(...subFiles);
        } else {
         files.push(Path.relative(cachePath, fullPath));
        }
       }
       return files;
      });
     return listRecursive(cachePath);
    },

    readMetadata: (pkg) => {
     const metaPath = Path.join(pkgDir(cacheDir, pkg), ".metadata.json");
     return fs.readFileString(metaPath).pipe(
      Effect.mapError(mapToCacheError("read", metaPath)),
      Effect.flatMap((content) =>
       Schema.decodeUnknown(CacheMetadata)(JSON.parse(content)).pipe(
        Effect.mapError(mapToCacheError("read", metaPath)),
       ),
      ),
     );
    },

    writeMetadata: (pkg, metadata) => {
     const metaPath = Path.join(pkgDir(cacheDir, pkg), ".metadata.json");
     const dirPath = Path.dirname(metaPath);
     return Effect.gen(function* () {
      yield* fs.makeDirectory(dirPath, { recursive: true }).pipe(
       Effect.mapError(mapToCacheError("write", dirPath)),
      );
      const encoded = Schema.encodeSync(CacheMetadata)(metadata);
      yield* fs.writeFileString(metaPath, JSON.stringify(encoded, null, 2)).pipe(
       Effect.mapError(mapToCacheError("write", metaPath)),
      );
     });
    },

    getVFS: (pkg) =>
     Effect.gen(function* () {
      const cache = CacheService.of(
       // Self-reference: we need listFiles and read from this same service
       // Use a direct implementation instead
       undefined as never,
      );
      // Inline the logic to avoid circular reference
      const cachePath = pkgDir(cacheDir, pkg);
      const listRecursive = (dir: string): Effect.Effect<string[], CacheError, never> =>
       Effect.gen(function* () {
        const entries = yield* fs.readDirectory(dir).pipe(
         Effect.mapError(mapToCacheError("list", dir)),
        );
        const files: string[] = [];
        for (const entry of entries) {
         const fullPath = Path.join(dir, entry);
         const stat = yield* fs.stat(fullPath).pipe(
          Effect.mapError(mapToCacheError("list", fullPath)),
         );
         if (stat.type === "Directory") {
          const subFiles = yield* listRecursive(fullPath);
          files.push(...subFiles);
         } else {
          files.push(Path.relative(cachePath, fullPath));
         }
        }
        return files;
       });

      const files = yield* listRecursive(cachePath);
      const vfs = new Map<string, string>();
      for (const file of files) {
       if (file === ".metadata.json") continue;
       const fullPath = Path.join(cachePath, file);
       const content = yield* fs.readFileString(fullPath).pipe(
        Effect.mapError(mapToCacheError("read", fullPath)),
       );
       const vfsPath = Path.join("node_modules", pkg.name, file);
       vfs.set(vfsPath, content);
      }
      return vfs;
     }),

    remove: (pkg) => {
     const cachePath = pkgDir(cacheDir, pkg);
     return fs.remove(cachePath, { recursive: true }).pipe(
      Effect.mapError(mapToCacheError("delete", cachePath)),
     );
    },
   });
  }),
 );

/**
 * Default CacheService layer using XDG cache directory.
 * Requires FileSystem.FileSystem to be provided.
 */
export const CacheServiceLive: Layer.Layer<CacheService, never, FileSystem.FileSystem> =
 makeNodeCacheLayer();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run __test__/layers/CacheServiceLive.test.ts
```

Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/layers/CacheServiceLive.ts __test__/layers/CacheServiceLive.test.ts
git commit -m "feat: add CacheServiceLive layer (closes over FileSystem)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 11: Create PackageFetcherLive layer

Move the `PackageFetcherImpl` logic into a `Layer.effect` that closes over
`HttpClient.HttpClient`. Add Schema validation for CDN responses.

**Files:**

- Create: `src/layers/PackageFetcherLive.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/layers/PackageFetcherLive.ts
import { HttpClient } from "@effect/platform";
import { Duration, Effect, Layer, Schedule, Schema } from "effect";
import { NetworkError } from "../errors/NetworkError.js";
import { PackageNotFoundError } from "../errors/PackageNotFoundError.js";
import { ParseError } from "../errors/ParseError.js";
import { FileTreeResponse } from "../schemas/FileTree.js";
import { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import {
 JSDELIVR_CDN,
 JSDELIVR_DATA_API,
 type PackageFetcher,
 PackageFetcher as PackageFetcherTag,
 TYPE_FILE_PATTERN,
} from "../services/PackageFetcher.js";

/** Exponential backoff: 100ms, 200ms, 400ms (3 retries) */
const retrySchedule = Schedule.exponential(Duration.millis(100)).pipe(
 Schedule.compose(Schedule.recurs(3)),
);

const defaultTimeout = Duration.seconds(30);

/**
 * PackageFetcher layer backed by HttpClient.
 * Closes over HttpClient — consumers provide the platform layer.
 */
export const PackageFetcherLive: Layer.Layer<PackageFetcher, never, HttpClient.HttpClient> =
 Layer.effect(
  PackageFetcherTag,
  Effect.gen(function* () {
   const http = yield* HttpClient.HttpClient;

   const fetchJson = (url: string) =>
    http.get(url).pipe(
     Effect.flatMap((res) => res.json),
     Effect.timeout(defaultTimeout),
     Effect.retry(retrySchedule),
     Effect.mapError((error) =>
      new NetworkError({ url, message: String(error) }),
     ),
    );

   const fetchText = (url: string) =>
    http.get(url).pipe(
     Effect.flatMap((res) => res.text),
     Effect.timeout(defaultTimeout),
     Effect.retry(retrySchedule),
     Effect.mapError((error) =>
      new NetworkError({ url, message: String(error) }),
     ),
    );

   return PackageFetcherTag.of({
    getVersions: (name) =>
     fetchJson(`${JSDELIVR_DATA_API}/package/npm/${name}`).pipe(
      Effect.map((data) => data as { versions: string[]; tags: Record<string, string> }),
     ),

    resolveVersion: (name, ref) =>
     fetchJson(`${JSDELIVR_DATA_API}/package/resolve/npm/${name}@${ref}`).pipe(
      Effect.map((data) => (data as { version: string }).version),
      Effect.catchTag("NetworkError", (e) =>
       Effect.fail(
        new PackageNotFoundError({
         name,
         version: ref,
         message: e.message,
        }),
       ),
      ),
     ),

    getFileTree: (pkg) =>
     fetchJson(`${JSDELIVR_DATA_API}/package/npm/${pkg.name}@${pkg.version}/flat`).pipe(
      Effect.flatMap((data) =>
       Schema.decodeUnknown(FileTreeResponse)(data).pipe(
        Effect.mapError((e) =>
         new ParseError({
          source: `${pkg.name}@${pkg.version}/flat`,
          message: `Schema validation failed: ${String(e)}`,
         }),
        ),
       ),
      ),
     ),

    downloadFile: (pkg, filePath) => {
     const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
     return fetchText(
      `${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}${normalizedPath}`,
     );
    },

    getPackageJson: (pkg) =>
     fetchText(`${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}/package.json`).pipe(
      Effect.flatMap((content) =>
       Schema.decodeUnknown(PackageJson)(JSON.parse(content)).pipe(
        Effect.mapError((e) =>
         new ParseError({
          source: `${pkg.name}@${pkg.version}/package.json`,
          message: `Schema validation failed: ${String(e)}`,
         }),
        ),
       ),
      ),
     ),

    getTypeFiles: (pkg) =>
     Effect.gen(function* () {
      const fileTree = yield* fetchJson(
       `${JSDELIVR_DATA_API}/package/npm/${pkg.name}@${pkg.version}/flat`,
      ).pipe(
       Effect.flatMap((data) =>
        Schema.decodeUnknown(FileTreeResponse)(data).pipe(
         Effect.mapError((e) =>
          new ParseError({
           source: `${pkg.name}@${pkg.version}/flat`,
           message: `Schema validation failed: ${String(e)}`,
          }),
         ),
        ),
       ),
      );

      const typeFiles = fileTree.files.filter((f) => TYPE_FILE_PATTERN.test(f.name));
      const vfs = new Map<string, string>();

      for (const file of typeFiles) {
       const normalizedPath = file.name.startsWith("/") ? file.name : `/${file.name}`;
       const content = yield* fetchText(
        `${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}${normalizedPath}`,
       );
       vfs.set(file.name, content);
      }

      // Include package.json if not already in type files
      const hasPackageJson = fileTree.files.some((f) => f.name === "/package.json");
      if (!hasPackageJson) {
       const pkgContent = yield* fetchText(
        `${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}/package.json`,
       );
       vfs.set("/package.json", pkgContent);
      }

      return vfs;
     }),
   });
  }),
 );
```

- [ ] **Step 2: Commit**

```bash
git add src/layers/PackageFetcherLive.ts
git commit -m "feat: add PackageFetcherLive layer (closes over HttpClient)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 12: Create TypeResolverLive layer

Move the `TypeResolverImpl` class logic into a proper `Layer.succeed`.

**Files:**

- Create: `src/layers/TypeResolverLive.ts`

- [ ] **Step 1: Write the implementation**

Move the full `TypeResolverImpl` class from the current
`src/services/TypeResolver.ts` into this file. Adapt it to return
`ResolvedModule` data class instances instead of plain objects, and use
`ResolutionError` instead of plain `Error`. The layer has no dependencies
(pure logic).

```typescript
// src/layers/TypeResolverLive.ts
import * as Path from "node:path";
import { Effect, Layer } from "effect";
import { ResolutionError } from "../errors/ResolutionError.js";
import type { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import { ResolvedModule } from "../schemas/ResolvedModule.js";
import { TypeResolver } from "../services/TypeResolver.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_EXTENSIONS: Set<string> = new Set([".d.ts", ".d.mts", ".d.cts"]);

function isTypeDefinition(filePath: string): boolean {
 return TYPE_EXTENSIONS.has(Path.extname(filePath)) || filePath.endsWith(".d.ts");
}

function normalizePath(path: string): string {
 return path.replace(/\\/g, "/");
}

function tryExtensions(basePath: string): string[] {
 return [
  basePath, `${basePath}.d.ts`, `${basePath}.d.mts`, `${basePath}.d.cts`,
  `${basePath}.ts`, `${basePath}.mts`, `${basePath}.cts`,
  `${basePath}.js`, `${basePath}.mjs`, `${basePath}.cjs`,
  `${basePath}/index.d.ts`, `${basePath}/index.d.mts`, `${basePath}/index.d.cts`,
  `${basePath}/index.ts`, `${basePath}/index.js`,
 ].map(normalizePath);
}

// ── Export value helpers ────────────────────────────────────────────────────

function getExportValue(
 exports: PackageJson["exports"],
 subpath: string,
): string | Record<string, unknown> | null {
 if (!exports) return null;
 if (typeof exports === "string") return subpath === "." ? exports : null;
 if (typeof exports === "object" && exports !== null) {
  const value = (exports as Record<string, unknown>)[subpath];
  if (value !== undefined) return value as string | Record<string, unknown>;
  const withoutDot = subpath.replace(/^\.\//, "");
  const alt = (exports as Record<string, unknown>)[withoutDot];
  if (alt !== undefined) return alt as string | Record<string, unknown>;
  for (const [pattern, val] of Object.entries(exports as Record<string, unknown>)) {
   if (pattern.includes("*")) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    if (regex.test(subpath) || regex.test(withoutDot))
     return val as string | Record<string, unknown>;
   }
  }
 }
 return null;
}

function extractTypesFromExport(
 exportValue: string | Record<string, unknown> | null,
): string | null {
 if (!exportValue) return null;
 if (typeof exportValue === "string") return exportValue;
 if (typeof exportValue === "object" && exportValue !== null) {
  const obj = exportValue as Record<string, unknown>;
  if (typeof obj.types === "string") return obj.types;
  if (typeof obj.import === "string") return obj.import;
  if (typeof obj.default === "string") return obj.default;
  if (typeof obj.import === "object")
   return extractTypesFromExport(obj.import as Record<string, unknown>);
  if (typeof obj.default === "object")
   return extractTypesFromExport(obj.default as Record<string, unknown>);
 }
 return null;
}

// ── Layer ───────────────────────────────────────────────────────────────────

/**
 * TypeResolver layer — pure logic, no platform dependencies.
 */
export const TypeResolverLive: Layer.Layer<TypeResolver> = Layer.succeed(
 TypeResolver,
 TypeResolver.of({
  resolveImport: (specifier, packageJson, pkg) =>
   Effect.gen(function* () {
    let subpath = specifier;
    if (specifier.startsWith(pkg.name)) {
     subpath = specifier.slice(pkg.name.length);
    }
    subpath = subpath.replace(/^\//, "");
    if (!subpath.startsWith(".")) subpath = `./${subpath}`;

    // Try exports
    if (packageJson.exports) {
     const lookupPath = subpath.startsWith("./") ? subpath : `./${subpath}`;
     const exportValue = getExportValue(packageJson.exports, lookupPath);
     if (exportValue) {
      const typesPath = extractTypesFromExport(exportValue);
      if (typesPath) {
       return new ResolvedModule({
        filePath: normalizePath(typesPath.replace(/^\.\//, "")),
        isTypeDefinition: isTypeDefinition(typesPath),
        package: pkg,
       });
      }
     }
    }

    // Try typesVersions
    if (packageJson.typesVersions) {
     const versionMap = packageJson.typesVersions["*"];
     if (versionMap) {
      const lookupPath = subpath.replace(/^\.\//, "");
      if (versionMap[lookupPath]) {
       const resolved = versionMap[lookupPath];
       const path = Array.isArray(resolved) ? resolved[0] : resolved;
       if (path) {
        return new ResolvedModule({
         filePath: normalizePath(path.replace(/^\.\//, "")),
         isTypeDefinition: isTypeDefinition(path),
         package: pkg,
        });
       }
      }
      for (const [pattern, paths] of Object.entries(versionMap)) {
       if (pattern.includes("*")) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
        if (regex.test(lookupPath)) {
         const resolved = Array.isArray(paths) ? paths[0] : paths;
         if (resolved) {
          const captured = lookupPath.replace(regex, "$1");
          const finalPath = resolved.replace("*", captured);
          return new ResolvedModule({
           filePath: normalizePath(finalPath.replace(/^\.\//, "")),
           isTypeDefinition: isTypeDefinition(finalPath),
           package: pkg,
          });
         }
        }
       }
      }
     }
    }

    // Fallback
    const candidates = tryExtensions(subpath.replace(/^\.\//, ""));
    for (const candidate of candidates) {
     if (isTypeDefinition(candidate)) {
      return new ResolvedModule({
       filePath: normalizePath(candidate),
       isTypeDefinition: true,
       package: pkg,
      });
     }
    }

    const fallback = normalizePath(candidates[0] || subpath);
    return new ResolvedModule({
     filePath: fallback,
     isTypeDefinition: isTypeDefinition(candidates[0] || subpath),
     package: pkg,
    });
   }),

  resolveMainEntry: (packageJson, pkg) =>
   Effect.gen(function* () {
    let mainPath: string | undefined;

    if (packageJson.types) {
     mainPath = packageJson.types;
    } else if (packageJson.typings) {
     mainPath = packageJson.typings;
    } else if (packageJson.exports) {
     const rootExport = getExportValue(packageJson.exports, ".");
     if (rootExport) {
      const typesPath = extractTypesFromExport(rootExport);
      if (typesPath) mainPath = typesPath;
     }
    }

    if (!mainPath && packageJson.main) {
     const mainWithoutExt = packageJson.main.replace(/\.(m?[jt]s|cjs)$/, "");
     const candidates = tryExtensions(mainWithoutExt);
     mainPath = candidates.find((c) => isTypeDefinition(c)) || packageJson.main;
    }

    if (!mainPath) mainPath = "index.d.ts";

    const normalizedPath = normalizePath(mainPath.replace(/^\.\//, ""));
    return new ResolvedModule({
     filePath: normalizedPath,
     isTypeDefinition: isTypeDefinition(normalizedPath),
     package: pkg,
    });
   }),

  resolveTypeEntries: (packageJson, pkg) =>
   Effect.gen(function* () {
    const resolver = TypeResolver.of(TypeResolverLive as never);
    // Inline logic to avoid circular issues
    const entries: ResolvedModule[] = [];

    // Main entry
    let mainPath: string | undefined;
    if (packageJson.types) mainPath = packageJson.types;
    else if (packageJson.typings) mainPath = packageJson.typings;
    else if (packageJson.exports) {
     const rootExport = getExportValue(packageJson.exports, ".");
     if (rootExport) {
      const typesPath = extractTypesFromExport(rootExport);
      if (typesPath) mainPath = typesPath;
     }
    }
    if (!mainPath && packageJson.main) {
     const mainWithoutExt = packageJson.main.replace(/\.(m?[jt]s|cjs)$/, "");
     const candidates = tryExtensions(mainWithoutExt);
     mainPath = candidates.find((c) => isTypeDefinition(c)) || packageJson.main;
    }
    if (!mainPath) mainPath = "index.d.ts";

    entries.push(
     new ResolvedModule({
      filePath: normalizePath(mainPath.replace(/^\.\//, "")),
      isTypeDefinition: isTypeDefinition(mainPath),
      package: pkg,
     }),
    );

    // Export entries
    if (packageJson.exports && typeof packageJson.exports === "object") {
     for (const [key, value] of Object.entries(
      packageJson.exports as Record<string, unknown>,
     )) {
      if (!key.startsWith(".") && key !== "*") continue;
      const typesPath = extractTypesFromExport(
       value as string | Record<string, unknown>,
      );
      if (typesPath) {
       entries.push(
        new ResolvedModule({
         filePath: normalizePath(typesPath.replace(/^\.\//, "")),
         isTypeDefinition: isTypeDefinition(typesPath),
         package: pkg,
        }),
       );
      }
     }
    }

    // Deduplicate
    const seen = new Set<string>();
    return entries.filter((e) => {
     if (seen.has(e.filePath)) return false;
     seen.add(e.filePath);
     return true;
    });
   }),

  findTypeDefinition: (jsFilePath, _packageJson, pkg) =>
   Effect.sync(() => {
    let typePath: string;
    if (jsFilePath.endsWith(".mjs"))
     typePath = jsFilePath.replace(/\.mjs$/, ".d.mts");
    else if (jsFilePath.endsWith(".cjs"))
     typePath = jsFilePath.replace(/\.cjs$/, ".d.cts");
    else if (jsFilePath.endsWith(".js"))
     typePath = jsFilePath.replace(/\.js$/, ".d.ts");
    else {
     const withoutExt = jsFilePath.replace(/\.(m?js|cjs)$/, "");
     typePath = `${withoutExt}.d.ts`;
    }

    return new ResolvedModule({
     filePath: normalizePath(typePath),
     isTypeDefinition: true,
     package: pkg,
    });
   }),
 }),
);
```

- [ ] **Step 2: Commit**

```bash
git add src/layers/TypeResolverLive.ts
git commit -m "feat: add TypeResolverLive layer (pure, no platform deps)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 4: Remove TypeRegistry Class

### Task 13: Create TypeRegistry namespace module

Replace the class with composable Effect programs.

**Files:**

- Rewrite: `src/TypeRegistry.ts`

- [ ] **Step 1: Rewrite TypeRegistry.ts as namespace module**

```typescript
// src/TypeRegistry.ts
/**
 * Composable Effect programs for managing type definitions.
 * Use these with Effect.provide(layer) for full control,
 * or use the convenience API from platforms/node.ts.
 *
 * @example
 * ```typescript
 * import * as TypeRegistry from "type-registry-effect";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const pkg = new TypeRegistry.PackageSpec({ name: "zod", version: "3.23.8" });
 *   yield* TypeRegistry.fetchAndCache(pkg);
 *   return yield* TypeRegistry.getVFS([pkg]);
 * });
 * ```
 */
import { Effect } from "effect";
import type { CacheError } from "./errors/CacheError.js";
import type { NetworkError } from "./errors/NetworkError.js";
import type { PackageNotFoundError } from "./errors/PackageNotFoundError.js";
import type { ParseError } from "./errors/ParseError.js";
import type { ResolutionError } from "./errors/ResolutionError.js";
import type { TypeRegistryError } from "./errors/index.js";
import { CacheMetadata } from "./schemas/CacheMetadata.js";
import type { PackageJson } from "./schemas/PackageJson.js";
import type { PackageSpec } from "./schemas/PackageSpec.js";
import type { ResolvedModule } from "./schemas/ResolvedModule.js";
import { CacheService, type VirtualFileSystem } from "./services/CacheService.js";
import { PackageFetcher } from "./services/PackageFetcher.js";
import { TypeResolver } from "./services/TypeResolver.js";

/**
 * Check if a package is cached.
 */
export const hasCached = (
 pkg: PackageSpec,
): Effect.Effect<boolean, CacheError, CacheService> =>
 Effect.gen(function* () {
  const cache = yield* CacheService;
  return yield* cache.exists(pkg);
 });

/**
 * Fetch and cache a package's type definitions.
 */
export const fetchAndCache = (
 pkg: PackageSpec,
 options?: { ttl?: number },
): Effect.Effect<void, NetworkError | ParseError | CacheError, CacheService | PackageFetcher> =>
 Effect.gen(function* () {
  const cache = yield* CacheService;
  const fetcher = yield* PackageFetcher;

  // Check if cached and not stale
  const exists = yield* cache.exists(pkg);
  if (exists) {
   const metadata = yield* cache.readMetadata(pkg);
   if (metadata.ttl && Date.now() - metadata.cachedAt < metadata.ttl) {
    return;
   }
  }

  // Fetch from CDN
  const packageJson = yield* fetcher.getPackageJson(pkg);
  const typeFiles = yield* fetcher.getTypeFiles(pkg);

  // Write to cache
  yield* cache.write(pkg, "package.json", JSON.stringify(packageJson, null, 2));

  for (const [filePath, content] of typeFiles) {
   const normalized = filePath.replace(/^\//, "");
   if (normalized !== "package.json") {
    yield* cache.write(pkg, normalized, content);
   }
  }

  yield* cache.writeMetadata(
   pkg,
   new CacheMetadata({
    version: pkg.version,
    cachedAt: Date.now(),
    ...(options?.ttl !== undefined ? { ttl: options.ttl } : {}),
   }),
  );
 });

/**
 * Get VFS for a single cached package (fetches if not cached and autoFetch is true).
 */
export const getPackageVFS = (
 pkg: PackageSpec,
 options?: { autoFetch?: boolean; ttl?: number },
): Effect.Effect<VirtualFileSystem, NetworkError | ParseError | CacheError | PackageNotFoundError, CacheService | PackageFetcher> =>
 Effect.gen(function* () {
  const cache = yield* CacheService;
  const autoFetch = options?.autoFetch ?? true;

  const exists = yield* cache.exists(pkg);
  if (!exists && autoFetch) {
   yield* fetchAndCache(pkg, { ttl: options?.ttl });
  } else if (!exists) {
   yield* Effect.fail(
    new (await import("./errors/PackageNotFoundError.js")).PackageNotFoundError({
     name: pkg.name,
     version: pkg.version,
     message: `Package ${pkg.toString()} is not cached and autoFetch is disabled`,
    }),
   );
  }

  return yield* cache.getVFS(pkg);
 });

/**
 * Get combined VFS for multiple packages with graceful degradation.
 * Continues processing if individual packages fail.
 */
export const getVFS = (
 packages: ReadonlyArray<PackageSpec>,
 options?: { autoFetch?: boolean; ttl?: number },
): Effect.Effect<VirtualFileSystem, PackageNotFoundError, CacheService | PackageFetcher> =>
 Effect.gen(function* () {
  const results = yield* Effect.forEach(
   packages,
   (pkg) =>
    getPackageVFS(pkg, options).pipe(
     Effect.map((vfs) => ({ pkg, vfs, error: null as TypeRegistryError | null })),
     Effect.catchAll((error) =>
      Effect.succeed({ pkg, vfs: new Map() as VirtualFileSystem, error }),
     ),
    ),
   { concurrency: 5 },
  );

  const failures = results.filter((r) => r.error !== null);
  if (failures.length === packages.length && packages.length > 0) {
   const { PackageNotFoundError } = await import("./errors/PackageNotFoundError.js");
   return yield* Effect.fail(
    new PackageNotFoundError({
     name: packages.map((p) => p.toString()).join(", "),
     version: "",
     message: `All ${packages.length} packages failed to load`,
    }),
   );
  }

  const vfs: VirtualFileSystem = new Map();
  for (const { vfs: pkgVfs } of results) {
   for (const [path, content] of pkgVfs) {
    vfs.set(path, content);
   }
  }
  return vfs;
 });

/**
 * Resolve an import specifier for a cached package.
 */
export const resolveImport = (
 pkg: PackageSpec,
 importSpecifier: string,
): Effect.Effect<ResolvedModule, CacheError | ResolutionError, CacheService | TypeResolver> =>
 Effect.gen(function* () {
  const cache = yield* CacheService;
  const resolver = yield* TypeResolver;

  const packageJsonContent = yield* cache.read(pkg, "package.json");
  const packageJson = JSON.parse(packageJsonContent) as PackageJson;

  return yield* resolver.resolveImport(importSpecifier, packageJson, pkg);
 });

/**
 * Get all type entry points for a cached package.
 */
export const getTypeEntries = (
 pkg: PackageSpec,
): Effect.Effect<ReadonlyArray<ResolvedModule>, CacheError | ResolutionError, CacheService | TypeResolver> =>
 Effect.gen(function* () {
  const cache = yield* CacheService;
  const resolver = yield* TypeResolver;

  const packageJsonContent = yield* cache.read(pkg, "package.json");
  const packageJson = JSON.parse(packageJsonContent) as PackageJson;

  return yield* resolver.resolveTypeEntries(packageJson, pkg);
 });

/**
 * Resolve a version reference to a specific version.
 */
export const resolveVersion = (
 packageName: string,
 versionRef: string,
): Effect.Effect<string, NetworkError | PackageNotFoundError, PackageFetcher> =>
 Effect.gen(function* () {
  const fetcher = yield* PackageFetcher;
  return yield* fetcher.resolveVersion(packageName, versionRef);
 });

/**
 * Remove a package from cache.
 */
export const clearCache = (
 pkg: PackageSpec,
): Effect.Effect<void, CacheError, CacheService> =>
 Effect.gen(function* () {
  const cache = yield* CacheService;
  yield* cache.remove(pkg);
 });
```

- [ ] **Step 2: Commit**

```bash
git add src/TypeRegistry.ts
git commit -m "refactor: convert TypeRegistry from class to namespace module

Effect programs are now composable values instead of Promise-returning
methods wrapped in a class.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 14: Create TypeRegistryLive composed layer

**Files:**

- Create: `src/layers/TypeRegistryLive.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/layers/TypeRegistryLive.ts
import type { FileSystem, HttpClient } from "@effect/platform";
import { Layer } from "effect";
import type { CacheService } from "../services/CacheService.js";
import type { PackageFetcher } from "../services/PackageFetcher.js";
import type { TypeResolver } from "../services/TypeResolver.js";
import { CacheServiceLive } from "./CacheServiceLive.js";
import { PackageFetcherLive } from "./PackageFetcherLive.js";
import { TypeResolverLive } from "./TypeResolverLive.js";

/**
 * Composed layer providing all TypeRegistry services.
 * Requires platform layers (FileSystem + HttpClient) to be provided.
 */
export const TypeRegistryLive: Layer.Layer<
 CacheService | PackageFetcher | TypeResolver,
 never,
 FileSystem.FileSystem | HttpClient.HttpClient
> = Layer.mergeAll(CacheServiceLive, PackageFetcherLive, TypeResolverLive);
```

- [ ] **Step 2: Commit**

```bash
git add src/layers/TypeRegistryLive.ts
git commit -m "feat: add TypeRegistryLive composed layer

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 15: Create Node.js platform module

**Files:**

- Create: `src/platforms/node.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/platforms/node.ts
/**
 * Node.js platform layer and Promise convenience API.
 *
 * @example
 * ```typescript
 * // Effect consumer
 * import { NodeLayer } from "type-registry-effect/node";
 * import * as TypeRegistry from "type-registry-effect";
 * import { Effect } from "effect";
 *
 * const program = TypeRegistry.fetchAndCache(pkg).pipe(
 *   Effect.provide(NodeLayer),
 * );
 *
 * // Promise consumer
 * import { fetchAndCache } from "type-registry-effect/node";
 * await fetchAndCache(pkg);
 * ```
 */
import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import {
 createDefaultMapFromNodeModules,
 createFSBackedSystem,
 createVirtualTypeScriptEnvironment,
} from "@typescript/vfs";
import { Effect, Layer } from "effect";
import * as ts from "typescript";
import type { CacheError } from "../errors/CacheError.js";
import type { NetworkError } from "../errors/NetworkError.js";
import type { PackageNotFoundError } from "../errors/PackageNotFoundError.js";
import type { ParseError } from "../errors/ParseError.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import type { VirtualFileSystem } from "../services/CacheService.js";
import * as TypeRegistry from "../TypeRegistry.js";
import { TypeRegistryLive } from "../layers/TypeRegistryLive.js";

/**
 * Full Node.js layer stack providing all TypeRegistry services.
 */
export const NodeLayer = TypeRegistryLive.pipe(
 Layer.provide(NodeFileSystem.layer),
 Layer.provide(NodeHttpClient.layerUndici),
);

// ── Promise Convenience API ─────────────────────────────────────────────────

/**
 * Check if a package is cached.
 */
export const hasCached = (pkg: PackageSpec): Promise<boolean> =>
 Effect.runPromise(TypeRegistry.hasCached(pkg).pipe(Effect.provide(NodeLayer)));

/**
 * Fetch and cache a package's type definitions.
 */
export const fetchAndCache = (pkg: PackageSpec, options?: { ttl?: number }): Promise<void> =>
 Effect.runPromise(TypeRegistry.fetchAndCache(pkg, options).pipe(Effect.provide(NodeLayer)));

/**
 * Get combined VFS for multiple packages.
 */
export const getVFS = (
 packages: ReadonlyArray<PackageSpec>,
 options?: { autoFetch?: boolean; ttl?: number },
): Promise<VirtualFileSystem> =>
 Effect.runPromise(TypeRegistry.getVFS(packages, options).pipe(Effect.provide(NodeLayer)));

/**
 * Resolve a version reference to a specific version.
 */
export const resolveVersion = (packageName: string, versionRef: string): Promise<string> =>
 Effect.runPromise(TypeRegistry.resolveVersion(packageName, versionRef).pipe(Effect.provide(NodeLayer)));

/**
 * Create a TypeScript virtual environment cache for Twoslash.
 */
export const createTypeScriptCache = async (
 packages: ReadonlyArray<PackageSpec>,
 compilerOptions: ts.CompilerOptions,
): Promise<Map<string, VirtualTypeScriptEnvironment>> => {
 const vfs = await getVFS(packages, { autoFetch: true });

 // Add TypeScript lib files
 const libMap = createDefaultMapFromNodeModules(compilerOptions, ts);
 for (const [path, content] of libMap) {
  vfs.set(path, content);
 }

 const sys = createFSBackedSystem(vfs, process.cwd(), ts);
 const rootFiles = Array.from(vfs.keys()).filter(
  (p) => p.endsWith(".d.ts") || p.endsWith(".d.mts") || p.endsWith(".d.cts"),
 );

 const tsEnv = createVirtualTypeScriptEnvironment(sys, rootFiles, ts, compilerOptions);
 const cacheKey = JSON.stringify(compilerOptions);
 const cache = new Map<string, VirtualTypeScriptEnvironment>();
 cache.set(cacheKey, tsEnv);
 return cache;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/platforms/node.ts
git commit -m "feat: add Node.js platform layer and Promise convenience API

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 16: Update index.ts exports

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite index.ts**

```typescript
// src/index.ts
/**
 * type-registry-effect
 *
 * Version-aware type definition registry for TypeScript documentation with Twoslash.
 * Built with Effect for composable async operations and typed error handling.
 *
 * @packageDocumentation
 */

// ── Namespace Modules ───────────────────────────────────────────────────────
export * as TypeRegistry from "./TypeRegistry.js";
export * as VirtualPackage from "./VirtualPackage.js";

// ── Schemas ─────────────────────────────────────────────────────────────────
export { PackageSpec, PackageSpecBase } from "./schemas/PackageSpec.js";
export { CacheMetadata } from "./schemas/CacheMetadata.js";
export { PackageJson } from "./schemas/PackageJson.js";
export { FileTreeEntry, FileTreeResponse } from "./schemas/FileTree.js";
export { ResolvedModule, ResolvedModuleBase } from "./schemas/ResolvedModule.js";

// ── Errors ──────────────────────────────────────────────────────────────────
export { CacheError, CacheErrorBase } from "./errors/CacheError.js";
export { NetworkError, NetworkErrorBase } from "./errors/NetworkError.js";
export { PackageNotFoundError, PackageNotFoundErrorBase } from "./errors/PackageNotFoundError.js";
export { ParseError, ParseErrorBase } from "./errors/ParseError.js";
export { ResolutionError, ResolutionErrorBase } from "./errors/ResolutionError.js";
export { TimeoutError, TimeoutErrorBase } from "./errors/TimeoutError.js";
export type { TypeRegistryError } from "./errors/index.js";

// ── Services ────────────────────────────────────────────────────────────────
export { CacheService, type VirtualFileSystem } from "./services/CacheService.js";
export { PackageFetcher, normalizeModuleName } from "./services/PackageFetcher.js";
export { TypeResolver } from "./services/TypeResolver.js";

// ── Layers ──────────────────────────────────────────────────────────────────
export { CacheServiceLive, makeNodeCacheLayer } from "./layers/CacheServiceLive.js";
export { PackageFetcherLive } from "./layers/PackageFetcherLive.js";
export { TypeResolverLive } from "./layers/TypeResolverLive.js";
export { TypeRegistryLive } from "./layers/TypeRegistryLive.js";

// ── Events ──────────────────────────────────────────────────────────────────
export { LogEventSchema, type LogEvent, type LogEventHandler } from "./events.js";

// ── External Types ──────────────────────────────────────────────────────────
export type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "refactor: update index.ts exports for Effect-first API

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 17: Delete obsolete files

**Files:**

- Delete: `src/types.ts`
- Delete: `src/Logger.ts` (if it exists)

- [ ] **Step 1: Delete types.ts**

```bash
git rm src/types.ts
```

- [ ] **Step 2: Delete Logger.ts if it exists**

```bash
git rm src/Logger.ts 2>/dev/null || echo "Logger.ts not found, skipping"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove obsolete types.ts and Logger.ts

Replaced by src/schemas/ and src/errors/ modules.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 18: Create test layers and update tests

**Files:**

- Create: `__test__/utils/TestLayers.ts`
- Modify: `__test__/TypeRegistry.unit.test.ts`

- [ ] **Step 1: Create TestLayers**

```typescript
// __test__/utils/TestLayers.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as Path from "node:path";
import { Effect, Layer } from "effect";
import { CacheError } from "../../src/errors/CacheError.js";
import { CacheMetadata } from "../../src/schemas/CacheMetadata.js";
import type { PackageSpec } from "../../src/schemas/PackageSpec.js";
import { CacheService, type VirtualFileSystem } from "../../src/services/CacheService.js";
import { PackageFetcher } from "../../src/services/PackageFetcher.js";
import { TypeResolver } from "../../src/services/TypeResolver.js";
import { TypeResolverLive } from "../../src/layers/TypeResolverLive.js";

// ── In-Memory Cache ─────────────────────────────────────────────────────────

export const InMemoryCacheLayer: Layer.Layer<CacheService> = Layer.effect(
 CacheService,
 Effect.gen(function* () {
  const store = new Map<string, string>();

  return CacheService.of({
   exists: (pkg) => Effect.succeed(store.has(`${pkg.name}@${pkg.version}/metadata`)),

   read: (pkg, path) => {
    const key = `${pkg.name}@${pkg.version}/${path}`;
    const content = store.get(key);
    return content
     ? Effect.succeed(content)
     : Effect.fail(new CacheError({ operation: "read", path: key, message: "Not found" }));
   },

   write: (pkg, path, content) =>
    Effect.sync(() => {
     store.set(`${pkg.name}@${pkg.version}/${path}`, content);
    }),

   listFiles: (pkg) =>
    Effect.sync(() => {
     const prefix = `${pkg.name}@${pkg.version}/`;
     return Array.from(store.keys())
      .filter((k) => k.startsWith(prefix) && !k.endsWith("/metadata"))
      .map((k) => k.slice(prefix.length));
    }),

   readMetadata: (pkg) => {
    const key = `${pkg.name}@${pkg.version}/metadata`;
    const content = store.get(key);
    return content
     ? Effect.succeed(JSON.parse(content) as CacheMetadata)
     : Effect.fail(new CacheError({ operation: "read", path: key, message: "No metadata" }));
   },

   writeMetadata: (pkg, metadata) =>
    Effect.sync(() => {
     store.set(`${pkg.name}@${pkg.version}/metadata`, JSON.stringify(metadata));
    }),

   getVFS: (pkg) =>
    Effect.sync(() => {
     const prefix = `${pkg.name}@${pkg.version}/`;
     const vfs: VirtualFileSystem = new Map();
     for (const [key, content] of store) {
      if (key.startsWith(prefix) && !key.endsWith("/metadata")) {
       const relativePath = key.slice(prefix.length);
       vfs.set(`node_modules/${pkg.name}/${relativePath}`, content);
      }
     }
     return vfs;
    }),

   remove: (pkg) =>
    Effect.sync(() => {
     const prefix = `${pkg.name}@${pkg.version}/`;
     for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
     }
    }),
  });
 }),
);

// ── Mock Package Fetcher ────────────────────────────────────────────────────

const FIXTURES_DIR = Path.resolve(import.meta.dirname, "../fixtures");

function readFixturePackageJson(pkg: PackageSpec): unknown {
 const fixturePath = Path.join(FIXTURES_DIR, pkg.name, pkg.version, "package.json");
 return JSON.parse(readFileSync(fixturePath, "utf-8"));
}

function readFixtureTypeFiles(pkg: PackageSpec): Map<string, string> {
 const fixtureDir = Path.join(FIXTURES_DIR, pkg.name, pkg.version);
 const files = new Map<string, string>();

 function walk(dir: string, prefix: string): void {
  for (const entry of readdirSync(dir)) {
   const fullPath = Path.join(dir, entry);
   const relativePath = `${prefix}/${entry}`;
   if (statSync(fullPath).isDirectory()) {
    walk(fullPath, relativePath);
   } else if (entry.endsWith(".d.ts") || entry.endsWith(".d.mts") || entry.endsWith(".d.cts")) {
    files.set(relativePath, readFileSync(fullPath, "utf-8"));
   }
  }
 }

 try {
  walk(fixtureDir, "");
 } catch {
  // No fixtures for this package
 }
 return files;
}

export const MockPackageFetcherLayer: Layer.Layer<PackageFetcher> = Layer.succeed(
 PackageFetcher,
 PackageFetcher.of({
  getVersions: () => Effect.succeed({ versions: [], tags: {} }),
  resolveVersion: (_name, ref) => Effect.succeed(ref),
  getFileTree: () => Effect.succeed({ default: "/index.d.ts", files: [] }),
  downloadFile: () => Effect.succeed(""),
  getPackageJson: (pkg) =>
   Effect.try({
    try: () => readFixturePackageJson(pkg) as any,
    catch: (e) => {
     const { NetworkError } = require("../../src/errors/NetworkError.js");
     return new NetworkError({ url: `fixture/${pkg.name}@${pkg.version}`, message: String(e) });
    },
   }),
  getTypeFiles: (pkg) =>
   Effect.try({
    try: () => readFixtureTypeFiles(pkg),
    catch: (e) => {
     const { NetworkError } = require("../../src/errors/NetworkError.js");
     return new NetworkError({ url: `fixture/${pkg.name}@${pkg.version}`, message: String(e) });
    },
   }),
 }),
);

// ── Composed Test Layer ─────────────────────────────────────────────────────

/**
 * Full test layer: in-memory cache + mock fetcher + real resolver.
 * No network, no filesystem.
 */
export const TestLayer = Layer.mergeAll(
 InMemoryCacheLayer,
 MockPackageFetcherLayer,
 TypeResolverLive,
);

/**
 * Helper to run Effect programs in tests.
 */
export const runTest = <A, E>(
 effect: Effect.Effect<A, E, CacheService | PackageFetcher | TypeResolver>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, TestLayer));
```

- [ ] **Step 2: Commit TestLayers**

```bash
git add __test__/utils/TestLayers.ts
git commit -m "feat: add TestLayers with in-memory cache and mock fetcher

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

- [ ] **Step 3: Update unit tests to use new API**

Update `__test__/TypeRegistry.unit.test.ts` to import from new paths and
use the namespace module pattern. This requires adapting all tests to use
`TypeRegistry.fetchAndCache(pkg)` instead of accessing services directly.
See existing test patterns and adapt each `describe` block.

- [ ] **Step 4: Run all tests**

```bash
pnpm vitest run
```

Expected: All tests pass. Fix any remaining import issues.

- [ ] **Step 5: Run typecheck**

```bash
pnpm run typecheck
```

Expected: No type errors. Fix any remaining issues.

- [ ] **Step 6: Run lint**

```bash
pnpm run lint:fix
```

- [ ] **Step 7: Run build**

```bash
pnpm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit all fixes**

```bash
git add -A
git commit -m "refactor: update tests and fix remaining imports for Effect-first API

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Post-Implementation Checklist

After completing all tasks:

- [ ] `pnpm run typecheck` passes with zero errors
- [ ] `pnpm run test` passes with all tests green
- [ ] `pnpm run build` completes successfully
- [ ] `pnpm run lint` reports no errors
- [ ] All `Data.TaggedError` types are catchable via `Effect.catchTag`
- [ ] All services use `Context.GenericTag` with clean interfaces
- [ ] All layers use `Layer.effect` or `Layer.succeed`
- [ ] TypeRegistry is a namespace module, not a class
- [ ] `src/types.ts` is deleted
- [ ] No `HttpClient` or `FileSystem` in service interface signatures
