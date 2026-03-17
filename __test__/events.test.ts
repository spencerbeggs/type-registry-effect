import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { LogEventSchema } from "../src/events.js";

const decode = Schema.decodeUnknownSync(LogEventSchema);

const base = {
	message: "test message",
	timestamp: Date.now(),
};

const baseWithFiber = {
	...base,
	fiber: "fiber-123",
};

describe("LogEventSchema", () => {
	describe("valid events", () => {
		it("should validate package.version.resolved", () => {
			const input = {
				...base,
				event: "package.version.resolved",
				level: "info",
				data: { package: "react", requested: "^18", resolved: "18.2.0" },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate cache.hit", () => {
			const input = {
				...base,
				event: "cache.hit",
				level: "info",
				data: { package: "react", version: "18.2.0", ageMinutes: 5 },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate cache.stale", () => {
			const input = {
				...base,
				event: "cache.stale",
				level: "debug",
				data: { package: "react", version: "18.2.0", ageMinutes: 120, ttlMinutes: 60 },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate cache.miss", () => {
			const input = {
				...base,
				event: "cache.miss",
				level: "debug",
				data: { package: "react", version: "18.2.0" },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.fetch.start", () => {
			const input = {
				...base,
				event: "package.fetch.start",
				level: "debug",
				data: { package: "react", version: "18.2.0" },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.loaded", () => {
			const input = {
				...base,
				event: "package.loaded",
				level: "info",
				data: { package: "react", version: "18.2.0", files: 42, source: "cache" as const, durationMs: 1234 },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.loaded with source network", () => {
			const input = {
				...base,
				event: "package.loaded",
				level: "info",
				data: { package: "react", version: "18.2.0", files: 42, source: "network" as const, durationMs: 5678 },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate package.load.failed", () => {
			const input = {
				...base,
				event: "package.load.failed",
				level: "warn",
				data: { package: "react", version: "18.2.0", error: "404 Not Found" },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate packages.batch.start", () => {
			const input = {
				...base,
				event: "packages.batch.start",
				level: "debug",
				data: { total: 3, packages: ["react", "vue", "svelte"] },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate packages.batch.complete", () => {
			const input = {
				...base,
				event: "packages.batch.complete",
				level: "info",
				data: { loaded: 2, failed: 1, total: 3, totalFiles: 100, durationMs: 1500 },
			};
			expect(decode(input)).toEqual(input);
		});

		it("should validate typescript.cache.created", () => {
			const input = {
				...base,
				event: "typescript.cache.created",
				level: "info",
				data: { packages: ["react", "vue"], fileCount: 50, rootFiles: 2 },
			};
			expect(decode(input)).toEqual(input);
		});
	});

	describe("optional fiber field", () => {
		it("should accept an event without fiber", () => {
			const input = {
				...base,
				event: "cache.hit",
				level: "info",
				data: { package: "react", version: "18.2.0", ageMinutes: 5 },
			};
			const result = decode(input);
			expect(result).toEqual(input);
			expect("fiber" in result).toBe(false);
		});

		it("should accept an event with fiber", () => {
			const input = {
				...baseWithFiber,
				event: "cache.hit",
				level: "info",
				data: { package: "react", version: "18.2.0", ageMinutes: 5 },
			};
			const result = decode(input);
			expect(result).toEqual(input);
			expect(result.fiber).toBe("fiber-123");
		});
	});

	describe("invalid events", () => {
		it("should throw on missing required field (message)", () => {
			const input = {
				event: "cache.hit",
				level: "info",
				timestamp: Date.now(),
				data: { package: "react", version: "18.2.0", ageMinutes: 5 },
			};
			expect(() => decode(input)).toThrow();
		});

		it("should throw on missing data field", () => {
			const input = {
				...base,
				event: "cache.hit",
				level: "info",
			};
			expect(() => decode(input)).toThrow();
		});

		it("should throw on unknown event discriminator", () => {
			const input = {
				...base,
				event: "unknown.event",
				level: "info",
				data: {},
			};
			expect(() => decode(input)).toThrow();
		});

		it("should throw on wrong level for event type", () => {
			const input = {
				...base,
				event: "cache.hit",
				level: "debug",
				data: { package: "react", version: "18.2.0", ageMinutes: 5 },
			};
			expect(() => decode(input)).toThrow();
		});

		it("should throw on invalid source literal in package.loaded", () => {
			const input = {
				...base,
				event: "package.loaded",
				level: "info",
				data: { package: "react", version: "18.2.0", files: 42, source: "disk", durationMs: 100 },
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
