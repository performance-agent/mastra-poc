# 0002 - Canonical Data Contracts

## Status

Accepted for pre-v0.

## Context

Reports and agents should work across multiple providers. A report that needs issues should not care whether they came from GitHub, Jira, Linear or a future integration.

## Decision

Plugins share data through versioned canonical data contracts. Agents and reports consume contracts such as `software.issue.v1`, not concrete provider APIs.

## Consequences

- Provider plugins map external provider data into canonical records.
- Consumer plugins depend on contract versions, not provider clients.
- Multiple providers can implement the same contract version.
- Contract versions coexist; automatic migrations are out of scope for v0.

## Alternatives Considered

- Provider-specific report APIs: faster for one provider, but tightly couples consumers to integrations.
- Unversioned contracts: simpler initially, but unsafe once contract shapes evolve.
- Shared provider SDKs in consumers: leaks provider concerns and weakens plugin isolation.
