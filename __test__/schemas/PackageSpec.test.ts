import { Equal } from "effect";
import { describe, expect, it } from "vitest";
import { PackageSpec } from "../../src/schemas/PackageSpec.js";

describe("PackageSpec", () => {
	it("should create with name and version", () => {
		const spec = new PackageSpec({ name: "zod", version: "3.22.4" });
		expect(spec.name).toBe("zod");
		expect(spec.version).toBe("3.22.4");
		expect(spec._tag).toBe("PackageSpec");
	});

	it("should support structural equality", () => {
		const a = new PackageSpec({ name: "zod", version: "3.22.4" });
		const b = new PackageSpec({ name: "zod", version: "3.22.4" });
		expect(Equal.equals(a, b)).toBe(true);
	});

	it("should not equal different specs", () => {
		const a = new PackageSpec({ name: "zod", version: "3.22.4" });
		const b = new PackageSpec({ name: "zod", version: "3.23.0" });
		expect(Equal.equals(a, b)).toBe(false);
	});

	it("should have a toString method", () => {
		const spec = new PackageSpec({ name: "zod", version: "3.22.4" });
		expect(spec.toString()).toBe("zod@3.22.4");
	});

	it("should handle scoped packages", () => {
		const spec = new PackageSpec({ name: "@effect/schema", version: "0.68.0" });
		expect(spec.toString()).toBe("@effect/schema@0.68.0");
	});

	it("should support optional registry field", () => {
		const spec = new PackageSpec({
			name: "zod",
			version: "3.22.4",
			registry: "https://npm.pkg.github.com",
		});
		expect(spec.registry).toBe("https://npm.pkg.github.com");
	});
});
