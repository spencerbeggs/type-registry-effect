import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { CacheError } from "../../src/errors/CacheError.js";
import { NetworkError } from "../../src/errors/NetworkError.js";
import { PackageNotFoundError } from "../../src/errors/PackageNotFoundError.js";
import { ParseError } from "../../src/errors/ParseError.js";
import { ResolutionError } from "../../src/errors/ResolutionError.js";
import { TimeoutError } from "../../src/errors/TimeoutError.js";

describe("Tagged Errors", () => {
	it("NetworkError should have correct _tag", () => {
		const err = new NetworkError({ url: "https://cdn.jsdelivr.net", message: "Connection refused" });
		expect(err._tag).toBe("NetworkError");
		expect(err.url).toBe("https://cdn.jsdelivr.net");
		expect(err.message).toBe("Connection refused");
	});

	it("NetworkError should have optional status", () => {
		const err = new NetworkError({ url: "https://cdn.jsdelivr.net", status: 404, message: "Not found" });
		expect(err.status).toBe(404);
	});

	it("CacheError should have correct _tag", () => {
		const err = new CacheError({ operation: "read", path: "/cache/zod", message: "ENOENT" });
		expect(err._tag).toBe("CacheError");
		expect(err.operation).toBe("read");
	});

	it("PackageNotFoundError should have correct _tag", () => {
		const err = new PackageNotFoundError({ name: "nonexistent", version: "1.0.0", message: "Not found" });
		expect(err._tag).toBe("PackageNotFoundError");
	});

	it("ParseError should have correct _tag", () => {
		const err = new ParseError({ source: "package.json", message: "Invalid JSON" });
		expect(err._tag).toBe("ParseError");
	});

	it("ResolutionError should have correct _tag", () => {
		const err = new ResolutionError({ package: "zod", specifier: "./deep", message: "Not found" });
		expect(err._tag).toBe("ResolutionError");
	});

	it("TimeoutError should have correct _tag", () => {
		const err = new TimeoutError({ operation: "fetch", duration: 30000, message: "Timed out" });
		expect(err._tag).toBe("TimeoutError");
	});

	it("should be catchable by tag in Effect", async () => {
		const program = Effect.fail(new NetworkError({ url: "https://cdn.jsdelivr.net", message: "fail" })).pipe(
			Effect.catchTag("NetworkError", (e) => Effect.succeed(`caught: ${e.url}`)),
		);
		const result = await Effect.runPromise(program);
		expect(result).toBe("caught: https://cdn.jsdelivr.net");
	});

	it("should support catchTags for multiple error types", async () => {
		const fail: Effect.Effect<never, NetworkError | CacheError> = Effect.fail(
			new CacheError({ operation: "write", path: "/cache", message: "ENOSPC" }),
		);
		const program = fail.pipe(
			Effect.catchTags({
				NetworkError: (e) => Effect.succeed(`network: ${e.url}`),
				CacheError: (e) => Effect.succeed(`cache: ${e.operation}`),
			}),
		);
		const result = await Effect.runPromise(program);
		expect(result).toBe("cache: write");
	});
});
