import { Data } from "effect";

/** @internal */
export const TimeoutErrorBase = Data.TaggedError("TimeoutError");

export class TimeoutError extends TimeoutErrorBase<{
	readonly operation: string;
	readonly duration: number;
	readonly message: string;
}> {}
