import { readFileSync } from "node:fs";
import type { VirtualFileSystem } from "./types.js";

/**
 * A virtual npm package that generates a VFS (virtual file system) from
 * declaration content. Supports single or multiple entry points.
 *
 * Not cached — transient, lives as long as the VFS does.
 * No dependency on `@microsoft/api-extractor-model`.
 */
export class VirtualPackage {
	constructor(
		readonly name: string,
		readonly version: string,
		protected readonly entries: Map<string, string>,
	) {}

	/**
	 * Single-entry convenience factory.
	 * Creates a virtual package with a single `index.d.ts` entry.
	 */
	static create(name: string, version: string, declarations: string): VirtualPackage {
		const entries = new Map<string, string>();
		entries.set("index.d.ts", declarations);
		return new VirtualPackage(name, version, entries);
	}

	/**
	 * Multi-entry factory.
	 * Creates a virtual package with multiple entry point files.
	 *
	 * @param entries - Map of file names (e.g. `"index.d.ts"`, `"testing.d.ts"`) to declaration content.
	 */
	static createMultiEntry(name: string, version: string, entries: Map<string, string>): VirtualPackage {
		return new VirtualPackage(name, version, entries);
	}

	/**
	 * Load from a `.d.ts` file on disk.
	 * Creates a single-entry virtual package from an existing declaration file.
	 */
	static fromFile(name: string, version: string, filePath: string): VirtualPackage {
		const content = readFileSync(filePath, "utf-8");
		return VirtualPackage.create(name, version, content);
	}

	/**
	 * Generate the full VFS: `package.json` + all entry `.d.ts` files.
	 * All paths are prefixed with `node_modules/{name}/`.
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
	 * Generate `package.json` content.
	 * Uses `types` field for single entry, `exports` map for multiple entries.
	 */
	protected generatePackageJson(): string {
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
