/**
 * Tests for the opt-in TypeRegistryObserver event channel.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
	RegistryEvent as Event,
	emitEvent,
	layerCallback,
	layerNoop,
} from "../../src/services/TypeRegistryObserver.js";

describe("TypeRegistryObserver", () => {
	it("emitEvent is a no-op when no observer is provided (adds no requirement)", async () => {
		// Note: emitEvent's type is Effect<void, never, never> — it compiles and
		// runs without any layer, proving emission never forces a requirement.
		await Effect.runPromise(emitEvent(Event.CacheMiss({ package: "zod", version: "3.0.0" })));
	});

	it("routes emitted events to a callback observer", async () => {
		const seen: Event[] = [];
		const program = Effect.gen(function* () {
			yield* emitEvent(Event.VersionResolved({ package: "vitest", requested: "^4.1.0", resolved: "4.1.9" }));
			yield* emitEvent(Event.BatchComplete({ loaded: 9, failed: 1, total: 10, totalFiles: 219, durationMs: 17 }));
		});

		await Effect.runPromise(
			Effect.provide(
				program,
				layerCallback((e) => seen.push(e)),
			),
		);

		expect(seen).toHaveLength(2);
		expect(seen[0]._tag).toBe("VersionResolved");
		const batch = seen[1];
		if (batch._tag !== "BatchComplete") throw new Error("expected BatchComplete");
		expect(batch.loaded).toBe(9);
		expect(batch.failed).toBe(1);
		expect(batch.totalFiles).toBe(219);
	});

	it("layerNoop swallows events without error", async () => {
		await Effect.runPromise(
			Effect.provide(emitEvent(Event.CacheHit({ package: "react", version: "19.2.7", ageMinutes: 3 })), layerNoop),
		);
	});
});
