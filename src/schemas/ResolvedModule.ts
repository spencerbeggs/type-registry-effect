import { Data } from "effect";
import type { PackageSpec } from "./PackageSpec.js";

/** @internal */
export const ResolvedModuleBase = Data.TaggedClass("ResolvedModule");

export class ResolvedModule extends ResolvedModuleBase<{
	readonly filePath: string;
	readonly isTypeDefinition: boolean;
	readonly package: PackageSpec;
}> {}
