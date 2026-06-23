# 0005 - Permission-Based Runtime Security

## Status

Accepted for pre-v0.

## Context

Plugin definitions need to declare intended access, and organizations need to grant only the access they approve. Runtime operations must enforce both sides.

## Decision

Runtime operations are authorized through explicit plugin permissions. A plugin operation is allowed only when the permission is declared by the plugin and granted by the installation. Internally, these permissions may be represented as `Capability` values.

## Consequences

- Declaration alone is not enough; installation grant is also required.
- Connections, secrets, storage, resource access and data queries are permission checked.
- Consumer data reads and provider data provides are checked independently.
- Domain errors expose stable error codes for denied operations.

## Alternatives Considered

- Trust plugin manifests without runtime checks: simpler, but unsafe.
- Grants without declarations: makes plugin intent unclear to installers.
- Role-based permissions only: coarse-grained for provider contracts and connection names.
