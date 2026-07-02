import { Effect, Layer } from "effect";
import type { PackageJson } from "../schemas/PackageJson.js";
import { ResolvedModule } from "../schemas/ResolvedModule.js";
import { TypeResolver } from "../services/TypeResolver.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isTypeDefinition(filePath: string): boolean {
	return filePath.endsWith(".d.ts") || filePath.endsWith(".d.mts") || filePath.endsWith(".d.cts");
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/");
}

function escapeRegex(str: string): string {
	return str.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function substituteWildcard(
	value: string | Record<string, unknown>,
	captured: string,
): string | Record<string, unknown> {
	if (typeof value === "string") return value.replace(/\*/g, captured);
	if (typeof value === "object" && value !== null) {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			if (typeof v === "string") result[k] = v.replace(/\*/g, captured);
			else if (typeof v === "object" && v !== null)
				result[k] = substituteWildcard(v as Record<string, unknown>, captured);
			else result[k] = v;
		}
		return result;
	}
	return value;
}

function tryExtensions(basePath: string): string[] {
	return [
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
	].map(normalizePath);
}

function getExportValue(exports: PackageJson["exports"], subpath: string): string | Record<string, unknown> | null {
	if (!exports) return null;
	if (typeof exports === "string") return subpath === "." ? exports : null;
	if (typeof exports === "object" && exports !== null) {
		const exportsObj = exports as Record<string, unknown>;
		const value = exportsObj[subpath];
		if (value !== undefined) return value as string | Record<string, unknown>;
		const withoutDot = subpath.replace(/^\.\//, "");
		const alt = exportsObj[withoutDot];
		if (alt !== undefined) return alt as string | Record<string, unknown>;
		for (const [pattern, val] of Object.entries(exportsObj)) {
			if (pattern.includes("*")) {
				const escaped = escapeRegex(pattern).replace(/\*/g, "(.*)");
				const regex = new RegExp(`^${escaped}$`);
				const match = regex.exec(subpath) || regex.exec(withoutDot);
				if (match) {
					const captured = match[1] || "";
					return substituteWildcard(val as string | Record<string, unknown>, captured);
				}
			}
		}
	}
	return null;
}

function findMainTypePath(packageJson: PackageJson): string {
	if (packageJson.types) return packageJson.types;
	if (packageJson.typings) return packageJson.typings;
	if (packageJson.exports) {
		const rootExport = getExportValue(packageJson.exports, ".");
		if (rootExport) {
			const typesPath = extractTypesFromExport(rootExport);
			if (typesPath) return typesPath;
		}
	}
	if (packageJson.main) {
		const mainWithoutExt = packageJson.main.replace(/\.(m?[jt]s|cjs)$/, "");
		const candidates = tryExtensions(mainWithoutExt);
		const found = candidates.find((c) => isTypeDefinition(c));
		if (found) return found;
		return packageJson.main;
	}
	return "index.d.ts";
}

function extractTypesFromExport(exportValue: string | Record<string, unknown> | null): string | null {
	if (!exportValue) return null;
	if (typeof exportValue === "string") return exportValue;
	if (typeof exportValue === "object" && exportValue !== null) {
		const obj = exportValue as Record<string, unknown>;
		if (typeof obj.types === "string") return obj.types;
		if (typeof obj.import === "string") return obj.import;
		if (typeof obj.default === "string") return obj.default;
		if (typeof obj.import === "object") return extractTypesFromExport(obj.import as Record<string, unknown>);
		if (typeof obj.default === "object") return extractTypesFromExport(obj.default as Record<string, unknown>);
	}
	return null;
}

// ── Layer ─────────────────────────────────────────────────────────────────────

/**
 * Pure {@link (TypeResolver:interface)} layer with no external dependencies.
 *
 * @remarks
 * Resolution is performed synchronously using only the data present in the
 * supplied `package.json`. The resolution order is:
 *
 * 1. `exports` map (`"types"` condition, then `"import"` / `"default"`)
 * 2. `typesVersions["*"]` with wildcard pattern matching
 * 3. Top-level `types` or `typings` fields
 * 4. Conventional extension swapping (`.js` to `.d.ts`) and `index.d.ts`
 *    fallback
 *
 * @see {@link (TypeResolver:interface)}
 *
 * @public
 */
export const TypeResolverLive: Layer.Layer<TypeResolver> = Layer.succeed(TypeResolver, {
	resolveImport: (specifier, packageJson, pkg) =>
		Effect.sync(() => {
			let subpath = specifier;
			if (specifier.startsWith(pkg.name)) subpath = specifier.slice(pkg.name.length);
			subpath = subpath.replace(/^\//, "");
			if (!subpath.startsWith(".")) subpath = `./${subpath}`;

			if (packageJson.exports) {
				const lookupPath = subpath.startsWith("./") ? subpath : `./${subpath}`;
				const exportValue = getExportValue(packageJson.exports, lookupPath);
				if (exportValue) {
					const typesPath = extractTypesFromExport(exportValue);
					if (typesPath) {
						return new ResolvedModule({
							filePath: normalizePath(typesPath.replace(/^\.\//, "")),
							isTypeDefinition: isTypeDefinition(typesPath),
							package: pkg,
						});
					}
				}
			}

			if (packageJson.typesVersions) {
				const versionMap = packageJson.typesVersions["*"];
				if (versionMap) {
					const lookupPath = subpath.replace(/^\.\//, "");
					if (versionMap[lookupPath]) {
						const resolved = versionMap[lookupPath];
						const path = Array.isArray(resolved) ? resolved[0] : resolved;
						if (path) {
							return new ResolvedModule({
								filePath: normalizePath(path.replace(/^\.\//, "")),
								isTypeDefinition: isTypeDefinition(path),
								package: pkg,
							});
						}
					}
					for (const [pattern, paths] of Object.entries(versionMap)) {
						if (pattern.includes("*")) {
							const escaped = escapeRegex(pattern).replace(/\*/g, "(.*)");
							const regex = new RegExp(`^${escaped}$`);
							if (regex.test(lookupPath)) {
								const resolved = Array.isArray(paths) ? paths[0] : paths;
								if (resolved) {
									const captured = lookupPath.replace(regex, "$1");
									const finalPath = resolved.replace("*", captured);
									return new ResolvedModule({
										filePath: normalizePath(finalPath.replace(/^\.\//, "")),
										isTypeDefinition: isTypeDefinition(finalPath),
										package: pkg,
									});
								}
							}
						}
					}
				}
			}

			const candidates = tryExtensions(subpath.replace(/^\.\//, ""));
			for (const candidate of candidates) {
				if (isTypeDefinition(candidate)) {
					return new ResolvedModule({ filePath: normalizePath(candidate), isTypeDefinition: true, package: pkg });
				}
			}

			const fallback = normalizePath(candidates[0] || subpath);
			return new ResolvedModule({
				filePath: fallback,
				isTypeDefinition: isTypeDefinition(candidates[0] || subpath),
				package: pkg,
			});
		}),

	resolveMainEntry: (packageJson, pkg) =>
		Effect.sync(() => {
			const mainPath = findMainTypePath(packageJson);
			const normalizedPath = normalizePath(mainPath.replace(/^\.\//, ""));
			return new ResolvedModule({
				filePath: normalizedPath,
				isTypeDefinition: isTypeDefinition(normalizedPath),
				package: pkg,
			});
		}),

	resolveTypeEntries: (packageJson, pkg) =>
		Effect.sync(() => {
			const entries: ResolvedModule[] = [];
			const mainPath = findMainTypePath(packageJson);

			entries.push(
				new ResolvedModule({
					filePath: normalizePath(mainPath.replace(/^\.\//, "")),
					isTypeDefinition: isTypeDefinition(mainPath),
					package: pkg,
				}),
			);

			if (packageJson.exports && typeof packageJson.exports === "object") {
				for (const [key, value] of Object.entries(packageJson.exports as Record<string, unknown>)) {
					if (!key.startsWith(".") && key !== "*") continue;
					const typesPath = extractTypesFromExport(value as string | Record<string, unknown>);
					if (typesPath) {
						entries.push(
							new ResolvedModule({
								filePath: normalizePath(typesPath.replace(/^\.\//, "")),
								isTypeDefinition: isTypeDefinition(typesPath),
								package: pkg,
							}),
						);
					}
				}
			}

			const seen = new Set<string>();
			return entries.filter((e) => {
				if (seen.has(e.filePath)) return false;
				seen.add(e.filePath);
				return true;
			});
		}),

	findTypeDefinition: (jsFilePath, _packageJson, pkg) =>
		Effect.sync(() => {
			let typePath: string;
			if (jsFilePath.endsWith(".mjs")) typePath = jsFilePath.replace(/\.mjs$/, ".d.mts");
			else if (jsFilePath.endsWith(".cjs")) typePath = jsFilePath.replace(/\.cjs$/, ".d.cts");
			else if (jsFilePath.endsWith(".js")) typePath = jsFilePath.replace(/\.js$/, ".d.ts");
			else {
				const withoutExt = jsFilePath.replace(/\.(m?js|cjs)$/, "");
				typePath = `${withoutExt}.d.ts`;
			}
			return new ResolvedModule({ filePath: normalizePath(typePath), isTypeDefinition: true, package: pkg });
		}),
});
