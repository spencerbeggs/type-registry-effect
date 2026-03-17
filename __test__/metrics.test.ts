import { Effect, Metric } from "effect";
import { describe, expect, it } from "vitest";
import {
	batchDuration,
	cacheHits,
	cacheMisses,
	cacheStale,
	packageLoadDuration,
	packagesFailed,
	packagesLoaded,
} from "../src/metrics.js";

describe("Metrics", () => {
	describe("counters", () => {
		it("should increment cacheHits", async () => {
			const program = Effect.gen(function* () {
				yield* Metric.increment(cacheHits);
				yield* Metric.increment(cacheHits);
				const state = yield* Metric.value(cacheHits);
				return state.count;
			});
			const result = await Effect.runPromise(program);
			expect(result).toBeGreaterThanOrEqual(2);
		});

		it("should increment cacheMisses", async () => {
			const program = Effect.gen(function* () {
				yield* Metric.increment(cacheMisses);
				const state = yield* Metric.value(cacheMisses);
				return state.count;
			});
			const result = await Effect.runPromise(program);
			expect(result).toBeGreaterThanOrEqual(1);
		});

		it("should increment cacheStale", async () => {
			const program = Effect.gen(function* () {
				yield* Metric.increment(cacheStale);
				const state = yield* Metric.value(cacheStale);
				return state.count;
			});
			const result = await Effect.runPromise(program);
			expect(result).toBeGreaterThanOrEqual(1);
		});

		it("should increment packagesLoaded", async () => {
			const program = Effect.gen(function* () {
				yield* Metric.increment(packagesLoaded);
				const state = yield* Metric.value(packagesLoaded);
				return state.count;
			});
			const result = await Effect.runPromise(program);
			expect(result).toBeGreaterThanOrEqual(1);
		});

		it("should increment packagesFailed", async () => {
			const program = Effect.gen(function* () {
				yield* Metric.increment(packagesFailed);
				const state = yield* Metric.value(packagesFailed);
				return state.count;
			});
			const result = await Effect.runPromise(program);
			expect(result).toBeGreaterThanOrEqual(1);
		});
	});

	describe("histograms", () => {
		it("should track packageLoadDuration", async () => {
			const program = Effect.gen(function* () {
				yield* Effect.sleep("10 millis").pipe(Metric.trackDuration(packageLoadDuration));
				const state = yield* Metric.value(packageLoadDuration);
				return state;
			});
			const result = await Effect.runPromise(program);
			expect(result.count).toBeGreaterThanOrEqual(1);
			expect(result.min).toBeGreaterThan(0);
		});

		it("should track batchDuration", async () => {
			const program = Effect.gen(function* () {
				yield* Effect.sleep("10 millis").pipe(Metric.trackDuration(batchDuration));
				const state = yield* Metric.value(batchDuration);
				return state;
			});
			const result = await Effect.runPromise(program);
			expect(result.count).toBeGreaterThanOrEqual(1);
			expect(result.min).toBeGreaterThan(0);
		});
	});
});
