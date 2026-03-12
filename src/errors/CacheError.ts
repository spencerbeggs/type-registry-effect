import { Data } from "effect";

/**
 * @internal
 * Exported for declaration bundling (api-extractor). When `export *` re-exports
 * a class whose `extends` expression is an inline call like
 * `Data.TaggedError(...)`, TypeScript emits an un-nameable `_base` symbol in
 * the declaration file. Splitting the base into a named export gives the
 * bundler a stable reference.
 *
 * @privateRemarks
 * This base constant must remain a named export so that api-extractor can
 * resolve the extends clause of {@link CacheError} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 */
export const CacheErrorBase = Data.TaggedError("CacheError");

/**
 * Raised when a disk cache operation (read, write, delete, or list) fails.
 *
 * @remarks
 * The `operation` field indicates which cache operation triggered the failure,
 * `path` is the filesystem path involved, and `message` describes the
 * underlying cause (e.g. permission denied, disk full). Use `Effect.catchTag`
 * with the `"CacheError"` tag to handle this error selectively.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { CacheError } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = TypeRegistry.fetchAndCache(
 *   new PackageSpec({ name: "zod", version: "3.23.8" }),
 * ).pipe(
 *   Effect.catchTag("CacheError", (err: CacheError) =>
 *     Effect.logWarning(`Cache ${err.operation} failed at ${err.path}: ${err.message}`),
 *   ),
 * );
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link CacheService}
 * @public
 */
export class CacheError extends CacheErrorBase<{
	readonly operation: "read" | "write" | "delete" | "list";
	readonly path: string;
	readonly message: string;
}> {}
