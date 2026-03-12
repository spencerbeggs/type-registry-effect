import type { FileSystem, HttpClient } from "@effect/platform";
import type { Layer } from "effect";
// Use a namespace import to access Layer.mergeAll without Effect.Layer
import { Layer as L } from "effect";
import type { CacheService } from "../services/CacheService.js";
import type { PackageFetcher } from "../services/PackageFetcher.js";
import type { TypeResolver } from "../services/TypeResolver.js";
import { CacheServiceLive } from "./CacheServiceLive.js";
import { PackageFetcherLive } from "./PackageFetcherLive.js";
import { TypeResolverLive } from "./TypeResolverLive.js";

export const TypeRegistryLive: Layer.Layer<
	CacheService | PackageFetcher | TypeResolver,
	never,
	FileSystem.FileSystem | HttpClient.HttpClient
> = L.mergeAll(CacheServiceLive, PackageFetcherLive, TypeResolverLive);
