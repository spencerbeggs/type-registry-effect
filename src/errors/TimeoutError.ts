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
 * resolve the extends clause of {@link TimeoutError} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 */
export const TimeoutErrorBase = Data.TaggedError("TimeoutError");

/**
 * Raised when an operation exceeds its configured time limit.
 *
 * @remarks
 * The `operation` field describes what was being performed (e.g.
 * `"fetchFileTree"`, `"resolveVersion"`), `duration` is the elapsed time in
 * milliseconds, and `message` provides additional context. Use
 * `Effect.catchTag` with the `"TimeoutError"` tag to handle this error
 * selectively.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { TimeoutError } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = TypeRegistry.fetchAndCache(
 *   new PackageSpec({ name: "zod", version: "3.23.8" }),
 * ).pipe(
 *   Effect.catchTag("TimeoutError", (err: TimeoutError) =>
 *     Effect.logWarning(`${err.operation} timed out after ${err.duration}ms: ${err.message}`),
 *   ),
 * );
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @public
 */
export class TimeoutError extends TimeoutErrorBase<{
	readonly operation: string;
	readonly duration: number;
	readonly message: string;
}> {}
