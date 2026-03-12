import type { Effect } from "effect";
import { Context } from "effect";
import type { ResolutionError } from "../errors/ResolutionError.js";
import type { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import type { ResolvedModule } from "../schemas/ResolvedModule.js";

export interface TypeResolverShape {
	readonly resolveImport: (
		specifier: string,
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule, ResolutionError>;

	readonly resolveMainEntry: (
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule, ResolutionError>;

	readonly resolveTypeEntries: (
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ReadonlyArray<ResolvedModule>, ResolutionError>;

	readonly findTypeDefinition: (
		jsFilePath: string,
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule | null, ResolutionError>;
}

export class TypeResolver extends Context.Tag("type-registry-effect/TypeResolver")<TypeResolver, TypeResolverShape>() {}
