/**
 * Structured log events emitted by TypeRegistry operations.
 * Uses Effect Schema for runtime validation and type safety.
 */

import * as Schema from "effect/Schema";

// ============================================================================
// Log Event Schemas
// ============================================================================

/**
 * Discriminated union of all log events.
 * Use the `event` field to narrow the type.
 *
 * @example
 * ```typescript
 * const handler: LogEventHandler = (event) => {
 *   if (event.event === "package.loaded") {
 *     console.log(`Loaded ${event.data.package}@${event.data.version}`);
 *   }
 * };
 * ```
 */
export class LogEventSchema extends Schema.Union(
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
) {}

/**
 * Type-safe log event extracted from schema.
 * This is a discriminated union - use the `event` field for type narrowing.
 */
export type LogEvent = Schema.Schema.Type<typeof LogEventSchema>;

/**
 * Handler function for log events.
 * Receives validated events from TypeRegistry operations.
 */
export type LogEventHandler = (event: LogEvent) => void;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a validated log event.
 * This function validates the event at runtime using the schema.
 *
 * @internal
 */
export function createLogEvent(event: unknown): LogEvent {
	return Schema.decodeUnknownSync(LogEventSchema)(event);
}
