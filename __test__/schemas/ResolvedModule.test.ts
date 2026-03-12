import { Equal } from "effect";
import { describe, expect, it } from "vitest";
import { PackageSpec } from "../../src/schemas/PackageSpec.js";
import { ResolvedModule } from "../../src/schemas/ResolvedModule.js";

describe("ResolvedModule", () => {
	it("should create with required fields", () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const mod = new ResolvedModule({
			filePath: "lib/index.d.ts",
			isTypeDefinition: true,
			package: pkg,
		});
		expect(mod.filePath).toBe("lib/index.d.ts");
		expect(mod.isTypeDefinition).toBe(true);
		expect(mod._tag).toBe("ResolvedModule");
	});

	it("should support structural equality", () => {
		const pkg = new PackageSpec({ name: "zod", version: "3.22.4" });
		const a = new ResolvedModule({ filePath: "lib/index.d.ts", isTypeDefinition: true, package: pkg });
		const b = new ResolvedModule({ filePath: "lib/index.d.ts", isTypeDefinition: true, package: pkg });
		expect(Equal.equals(a, b)).toBe(true);
	});
});
