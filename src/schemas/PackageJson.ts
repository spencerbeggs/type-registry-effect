import { Schema } from "effect";

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
