import { Data } from "effect";

/**
 * Base class for {@link PackageNotFoundError}, exported for declaration bundling
 * (api-extractor). When `export *` re-exports a class whose `extends` expression
 * is an inline call like `Data.TaggedError(...)`, TypeScript emits an un-nameable
 * `_base` symbol in the declaration file. Splitting the base into a named export
 * gives the bundler a stable reference.
 *
 * @privateRemarks
 * This base constant must remain a named export so that api-extractor can
 * resolve the extends clause of {@link PackageNotFoundError} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 *
 * @public
 */
export const PackageNotFoundErrorBase = Data.TaggedError("PackageNotFoundError");

/**
 * Raised when a package or version does not exist on the CDN.
 *
 * @remarks
 * The `name` and `version` fields identify the package that could not be
 * found, and `message` provides additional context. This typically occurs
 * when a typo is present in the package name or the requested version has
 * not been published. Use `Effect.catchTag` with the
 * `"PackageNotFoundError"` tag to handle this error selectively.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { PackageNotFoundError } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = TypeRegistry.fetchAndCache(
 *   new PackageSpec({ name: "nonexistent-pkg", version: "0.0.0" }),
 * ).pipe(
 *   Effect.catchTag("PackageNotFoundError", (err: PackageNotFoundError) =>
 *     Effect.logWarning(`Package ${err.name}@${err.version} not found: ${err.message}`),
 *   ),
 * );
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link (PackageFetcher:interface).resolveVersion}
 * @public
 */
export class PackageNotFoundError extends PackageNotFoundErrorBase<{
	readonly name: string;
	readonly version: string;
	readonly message: string;
}> {}
