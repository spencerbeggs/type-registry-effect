/**
 * Tests for XDG Base Directory utilities
 */

import { homedir } from "node:os";
import * as Path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDefaultCacheDir, getXdgCacheHome, getXdgConfigHome, getXdgDataHome } from "../src/utils/xdg.js";

describe("XDG utilities", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		// Save original environment
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
	});

	describe("getXdgCacheHome", () => {
		it("should return XDG_CACHE_HOME if set and absolute", () => {
			process.env.XDG_CACHE_HOME = "/custom/cache";
			expect(getXdgCacheHome()).toBe("/custom/cache");
		});

		it("should return default ~/.cache if XDG_CACHE_HOME is not set", () => {
			delete process.env.XDG_CACHE_HOME;
			expect(getXdgCacheHome()).toBe(Path.join(homedir(), ".cache"));
		});

		it("should return default ~/.cache if XDG_CACHE_HOME is relative", () => {
			process.env.XDG_CACHE_HOME = "relative/path";
			expect(getXdgCacheHome()).toBe(Path.join(homedir(), ".cache"));
		});

		it("should return default ~/.cache if XDG_CACHE_HOME is empty", () => {
			process.env.XDG_CACHE_HOME = "";
			expect(getXdgCacheHome()).toBe(Path.join(homedir(), ".cache"));
		});
	});

	describe("getXdgConfigHome", () => {
		it("should return XDG_CONFIG_HOME if set and absolute", () => {
			process.env.XDG_CONFIG_HOME = "/custom/config";
			expect(getXdgConfigHome()).toBe("/custom/config");
		});

		it("should return default ~/.config if XDG_CONFIG_HOME is not set", () => {
			delete process.env.XDG_CONFIG_HOME;
			expect(getXdgConfigHome()).toBe(Path.join(homedir(), ".config"));
		});

		it("should return default ~/.config if XDG_CONFIG_HOME is relative", () => {
			process.env.XDG_CONFIG_HOME = "relative/path";
			expect(getXdgConfigHome()).toBe(Path.join(homedir(), ".config"));
		});
	});

	describe("getXdgDataHome", () => {
		it("should return XDG_DATA_HOME if set and absolute", () => {
			process.env.XDG_DATA_HOME = "/custom/data";
			expect(getXdgDataHome()).toBe("/custom/data");
		});

		it("should return default ~/.local/share if XDG_DATA_HOME is not set", () => {
			delete process.env.XDG_DATA_HOME;
			expect(getXdgDataHome()).toBe(Path.join(homedir(), ".local", "share"));
		});

		it("should return default ~/.local/share if XDG_DATA_HOME is relative", () => {
			process.env.XDG_DATA_HOME = "relative/path";
			expect(getXdgDataHome()).toBe(Path.join(homedir(), ".local", "share"));
		});
	});

	describe("getDefaultCacheDir", () => {
		it("should return effect-type-registry subdir in XDG cache home", () => {
			process.env.XDG_CACHE_HOME = "/custom/cache";
			expect(getDefaultCacheDir()).toBe("/custom/cache/effect-type-registry");
		});

		it("should return effect-type-registry subdir in default cache when XDG_CACHE_HOME not set", () => {
			delete process.env.XDG_CACHE_HOME;
			expect(getDefaultCacheDir()).toBe(Path.join(homedir(), ".cache", "effect-type-registry"));
		});

		it("should handle trailing slashes in XDG_CACHE_HOME", () => {
			process.env.XDG_CACHE_HOME = "/custom/cache/";
			const result = getDefaultCacheDir();
			expect(result).toContain("effect-type-registry");
			expect(result.startsWith("/custom/cache")).toBe(true);
		});
	});
});
