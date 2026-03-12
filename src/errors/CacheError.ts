import { Data } from "effect";

/** @internal */
export const CacheErrorBase = Data.TaggedError("CacheError");

export class CacheError extends CacheErrorBase<{
	readonly operation: "read" | "write" | "delete" | "list";
	readonly path: string;
	readonly message: string;
}> {}
