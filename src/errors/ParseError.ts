import { Data } from "effect";

/** @internal */
export const ParseErrorBase = Data.TaggedError("ParseError");

export class ParseError extends ParseErrorBase<{
	readonly source: string;
	readonly message: string;
}> {}
