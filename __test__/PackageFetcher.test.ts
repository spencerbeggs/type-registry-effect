/**
 * Tests for PackageFetcher service
 */

import { describe, expect, it } from "vitest";
import { normalizeModuleName } from "./PackageFetcher.js";

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
});
