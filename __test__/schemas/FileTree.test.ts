import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { FileTreeResponse } from "../../src/schemas/FileTree.js";

describe("FileTreeResponse", () => {
	it("should decode a valid jsDelivr response", () => {
		const result = Schema.decodeUnknownSync(FileTreeResponse)({
			default: "/lib/index.js",
			files: [
				{ name: "/lib/index.d.ts", hash: "abc123", time: "2024-01-01T00:00:00Z", size: 1234 },
				{ name: "/lib/types.d.ts", hash: "def456", time: "2024-01-01T00:00:00Z", size: 5678 },
			],
		});
		expect(result.default).toBe("/lib/index.js");
		expect(result.files).toHaveLength(2);
		expect(result.files[0].name).toBe("/lib/index.d.ts");
	});

	it("should decode a response with a null default (e.g. ink)", () => {
		const result = Schema.decodeUnknownSync(FileTreeResponse)({
			default: null,
			files: [{ name: "/build/index.d.ts", hash: "abc123", time: "2024-01-01T00:00:00Z", size: 1234 }],
		});
		expect(result.default).toBeNull();
		expect(result.files).toHaveLength(1);
	});

	it("should reject invalid response", () => {
		expect(() =>
			Schema.decodeUnknownSync(FileTreeResponse)({
				files: "not an array",
			}),
		).toThrow();
	});
});
