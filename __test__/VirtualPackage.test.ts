import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VirtualPackage } from "../src/VirtualPackage.js";

describe("VirtualPackage", () => {
	describe("create (single entry)", () => {
		it("should create a virtual package with a single index.d.ts entry", () => {
			const pkg = VirtualPackage.create("my-pkg", "2.0.0", "export declare const x: number;");
			expect(pkg.name).toBe("my-pkg");
			expect(pkg.version).toBe("2.0.0");
		});

		it("should generate correct VFS with node_modules prefix", () => {
			const declarations = "export declare const x: number;";
			const pkg = VirtualPackage.create("my-pkg", "1.0.0", declarations);
			const vfs = pkg.generateVfs();

			expect(vfs.has("node_modules/my-pkg/package.json")).toBe(true);
			expect(vfs.has("node_modules/my-pkg/index.d.ts")).toBe(true);
			expect(vfs.get("node_modules/my-pkg/index.d.ts")).toBe(declarations);
		});

		it("should generate package.json with types field for single entry", () => {
			const pkg = VirtualPackage.create("my-pkg", "3.1.0", "export {};");
			const vfs = pkg.generateVfs();

			const raw = vfs.get("node_modules/my-pkg/package.json") ?? "";
			const pkgJson = JSON.parse(raw);
			expect(pkgJson.name).toBe("my-pkg");
			expect(pkgJson.version).toBe("3.1.0");
			expect(pkgJson.types).toBe("index.d.ts");
			expect(pkgJson.exports).toBeUndefined();
		});
	});

	describe("createMultiEntry", () => {
		it("should create a virtual package with multiple entries", () => {
			const entries = new Map<string, string>();
			entries.set("index.d.ts", "export declare const main: string;");
			entries.set("testing.d.ts", "export declare const test: boolean;");

			const pkg = VirtualPackage.createMultiEntry("multi-pkg", "1.0.0", entries);
			const vfs = pkg.generateVfs();

			expect(vfs.has("node_modules/multi-pkg/package.json")).toBe(true);
			expect(vfs.has("node_modules/multi-pkg/index.d.ts")).toBe(true);
			expect(vfs.has("node_modules/multi-pkg/testing.d.ts")).toBe(true);
			expect(vfs.get("node_modules/multi-pkg/index.d.ts")).toBe("export declare const main: string;");
			expect(vfs.get("node_modules/multi-pkg/testing.d.ts")).toBe("export declare const test: boolean;");
		});

		it("should generate package.json with exports map for multiple entries", () => {
			const entries = new Map<string, string>();
			entries.set("index.d.ts", "export {};");
			entries.set("testing.d.ts", "export {};");

			const pkg = VirtualPackage.createMultiEntry("multi-pkg", "2.0.0", entries);
			const vfs = pkg.generateVfs();

			const raw = vfs.get("node_modules/multi-pkg/package.json") ?? "";
			const pkgJson = JSON.parse(raw);
			expect(pkgJson.name).toBe("multi-pkg");
			expect(pkgJson.version).toBe("2.0.0");
			expect(pkgJson.types).toBeUndefined();
			expect(pkgJson.exports).toBeDefined();
			expect(pkgJson.exports["."]).toEqual({ types: "./index.d.ts" });
			expect(pkgJson.exports["./testing"]).toEqual({ types: "./testing.d.ts" });
		});
	});

	describe("fromFile", () => {
		let tmpDir: string;
		let dtsFilePath: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-test-"));
			dtsFilePath = path.join(tmpDir, "index.d.ts");
			fs.writeFileSync(dtsFilePath, "export declare function hello(): string;", "utf-8");
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("should load declarations from a .d.ts file", async () => {
			const pkg = await Effect.runPromise(
				VirtualPackage.fromFile("file-pkg", "0.1.0", dtsFilePath).pipe(Effect.provide(NodeFileSystem.layer)),
			);
			const vfs = pkg.generateVfs();

			expect(vfs.get("node_modules/file-pkg/index.d.ts")).toBe("export declare function hello(): string;");
		});

		it("should generate correct package.json for file-based package", async () => {
			const pkg = await Effect.runPromise(
				VirtualPackage.fromFile("file-pkg", "0.1.0", dtsFilePath).pipe(Effect.provide(NodeFileSystem.layer)),
			);
			const vfs = pkg.generateVfs();

			const raw = vfs.get("node_modules/file-pkg/package.json") ?? "";
			const pkgJson = JSON.parse(raw);
			expect(pkgJson.name).toBe("file-pkg");
			expect(pkgJson.version).toBe("0.1.0");
			expect(pkgJson.types).toBe("index.d.ts");
		});
	});

	describe("generateVfs", () => {
		it("should produce correct node_modules/ paths", () => {
			const pkg = VirtualPackage.create("@scope/pkg", "1.0.0", "export {};");
			const vfs = pkg.generateVfs();

			const keys = [...vfs.keys()];
			for (const key of keys) {
				expect(key.startsWith("node_modules/@scope/pkg/")).toBe(true);
			}
		});

		it("should include exactly entries.size + 1 files (entries + package.json)", () => {
			const entries = new Map<string, string>();
			entries.set("index.d.ts", "export {};");
			entries.set("utils.d.ts", "export {};");
			entries.set("types.d.ts", "export {};");

			const pkg = VirtualPackage.createMultiEntry("big-pkg", "1.0.0", entries);
			const vfs = pkg.generateVfs();

			expect(vfs.size).toBe(4); // 3 entries + package.json
		});

		it("should handle empty entries", () => {
			const pkg = VirtualPackage.createMultiEntry("empty-pkg", "1.0.0", new Map());
			const vfs = pkg.generateVfs();

			expect(vfs.size).toBe(1); // Just package.json
			expect(vfs.has("node_modules/empty-pkg/package.json")).toBe(true);
		});
	});

	describe("generatePackageJson", () => {
		it("should use types field for zero entries", () => {
			const pkg = VirtualPackage.createMultiEntry("zero-pkg", "1.0.0", new Map());
			const vfs = pkg.generateVfs();

			const raw = vfs.get("node_modules/zero-pkg/package.json") ?? "";
			const pkgJson = JSON.parse(raw);
			expect(pkgJson.types).toBe("index.d.ts");
			expect(pkgJson.exports).toBeUndefined();
		});

		it("should use types field for exactly one entry", () => {
			const pkg = VirtualPackage.create("one-pkg", "1.0.0", "export {};");
			const vfs = pkg.generateVfs();

			const raw = vfs.get("node_modules/one-pkg/package.json") ?? "";
			const pkgJson = JSON.parse(raw);
			expect(pkgJson.types).toBe("index.d.ts");
		});

		it("should use exports map for two or more entries", () => {
			const entries = new Map<string, string>();
			entries.set("index.d.ts", "export {};");
			entries.set("testing.d.ts", "export {};");

			const pkg = VirtualPackage.createMultiEntry("two-pkg", "1.0.0", entries);
			const vfs = pkg.generateVfs();

			const raw = vfs.get("node_modules/two-pkg/package.json") ?? "";
			const pkgJson = JSON.parse(raw);
			expect(pkgJson.exports).toBeDefined();
			expect(pkgJson.types).toBeUndefined();
		});
	});
});
