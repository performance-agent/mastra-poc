# Issue Inventory Example

This example is the reference vertical slice for future integrations.

It installs three plugins into the same fake organization:

- `github`, a fake provider for `software.issue.v1` from assigned `github.repository` resources.
- `jira`, a fake provider for `software.issue.v1` from assigned `jira.project` resources.
- `issue-report`, a report plugin that reads canonical issue data only.

Providers use their own connections. The GitHub provider calls its fake `github` connection, and the Jira provider calls its fake `jira` connection. The report plugin does not declare GitHub or Jira connections and cannot access them.

The example uses the explicit SDK names intended for plugin authors:

- `defineConnection(...)` defines a connection.
- `permission.connection.use(...)` declares permission to use it.
- `defineReport(...)` defines a report.
- `permission.report.write(...)` declares permission to write report output.
- `providesData.withConnections(connections)(...)` uses the plugin connection map as the single source of truth for provider context types.

Provider handlers access their own connections directly:

```ts
const github = await ctx.connections.github.client();
```

Reports consume canonical contracts only. The inventory report calls:

```ts
ctx.data.query(software.issue.v1, { scope: ctx.scope });
```

That query is provider-agnostic: the report does not know whether records came from GitHub, Jira, or a future provider.

Plugins do not share connections. The fake runtime executes provider queries with provider-owned runtime contexts, so provider connections and secrets never leak to the consumer plugin.

Resource assignments control visibility. In `run.ts`, one GitHub repository and one Jira project are assigned to `workspace-a`, while another GitHub repository is assigned to `workspace-b`. Running the report in `workspace-a` returns only the assigned GitHub and Jira issues for `workspace-a`.

Run it from the repo root:

```bash
npm run example:issue-inventory
```
