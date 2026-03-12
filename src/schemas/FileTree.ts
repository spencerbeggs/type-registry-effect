import { Schema } from "effect";

/**
 * Schema for a single file entry in the jsDelivr flat file tree response.
 *
 * @remarks
 * Each entry contains the file `name` (path relative to the package root),
 * a content `hash` for integrity checking, a `time` timestamp string, and
 * the file `size` in bytes. This schema is used to validate raw JSON from
 * the jsDelivr data API before further processing.
 *
 * @example
 * ```typescript
 * import { Schema } from "effect";
 * import { FileTreeEntry } from "type-registry-effect";
 *
 * const decode = Schema.decodeUnknownSync(FileTreeEntry);
 * const entry = decode({
 *   name: "/dist/index.d.ts",
 *   hash: "abc123",
 *   time: "2024-01-15T10:30:00.000Z",
 *   size: 4096,
 * });
 * ```
 *
 * @see {@link PackageFetcher.getFileTree}
 * @public
 */
export const FileTreeEntry = Schema.Struct({
	name: Schema.String,
	hash: Schema.String,
	time: Schema.String,
	size: Schema.Number,
});

export type FileTreeEntry = Schema.Schema.Type<typeof FileTreeEntry>;

/**
 * Schema for the jsDelivr flat file tree API response.
 *
 * @remarks
 * The response includes a `default` field indicating the package's default
 * branch/tag and a `files` array of {@link FileTreeEntry} objects. This
 * corresponds to the `GET /v1/packages/npm/:package@:version/flat` endpoint.
 *
 * @example
 * ```typescript
 * import { Schema } from "effect";
 * import { FileTreeResponse } from "type-registry-effect";
 *
 * const decode = Schema.decodeUnknownSync(FileTreeResponse);
 * const tree = decode({
 *   default: "/dist/index.js",
 *   files: [
 *     { name: "/dist/index.js", hash: "abc123", time: "2024-01-15T10:30:00.000Z", size: 2048 },
 *     { name: "/dist/index.d.ts", hash: "def456", time: "2024-01-15T10:30:00.000Z", size: 4096 },
 *   ],
 * });
 * ```
 *
 * @see {@link PackageFetcher.getFileTree}
 * @see {@link https://www.jsdelivr.com/docs/data.jsdelivr.com | jsDelivr Data API}
 * @public
 */
export const FileTreeResponse = Schema.Struct({
	default: Schema.String,
	files: Schema.Array(FileTreeEntry),
});

export type FileTreeResponse = Schema.Schema.Type<typeof FileTreeResponse>;
