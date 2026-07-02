import { Data } from "effect";

/**
 * Base class for {@link ParseError}, exported for declaration bundling (api-extractor).
 * When `export *` re-exports a class whose `extends` expression is an inline call
 * like `Data.TaggedError(...)`, TypeScript emits an un-nameable `_base` symbol in
 * the declaration file. Splitting the base into a named export gives the
 * bundler a stable reference.
 *
 * @privateRemarks
 * This base constant must remain a named export so that api-extractor can
 * resolve the extends clause of {@link ParseError} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 *
 * @public
 */
export const ParseErrorBase = Data.TaggedError("ParseError");

/**
 * Raised when a CDN response fails schema validation or JSON parsing.
 *
 * @remarks
 * The `source` field identifies what was being parsed (e.g. `"package.json"`,
 * `"file-tree"`) and `message` describes the validation failure. This
 * typically indicates the CDN returned an unexpected response shape or
 * corrupted data. Use `Effect.catchTag` with the `"ParseError"` tag to
 * handle this error selectively.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { ParseError } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = TypeRegistry.fetchAndCache(
 *   new PackageSpec({ name: "zod", version: "3.23.8" }),
 * ).pipe(
 *   Effect.catchTag("ParseError", (err: ParseError) =>
 *     Effect.logError(`Failed to parse ${err.source}: ${err.message}`),
 *   ),
 * );
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link (PackageFetcher:interface).getPackageJson}
 * @public
 */
export class ParseError extends ParseErrorBase<{
	readonly source: string;
	readonly message: string;
}> {}
