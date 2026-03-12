import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PackageJson } from "../../src/schemas/PackageJson.js";

describe("PackageJson", () => {
	it("should decode a minimal package.json", () => {
		const result = Schema.decodeUnknownSync(PackageJson)({
			name: "zod",
			version: "3.22.4",
		});
		expect(result.name).toBe("zod");
		expect(result.version).toBe("3.22.4");
	});

	it("should decode with types field", () => {
		const result = Schema.decodeUnknownSync(PackageJson)({
			name: "zod",
			version: "3.22.4",
			types: "./lib/index.d.ts",
		});
		expect(result.types).toBe("./lib/index.d.ts");
	});

	it("should decode with exports field (string)", () => {
		const result = Schema.decodeUnknownSync(PackageJson)({
			name: "zod",
			version: "3.22.4",
			exports: "./lib/index.js",
		});
		expect(result.exports).toBe("./lib/index.js");
	});

	it("should decode with exports field (object)", () => {
		const result = Schema.decodeUnknownSync(PackageJson)({
			name: "zod",
			version: "3.22.4",
			exports: {
				".": { types: "./lib/index.d.ts", import: "./lib/index.js" },
			},
		});
		expect(result.exports).toBeDefined();
	});

	it("should reject missing required fields", () => {
		expect(() =>
			Schema.decodeUnknownSync(PackageJson)({
				name: "zod",
			}),
		).toThrow();
	});

	it("should allow extra fields (passthrough)", () => {
		const result = Schema.decodeUnknownSync(PackageJson)({
			name: "zod",
			version: "3.22.4",
			description: "TypeScript-first schema validation",
			license: "MIT",
		});
		expect(result.name).toBe("zod");
	});
});
