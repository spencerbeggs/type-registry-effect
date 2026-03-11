/**
 * Mock PackageFetcher for testing without network calls
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import * as Path from "node:path";
import type { HttpClient } from "@effect/platform";
import * as Effect from "effect/Effect";
import type { PackageFetcher } from "../../src/services/PackageFetcher.js";
import type { PackageJson, PackageSpec } from "../../src/types.js";

/**
 * Map of fixture data for mock packages
 */
interface PackageMetadata {
	readonly versions: string[];
	readonly tags: Record<string, string>;
}

interface FileTreeEntry {
	readonly name: string;
	readonly hash: string;
	readonly time: string;
	readonly size: number;
}

interface FileTreeResponse {
	readonly default: string;
	readonly files: FileTreeEntry[];
}

/**
 * Get fixture directory path for a package
 */
function getFixturePath(packageName: string): string {
	// Get the current file's directory using import.meta.url
	const currentFileUrl = new URL(import.meta.url);
	const currentDir = Path.dirname(currentFileUrl.pathname);
	const fixturesDir = Path.join(currentDir, "..", "fixtures");
	return Path.join(fixturesDir, packageName);
}

/**
 * Read fixture file
 */
function readFixtureFile(packageName: string, filePath: string): string {
	const fixturePath = getFixturePath(packageName);
	const fullPath = Path.join(fixturePath, filePath);
	return readFileSync(fullPath, "utf-8");
}

/**
 * Get all files recursively from a directory
 */
function getAllFiles(dir: string, baseDir: string = dir): string[] {
	const files: string[] = [];
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = Path.join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			files.push(...getAllFiles(fullPath, baseDir));
		} else {
			const relativePath = Path.relative(baseDir, fullPath);
			files.push(`/${relativePath.replace(/\\/g, "/")}`);
		}
	}

	return files;
}

/**
 * Mock PackageFetcher implementation
 */
class MockPackageFetcherImpl implements PackageFetcher {
	getVersions(packageName: string): Effect.Effect<PackageMetadata, Error, HttpClient.HttpClient> {
		return Effect.sync(() => {
			// Return mock metadata based on fixture
			const fixturePath = getFixturePath(packageName);
			const packageJson = JSON.parse(readFileSync(Path.join(fixturePath, "package.json"), "utf-8")) as PackageJson;

			return {
				versions: [packageJson.version],
				tags: {
					latest: packageJson.version,
				},
			};
		});
	}

	resolveVersion(packageName: string, versionRef: string): Effect.Effect<string, Error, HttpClient.HttpClient> {
		return Effect.sync(() => {
			// Simple mock: return the version from fixture
			const fixturePath = getFixturePath(packageName);
			const packageJson = JSON.parse(readFileSync(Path.join(fixturePath, "package.json"), "utf-8")) as PackageJson;

			if (versionRef === "latest" || versionRef === packageJson.version) {
				return packageJson.version;
			}

			throw new Error(`Version ${versionRef} not found for ${packageName}`);
		});
	}

	getFileTree(pkg: PackageSpec): Effect.Effect<FileTreeResponse, Error, HttpClient.HttpClient> {
		return Effect.sync(() => {
			const fixturePath = getFixturePath(pkg.name);
			const files = getAllFiles(fixturePath);

			return {
				default: "/package.json",
				files: files.map((filePath) => ({
					name: filePath,
					hash: "mock-hash",
					time: "2024-01-01T00:00:00.000Z",
					size: 0,
				})),
			};
		});
	}

	downloadFile(pkg: PackageSpec, filePath: string): Effect.Effect<string, Error, HttpClient.HttpClient> {
		return Effect.sync(() => {
			// Remove leading slash
			const normalizedPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
			return readFixtureFile(pkg.name, normalizedPath);
		});
	}

	getPackageJson(pkg: PackageSpec): Effect.Effect<PackageJson, Error, HttpClient.HttpClient> {
		return Effect.sync(() => {
			const content = readFixtureFile(pkg.name, "package.json");
			return JSON.parse(content) as PackageJson;
		});
	}

	getTypeFiles(pkg: PackageSpec): Effect.Effect<Map<string, string>, Error, HttpClient.HttpClient> {
		return Effect.sync(() => {
			const fixturePath = getFixturePath(pkg.name);
			const files = getAllFiles(fixturePath);

			const typeFiles = new Map<string, string>();
			const typeFilePattern = /\.d\.([^.]+\.)?[cm]?ts$/i;

			for (const file of files) {
				if (typeFilePattern.test(file) || file.endsWith("package.json")) {
					const normalizedPath = file.startsWith("/") ? file.slice(1) : file;
					const content = readFixtureFile(pkg.name, normalizedPath);
					typeFiles.set(file, content);
				}
			}

			return typeFiles;
		});
	}
}

/**
 * Mock PackageFetcher layer
 */
export const MockPackageFetcherLive: Effect.Effect<PackageFetcher, never> = Effect.succeed(
	new MockPackageFetcherImpl(),
);
