import { Data } from "effect";

/** @internal */
export const NetworkErrorBase = Data.TaggedError("NetworkError");

export class NetworkError extends NetworkErrorBase<{
	readonly url: string;
	readonly status?: number;
	readonly message: string;
}> {}
