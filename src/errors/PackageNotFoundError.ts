import { Data } from "effect";

/** @internal */
export const PackageNotFoundErrorBase = Data.TaggedError("PackageNotFoundError");

export class PackageNotFoundError extends PackageNotFoundErrorBase<{
	readonly name: string;
	readonly version: string;
	readonly message: string;
}> {}
