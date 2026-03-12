import { HttpClient } from "@effect/platform";
import { Duration, Effect, Layer, Schedule, Schema } from "effect";
import { NetworkError } from "../errors/NetworkError.js";
import { PackageNotFoundError } from "../errors/PackageNotFoundError.js";
import { ParseError } from "../errors/ParseError.js";
import { FileTreeResponse } from "../schemas/FileTree.js";
import { PackageJson } from "../schemas/PackageJson.js";
import type { PackageSpec } from "../schemas/PackageSpec.js";
import { JSDELIVR_CDN, JSDELIVR_DATA_API, PackageFetcher, TYPE_FILE_PATTERN } from "../services/PackageFetcher.js";

const PackageMetadataSchema = Schema.Struct({
	versions: Schema.mutable(Schema.Array(Schema.String)),
	tags: Schema.mutable(Schema.Record({ key: Schema.String, value: Schema.String })),
});

const ResolveResponseSchema = Schema.Struct({ version: Schema.String });

const retrySchedule = Schedule.exponential(Duration.millis(100)).pipe(Schedule.compose(Schedule.recurs(3)));

const defaultTimeout = Duration.seconds(30);

/**
 * Live {@link PackageFetcher} layer that fetches package metadata and type
 * definitions from the jsDelivr CDN.
 *
 * @remarks
 * All HTTP requests are retried up to **3 times** with exponential back-off
 * (starting at 100 ms) and time out after **30 seconds**. Requires an
 * {@link @effect/platform#HttpClient | HttpClient} layer to be provided at
 * composition time.
 *
 * @see {@link PackageFetcher}
 *
 * @public
 */
export const PackageFetcherLive: Layer.Layer<PackageFetcher, never, HttpClient.HttpClient> = Layer.effect(
	PackageFetcher,
	Effect.gen(function* () {
		const http = yield* HttpClient.HttpClient;

		const fetchJson = (url: string) =>
			http.get(url).pipe(
				Effect.flatMap((res) => res.json),
				Effect.timeout(defaultTimeout),
				Effect.retry(retrySchedule),
				Effect.mapError((error) => new NetworkError({ url, message: String(error) })),
			);

		const fetchText = (url: string) =>
			http.get(url).pipe(
				Effect.flatMap((res) => res.text),
				Effect.timeout(defaultTimeout),
				Effect.retry(retrySchedule),
				Effect.mapError((error) => new NetworkError({ url, message: String(error) })),
			);

		const getFileTree = (pkg: PackageSpec) =>
			fetchJson(`${JSDELIVR_DATA_API}/package/npm/${pkg.name}@${pkg.version}/flat`).pipe(
				Effect.flatMap((data) =>
					Schema.decodeUnknown(FileTreeResponse)(data).pipe(
						Effect.mapError(
							(e) =>
								new ParseError({
									source: `${pkg.name}@${pkg.version}/flat`,
									message: `Schema validation failed: ${String(e)}`,
								}),
						),
					),
				),
			);

		return {
			getVersions: (name) =>
				fetchJson(`${JSDELIVR_DATA_API}/package/npm/${name}`).pipe(
					Effect.flatMap((data) =>
						Schema.decodeUnknown(PackageMetadataSchema)(data).pipe(
							Effect.mapError(
								(e) =>
									new ParseError({
										source: `${name}/versions`,
										message: `Schema validation failed: ${String(e)}`,
									}),
							),
						),
					),
				),

			resolveVersion: (name, ref) =>
				fetchJson(`${JSDELIVR_DATA_API}/package/resolve/npm/${name}@${ref}`).pipe(
					Effect.flatMap((data) =>
						Schema.decodeUnknown(ResolveResponseSchema)(data).pipe(
							Effect.mapError(
								(e) =>
									new ParseError({
										source: `resolve/${name}@${ref}`,
										message: `Invalid response: ${String(e)}`,
									}),
							),
						),
					),
					Effect.map((data) => data.version),
					Effect.catchTags({
						ParseError: (e) => Effect.fail(new PackageNotFoundError({ name, version: ref, message: e.message })),
						NetworkError: (e) =>
							e.message.includes("404")
								? Effect.fail(new PackageNotFoundError({ name, version: ref, message: e.message }))
								: Effect.fail(e),
					}),
				),

			getFileTree,

			downloadFile: (pkg, filePath) => {
				const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
				return fetchText(`${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}${normalizedPath}`);
			},

			getPackageJson: (pkg) =>
				fetchText(`${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}/package.json`).pipe(
					Effect.flatMap((content) =>
						Effect.try({
							try: () => JSON.parse(content) as unknown,
							catch: (e) =>
								new ParseError({
									source: `${pkg.name}@${pkg.version}/package.json`,
									message: `JSON parse failed: ${String(e)}`,
								}),
						}),
					),
					Effect.flatMap((parsed) =>
						Schema.decodeUnknown(PackageJson)(parsed).pipe(
							Effect.mapError(
								(e) =>
									new ParseError({
										source: `${pkg.name}@${pkg.version}/package.json`,
										message: `Schema validation failed: ${String(e)}`,
									}),
							),
						),
					),
				),

			getTypeFiles: (pkg) =>
				Effect.gen(function* () {
					const fileTree = yield* getFileTree(pkg);

					const typeFiles = fileTree.files.filter((f) => TYPE_FILE_PATTERN.test(f.name));

					const entries = yield* Effect.forEach(
						typeFiles,
						(file) => {
							const normalizedPath = file.name.startsWith("/") ? file.name : `/${file.name}`;
							return fetchText(`${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}${normalizedPath}`).pipe(
								Effect.map((content) => [file.name, content] as const),
							);
						},
						{ concurrency: 10 },
					);

					const vfs = new Map<string, string>(entries);

					const hasPackageJson = fileTree.files.some((f) => f.name === "/package.json");
					if (!hasPackageJson) {
						const pkgContent = yield* fetchText(`${JSDELIVR_CDN}/npm/${pkg.name}@${pkg.version}/package.json`);
						vfs.set("/package.json", pkgContent);
					}

					return vfs;
				}),
		};
	}),
);
