# 0001 - Organization-Level Plugin Installations

## Status

Accepted for pre-v0.

## Context

Plugins need a tenant boundary for configuration, permissions, connections and discovered resources. The platform also needs resource visibility below the organization level so workspaces and groups can consume only the resources assigned to them.

## Decision

Plugins are installed at organization level. External resources discovered by a plugin installation can be assigned to workspaces or groups.

## Consequences

- Installation state, grants and connections are scoped to an organization plugin installation.
- Discovered resources keep their source installation identity.
- Workspace and group visibility is controlled by resource assignments.
- Data derived from an assigned resource inherits that resource visibility.

## Alternatives Considered

- Workspace-level plugin installations: simpler visibility, but duplicates setup and connections across workspaces.
- Global plugin installations: easier central management, but too broad for organization isolation.
- Direct data assignment without resource assignment: loses the source-resource relationship needed for traceability.
