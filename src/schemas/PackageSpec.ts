import { Data } from "effect";

/**
 * @internal
 * Exported for declaration bundling (api-extractor). When `export *` re-exports
 * a class whose `extends` expression is an inline call like
 * `Data.TaggedClass(...)`, TypeScript emits an un-nameable `_base` symbol in
 * the declaration file. Splitting the base into a named export gives the
 * bundler a stable reference.
 *
 * @privateRemarks
 * This base constant must remain a named export so that api-extractor can
 * resolve the extends clause of {@link PackageSpec} to a stable
 * declaration. Without it the bundled `.d.ts` would contain an anonymous
 * `_base` symbol that cannot be referenced by downstream consumers.
 */
export const PackageSpecBase = Data.TaggedClass("PackageSpec");

/**
 * Immutable value object identifying a package at a specific version.
 *
 * @remarks
 * `PackageSpec` uses {@link https://effect.website/docs/data-types/data/#taggedclass | Data.TaggedClass}
 * to provide structural equality out of the box. Two `PackageSpec` instances
 * with the same `name` and `version` are considered equal via `Equal.equals`.
 * The optional `registry` field allows targeting alternative registries.
 *
 * @example
 * ```typescript
 * import { Equal } from "effect";
 * import type { PackageSpec } from "type-registry-effect";
 * import { PackageSpec as PackageSpecClass } from "type-registry-effect";
 *
 * const pkg = new PackageSpecClass({ name: "zod", version: "3.23.8" });
 * const same = new PackageSpecClass({ name: "zod", version: "3.23.8" });
 *
 * // Structural equality via Data.TaggedClass
 * console.assert(Equal.equals(pkg, same) === true);
 *
 * // String representation: "zod@3.23.8"
 * console.assert(pkg.toString() === "zod@3.23.8");
 *
 * // Optional registry for alternative sources
 * const custom = new PackageSpecClass({
 *   name: "@myorg/types",
 *   version: "1.0.0",
 *   registry: "https://npm.pkg.github.com",
 * });
 * ```
 *
 * @see {@link CacheService}
 * @see {@link TypeRegistry}
 * @public
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
