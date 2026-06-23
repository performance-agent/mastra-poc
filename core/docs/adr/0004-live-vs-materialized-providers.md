# 0004 - Live vs Materialized Providers

## Status

Accepted for pre-v0.

## Context

Different integrations need different data access patterns. Some providers can answer queries live, while others need synchronized local records for performance, rate limits or offline reporting.

## Decision

Data providers may be `live`, `cached` or `materialized`. V0 implements live and simple materialized support. Cached mode exists in the type system for future use.

## Consequences

- Live providers query external systems at runtime.
- Materialized providers can serve records previously stored by the platform runtime.
- Cached mode is reserved without requiring cache implementation in v0.
- The data orchestrator can match providers by contract and mode without knowing provider-specific details.

## Alternatives Considered

- Live-only providers: simpler, but insufficient for sync-heavy providers.
- Materialized-only providers: predictable, but adds unnecessary persistence work for simple integrations.
- Implement full caching in v0: useful later, but premature before the provider model is validated.
