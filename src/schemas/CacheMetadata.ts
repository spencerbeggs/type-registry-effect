import { Schema } from "effect";

/**
 * Metadata stored alongside cached packages on disk.
 *
 * @remarks
 * Each cached package directory contains a metadata file recording when it was
 * cached and the version that was resolved. The optional `ttl` field (in
 * milliseconds) allows per-package cache expiration policies. When `ttl` is
 * omitted the cache entry never expires automatically.
 *
 * @example
 * ```typescript
 * import { CacheMetadata } from "type-registry-effect";
 *
 * // Metadata with an explicit 1-hour TTL
 * const meta: CacheMetadata = {
 *   version: "3.23.8",
 *   cachedAt: Date.now(),
 *   ttl: 60 * 60 * 1000,
 * };
 *
 * // Metadata that never expires
 * const permanent: CacheMetadata = {
 *   version: "5.4.2",
 *   cachedAt: Date.now(),
 * };
 * ```
 *
 * @see `CacheServiceLive` for the layer that writes this metadata
 * @see `TypeRegistry.fetchAndCache` which populates this metadata on write
 * @public
 */
export interface CacheMetadata {
	readonly version: string;
	readonly cachedAt: number;
	readonly ttl?: number | undefined;
}

/**
 * Effect Schema for validating and encoding {@link (CacheMetadata:interface)}.
 *
 * @see {@link (CacheMetadata:interface)}
 * @public
 */
export const CacheMetadata: Schema.Schema<CacheMetadata> = Schema.Struct({
	version: Schema.String,
	cachedAt: Schema.Number,
	ttl: Schema.optional(Schema.Number),
});
