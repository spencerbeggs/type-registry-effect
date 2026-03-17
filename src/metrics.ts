/**
 * Effect Metrics for TypeRegistry operations.
 *
 * @remarks
 * Counters track cumulative event counts. Histograms (via {@link Metric.timer})
 * track operation durations in milliseconds. Consumers can read metric values
 * via {@link Metric.value} or connect an OpenTelemetry exporter.
 *
 * @packageDocumentation
 */

import { Metric } from "effect";

// ── Counters ────────────────────────────────────────────────────────────────

/** Number of cache hits (package found in cache and fresh). */
export const cacheHits = Metric.counter("type_registry_cache_hits", {
	description: "Cache hits — package found in cache and fresh",
	incremental: true,
});

/** Number of cache misses (package not in cache). */
export const cacheMisses = Metric.counter("type_registry_cache_misses", {
	description: "Cache misses — package not in cache",
	incremental: true,
});

/** Number of stale cache entries (TTL expired, re-fetch triggered). */
export const cacheStale = Metric.counter("type_registry_cache_stale", {
	description: "Cache stale — TTL expired, re-fetch triggered",
	incremental: true,
});

/** Number of packages loaded successfully. */
export const packagesLoaded = Metric.counter("type_registry_packages_loaded", {
	description: "Packages loaded successfully",
	incremental: true,
});

/** Number of packages that failed to load. */
export const packagesFailed = Metric.counter("type_registry_packages_failed", {
	description: "Packages that failed to load",
	incremental: true,
});

// ── Histograms (timers) ─────────────────────────────────────────────────────

/** Duration to load a single package (cache or network), in milliseconds. */
export const packageLoadDuration = Metric.timer(
	"type_registry_package_load_duration",
	"Time to load a single package in milliseconds",
);

/** Duration of a full getVFS batch operation, in milliseconds. */
export const batchDuration = Metric.timer(
	"type_registry_batch_duration",
	"Time for a full getVFS batch operation in milliseconds",
);
