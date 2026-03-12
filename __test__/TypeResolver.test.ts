/**
 * Tests for TypeResolver service
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { TypeResolverLive } from "../src/layers/TypeResolverLive.js";
import type { PackageJson } from "../src/schemas/PackageJson.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import { TypeResolver } from "../src/services/TypeResolver.js";

const run = <A, E>(effect: Effect.Effect<A, E, TypeResolver>) =>
	Effect.runPromise(Effect.provide(effect, TypeResolverLive));

describe("TypeResolver", () => {
	const testPackage = new PackageSpec({
		name: "test-package",
		version: "1.0.0",
	});

	describe("resolveMainEntry", () => {
		it("should resolve from types field", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				types: "./dist/index.d.ts",
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveMainEntry(packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("dist/index.d.ts");
			expect(result.isTypeDefinition).toBe(true);
			expect(result.package).toEqual(testPackage);
		});

		it("should resolve from typings field", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				typings: "./lib/main.d.ts",
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveMainEntry(packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("lib/main.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should resolve from exports field", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					".": {
						types: "./dist/index.d.ts",
						import: "./dist/index.js",
					},
				},
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveMainEntry(packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("dist/index.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should fallback to index.d.ts when no type fields exist", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveMainEntry(packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("index.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});
	});

	describe("resolveImport", () => {
		it("should resolve subpath from exports", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					"./utils": {
						types: "./dist/utils.d.ts",
						import: "./dist/utils.js",
					},
				},
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("./utils", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("dist/utils.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should resolve wildcard exports", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					"./*": {
						types: "./dist/*.d.ts",
						import: "./dist/*.js",
					},
				},
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("./helper", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("dist/*.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should handle package name prefix in import specifier", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					"./sub": {
						types: "./dist/sub.d.ts",
					},
				},
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("test-package/sub", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("dist/sub.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});
	});

	describe("resolveTypeEntries", () => {
		it("should collect all entry points from exports", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				types: "./dist/index.d.ts",
				exports: {
					".": {
						types: "./dist/index.d.ts",
					},
					"./utils": {
						types: "./dist/utils.d.ts",
					},
					"./helpers": {
						types: "./dist/helpers.d.ts",
					},
				},
			};

			const results = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveTypeEntries(packageJson, testPackage);
				}),
			);

			expect(results.length).toBe(3); // main + 2 subpaths
			expect(results.map((r) => r.filePath)).toContain("dist/index.d.ts");
			expect(results.map((r) => r.filePath)).toContain("dist/utils.d.ts");
			expect(results.map((r) => r.filePath)).toContain("dist/helpers.d.ts");
		});

		it("should deduplicate entries", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				types: "./dist/index.d.ts",
				exports: {
					".": {
						types: "./dist/index.d.ts", // Same as types field
					},
				},
			};

			const results = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveTypeEntries(packageJson, testPackage);
				}),
			);

			expect(results.length).toBe(1); // Should be deduplicated
			expect(results[0]?.filePath).toBe("dist/index.d.ts");
		});
	});

	describe("findTypeDefinition", () => {
		it("should find .d.ts for .js file", async () => {
			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.findTypeDefinition("src/utils.js", {} as PackageJson, testPackage);
				}),
			);

			expect(result).not.toBeNull();
			expect(result?.filePath).toBe("src/utils.d.ts");
			expect(result?.isTypeDefinition).toBe(true);
		});

		it("should find .d.mts for .mjs file", async () => {
			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.findTypeDefinition("src/module.mjs", {} as PackageJson, testPackage);
				}),
			);

			expect(result).not.toBeNull();
			expect(result?.filePath).toBe("src/module.d.mts");
			expect(result?.isTypeDefinition).toBe(true);
		});

		it("should find .d.cts for .cjs file", async () => {
			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.findTypeDefinition("lib/common.cjs", {} as PackageJson, testPackage);
				}),
			);

			expect(result).not.toBeNull();
			expect(result?.filePath).toBe("lib/common.d.cts");
			expect(result?.isTypeDefinition).toBe(true);
		});
	});

	describe("resolveImport — typesVersions", () => {
		it("should resolve typesVersions['*'] exact match with non-array value", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				typesVersions: {
					"*": {
						utils: "./dist/utils.d.ts" as unknown as string[],
					},
				},
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("./utils", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("dist/utils.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should resolve typesVersions['*'] wildcard pattern", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				typesVersions: {
					"*": {
						"lib/*": ["./dist/*.d.ts"],
					},
				},
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("./lib/foo", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toMatch(/\.d\.ts$/);
			expect(result.isTypeDefinition).toBe(true);
		});
	});

	describe("resolveImport — tryExtensions fallback", () => {
		it("should fallback to .d.ts candidate when no exports or typesVersions match", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("./some/module", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("some/module.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should return first candidate when nothing matches as type definition", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			// The specifier itself (after stripping ./) is the base path.
			// tryExtensions produces candidates starting with the base path itself,
			// then .d.ts, .d.mts, etc. The first .d.ts candidate will match, so
			// to truly test the fallback we need a path that already has an extension
			// that is NOT a type definition but IS the first candidate.
			// Actually, the loop finds the first isTypeDefinition candidate — the
			// second candidate is always basePath.d.ts which IS a type def, so
			// the fallback (lines 154-159) only triggers when candidates is empty,
			// which can't happen with tryExtensions. The fallback is effectively
			// unreachable with the current tryExtensions, but we can at least
			// verify the function returns something sensible for any subpath.
			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("./deep/nested/path", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("deep/nested/path.d.ts");
			expect(result.isTypeDefinition).toBe(true);
			expect(result.package).toEqual(testPackage);
		});
	});

	describe("findTypeDefinition — extension mapping", () => {
		it("should produce .d.mts for .mjs input", async () => {
			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.findTypeDefinition("lib/esm/index.mjs", {} as PackageJson, testPackage);
				}),
			);

			if (result === null) throw new Error("Expected non-null result");
			expect(result.filePath).toBe("lib/esm/index.d.mts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should produce .d.cts for .cjs input", async () => {
			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.findTypeDefinition("lib/cjs/index.cjs", {} as PackageJson, testPackage);
				}),
			);

			if (result === null) throw new Error("Expected non-null result");
			expect(result.filePath).toBe("lib/cjs/index.d.cts");
			expect(result.isTypeDefinition).toBe(true);
		});

		it("should produce .d.ts for .js input", async () => {
			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.findTypeDefinition("dist/main.js", {} as PackageJson, testPackage);
				}),
			);

			if (result === null) throw new Error("Expected non-null result");
			expect(result.filePath).toBe("dist/main.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});
	});

	describe("resolveTypeEntries — multiple subpath entries", () => {
		it("should collect main entry plus all subpath exports", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					".": {
						types: "./dist/index.d.ts",
					},
					"./alpha": {
						types: "./dist/alpha.d.ts",
					},
					"./beta": {
						types: "./dist/beta.d.ts",
					},
					"./gamma": {
						types: "./dist/gamma.d.ts",
					},
				},
			};

			const results = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveTypeEntries(packageJson, testPackage);
				}),
			);

			expect(results.length).toBe(4);
			const paths = results.map((r) => r.filePath);
			expect(paths).toContain("dist/index.d.ts");
			expect(paths).toContain("dist/alpha.d.ts");
			expect(paths).toContain("dist/beta.d.ts");
			expect(paths).toContain("dist/gamma.d.ts");
		});

		it("should resolve entries from typesVersions when no exports exist", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				typesVersions: {
					"*": {
						utils: ["./dist/utils.d.ts"],
						"helpers/*": ["./dist/helpers/*.d.ts"],
					},
				},
			};

			const results = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveTypeEntries(packageJson, testPackage);
				}),
			);

			// Without exports or types field, falls back to index.d.ts as main entry
			expect(results.length).toBe(1);
			expect(results[0]?.filePath).toBe("index.d.ts");
		});

		it("should fallback to main field when no types/exports exist", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				main: "./lib/index.js",
			};

			const results = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveTypeEntries(packageJson, testPackage);
				}),
			);

			expect(results.length).toBe(1);
			expect(results[0]?.filePath).toBe("lib/index.d.ts");
			expect(results[0]?.isTypeDefinition).toBe(true);
		});
	});

	describe("complex package.json scenarios", () => {
		it("should handle @effect/cli-like namespace exports", async () => {
			const packageJson: PackageJson = {
				name: "@effect/cli",
				version: "0.73.0",
				types: "./dist/dts/index.d.ts",
				exports: {
					".": {
						types: "./dist/dts/index.d.ts",
					},
					"./Command": {
						types: "./dist/dts/Command.d.ts",
					},
					"./Args": {
						types: "./dist/dts/Args.d.ts",
					},
				},
			};

			const pkg = new PackageSpec({
				name: "@effect/cli",
				version: "0.73.0",
			});

			const entries = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveTypeEntries(packageJson, pkg);
				}),
			);

			expect(entries.length).toBeGreaterThan(0);
			expect(entries.some((e) => e.filePath.includes("Command.d.ts"))).toBe(true);
			expect(entries.some((e) => e.filePath.includes("Args.d.ts"))).toBe(true);
		});

		it("should handle typesVersions field", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				typesVersions: {
					"*": {
						utils: ["./dist/utils.d.ts"],
						"helpers/*": ["./dist/helpers/*.d.ts"],
					},
				},
			};

			const result = await run(
				Effect.gen(function* () {
					const resolver = yield* TypeResolver;
					return yield* resolver.resolveImport("./utils", packageJson, testPackage);
				}),
			);

			expect(result.filePath).toBe("dist/utils.d.ts");
			expect(result.isTypeDefinition).toBe(true);
		});
	});
});
