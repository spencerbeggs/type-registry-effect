import { readFileSync } from "node:fs";
import type { VirtualFileSystem } from "./services/CacheService.js";

/**
 * Creates virtual npm packages from TypeScript declaration content for
 * inclusion in a {@link VirtualFileSystem} without fetching from the CDN.
 *
 * @remarks
 * `VirtualPackage` is useful when you have locally-generated `.d.ts` files —
 * for example, output from API Extractor, hand-written ambient declarations, or
 * declaration files bundled alongside your own packages — and want to inject
 * them into the same VFS that TypeRegistry builds from remote packages.
 *
 * Instances are **transient**: they are not persisted to the disk cache and
 * live only as long as the VFS they produce. Call {@link VirtualPackage.generateVfs}
 * to obtain a VFS that can be merged with other VFS maps.
 *
 * @see {@link VirtualFileSystem} for the VFS type consumed by TypeScript tooling
 *
 * @public
 */
export class VirtualPackage {
	constructor(
		readonly name: string,
		readonly version: string,
		private readonly entries: Map<string, string>,
	) {}

	/**
	 * Single-entry convenience factory.
	 *
	 * Creates a virtual package whose sole entry point is `index.d.ts`.
	 *
	 * @param name - Package name (e.g. `"@my-org/api-types"`).
	 * @param version - Semver version string (e.g. `"1.0.0"`).
	 * @param declarations - The full TypeScript declaration source for `index.d.ts`.
	 * @returns A new {@link VirtualPackage} instance.
	 *
	 * @example
	 * ```typescript
	 * import type { VirtualFileSystem } from "type-registry-effect";
	 * import { VirtualPackage } from "type-registry-effect";
	 *
	 * const declarations = `
	 *   export interface User {
	 *     id: string;
	 *     name: string;
	 *   }
	 * `;
	 *
	 * const pkg = VirtualPackage.create("@my-org/api-types", "1.0.0", declarations);
	 * const vfs: VirtualFileSystem = pkg.generateVfs();
	 * console.log([...vfs.keys()]);
	 * // ["node_modules/@my-org/api-types/package.json",
	 * //  "node_modules/@my-org/api-types/index.d.ts"]
	 * ```
	 *
	 * @public
	 */
	static create(name: string, version: string, declarations: string): VirtualPackage {
		const entries = new Map<string, string>();
		entries.set("index.d.ts", declarations);
		return new VirtualPackage(name, version, entries);
	}

	/**
	 * Multi-entry factory.
	 *
	 * Creates a virtual package with multiple `.d.ts` entry point files,
	 * producing a `package.json` that uses the `exports` map.
	 *
	 * @param name - Package name.
	 * @param version - Semver version string.
	 * @param entries - Map of file names (e.g. `"index.d.ts"`, `"testing.d.ts"`)
	 *   to their declaration source content.
	 * @returns A new {@link VirtualPackage} instance.
	 *
	 * @example
	 * ```typescript
	 * import type { VirtualFileSystem } from "type-registry-effect";
	 * import { VirtualPackage } from "type-registry-effect";
	 *
	 * const entries = new Map<string, string>([
	 *   ["index.d.ts", "export declare function run(): void;"],
	 *   ["testing.d.ts", "export declare function mock(): void;"],
	 * ]);
	 *
	 * const pkg = VirtualPackage.createMultiEntry("@my-org/sdk", "2.0.0", entries);
	 * const vfs: VirtualFileSystem = pkg.generateVfs();
	 * console.log([...vfs.keys()]);
	 * // ["node_modules/@my-org/sdk/package.json",
	 * //  "node_modules/@my-org/sdk/index.d.ts",
	 * //  "node_modules/@my-org/sdk/testing.d.ts"]
	 * ```
	 *
	 * @public
	 */
	static createMultiEntry(name: string, version: string, entries: Map<string, string>): VirtualPackage {
		return new VirtualPackage(name, version, entries);
	}

	/**
	 * Load a single `.d.ts` file from disk and create a virtual package from it.
	 *
	 * @remarks
	 * Reads the file synchronously with `node:fs`. The resulting package has a
	 * single `index.d.ts` entry whose content matches the file on disk.
	 *
	 * @param name - Package name.
	 * @param version - Semver version string.
	 * @param filePath - Absolute or relative path to a `.d.ts` file.
	 * @returns A new {@link VirtualPackage} instance.
	 *
	 * @example
	 * ```typescript
	 * import type { VirtualFileSystem } from "type-registry-effect";
	 * import { VirtualPackage } from "type-registry-effect";
	 *
	 * const pkg = VirtualPackage.fromFile(
	 *   "@my-org/api-types",
	 *   "1.0.0",
	 *   "./dist/api-types.d.ts",
	 * );
	 * const vfs: VirtualFileSystem = pkg.generateVfs();
	 * ```
	 *
	 * @public
	 */
	static fromFile(name: string, version: string, filePath: string): VirtualPackage {
		const content = readFileSync(filePath, "utf-8");
		return VirtualPackage.create(name, version, content);
	}

	/**
	 * Generate the full {@link VirtualFileSystem}: a synthetic `package.json`
	 * plus all entry `.d.ts` files, with every path prefixed by
	 * `node_modules/<name>/`.
	 *
	 * @returns A {@link VirtualFileSystem} map ready to be merged with other VFS maps.
	 *
	 * @example
	 * ```typescript
	 * import type { VirtualFileSystem } from "type-registry-effect";
	 * import { VirtualPackage } from "type-registry-effect";
	 *
	 * const pkg = VirtualPackage.create("my-types", "1.0.0", "export type Foo = string;");
	 * const vfs: VirtualFileSystem = pkg.generateVfs();
	 *
	 * for (const [path, content] of vfs) {
	 *   console.log(`${path} (${content.length} chars)`);
	 * }
	 * ```
	 *
	 * @public
	 */
	generateVfs(): VirtualFileSystem {
		const vfs: VirtualFileSystem = new Map();
		const prefix = `node_modules/${this.name}`;

		vfs.set(`${prefix}/package.json`, this.generatePackageJson());

		for (const [fileName, content] of this.entries) {
			vfs.set(`${prefix}/${fileName}`, content);
		}

		return vfs;
	}

	/**
	 * Generate synthetic `package.json` content for the virtual package.
	 *
	 * @remarks
	 * Uses the `types` field for single-entry packages and the `exports` map
	 * for multi-entry packages so that TypeScript module resolution works
	 * correctly against the generated VFS.
	 *
	 * @returns The `package.json` content as a JSON string.
	 *
	 * @internal
	 */
	private generatePackageJson(): string {
		const isSingleEntry = this.entries.size <= 1;

		interface PkgJson {
			name: string;
			version: string;
			types?: string;
			exports?: Record<string, { types: string }>;
		}

		const pkg: PkgJson = { name: this.name, version: this.version };

		if (isSingleEntry) {
			pkg.types = "index.d.ts";
		} else {
			pkg.exports = {};
			for (const [fileName] of this.entries) {
				const baseName = fileName.replace(/\.d\.ts$/, "");
				const key = baseName === "index" ? "." : `./${baseName}`;
				pkg.exports[key] = { types: `./${fileName}` };
			}
		}

		return JSON.stringify(pkg, null, 2);
	}
}
