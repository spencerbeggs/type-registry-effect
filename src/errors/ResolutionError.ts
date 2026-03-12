import { Data } from "effect";

/** @internal */
export const ResolutionErrorBase = Data.TaggedError("ResolutionError");

export class ResolutionError extends ResolutionErrorBase<{
	readonly package: string;
	readonly specifier: string;
	readonly message: string;
}> {}
