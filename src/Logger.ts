/**
 * Logger module that wraps Effect-TS logging
 * Automatically suppresses logging in test environment (NODE_ENV=test or when running via vitest)
 */

import * as Effect from "effect/Effect";

// Detect if we're running in test mode
// @ts-expect-error - vitest sets this global
const isTest: boolean = typeof globalThis.vitest !== "undefined" || process.env.NODE_ENV === "test";

/**
 * Log a debug message (suppressed in test mode)
 */
export const logDebug = (message: string, data?: Record<string, unknown>): Effect.Effect<void, never, never> => {
	if (isTest) return Effect.void;
	return data ? Effect.logDebug(message, data) : Effect.logDebug(message);
};

/**
 * Log an info message (suppressed in test mode)
 */
export const logInfo = (message: string, data?: Record<string, unknown>): Effect.Effect<void, never, never> => {
	if (isTest) return Effect.void;
	return data ? Effect.logInfo(message, data) : Effect.logInfo(message);
};

/**
 * Log a warning message (suppressed in test mode)
 */
export const logWarning = (message: string, data?: Record<string, unknown>): Effect.Effect<void, never, never> => {
	if (isTest) return Effect.void;
	return data ? Effect.logWarning(message, data) : Effect.logWarning(message);
};

/**
 * Log an error message (suppressed in test mode)
 */
export const logError = (message: string, data?: Record<string, unknown>): Effect.Effect<void, never, never> => {
	if (isTest) return Effect.void;
	return data ? Effect.logError(message, data) : Effect.logError(message);
};
