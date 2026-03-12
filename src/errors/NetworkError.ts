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
 * resolve the extends clause of {@link NetworkError} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 */
export const NetworkErrorBase = Data.TaggedError("NetworkError");

/**
 * Raised when an HTTP request to the jsDelivr CDN fails.
 *
 * @remarks
 * The `url` field contains the request URL, `status` is the HTTP status code
 * (when available), and `message` describes the failure. Network errors may be
 * transient (e.g. DNS resolution, connection reset) or permanent (e.g. 403
 * Forbidden). Use `Effect.catchTag` with the `"NetworkError"` tag to handle
 * this error selectively.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import type { NetworkError } from "type-registry-effect";
 * import { TypeRegistry, PackageSpec } from "type-registry-effect";
 * import { NodeLayer } from "type-registry-effect/node";
 *
 * const program = TypeRegistry.fetchAndCache(
 *   new PackageSpec({ name: "zod", version: "3.23.8" }),
 * ).pipe(
 *   Effect.catchTag("NetworkError", (err: NetworkError) =>
 *     Effect.logError(`Request to ${err.url} failed (${err.status ?? "no status"}): ${err.message}`),
 *   ),
 * );
 *
 * await Effect.runPromise(Effect.provide(program, NodeLayer));
 * ```
 *
 * @see {@link PackageFetcher}
 * @public
 */
export class NetworkError extends NetworkErrorBase<{
	readonly url: string;
	readonly status?: number;
	readonly message: string;
}> {}
