import type { Effect } from "effect";
import { Context } from "effect";
import type { ResolutionError } from "../errors/ResolutionError.js";
import type { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import type { ResolvedModule } from "../schemas/ResolvedModule.js";

/**
 * Effect service interface for import resolution using `package.json` metadata.
 *
 * @remarks
 * Resolution is attempted in the following order:
 *
 * 1. **`exports`** -- the `"types"` condition inside the package's exports map.
 * 2. **`typesVersions`** -- the `"*"` entry of `typesVersions` with wildcard
 *    matching.
 * 3. **`types` / `typings`** -- top-level fields pointing at the main
 *    declaration file.
 * 4. **Conventional** -- extension swapping (`.js` to `.d.ts`) and
 *    `index.d.ts` fallback.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { TypeResolver } from "type-registry-effect";
 * import type { PackageJson } from "type-registry-effect";
 * import type { PackageSpec } from "type-registry-effect";
 *
 * const program = Effect.gen(function* () {
 *   const resolver = yield* TypeResolver;
 *   const resolved = yield* resolver.resolveMainEntry(
 *     { name: "lodash", version: "4.17.21" } as unknown as PackageJson,
 *     { name: "lodash", version: "4.17.21" } as PackageSpec,
 *   );
 *   console.log("main types:", resolved.filePath);
 * });
 * ```
 *
 * @see {@link TypeResolverLive}
 *
 * @public
 */
export interface TypeResolver {
	/**
	 * Resolve a bare or deep-import specifier to a type definition path within
	 * the package.
	 */
	readonly resolveImport: (
		specifier: string,
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule, ResolutionError>;

	/**
	 * Resolve the main (root `"."`) type entry point for a package.
	 */
	readonly resolveMainEntry: (
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule, ResolutionError>;

	/**
	 * Collect all type entry points declared by the package, including the main
	 * entry and any additional sub-path exports that expose types.
	 */
	readonly resolveTypeEntries: (
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ReadonlyArray<ResolvedModule>, ResolutionError>;

	/**
	 * Given a JavaScript file path, derive the corresponding `.d.ts` / `.d.mts`
	 * / `.d.cts` path. Returns `null` when no type definition can be inferred.
	 */
	readonly findTypeDefinition: (
		jsFilePath: string,
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule | null, ResolutionError>;
}

/**
 * Effect Context tag for the {@link TypeResolver} service.
 *
 * @see {@link TypeResolverLive}
 */
export const TypeResolver = Context.GenericTag<TypeResolver>("type-registry-effect/TypeResolver");
