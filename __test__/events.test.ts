import { Schema } from "effect";
import { describe, expect, it } from "vitest";
// biome-ignore lint/suspicious/noDeprecatedImports: this suite intentionally exercises the deprecated LogEventSchema to guard its back-compat behavior until it is removed in a future major.
import { LogEventSchema } from "../src/events.js";

const decode = Schema.decodeUnknownSync(LogEventSchema);

describe("LogEventSchema", () => {
	describe("valid events", () => {
		it("should validate package.version.resolved", () => {
			const input = {
				event: "package.version.resolved",
				package: "react",
				requested: "^18",
				resolved: "18.2.0",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate cache.hit", () => {
			const input = {
				event: "cache.hit",
				package: "react",
				version: "18.2.0",
				ageMinutes: "5",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate cache.stale", () => {
			const input = {
				event: "cache.stale",
				package: "react",
				version: "18.2.0",
				ageMinutes: "120",
				ttlMinutes: "60",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate cache.miss", () => {
			const input = {
				event: "cache.miss",
				package: "react",
				version: "18.2.0",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.fetch.start", () => {
			const input = {
				event: "package.fetch.start",
				package: "react",
				version: "18.2.0",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.loaded", () => {
			const input = {
				event: "package.loaded",
				package: "react",
				version: "18.2.0",
				files: "42",
				source: "cache",
				durationMs: "1234",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.loaded with source network", () => {
			const input = {
				event: "package.loaded",
				package: "react",
				version: "18.2.0",
				files: "42",
				source: "network",
				durationMs: "5678",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.load.failed", () => {
			const input = {
				event: "package.load.failed",
				package: "react",
				version: "18.2.0",
				error: "404 Not Found",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate packages.batch.start", () => {
			const input = {
				event: "packages.batch.start",
				total: "3",
				packages: "react, vue, svelte",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate packages.batch.complete", () => {
			const input = {
				event: "packages.batch.complete",
				loaded: "2",
				failed: "1",
				total: "3",
				totalFiles: "100",
				durationMs: "1500",
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate typescript.cache.created", () => {
			const input = {
				event: "typescript.cache.created",
				packages: "react, vue",
				fileCount: "50",
				rootFiles: "2",
			};
			expect(decode(input)).toEqual(input);
		});
	});

	describe("invalid events", () => {
		it("should throw on unknown event discriminator", () => {
			const input = {
				event: "unknown.event",
				package: "react",
			};
			expect(() => decode(input)).toThrow();
		});

		it("should throw on missing required field", () => {
			const input = {
				event: "cache.hit",
				package: "react",
				// missing version and ageMinutes
			};
			expect(() => decode(input)).toThrow();
		});

		it("should throw on completely invalid input", () => {
			expect(() => decode(null)).toThrow();
			expect(() => decode(42)).toThrow();
			expect(() => decode("string")).toThrow();
		});
	});
});
