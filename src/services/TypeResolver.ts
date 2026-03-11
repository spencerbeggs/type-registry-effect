/**
 * Type resolver service for resolving module imports and type definitions
 */

import * as Path from "node:path";
import { Context, Effect } from "effect";
import type { PackageJson, PackageSpec } from "../types.js";

/**
 * Resolved module information
 */
export interface ResolvedModule {
	/**
	 * The file path to the resolved module (relative to package root)
	 */
	readonly filePath: string;

	/**
	 * Whether this is a type definition file
	 */
	readonly isTypeDefinition: boolean;

	/**
	 * The package this module belongs to
	 */
	readonly package: PackageSpec;
}

/**
 * TypeResolver service interface
 */
export interface TypeResolver {
	/**
	 * Resolve an import specifier to a file path
	 * @param importSpecifier - The import specifier (e.g., `@effect/cli/Command`)
	 * @param packageJson - The package.json of the package
	 * @param pkg - The package spec
	 */
	readonly resolveImport: (
		importSpecifier: string,
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule, Error>;

	/**
	 * Get the main entry point for a package
	 * @param packageJson - The package.json of the package
	 * @param pkg - The package spec
	 */
	readonly resolveMainEntry: (packageJson: PackageJson, pkg: PackageSpec) => Effect.Effect<ResolvedModule, Error>;

	/**
	 * Resolve all type definition entry points from package.json
	 * @param packageJson - The package.json of the package
	 * @param pkg - The package spec
	 */
	readonly resolveTypeEntries: (packageJson: PackageJson, pkg: PackageSpec) => Effect.Effect<ResolvedModule[], Error>;

	/**
	 * Find the appropriate type definition file for a JavaScript file
	 * @param jsFilePath - Path to the JavaScript file
	 * @param packageJson - The package.json of the package
	 * @param pkg - The package spec
	 */
	readonly findTypeDefinition: (
		jsFilePath: string,
		packageJson: PackageJson,
		pkg: PackageSpec,
	) => Effect.Effect<ResolvedModule | null, Error>;
}

/**
 * TypeResolver service tag for dependency injection
 */
export const TypeResolver: Context.Tag<TypeResolver, TypeResolver> = Context.GenericTag<TypeResolver>(
	"effect-type-registry/TypeResolver",
);

/**
 * Type definition file extensions
 */
const TYPE_EXTENSIONS: Set<string> = new Set([".d.ts", ".d.mts", ".d.cts"]);

/**
 * Check if a file path is a type definition
 */
function isTypeDefinition(filePath: string): boolean {
	return TYPE_EXTENSIONS.has(Path.extname(filePath)) || filePath.endsWith(".d.ts");
}

/**
 * Normalize path separators to forward slashes
 */
function normalizePath(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * Try to resolve a path with common extensions
 */
function tryExtensions(basePath: string): string[] {
	const candidates: string[] = [
		basePath,
		`${basePath}.d.ts`,
		`${basePath}.d.mts`,
		`${basePath}.d.cts`,
		`${basePath}.ts`,
		`${basePath}.mts`,
		`${basePath}.cts`,
		`${basePath}.js`,
		`${basePath}.mjs`,
		`${basePath}.cjs`,
		`${basePath}/index.d.ts`,
		`${basePath}/index.d.mts`,
		`${basePath}/index.d.cts`,
		`${basePath}/index.ts`,
		`${basePath}/index.js`,
	];
	return candidates.map(normalizePath);
}

/**
 * Implementation of TypeResolver
 */
class TypeResolverImpl implements TypeResolver {
	resolveImport(
		importSpecifier: string,
		packageJson: PackageJson,
		pkg: PackageSpec,
	): Effect.Effect<ResolvedModule, Error> {
		return Effect.gen(this, function* () {
			// Remove package name prefix if present
			let subpath = importSpecifier;
			if (importSpecifier.startsWith(pkg.name)) {
				subpath = importSpecifier.slice(pkg.name.length);
			}

			// Normalize subpath - remove leading / and ensure ./
			subpath = subpath.replace(/^\//, "");
			if (!subpath.startsWith(".")) {
				subpath = `./${subpath}`;
			}

			// Try to resolve using exports field
			if (packageJson.exports) {
				const resolved = yield* this.resolveFromExports(subpath, packageJson.exports, pkg);
				if (resolved) {
					return resolved;
				}
			}

			// Try to resolve using typesVersions
			if (packageJson.typesVersions) {
				const resolved = yield* this.resolveFromTypesVersions(subpath, packageJson.typesVersions, pkg);
				if (resolved) {
					return resolved;
				}
			}

			// Fallback: try direct path resolution
			const candidates = tryExtensions(subpath.replace(/^\.\//, ""));
			for (const candidate of candidates) {
				// Return the first candidate (we can't check if file exists without filesystem access)
				if (isTypeDefinition(candidate)) {
					return {
						filePath: normalizePath(candidate),
						isTypeDefinition: true,
						package: pkg,
					};
				}
			}

			// If no type definition found, return the first candidate
			const fallback = normalizePath(candidates[0] || subpath);
			return {
				filePath: fallback,
				isTypeDefinition: isTypeDefinition(candidates[0] || subpath),
				package: pkg,
			};
		});
	}

	resolveMainEntry(packageJson: PackageJson, pkg: PackageSpec): Effect.Effect<ResolvedModule, Error> {
		return Effect.gen(this, function* () {
			// Priority: types -> typings -> exports["."]/types -> main
			let mainPath: string | undefined;

			// Check types field
			if (packageJson.types) {
				mainPath = packageJson.types;
			} else if (packageJson.typings) {
				mainPath = packageJson.typings;
			} else if (packageJson.exports) {
				// Check exports["."] for types
				const rootExport = this.getExportValue(packageJson.exports, ".");
				if (rootExport) {
					const typesPath = this.extractTypesFromExport(rootExport);
					if (typesPath) {
						mainPath = typesPath;
					}
				}
			}

			// Fallback to main field
			if (!mainPath && packageJson.main) {
				// Try to find corresponding .d.ts file
				const mainWithoutExt = packageJson.main.replace(/\.(m?[jt]s|cjs)$/, "");
				const candidates = tryExtensions(mainWithoutExt);
				mainPath = candidates.find((c) => isTypeDefinition(c)) || packageJson.main;
			}

			// Default to index.d.ts
			if (!mainPath) {
				mainPath = "index.d.ts";
			}

			// Normalize path
			const normalizedPath = normalizePath(mainPath.replace(/^\.\//, ""));

			return {
				filePath: normalizedPath,
				isTypeDefinition: isTypeDefinition(normalizedPath),
				package: pkg,
			};
		});
	}

	resolveTypeEntries(packageJson: PackageJson, pkg: PackageSpec): Effect.Effect<ResolvedModule[], Error> {
		return Effect.gen(this, function* () {
			const entries: ResolvedModule[] = [];

			// Get main entry
			const mainEntry = yield* this.resolveMainEntry(packageJson, pkg);
			entries.push(mainEntry);

			// Extract entries from exports
			if (packageJson.exports) {
				const exportEntries = this.extractEntriesFromExports(packageJson.exports, pkg);
				entries.push(...exportEntries);
			}

			// Deduplicate by file path
			const seen = new Set<string>();
			const uniqueEntries = entries.filter((entry) => {
				if (seen.has(entry.filePath)) {
					return false;
				}
				seen.add(entry.filePath);
				return true;
			});

			return uniqueEntries;
		});
	}

	findTypeDefinition(
		jsFilePath: string,
		_packageJson: PackageJson,
		pkg: PackageSpec,
	): Effect.Effect<ResolvedModule | null, Error> {
		return Effect.sync(() => {
			// Match file extension and return corresponding type definition
			let typePath: string;

			if (jsFilePath.endsWith(".mjs")) {
				typePath = jsFilePath.replace(/\.mjs$/, ".d.mts");
			} else if (jsFilePath.endsWith(".cjs")) {
				typePath = jsFilePath.replace(/\.cjs$/, ".d.cts");
			} else if (jsFilePath.endsWith(".js")) {
				typePath = jsFilePath.replace(/\.js$/, ".d.ts");
			} else {
				// Fallback: try .d.ts
				const withoutExt = jsFilePath.replace(/\.(m?js|cjs)$/, "");
				typePath = `${withoutExt}.d.ts`;
			}

			return {
				filePath: normalizePath(typePath),
				isTypeDefinition: true,
				package: pkg,
			};
		});
	}

	/**
	 * Resolve from package.json exports field
	 */
	private resolveFromExports(
		subpath: string,
		exports: PackageJson["exports"],
		pkg: PackageSpec,
	): Effect.Effect<ResolvedModule | null, Error> {
		return Effect.sync(() => {
			if (!exports) {
				return null;
			}

			// Normalize subpath for exports lookup
			const lookupPath = subpath.startsWith("./") ? subpath : `./${subpath}`;

			const exportValue = this.getExportValue(exports, lookupPath);
			if (!exportValue) {
				return null;
			}

			const typesPath = this.extractTypesFromExport(exportValue);
			if (!typesPath) {
				return null;
			}

			return {
				filePath: normalizePath(typesPath.replace(/^\.\//, "")),
				isTypeDefinition: isTypeDefinition(typesPath),
				package: pkg,
			};
		});
	}

	/**
	 * Resolve from package.json typesVersions field
	 */
	private resolveFromTypesVersions(
		subpath: string,
		typesVersions: NonNullable<PackageJson["typesVersions"]>,
		pkg: PackageSpec,
	): Effect.Effect<ResolvedModule | null, Error> {
		return Effect.sync(() => {
			// Use "*" as the TypeScript version (most permissive)
			const versionMap = typesVersions["*"];
			if (!versionMap) {
				return null;
			}

			// Normalize subpath
			const lookupPath = subpath.replace(/^\.\//, "");

			// Try exact match first
			if (versionMap[lookupPath]) {
				const resolved = versionMap[lookupPath];
				const path = Array.isArray(resolved) ? resolved[0] : resolved;
				if (!path) {
					return null;
				}

				return {
					filePath: normalizePath(path.replace(/^\.\//, "")),
					isTypeDefinition: isTypeDefinition(path),
					package: pkg,
				};
			}

			// Try wildcard patterns
			for (const [pattern, paths] of Object.entries(versionMap)) {
				if (pattern.includes("*")) {
					const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
					if (regex.test(lookupPath)) {
						const resolved = Array.isArray(paths) ? paths[0] : paths;
						if (!resolved) {
							continue;
						}

						// Replace * in the resolved path with the captured part
						const captured = lookupPath.replace(regex, "$1");
						const finalPath = resolved.replace("*", captured);

						return {
							filePath: normalizePath(finalPath.replace(/^\.\//, "")),
							isTypeDefinition: isTypeDefinition(finalPath),
							package: pkg,
						};
					}
				}
			}

			return null;
		});
	}

	/**
	 * Get export value for a given subpath
	 */
	private getExportValue(exports: PackageJson["exports"], subpath: string): string | Record<string, unknown> | null {
		if (!exports) {
			return null;
		}

		// Handle string exports
		if (typeof exports === "string") {
			return subpath === "." ? exports : null;
		}

		// Handle object exports
		if (typeof exports === "object" && exports !== null) {
			// Direct lookup
			const value = exports[subpath];
			if (value !== undefined) {
				return value as string | Record<string, unknown>;
			}

			// Try without leading ./
			const withoutDot = subpath.replace(/^\.\//, "");
			const valueWithoutDot = exports[withoutDot];
			if (valueWithoutDot !== undefined) {
				return valueWithoutDot as string | Record<string, unknown>;
			}

			// Try wildcard patterns
			for (const [pattern, value] of Object.entries(exports)) {
				if (pattern.includes("*")) {
					const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
					if (regex.test(subpath) || regex.test(withoutDot)) {
						return value as string | Record<string, unknown>;
					}
				}
			}
		}

		return null;
	}

	/**
	 * Extract types path from export value
	 */
	private extractTypesFromExport(exportValue: string | Record<string, unknown> | null): string | null {
		if (!exportValue) {
			return null;
		}

		// Handle string export
		if (typeof exportValue === "string") {
			return exportValue;
		}

		// Handle conditional exports
		if (typeof exportValue === "object" && exportValue !== null) {
			const obj = exportValue as Record<string, unknown>;

			// Priority: types -> import -> default
			if (typeof obj.types === "string") {
				return obj.types;
			}
			if (typeof obj.import === "string") {
				return obj.import;
			}
			if (typeof obj.default === "string") {
				return obj.default;
			}

			// Recurse for nested conditions
			if (typeof obj.import === "object") {
				return this.extractTypesFromExport(obj.import as Record<string, unknown>);
			}
			if (typeof obj.default === "object") {
				return this.extractTypesFromExport(obj.default as Record<string, unknown>);
			}
		}

		return null;
	}

	/**
	 * Extract all entry points from exports
	 */
	private extractEntriesFromExports(exports: PackageJson["exports"], pkg: PackageSpec): ResolvedModule[] {
		const entries: ResolvedModule[] = [];

		if (!exports) {
			return entries;
		}

		// Handle object exports
		if (typeof exports === "object" && exports !== null) {
			for (const [key, value] of Object.entries(exports)) {
				// Skip non-export keys like "types" at root level
				if (!key.startsWith(".") && key !== "*") {
					continue;
				}

				const typesPath = this.extractTypesFromExport(value as string | Record<string, unknown>);
				if (typesPath) {
					entries.push({
						filePath: normalizePath(typesPath.replace(/^\.\//, "")),
						isTypeDefinition: isTypeDefinition(typesPath),
						package: pkg,
					});
				}
			}
		}

		return entries;
	}
}

/**
 * Default TypeResolver layer
 */
export const TypeResolverLive: Effect.Effect<TypeResolver, never> = Effect.succeed(new TypeResolverImpl());
