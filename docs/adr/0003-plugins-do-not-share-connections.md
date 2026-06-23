# 0003 - Plugins Do Not Share Connections

## Status

Accepted for pre-v0.

## Context

Connections carry sensitive provider access. Sharing connections across plugins would make permission boundaries harder to reason about and would let consumer plugins depend on provider-specific APIs.

## Decision

Plugins do not share connections in v0. Provider plugins use their own connections. Consumer plugins access provider data only through canonical data contracts.

## Consequences

- Provider queries run with provider-owned runtime context.
- Reports and agents do not receive provider connections or secrets.
- Cross-plugin connection sharing is intentionally out of scope for v0.
- Provider-agnostic consumers remain portable across integrations.

## Alternatives Considered

- Shared organization connection registry: convenient, but weakens plugin isolation.
- Let reports request provider connections directly: powerful, but couples reports to providers.
- Brokered connection delegation: possible future design, but too complex for v0.
