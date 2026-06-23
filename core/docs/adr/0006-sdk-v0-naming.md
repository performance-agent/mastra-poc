# 0006 - SDK v0 Naming

## Status

Accepted for pre-v0.

## Context

The SDK is the primary developer experience for plugin authors. Early scaffold names mixed internal and public language, including `capabilities` and callable namespace aliases.

## Decision

The public SDK v0 uses `permissions` in plugin definitions, `permission.*` as the helper namespace, explicit declaration helpers such as `definePlugin`, `defineConnection` and `defineReport`, setup helpers under `ui.*`, and no scaffold-era compatibility aliases.

## Consequences

- Plugin definitions read in product-facing language.
- Permission helpers are grouped under one namespace.
- Declaration helpers are explicit and predictable.
- Pre-v0 code can change without compatibility aliases.

## Alternatives Considered

- Keep `capabilities` publicly: accurate internally, but less clear for installation UX.
- Support both `capability.*` and `permission.*`: convenient short term, but confusing before v0.
- Callable namespace aliases such as `connection.use(...)`: compact, but ambiguous between declarations and permissions.
