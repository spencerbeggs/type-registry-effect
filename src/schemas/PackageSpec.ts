import { Data } from "effect";

/** @internal */
export const PackageSpecBase = Data.TaggedClass("PackageSpec");

export class PackageSpec extends PackageSpecBase<{
	readonly name: string;
	readonly version: string;
	readonly registry?: string;
}> {
	toString(): string {
		return `${this.name}@${this.version}`;
	}

	[Symbol.for("nodejs.util.inspect.custom")](): string {
		return this.toString();
	}
}
