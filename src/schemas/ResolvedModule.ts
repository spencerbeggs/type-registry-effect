import { Data } from "effect";
import type { PackageSpec } from "./PackageSpec.js";

/**
 * Base class for {@link ResolvedModule}, exported for declaration bundling
 * (api-extractor). When `export *` re-exports a class whose `extends` expression
 * is an inline call like `Data.TaggedClass(...)`, TypeScript emits an un-nameable
 * `_base` symbol in the declaration file. Splitting the base into a named export
 * gives the bundler a stable reference.
 *
 * @privateRemarks
 * This base constant must remain a named export so that api-extractor can
 * resolve the extends clause of {@link ResolvedModule} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 *
 * @public
 */
export const ResolvedModuleBase = Data.TaggedClass("ResolvedModule");

/**
 * Represents a resolved module path within a package.
 *
 * @remarks
 * After the {@link (TypeResolver:interface)} walks a package's exports and file tree, each
 * resolvable import specifier maps to a `ResolvedModule`. The `filePath` is
 * relative to the package root, and `isTypeDefinition` indicates whether the
 * file is a `.d.ts` (or `.d.mts` / `.d.cts`) declaration file. The `package`
 * field links back to the originating {@link PackageSpec}.
 *
 * @example
 * ```typescript
 * import type { ResolvedModule, PackageSpec } from "type-registry-effect";
 * import {
 *   ResolvedModule as ResolvedModuleClass,
 *   PackageSpec as PackageSpecClass,
 * } from "type-registry-effect";
 *
 * const mod = new ResolvedModuleClass({
 *   filePath: "dist/index.d.ts",
 *   isTypeDefinition: true,
 *   package: new PackageSpecClass({ name: "zod", version: "3.23.8" }),
 * });
 * ```
 *
 * @see {@link (TypeResolver:interface).resolveImport}
 * @see {@link (TypeResolver:interface).resolveTypeEntries}
 * @public
 */
export class ResolvedModule extends ResolvedModuleBase<{
	readonly filePath: string;
	readonly isTypeDefinition: boolean;
	readonly package: PackageSpec;
}> {}
