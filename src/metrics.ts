// Effect Metrics for TypeRegistry operations.
//
// Counters track cumulative event counts. Histograms (via `Metric.timer`)
// track operation durations in milliseconds. Consumers can read metric values
// via `Metric.value` or connect an OpenTelemetry exporter.

import { Metric } from "effect";

// ── Counters ────────────────────────────────────────────────────────────────

/**
 * Number of cache hits (package found in cache and fresh).
 *
 * @public
 */
export const cacheHits = Metric.counter("type_registry_cache_hits", {
	description: "Cache hits — package found in cache and fresh",
	incremental: true,
});

/**
 * Number of cache misses (package not in cache).
 *
 * @public
 */
export const cacheMisses = Metric.counter("type_registry_cache_misses", {
	description: "Cache misses — package not in cache",
	incremental: true,
});

/**
 * Number of stale cache entries (TTL expired, re-fetch triggered).
 *
 * @public
 */
export const cacheStale = Metric.counter("type_registry_cache_stale", {
	description: "Cache stale — TTL expired, re-fetch triggered",
	incremental: true,
});

/**
 * Number of packages loaded successfully.
 *
 * @public
 */
export const packagesLoaded = Metric.counter("type_registry_packages_loaded", {
	description: "Packages loaded successfully",
	incremental: true,
});

/**
 * Number of packages that failed to load.
 *
 * @public
 */
export const packagesFailed = Metric.counter("type_registry_packages_failed", {
	description: "Packages that failed to load",
	incremental: true,
});

// ── Histograms (timers) ─────────────────────────────────────────────────────

/**
 * Duration to load a single package (cache or network), in milliseconds.
 *
 * @public
 */
export const packageLoadDuration = Metric.timer(
	"type_registry_package_load_duration",
	"Time to load a single package in milliseconds",
);

/**
 * Duration of a full getVFS batch operation, in milliseconds.
 *
 * @public
 */
export const batchDuration = Metric.timer(
	"type_registry_batch_duration",
	"Time for a full getVFS batch operation in milliseconds",
);
