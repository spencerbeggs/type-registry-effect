import { Schema } from "effect";

export const FileTreeEntry = Schema.Struct({
	name: Schema.String,
	hash: Schema.String,
	time: Schema.String,
	size: Schema.Number,
});

export type FileTreeEntry = Schema.Schema.Type<typeof FileTreeEntry>;

export const FileTreeResponse = Schema.Struct({
	default: Schema.String,
	files: Schema.Array(FileTreeEntry),
});

export type FileTreeResponse = Schema.Schema.Type<typeof FileTreeResponse>;
