import { Schema } from "effect";

/**
 * Schema for a validated subset of npm `package.json` fields relevant to type resolution.
 *
 * @remarks
 * This schema captures only the fields the type resolver needs to locate
 * declaration files within a published package:
 *
 * - **`name`** and **`version`** -- identity fields (always required).
 * - **`types`** / **`typings`** -- legacy top-level type entry points.
 * - **`main`** / **`module`** -- JavaScript entry points used as fallbacks
 *   when no explicit type entry is declared.
 * - **`exports`** -- the modern Node.js conditional exports map; may be a
 *   simple string or a nested record of conditions.
 * - **`typesVersions`** -- TypeScript path-mapping overrides keyed by TS
 *   version ranges (e.g. `">=4.0"`).
 * - **`dependencies`** / **`peerDependencies`** / **`devDependencies`** --
 *   used to discover transitive type packages (e.g. `@types/*`).
 *
 * Fields outside this set are intentionally ignored to keep validation fast
 * and the attack surface small.
 *
 * @example
 * ```typescript
 * import { Schema } from "effect";
 * import { PackageJson } from "type-registry-effect";
 *
 * const decode = Schema.decodeUnknownSync(PackageJson);
 * const pkg = decode({
 *   name: "zod",
 *   version: "3.23.8",
 *   types: "./lib/types.d.ts",
 *   main: "./lib/index.js",
 *   exports: {
 *     ".": { types: "./lib/types.d.ts", import: "./lib/index.mjs" },
 *   },
 * });
 * ```
 *
 * @see {@link TypeResolver}
 * @public
 */
export const PackageJson = Schema.Struct({
	name: Schema.String,
	version: Schema.String,
	types: Schema.optional(Schema.String),
	typings: Schema.optional(Schema.String),
	main: Schema.optional(Schema.String),
	module: Schema.optional(Schema.String),
	exports: Schema.optional(Schema.Union(Schema.String, Schema.Record({ key: Schema.String, value: Schema.Unknown }))),
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
