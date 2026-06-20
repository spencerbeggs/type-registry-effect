/**
 * Structured log event annotation schemas emitted by TypeRegistry operations.
 *
 * @remarks
 * Events are emitted via `Effect.log` with `Effect.annotateLogs`. The
 * {@link LogEventSchema} discriminated union describes the flat annotation
 * keys that a Logger receives for each event type. All annotation values
 * are strings (numeric values are stringified before emission).
 *
 * The Logger's own fields (`message`, `logLevel`, `timestamp`, `fiberId`)
 * are NOT part of the annotation map and are therefore not modeled here.
 *
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";

// ============================================================================
// Log Event Schemas
// ============================================================================

/**
 * Discriminated union schema for the annotation maps emitted by
 * TypeRegistry operations via `Effect.annotateLogs`.
 *
 * @remarks
 * Each variant describes the flat annotation keys a custom Logger
 * receives in its `annotations` parameter. All values are strings
 * because `Effect.annotateLogs` stringifies them before emission.
 *
 * The following event types are defined:
 *
 * - `"package.version.resolved"` — a version reference was resolved to a pinned version.
 * - `"cache.hit"` — a package was found in the disk cache and is fresh.
 * - `"cache.stale"` — a cached package exceeded its TTL.
 * - `"cache.miss"` — a package was not found in the cache.
 * - `"package.fetch.start"` — a network fetch has begun for a package.
 * - `"package.loaded"` — a package was successfully loaded (from cache or network).
 * - `"package.load.failed"` — loading a package failed.
 * - `"packages.batch.start"` — a batch operation started for multiple packages.
 * - `"packages.batch.complete"` — a batch operation finished with summary statistics.
 * - `"typescript.cache.created"` — a TypeScript in-memory cache was created from VFS data.
 *
 * Use the `event` field on the decoded value to narrow the type in a
 * `switch`/`case` or `if` block.
 *
 * @see {@link LogEvent} for the inferred TypeScript type
 *
 * @deprecated TypeRegistry no longer emits diagnostics via `Effect.log`.
 * Subscribe to typed events through `TypeRegistryObserver` / `RegistryEvent`
 * instead. This schema is retained for backward compatibility and will be
 * removed in a future major release.
 *
 * @example
 * ```typescript
 * import { Logger } from "effect";
 * import type { LogEvent } from "type-registry-effect";
 *
 * const myLogger = Logger.make(({ annotations }) => {
 *   const event = annotations.get("event") as string | undefined;
 *   if (event === "package.loaded") {
 *     const pkg = annotations.get("package") as string;
 *     const source = annotations.get("source") as string;
 *     console.log(`Loaded ${pkg} from ${source}`);
 *   }
 * });
 * ```
 *
 * @public
 */
export const LogEventSchema = Schema.Union(
	// Package version resolved
	Schema.Struct({
		event: Schema.Literal("package.version.resolved"),
		package: Schema.String,
		requested: Schema.String,
		resolved: Schema.String,
	}),
	// Cache hit
	Schema.Struct({
		event: Schema.Literal("cache.hit"),
		package: Schema.String,
		version: Schema.String,
		ageMinutes: Schema.String,
	}),
	// Cache stale
	Schema.Struct({
		event: Schema.Literal("cache.stale"),
		package: Schema.String,
		version: Schema.String,
		ageMinutes: Schema.String,
		ttlMinutes: Schema.String,
	}),
	// Cache miss
	Schema.Struct({
		event: Schema.Literal("cache.miss"),
		package: Schema.String,
		version: Schema.String,
	}),
	// Package fetch start
	Schema.Struct({
		event: Schema.Literal("package.fetch.start"),
		package: Schema.String,
		version: Schema.String,
	}),
	// Package loaded
	Schema.Struct({
		event: Schema.Literal("package.loaded"),
		package: Schema.String,
		version: Schema.String,
		files: Schema.String,
		source: Schema.String,
		durationMs: Schema.String,
	}),
	// Package load failed
	Schema.Struct({
		event: Schema.Literal("package.load.failed"),
		package: Schema.String,
		version: Schema.String,
		error: Schema.String,
	}),
	// Packages batch start
	Schema.Struct({
		event: Schema.Literal("packages.batch.start"),
		total: Schema.String,
		packages: Schema.String,
	}),
	// Packages batch complete
	Schema.Struct({
		event: Schema.Literal("packages.batch.complete"),
		loaded: Schema.String,
		failed: Schema.String,
		total: Schema.String,
		totalFiles: Schema.String,
		durationMs: Schema.String,
	}),
	// TypeScript cache created
	Schema.Struct({
		event: Schema.Literal("typescript.cache.created"),
		packages: Schema.String,
		fileCount: Schema.String,
		rootFiles: Schema.String,
	}),
);

/**
 * Type-safe log event annotation map inferred from {@link LogEventSchema}.
 *
 * @remarks
 * This is a discriminated union — narrow it using the `event` string literal
 * field. Each variant describes the flat annotation keys emitted by the
 * corresponding TypeRegistry operation.
 *
 * @example
 * ```typescript
 * import type { LogEvent } from "type-registry-effect";
 *
 * function handleAnnotations(event: LogEvent): void {
 *   switch (event.event) {
 *     case "cache.hit":
 *       console.log(`Cache hit for ${event.package}@${event.version}`);
 *       break;
 *     case "package.loaded":
 *       console.log(`Loaded ${event.files} files from ${event.source}`);
 *       break;
 *     case "packages.batch.complete":
 *       console.log(`Batch: ${event.loaded}/${event.total} in ${event.durationMs}ms`);
 *       break;
 *   }
 * }
 * ```
 *
 * @see {@link LogEventSchema} for the runtime schema definition
 *
 * @public
 */
export type LogEvent = Schema.Schema.Type<typeof LogEventSchema>;
