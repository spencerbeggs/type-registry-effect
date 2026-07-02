import { Data } from "effect";

/**
 * Base class for {@link ResolutionError}, exported for declaration bundling
 * (api-extractor). When `export *` re-exports a class whose `extends` expression
 * is an inline call like `Data.TaggedError(...)`, TypeScript emits an un-nameable
 * `_base` symbol in the declaration file. Splitting the base into a named export
 * gives the bundler a stable reference.
 *
 * @privateRemarks
 * This base constant must remain a named export so that api-extractor can
 * resolve the extends clause of {@link ResolutionError} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 *
 * @public
 */
export const ResolutionErrorBase = Data.TaggedError("ResolutionError");

/**
 * Raised when an import specifier cannot be resolved to a module within a package.
 *
 * @remarks
 * The `package` field is the package name, `specifier` is the import path
 * that could not be resolved, and `message` describes the failure cause.
 * This occurs when the package's exports map, `typesVersions`, or file tree
 * do not contain a matching entry for the requested specifier. Use
 * `Effect.catchTag` with the `"ResolutionError"` tag to handle this error
 * selectively.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { ResolutionError } from "type-registry-effect";
 * import { TypeResolver, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = TypeResolver.resolveImport(
 *   new PackageSpec({ name: "zod", version: "3.23.8" }),
 *   "./nonexistent",
 * ).pipe(
 *   Effect.catchTag("ResolutionError", (err: ResolutionError) =>
 *     Effect.logWarning(`Cannot resolve "${err.specifier}" in ${err.package}: ${err.message}`),
 *   ),
 * );
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link (TypeResolver:interface).resolveImport}
 * @public
 */
export class ResolutionError extends ResolutionErrorBase<{
	readonly package: string;
	readonly specifier: string;
	readonly message: string;
}> {}
