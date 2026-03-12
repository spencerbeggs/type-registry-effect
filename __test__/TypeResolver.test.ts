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
