/**
 * Tests for PackageFetcher service
 */

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { PackageFetcherLive } from "../src/layers/PackageFetcherLive.js";
import { PackageSpec } from "../src/schemas/PackageSpec.js";
import { JSDELIVR_CDN, PackageFetcher, normalizeModuleName } from "../src/services/PackageFetcher.js";

/**
 * Creates a mock HttpClient layer that routes requests to a handler function.
 * The handler receives the URL string and returns { status, body } or throws to simulate network errors.
 */
function makeMockHttpLayer(
	handler: (url: string) => { status: number; body: string },
): Layer.Layer<HttpClient.HttpClient> {
	const mockClient = HttpClient.make((request, url) => {
		const result = handler(url.toString());
		const webResponse = new Response(result.body, {
			status: result.status,
			headers: { "Content-Type": "application/json" },
		});
		return Effect.succeed(HttpClientResponse.fromWeb(request, webResponse));
	});
	return Layer.succeed(HttpClient.HttpClient, mockClient);
}

/**
 * Helper to build the PackageFetcher service with a mock HTTP layer and run an effect.
 */
function runWithMockHttp<A, E>(
	handler: (url: string) => { status: number; body: string },
	program: Effect.Effect<A, E, PackageFetcher>,
): Promise<A> {
	const mockHttp = makeMockHttpLayer(handler);
	const layer = PackageFetcherLive.pipe(Layer.provide(mockHttp));
	return Effect.runPromise(Effect.provide(program, layer)) as Promise<A>;
}

const testPkg = new PackageSpec({ name: "test-pkg", version: "1.0.0" });

describe("PackageFetcher", () => {
	describe("normalizeModuleName", () => {
		it("should handle node: protocol", () => {
			expect(normalizeModuleName("node:fs")).toBe("node");
			expect(normalizeModuleName("node:path")).toBe("node");
		});

		it("should handle built-in Node modules", () => {
			expect(normalizeModuleName("fs")).toBe("node");
			expect(normalizeModuleName("path")).toBe("node");
			expect(normalizeModuleName("fs/promises")).toBe("node");
		});

		it("should handle scoped packages", () => {
			expect(normalizeModuleName("@effect/cli")).toBe("@effect/cli");
			expect(normalizeModuleName("@effect/cli/Command")).toBe("@effect/cli");
			expect(normalizeModuleName("@types/node")).toBe("@types/node");
		});

		it("should handle regular packages with subpaths", () => {
			expect(normalizeModuleName("lodash")).toBe("lodash");
			expect(normalizeModuleName("lodash/identity")).toBe("lodash");
			expect(normalizeModuleName("zod")).toBe("zod");
			expect(normalizeModuleName("zod/lib/types")).toBe("zod");
		});
	});

	describe("PackageFetcherLive", () => {
		describe("resolveVersion", () => {
			it("should return PackageNotFoundError when the package does not exist", async () => {
				const handler = (url: string) => {
					if (url.includes("/package/resolve/")) {
						return { status: 404, body: "Not Found" };
					}
					return { status: 200, body: "{}" };
				};

				const program = Effect.gen(function* () {
					const fetcher = yield* PackageFetcher;
					return yield* fetcher
						.resolveVersion("nonexistent-pkg", "latest")
						.pipe(
							Effect.catchTag("PackageNotFoundError", (err) =>
								Effect.succeed({ caught: true, name: err.name, version: err.version }),
							),
						);
				});

				const result = await runWithMockHttp(handler, program);
				expect(result).toEqual({
					caught: true,
					name: "nonexistent-pkg",
					version: "latest",
				});
			});
		});

		describe("downloadFile", () => {
			it("should not double-prefix a path that already starts with /", async () => {
				let requestedUrl = "";
				const handler = (url: string) => {
					if (url.includes(`${JSDELIVR_CDN}/npm/`)) {
						requestedUrl = url;
						return { status: 200, body: "file content" };
					}
					return { status: 200, body: "{}" };
				};

				const program = Effect.gen(function* () {
					const fetcher = yield* PackageFetcher;
					return yield* fetcher.downloadFile(testPkg, "/dist/index.d.ts");
				});

				const result = await runWithMockHttp(handler, program);
				expect(result).toBe("file content");
				expect(requestedUrl).toBe(`${JSDELIVR_CDN}/npm/test-pkg@1.0.0/dist/index.d.ts`);
				// Verify no double slash
				expect(requestedUrl).not.toContain("//dist");
			});

			it("should add / prefix to a path that does not start with /", async () => {
				let requestedUrl = "";
				const handler = (url: string) => {
					if (url.includes(`${JSDELIVR_CDN}/npm/`)) {
						requestedUrl = url;
						return { status: 200, body: "file content" };
					}
					return { status: 200, body: "{}" };
				};

				const program = Effect.gen(function* () {
					const fetcher = yield* PackageFetcher;
					return yield* fetcher.downloadFile(testPkg, "dist/index.d.ts");
				});

				const result = await runWithMockHttp(handler, program);
				expect(result).toBe("file content");
				expect(requestedUrl).toBe(`${JSDELIVR_CDN}/npm/test-pkg@1.0.0/dist/index.d.ts`);
			});
		});

		describe("getPackageJson", () => {
			it("should produce ParseError when response is invalid JSON", async () => {
				const handler = (url: string) => {
					if (url.includes("/package.json")) {
						return { status: 200, body: "not valid json {{{}}" };
					}
					return { status: 200, body: "{}" };
				};

				const program = Effect.gen(function* () {
					const fetcher = yield* PackageFetcher;
					return yield* fetcher.getPackageJson(testPkg);
				});

				const mockHttp = makeMockHttpLayer(handler);
				const layer = PackageFetcherLive.pipe(Layer.provide(mockHttp));
				const result = await Effect.runPromiseExit(Effect.provide(program, layer));

				expect(result._tag).toBe("Failure");
				if (result._tag === "Failure") {
					const errorStr = String(result.cause);
					expect(errorStr).toContain("ParseError");
					expect(errorStr).toContain("JSON parse failed");
				}
			});

			it("should produce ParseError when JSON does not match PackageJson schema", async () => {
				const handler = (url: string) => {
					if (url.includes("/package.json")) {
						// Valid JSON but missing required fields (name, version)
						return { status: 200, body: JSON.stringify({ description: "no name or version" }) };
					}
					return { status: 200, body: "{}" };
				};

				const program = Effect.gen(function* () {
					const fetcher = yield* PackageFetcher;
					return yield* fetcher.getPackageJson(testPkg);
				});

				const mockHttp = makeMockHttpLayer(handler);
				const layer = PackageFetcherLive.pipe(Layer.provide(mockHttp));
				const result = await Effect.runPromiseExit(Effect.provide(program, layer));

				expect(result._tag).toBe("Failure");
				if (result._tag === "Failure") {
					const errorStr = String(result.cause);
					expect(errorStr).toContain("ParseError");
					expect(errorStr).toContain("Schema validation failed");
				}
			});
		});

		describe("getTypeFiles", () => {
			it("should auto-include package.json when not in file tree", async () => {
				const handler = (url: string) => {
					// File tree API — return only a .d.ts file, no package.json
					if (url.includes("/flat")) {
						return {
							status: 200,
							body: JSON.stringify({
								default: "/dist/index.js",
								files: [{ name: "/dist/index.d.ts", hash: "abc123", time: "2024-01-01T00:00:00.000Z", size: 100 }],
							}),
						};
					}
					// CDN file requests
					if (url.includes("/dist/index.d.ts")) {
						return { status: 200, body: "export declare const foo: string;" };
					}
					if (url.includes("/package.json")) {
						return {
							status: 200,
							body: JSON.stringify({ name: "test-pkg", version: "1.0.0" }),
						};
					}
					return { status: 200, body: "" };
				};

				const program = Effect.gen(function* () {
					const fetcher = yield* PackageFetcher;
					return yield* fetcher.getTypeFiles(testPkg);
				});

				const vfs = await runWithMockHttp(handler, program);

				// Should have the .d.ts file
				expect(vfs.has("/dist/index.d.ts")).toBe(true);
				expect(vfs.get("/dist/index.d.ts")).toBe("export declare const foo: string;");

				// Should have auto-fetched package.json since it was not in the file tree
				expect(vfs.has("/package.json")).toBe(true);
				const pkgJsonStr = vfs.get("/package.json");
				expect(pkgJsonStr).toBeDefined();
				const pkgJson = JSON.parse(pkgJsonStr as string);
				expect(pkgJson.name).toBe("test-pkg");
			});

			it("should not re-fetch package.json when it is already in file tree", async () => {
				let packageJsonFetchCount = 0;
				const handler = (url: string) => {
					if (url.includes("/flat")) {
						return {
							status: 200,
							body: JSON.stringify({
								default: "/dist/index.js",
								files: [
									{ name: "/dist/index.d.ts", hash: "abc123", time: "2024-01-01T00:00:00.000Z", size: 100 },
									{ name: "/package.json", hash: "def456", time: "2024-01-01T00:00:00.000Z", size: 50 },
								],
							}),
						};
					}
					if (url.includes("/dist/index.d.ts")) {
						return { status: 200, body: "export declare const bar: number;" };
					}
					if (url.includes("/package.json")) {
						packageJsonFetchCount++;
						return {
							status: 200,
							body: JSON.stringify({ name: "test-pkg", version: "1.0.0" }),
						};
					}
					return { status: 200, body: "" };
				};

				const program = Effect.gen(function* () {
					const fetcher = yield* PackageFetcher;
					return yield* fetcher.getTypeFiles(testPkg);
				});

				const vfs = await runWithMockHttp(handler, program);

				expect(vfs.has("/dist/index.d.ts")).toBe(true);
				// package.json is in the tree but is not a .d.ts file, so it should NOT
				// be fetched as a type file. However, since it IS in the file tree listing,
				// the auto-fetch branch should NOT trigger either.
				// The only fetch of package.json would be zero (it's listed but not a type file)
				expect(packageJsonFetchCount).toBe(0);
			});
		});
	});
});
