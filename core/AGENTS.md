# AGENTS.md

## Project

Performance Platform is an extensible integration platform.

The platform allows organizations to install plugins, connect external systems, assign discovered external resources to workspaces or groups, query canonical data contracts, generate reports and run basic read-only agents.

This repository is building the first TypeScript core for that system.

## Design Goal

Build a modular, extensible, SOLID-compliant plugin core.

The core must allow new integrations, data providers, reports and agents to be added without modifying the core itself.

The system must prioritize:

* Strong developer experience
* Type-safe SDK
* Declarative manifests
* Explicit capabilities
* Runtime permission enforcement
* Clean plugin isolation
* Canonical data contracts
* Provider-agnostic agents and reports

## Core Rule

Plugins do not share connections.

Plugins share data through canonical contracts.

A report or agent that needs issues must query `software.issue.v1`, not GitHub, Jira or Linear directly.

## Architecture Summary

Plugins are installed at organization level.

A plugin installation can discover external resources.

External resources can be assigned by the web platform to workspaces or groups.

Data derived from assigned resources inherits the resource assignment.

Example:

```txt
Organization
└── GitHub plugin installation
    ├── Discovered resource: github.repository repo-a
    ├── Discovered resource: github.repository repo-b
    ├── repo-a assigned to Workspace A
    └── repo-b assigned to Group Backend
```

Issues, pull requests and commits derived from `repo-a` are visible to Workspace A.

## Packages

### @pa/core

Contains pure TypeScript contracts.

Responsibilities:

* PluginDefinition
* PluginManifest
* PluginInstallation
* RuntimeContext
* RuntimeScope
* Capability
* ConnectionProvider
* DataTypeDefinition
* DataProvider
* DataQueryOrchestrator
* DataRecord
* ResourceAssignment
* ScopedStorage
* SecretReader
* ScheduleDefinition
* AgentDefinition
* ReportDefinition
* SetupDefinition
* Manifest validation
* Error types

Rules:

* No concrete GitHub/Jira/Linear/Salesforce code.
* No external provider SDKs.
* No platform-specific integration logic.
* Keep interfaces small.
* Prefer discriminated unions.

### @pa/sdk

Contains developer-facing DSL.

Responsibilities:

* definePlugin(...)
* dataType(...)
* providesData(...)
* connection(...)
* connectionProvider(...)
* schedule(...)
* agent(...)
* report(...)
* setup UI helpers
* capability helpers

The SDK should be pleasant to use and strongly typed.

### @pa/testing

Contains fake runtime utilities.

Responsibilities:

* Fake organization installer
* Fake plugin installation
* Fake connection registry
* Fake provider registry
* Fake scoped storage
* Fake secret reader
* Fake data orchestrator
* Fake report repository
* Test helpers for assigning resources to workspaces/groups

### @pa/packs-software

Contains official canonical software delivery contracts.

Start with:

* software.issue.v1
* software.repository.v1
* software.pullRequest.v1

This package must only define contracts.

It must not implement integrations.

## Canonical Data Contracts

A canonical data contract defines a shared type that multiple plugins can provide.

Example:

```txt
software.issue.v1
```

Can be provided by:

* GitHub
* Jira
* Linear

Consumed by:

* Issue reports
* Issue health agents
* Delivery analytics
* QA agents

Consumers must not care where the data came from.

## Data Provider Modes

A provider may contribute data using one of three modes:

```ts
type DataProviderMode = "live" | "cached" | "materialized";
```

### live

The provider queries the external system directly at runtime.

### cached

The provider queries through a runtime-managed cache.

For v0, represent this mode in types but do not fully implement caching.

### materialized

The provider syncs data into platform storage and later queries local records.

For v0, implement a simple materialized flow.

## Data Query Flow

A consumer calls:

```ts
ctx.data.query(software.issue.v1, query)
```

The runtime must:

1. Check that the consumer plugin has `data.read` for the contract.
2. Find installed providers that can provide the contract.
3. Filter providers/resources by organization installation and runtime scope.
4. Execute each provider using the provider plugin’s own context.
5. Check that the provider plugin has `data.provide` for the contract.
6. Normalize provider results into `DataRecord<T>`.
7. Apply resource assignment visibility.
8. Return `DataRecord<T>[]`.

## Provider Context Boundary

A consumer and provider do not run with the same permissions.

Example:

* `issue-report` plugin has `data.read(software.issue.v1)`.
* `github` plugin has `connection.use("github")` and `data.provide(software.issue.v1)`.

When `issue-report` queries issues:

* The report plugin may read canonical issue data.
* The GitHub provider may use its own GitHub connection.
* The report plugin must never access the GitHub connection.

## DataRecord

Canonical queries return records with data and metadata.

```ts
type DataRecord<T> = {
  data: T;
  meta: {
    provider: string;
    pluginId: string;
    connectionId?: string;
    resourceType?: string;
    resourceId?: string;
    externalId?: string;
    fetchedAt?: Date;
    materializedAt?: Date;
  };
};
```

Agents may ignore `meta`.

Reports and debugging tools may use `meta`.

## Identity

No deduplication in v0.

Records from different providers are distinct.

Use a stable canonical ID derived from:

* provider
* connectionId
* resourceId
* externalId

Expose ID generation through helper APIs.

Do not force plugins to manually craft IDs.

## Contract Versioning

Versions coexist.

A provider declares exactly which version it provides.

A consumer declares exactly which version it consumes.

Do not implement automatic migrations in v0.

Example:

```txt
software.issue.v1
software.issue.v2
```

Both can exist.

## Capabilities

Capabilities must be explicit and enforced at runtime.

Examples:

```ts
data.read(software.issue.v1)
data.provide(software.issue.v1)
data.write(software.issue.v1)
connection.use("github")
resource.discover("github.repository")
report.write("software.issue_inventory")
schedule.run("syncIssues")
storage.kv("plugin")
secret.read("github.webhookSecret")
```

Both declaration and grant are required.

A plugin can perform an operation only when the capability exists in:

```txt
declaredCapabilities ∩ grantedCapabilities
```

## Secrets

Secrets are isolated.

A plugin must only read secrets it declared and was granted.

Do not expose secret listing.

Prefer connection clients over raw secret access.

Good:

```ts
const github = await ctx.connections.github.client();
```

Avoid:

```ts
const key = await ctx.secrets.get("github.privateKey");
```

Raw secret reads should be rare and permission-checked.

## Storage

Storage is scoped.

Namespace must include:

* tenantId
* organizationId
* pluginId
* installationId
* optional runtime scope

A plugin must not read another plugin’s storage.

Use storage for operational state such as cursors, checkpoints and temporary plugin data.

Canonical data may be live, cached or materialized depending on provider mode.

## Connections

A plugin may only use its own declared and granted connections.

A plugin must not use another plugin’s connections.

Cross-plugin connection sharing is out of scope for v0.

A report that reads issues should depend on `software.issue.v1`, not `connection.use("github")`.

## Setup UI

Setup UI is declarative.

No custom UI in v0.

Initial helper set:

* section
* text
* number
* boolean
* secret
* select
* multiSelect
* connection
* resourcePicker

## Schedules

Schedules run per plugin installation in v0.

Schedules can be used for:

* sync jobs
* report generation
* maintenance

Leave room for:

* locks
* cursors
* retries
* idempotency
* logging

## Agents

Agents in v0 are read/report only.

Allowed:

* Read canonical data.
* Generate reports.
* Save report outputs.

Not allowed in v0:

* Mutate external systems.
* Use another plugin’s connection.
* Execute autonomous write actions.

Future extension can add approval-based actions.

## Reports

Reports can read canonical data and save report outputs.

A report should declare capabilities like:

```ts
data.read(software.issue.v1)
report.write("software.issue_inventory")
```

The report should query:

```ts
ctx.data.query(software.issue.v1, query)
```

## Manifest

The TypeScript DSL is the source of truth.

Generate a declarative manifest from plugin definitions.

The manifest must not contain executable logic.

The manifest should include:

* plugin metadata
* capabilities
* connections
* setup UI
* provided contracts
* schedules
* agents
* reports

## Testing Expectations

Required tests:

1. One plugin cannot read another plugin’s secrets.
2. One plugin cannot read another plugin’s storage.
3. A plugin cannot use a connection it did not declare and was not granted.
4. A report plugin cannot access GitHub connection unless it owns and was granted that connection.
5. A plugin cannot read/write/provide a data contract it did not declare and was not granted.
6. A GitHub-like fake provider and Jira-like fake provider can both provide `software.issue.v1`.
7. An issue report plugin can query `software.issue.v1` without knowing which provider created records.
8. Runtime scope filters data according to resource assignments.
9. Data derived from assigned resources inherits visibility.
10. Contract versions coexist.

## Coding Style

* TypeScript strict mode.
* Small interfaces.
* Small files.
* No concrete provider logic in core.
* No unnecessary inheritance.
* Prefer composition.
* Prefer immutable definitions.
* Prefer discriminated unions.
* Avoid `any`.
* Avoid stringly typed APIs where TypeScript can infer types.
* Keep examples readable.
* Keep tests expressive.

## Out of Scope for v0

Do not implement:

* Real GitHub integration.
* Real Jira integration.
* Real Linear integration.
* Real OAuth flows.
* Real webhook handling.
* Deduplication/entity resolution.
* Cross-version migrations.
* Agent write actions.
* Custom UI.
* Cross-plugin connection sharing.
* Marketplace dependency resolution.
* Full analytics engine.

## Success Criteria

The core is successful when:

* A fake GitHub provider and fake Jira provider can both provide `software.issue.v1`.
* A report plugin can list all issues through `ctx.data.query(software.issue.v1)`.
* The report plugin never receives GitHub or Jira connections.
* Resource assignments filter visible data by workspace/group.
* Secret and storage isolation are enforced.
* Manifest generation and validation work.
* The implementation is easy to extend with a real GitHub plugin later.
