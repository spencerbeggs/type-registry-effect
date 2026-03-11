/**
 * XDG Base Directory Specification utilities
 * @see https://specifications.freedesktop.org/basedir-spec/latest/
 */

import { homedir } from "node:os";
import * as Path from "node:path";

/**
 * Get XDG cache directory
 * Uses XDG_CACHE_HOME if set, otherwise defaults to ~/.cache
 */
export function getXdgCacheHome(): string {
	const xdgCacheHome = process.env.XDG_CACHE_HOME;

	if (xdgCacheHome && Path.isAbsolute(xdgCacheHome)) {
		return xdgCacheHome;
	}

	return Path.join(homedir(), ".cache");
}

/**
 * Get XDG config directory
 * Uses XDG_CONFIG_HOME if set, otherwise defaults to ~/.config
 */
export function getXdgConfigHome(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME;

	if (xdgConfigHome && Path.isAbsolute(xdgConfigHome)) {
		return xdgConfigHome;
	}

	return Path.join(homedir(), ".config");
}

/**
 * Get XDG data directory
 * Uses XDG_DATA_HOME if set, otherwise defaults to ~/.local/share
 */
export function getXdgDataHome(): string {
	const xdgDataHome = process.env.XDG_DATA_HOME;

	if (xdgDataHome && Path.isAbsolute(xdgDataHome)) {
		return xdgDataHome;
	}

	return Path.join(homedir(), ".local", "share");
}

/**
 * Get the default cache directory for effect-type-registry
 * Respects XDG_CACHE_HOME environment variable
 */
export function getDefaultCacheDir(): string {
	return Path.join(getXdgCacheHome(), "effect-type-registry");
}
