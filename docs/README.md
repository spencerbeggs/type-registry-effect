# effect-type-registry Documentation

Comprehensive documentation for the effect-type-registry package.

## Overview

effect-type-registry is an Effect-based TypeScript type definition
registry with version-aware caching, fault tolerance, and observability.
It fetches and caches type definitions from npm packages via jsDelivr CDN,
generating virtual file systems (VFS) for tools like Twoslash.

## Quick Links

- [Package README](../README.md) - Installation and quick start
- [GitHub Repository](
  https://github.com/spencerbeggs/website/tree/main/pkgs/effect-type-registry)

## Architecture

Understanding the internal design and component organization:

- [Architecture Overview](./architecture/overview.md) - High-level
  architecture and component design

## Guides

Step-by-step guides for common tasks:

- [Getting Started](./guides/getting-started.md) - Detailed installation
  and first steps
- [Caching](./guides/caching.md) - Cache configuration, optimization,
  and management
- [Observability](./guides/observability.md) - Event system, logging,
  and monitoring
- [Advanced Usage](./guides/advanced-usage.md) - Direct service usage,
  Effect-TS patterns, and XDG utilities
- [Troubleshooting](./guides/troubleshooting.md) - Common issues and
  solutions

## Reference

- [API Documentation](../README.md#api-reference) - Complete API
  reference

## Contributing

See the [main README](../README.md#development-status) for
development status and planned features.
