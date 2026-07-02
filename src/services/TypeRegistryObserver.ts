// Observer service — a typed, opt-in event channel for TypeRegistry operations.
//
// TypeRegistry tracks aggregate counters via `Metric` and surfaces per-failure
// detail via typed errors. Neither is the right surface for a *consumer* that
// wants to react programmatically (drive a progress UI, build a report, fail
// fast on a specific failure). This service is that surface: the library emits
// strongly-typed `RegistryEvent` values, and the host application decides
// how to handle them. The library performs no `Effect.log` output of its own.
//
// Emission is opt-in and zero-cost by default: internal call sites use
// `emitEvent`, which resolves the observer via `Effect.serviceOption`, so
// it adds no requirement to the program's type and is a no-op when no observer
// layer is provided. A consumer opts in by providing `layerCallback` (or
// their own `TypeRegistryObserver` layer backed by a callback, a `PubSub`,
// a `Stream` sink, their own logger/metrics — whatever they like).

import { Context, Data, Effect, Layer, Option } from "effect";

/**
 * A typed event emitted during TypeRegistry operations.
 *
 * @remarks
 * The typed counterpart to {@link LogEvent} (which models the stringly-typed log
 * annotations). Values are properly typed (numbers are numbers), and the union is
 * a `Data.TaggedEnum`, so consumers get constructors plus `$is` / `$match`.
 *
 * @public
 */
export type RegistryEvent = Data.TaggedEnum<{
	/** A version reference (range, tag, or exact) was resolved to a pinned version. */
	readonly VersionResolved: { readonly package: string; readonly requested: string; readonly resolved: string };
	/** A version reference could not be resolved (unpublished, workspace-only, or a range the CDN rejects). */
	readonly VersionResolveFailed: { readonly package: string; readonly requested: string; readonly reason: string };
	/** A package was found fresh in the disk cache. */
	readonly CacheHit: { readonly package: string; readonly version: string; readonly ageMinutes: number };
	/** A cached package exceeded its TTL and is being refetched. */
	readonly CacheStale: {
		readonly package: string;
		readonly version: string;
		readonly ageMinutes: number;
		readonly ttlMinutes: number;
	};
	/** A package was not present in the cache. */
	readonly CacheMiss: { readonly package: string; readonly version: string };
	/** A network fetch began for a package. */
	readonly FetchStart: { readonly package: string; readonly version: string };
	/** A single HTTP request returned a non-2xx response, with the status and a body snippet for diagnosis. */
	readonly FetchFailed: { readonly url: string; readonly status: number; readonly bodySnippet: string };
	/** A package was loaded successfully (from cache or network). */
	readonly PackageLoaded: {
		readonly package: string;
		readonly version: string;
		readonly files: number;
		readonly source: "cache" | "network";
		readonly durationMs: number;
	};
	/** Loading a package failed, classified so consumers can react without parsing error strings. */
	readonly PackageLoadFailed: {
		readonly package: string;
		readonly version: string;
		readonly kind: "not-found" | "version-range" | "schema" | "json" | "network" | "unknown";
		readonly message: string;
	};
	/** A batch load started for multiple packages. */
	readonly BatchStart: { readonly total: number; readonly packages: ReadonlyArray<string> };
	/** A batch load completed with summary statistics. */
	readonly BatchComplete: {
		readonly loaded: number;
		readonly failed: number;
		readonly total: number;
		readonly totalFiles: number;
		readonly durationMs: number;
	};
}>;

/**
 * Constructors and refinements for {@link (RegistryEvent:type)} (`RegistryEvent.BatchComplete({...})`, `RegistryEvent.$is`, `RegistryEvent.$match`).
 *
 * @public
 */
export const RegistryEvent = Data.taggedEnum<RegistryEvent>();

/**
 * Shape of the observer service: a single `emit` that the host implements.
 *
 * @public
 */
export interface TypeRegistryObserverShape {
	readonly emit: (event: RegistryEvent) => Effect.Effect<void>;
}

/**
 * Service tag for the opt-in TypeRegistry event observer.
 *
 * @public
 */
export class TypeRegistryObserver extends Context.Tag("type-registry-effect/TypeRegistryObserver")<
	TypeRegistryObserver,
	TypeRegistryObserverShape
>() {}

/**
 * No-op observer layer. Equivalent to providing nothing (the default behavior),
 * but explicit — useful in tests or to make "events are intentionally dropped" visible.
 *
 * @public
 */
export const layerNoop: Layer.Layer<TypeRegistryObserver> = Layer.succeed(TypeRegistryObserver, {
	emit: () => Effect.void,
});

/**
 * Build an observer layer from a plain callback. The lowest-friction way to
 * subscribe — no `PubSub`/`Stream`/`Scope` ceremony, no Effect knowledge required.
 *
 * @example
 * ```typescript
 * import { TypeRegistry } from "type-registry-effect";
 * import { layerCallback, RegistryEvent } from "type-registry-effect";
 *
 * const observer = layerCallback((e) =>
 *   RegistryEvent.$match(e, {
 *     BatchComplete: ({ loaded, total, durationMs }) => bar.finish(loaded, total, durationMs),
 *     PackageLoadFailed: ({ package: p, kind, message }) => report.fail(p, kind, message),
 *     // ...other variants are ignored
 *     _: () => {},
 *   }),
 * );
 *
 * await Effect.runPromise(TypeRegistry.getVFS(specs).pipe(Effect.provide(observer), Effect.provide(NodeLayer)));
 * ```
 *
 * @public
 */
export const layerCallback = (onEvent: (event: RegistryEvent) => void): Layer.Layer<TypeRegistryObserver> =>
	Layer.succeed(TypeRegistryObserver, {
		emit: (event) => Effect.sync(() => onEvent(event)),
	});

/**
 * Emit a {@link (RegistryEvent:type)} to the host's observer, if one is provided.
 *
 * @remarks
 * Resolved via `Effect.serviceOption`, so this adds **no** requirement to the
 * caller's type signature and is a no-op when no {@link TypeRegistryObserver}
 * layer is in scope. Internal TypeRegistry call sites use this.
 *
 * @public
 */
export const emitEvent = (event: RegistryEvent): Effect.Effect<void> =>
	Effect.serviceOption(TypeRegistryObserver).pipe(
		Effect.flatMap(
			Option.match({
				onNone: () => Effect.void,
				onSome: (observer) => observer.emit(event),
			}),
		),
	);
