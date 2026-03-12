import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CacheMetadata } from "../../src/schemas/CacheMetadata.js";

describe("CacheMetadata", () => {
	it("should create with required fields", () => {
		const meta = new CacheMetadata({
			version: "3.22.4",
			cachedAt: 1705334400000,
		});
		expect(meta.version).toBe("3.22.4");
		expect(meta.cachedAt).toBe(1705334400000);
		expect(meta.ttl).toBeUndefined();
	});

	it("should create with optional ttl", () => {
		const meta = new CacheMetadata({
			version: "3.22.4",
			cachedAt: 1705334400000,
			ttl: 604800000,
		});
		expect(meta.ttl).toBe(604800000);
	});

	it("should encode to JSON-safe object", () => {
		const meta = new CacheMetadata({
			version: "3.22.4",
			cachedAt: 1705334400000,
		});
		const encoded = Schema.encodeSync(CacheMetadata)(meta);
		expect(encoded).toEqual({
			version: "3.22.4",
			cachedAt: 1705334400000,
		});
	});

	it("should decode from unknown object", () => {
		const decoded = Schema.decodeUnknownSync(CacheMetadata)({
			version: "3.22.4",
			cachedAt: 1705334400000,
			ttl: 604800000,
		});
		expect(decoded).toBeInstanceOf(CacheMetadata);
		expect(decoded.version).toBe("3.22.4");
	});

	it("should reject invalid data", () => {
		expect(() =>
			Schema.decodeUnknownSync(CacheMetadata)({
				version: 123,
				cachedAt: "not a number",
			}),
		).toThrow();
	});
});
