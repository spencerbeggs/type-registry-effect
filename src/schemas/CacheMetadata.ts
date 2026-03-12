import { Schema } from "effect";

export class CacheMetadata extends Schema.Class<CacheMetadata>("CacheMetadata")({
	version: Schema.String,
	cachedAt: Schema.Number,
	ttl: Schema.optional(Schema.Number),
}) {}
