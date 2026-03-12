/**
 * Utilities for resolving directories according to the
 * {@link https://specifications.freedesktop.org/basedir-spec/latest/ | XDG Base Directory Specification}.
 *
 * @remarks
 * Each helper honours the corresponding `XDG_*` environment variable when it
 * is set to an absolute path, falling back to the spec-defined default under
 * the user's home directory.
 *
 * @packageDocumentation
 */

import { homedir } from "node:os";
import * as Path from "node:path";

/**
 * Return the XDG cache directory.
 *
 * @remarks
 * Uses `XDG_CACHE_HOME` if set to an absolute path, otherwise defaults to
 * `~/.cache`.
 *
 * @returns Absolute path to the cache directory.
 *
 * @internal
 */
export function getXdgCacheHome(): string {
	const xdgCacheHome = process.env.XDG_CACHE_HOME;

	if (xdgCacheHome && Path.isAbsolute(xdgCacheHome)) {
		return xdgCacheHome;
	}

	return Path.join(homedir(), ".cache");
}

/**
 * Return the XDG config directory.
 *
 * @remarks
 * Uses `XDG_CONFIG_HOME` if set to an absolute path, otherwise defaults to
 * `~/.config`.
 *
 * @returns Absolute path to the config directory.
 *
 * @internal
 */
export function getXdgConfigHome(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME;

	if (xdgConfigHome && Path.isAbsolute(xdgConfigHome)) {
		return xdgConfigHome;
	}

	return Path.join(homedir(), ".config");
}

/**
 * Return the XDG data directory.
 *
 * @remarks
 * Uses `XDG_DATA_HOME` if set to an absolute path, otherwise defaults to
 * `~/.local/share`.
 *
 * @returns Absolute path to the data directory.
 *
 * @internal
 */
export function getXdgDataHome(): string {
	const xdgDataHome = process.env.XDG_DATA_HOME;

	if (xdgDataHome && Path.isAbsolute(xdgDataHome)) {
		return xdgDataHome;
	}

	return Path.join(homedir(), ".local", "share");
}

/**
 * Return the default cache directory used by `effect-type-registry`.
 *
 * @remarks
 * Resolves to `<XDG_CACHE_HOME>/effect-type-registry`. This is the path
 * used by the built-in Node.js cache layer when no custom directory is
 * provided.
 *
 * @returns Absolute path to the default cache directory
 *   (e.g. `~/.cache/effect-type-registry`).
 *
 * @see {@link makeNodeCacheLayer} in `"type-registry-effect/node"` which
 *   calls this function when constructing the default layer.
 *
 * @public
 */
export function getDefaultCacheDir(): string {
	return Path.join(getXdgCacheHome(), "effect-type-registry");
}
