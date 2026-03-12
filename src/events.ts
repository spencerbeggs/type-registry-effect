/**
 * Structured log events emitted by TypeRegistry operations.
 *
 * @remarks
 * Uses {@link https://effect.website/docs/schema | Effect Schema} for runtime
 * validation and type safety. Every event conforms to the {@link LogEventSchema}
 * discriminated union and can be narrowed by its `event` field.
 *
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";

// ============================================================================
// Log Event Schemas
// ============================================================================

/**
 * Discriminated union schema for all structured log events emitted by
 * TypeRegistry operations.
 *
 * @remarks
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
 * @see {@link LogEventHandler} for the callback signature
 *
 * @example
 * ```typescript
 * import type { LogEventHandler } from "type-registry-effect";
 *
 * const handler: LogEventHandler = (event) => {
 *   if (event.event === "package.loaded") {
 *     console.log(`Loaded ${event.data.package}@${event.data.version}`);
 *   }
 * };
 * ```
 *
 * @public
 */
export const LogEventSchema = Schema.Union(
	// Package version resolved
	Schema.Struct({
		event: Schema.Literal("package.version.resolved"),
		level: Schema.Literal("info"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			package: Schema.String,
			requested: Schema.String,
			resolved: Schema.String,
		}),
	}),
	// Cache hit
	Schema.Struct({
		event: Schema.Literal("cache.hit"),
		level: Schema.Literal("info"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			package: Schema.String,
			version: Schema.String,
			ageMinutes: Schema.Number,
		}),
	}),
	// Cache stale
	Schema.Struct({
		event: Schema.Literal("cache.stale"),
		level: Schema.Literal("debug"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			package: Schema.String,
			version: Schema.String,
			ageMinutes: Schema.Number,
			ttlMinutes: Schema.Number,
		}),
	}),
	// Cache miss
	Schema.Struct({
		event: Schema.Literal("cache.miss"),
		level: Schema.Literal("debug"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			package: Schema.String,
			version: Schema.String,
		}),
	}),
	// Package fetch start
	Schema.Struct({
		event: Schema.Literal("package.fetch.start"),
		level: Schema.Literal("debug"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			package: Schema.String,
			version: Schema.String,
		}),
	}),
	// Package loaded
	Schema.Struct({
		event: Schema.Literal("package.loaded"),
		level: Schema.Literal("info"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			package: Schema.String,
			version: Schema.String,
			files: Schema.Number,
			source: Schema.Literal("cache", "network"),
		}),
	}),
	// Package load failed
	Schema.Struct({
		event: Schema.Literal("package.load.failed"),
		level: Schema.Literal("warn"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			package: Schema.String,
			version: Schema.String,
			error: Schema.String,
		}),
	}),
	// Packages batch start
	Schema.Struct({
		event: Schema.Literal("packages.batch.start"),
		level: Schema.Literal("debug"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			total: Schema.Number,
			packages: Schema.Array(Schema.String),
		}),
	}),
	// Packages batch complete
	Schema.Struct({
		event: Schema.Literal("packages.batch.complete"),
		level: Schema.Literal("info"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			loaded: Schema.Number,
			failed: Schema.Number,
			total: Schema.Number,
			totalFiles: Schema.Number,
			durationMs: Schema.Number,
		}),
	}),
	// TypeScript cache created
	Schema.Struct({
		event: Schema.Literal("typescript.cache.created"),
		level: Schema.Literal("info"),
		message: Schema.String,
		timestamp: Schema.Number,
		fiber: Schema.optional(Schema.String),
		data: Schema.Struct({
			packages: Schema.Array(Schema.String),
			fileCount: Schema.Number,
			rootFiles: Schema.Number,
		}),
	}),
);

/**
 * Type-safe log event inferred from {@link LogEventSchema}.
 *
 * @remarks
 * This is a discriminated union — narrow it using the `event` string literal
 * field. Each variant carries a strongly-typed `data` payload.
 *
 * @example
 * ```typescript
 * import type { LogEvent } from "type-registry-effect";
 *
 * function handleEvent(event: LogEvent): void {
 *   switch (event.event) {
 *     case "cache.hit":
 *       console.log(`Cache hit for ${event.data.package}@${event.data.version}`);
 *       break;
 *     case "cache.miss":
 *       console.log(`Cache miss for ${event.data.package}@${event.data.version}`);
 *       break;
 *     case "package.loaded":
 *       console.log(`Loaded ${event.data.files} files from ${event.data.source}`);
 *       break;
 *     case "packages.batch.complete":
 *       console.log(`Batch done: ${event.data.loaded}/${event.data.total} in ${event.data.durationMs}ms`);
 *       break;
 *     default:
 *       console.log(`[${event.level}] ${event.message}`);
 *   }
 * }
 * ```
 *
 * @see {@link LogEventSchema} for the runtime schema definition
 *
 * @public
 */
export type LogEvent = Schema.Schema.Type<typeof LogEventSchema>;

/**
 * Callback function type for receiving validated {@link LogEvent} instances.
 *
 * @remarks
 * Pass an implementation of this type to logging integrations that subscribe
 * to TypeRegistry operations. The handler is invoked synchronously with each
 * event after it has been validated against the {@link LogEventSchema}.
 *
 * @see {@link LogEvent} for the event payload type
 * @see {@link LogEventSchema} for the runtime schema
 *
 * @public
 */
export type LogEventHandler = (event: LogEvent) => void;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a validated {@link LogEvent} from unknown data.
 *
 * @remarks
 * Decodes `event` synchronously through {@link LogEventSchema}. Throws a
 * parse error if the input does not conform to any variant of the schema.
 * This is intended for internal use within the library's logging
 * infrastructure.
 *
 * @param event - Raw, unvalidated event data.
 * @returns A fully validated {@link LogEvent}.
 * @throws `ParseError` when `event` does not match {@link LogEventSchema}.
 *
 * @internal
 */
export function createLogEvent(event: unknown): LogEvent {
	return Schema.decodeUnknownSync(LogEventSchema)(event);
}
