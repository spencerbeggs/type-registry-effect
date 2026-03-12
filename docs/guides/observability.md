# Observability

type-registry-effect uses a structured event system for observability.
Events are defined with Effect Schema and emitted at key lifecycle
points.

> **Note:** The event system is being evaluated for integration with
> Effect's built-in logging and tracing. The current callback-based API
> will continue to work but may be supplemented with Effect-native
> observability in a future release.

## Event schema

All events are defined as a discriminated union in `LogEventSchema`.
Each event has:

- `event` -- discriminator string (e.g., `"cache.hit"`)
- `level` -- severity (`"debug"` | `"info"` | `"warn"`)
- `message` -- human-readable description
- `timestamp` -- Unix timestamp
- `fiber` -- optional Effect fiber ID
- `data` -- event-specific payload

## Event types

| Event | Level | When |
| --- | --- | --- |
| `package.version.resolved` | info | Version range resolved to specific version |
| `cache.hit` | info | Package found in cache and still fresh |
| `cache.miss` | debug | Package not in cache |
| `cache.stale` | debug | Package in cache but TTL expired |
| `package.fetch.start` | debug | HTTP download started |
| `package.loaded` | info | Package successfully loaded (from cache or network) |
| `package.load.failed` | warn | Package failed to load |
| `packages.batch.start` | debug | Batch fetch started |
| `packages.batch.complete` | info | Batch fetch completed |
| `typescript.cache.created` | info | TypeScript virtual environment created |

## Using events

### Creating validated events

```typescript
import { createLogEvent, type LogEvent } from "type-registry-effect";

const event: LogEvent = createLogEvent({
  event: "cache.hit",
  level: "info",
  message: "Cache hit for zod@3.23.8",
  timestamp: Date.now(),
  data: {
    package: "zod",
    version: "3.23.8",
    ageMinutes: 12,
  },
});
```

### Type narrowing

The `event` field is a string literal discriminator:

```typescript
import type { LogEvent } from "type-registry-effect";

function handleEvent(event: LogEvent): void {
  switch (event.event) {
    case "cache.hit":
      // event.data is typed as { package, version, ageMinutes }
      console.log(`cached: ${event.data.package}@${event.data.version}`);
      break;

    case "package.loaded":
      // event.data is typed as { package, version, files, source }
      console.log(`loaded ${event.data.files} files from ${event.data.source}`);
      break;

    case "package.load.failed":
      console.error(`failed: ${event.data.error}`);
      break;
  }
}
```

## Design notes

The event system is decoupled from Effect's logging layer by design.
Events are plain data validated by Schema -- they can be consumed by any
logging library, metrics collector, or UI without depending on Effect
runtime.

Future versions may add an Effect `Layer` that bridges these events into
`Effect.log` spans for automatic tracing.
