# Performance Platform plugin core

Minimal TypeScript core for plugins that discover external resources and provide native data.

The plugin layer does not define canonical platform `DataType` records or mappings. Those belong to the host platform. A plugin only declares its secrets, resources and native output schemas.

## Packages

- `@pa/core`: host/plugin contracts and serializable manifest types.
- `@pa/sdk`: typed JSON Schema DSL and runtime validation helpers.
- `@pa/plugin-github`: GitHub App implementation using Octokit.
- `@pa/plugin-jira`: Jira Cloud implementation using an Atlassian API token.

## Plugin shape

```ts
import { definePlugin, defineSecrets, secret, schema, resourceType, providesResources, dataType, providesData } from "@pa/sdk";

const secrets = defineSecrets([
  secret({ key: "token", label: "API token", sensitive: true }),
]);

const project = resourceType({ key: "example.project", name: "Project" });
const issue = dataType({
  key: "example.issue",
  schema: schema.object({ id: schema.string(), project: schema.string(), title: schema.string() }),
});

const discovered = providesResources(project, {
  secrets,
  async discover(ctx) {
    const token = await ctx.secrets.get("token");
    return loadProjects(token);
  },
});

const issues = providesData(issue, {
  secrets,
  async provide(ctx, assignedResource, options) {
    const token = await ctx.secrets.get("token");
    return loadIssues(token, assignedResource, options);
  },
});

export const plugin = definePlugin({
  id: "example",
  name: "Example",
  version: "1.0.0",
  secrets,
  resourceProviders: [discovered],
  dataProviders: [issues] as const,
});
```

The host creates a scoped `SecretReader`, invokes resource discovery, persists the returned snapshot, and calls each data provider once per assigned resource. SDK wrappers validate the resource and provider output.

## Optional date period

Data providers accept a third, optional `DataProviderOptions` argument exported
by `@pa/core`. Existing providers that accept two arguments remain compatible.

```ts
await issues.provide(context, assignedResource, {
  period: { from: "2026-06-10", to: "2026-06-20" },
});
```

Both values must be real calendar dates in `YYYY-MM-DD` format, with `from <= to`.
The entire first and last days are included in UTC. The SDK rejects invalid
periods before invoking the provider. `dataProviderPeriodBounds` and
`isWithinDataProviderPeriod`, exported by `@pa/core`, support the same validation
and exact timestamp filtering in clients. Options belong to each query; they
are not part of the installation context or resource discovery.

GitHub and Jira clients accept the same options as their second argument:

- GitHub commits use `since`/`until`, then exact commit-date filtering, falling
  back to author date when commit date is missing. Records without either date
  are retained for the host to report their limitation.
- GitHub issues and Jira issues are selected by their latest update. Jira JQL
  uses a broader candidate window to account for the configured Jira timezone,
  followed by exact UTC filtering.
- GitHub pull requests are paged in descending update order and selected before
  fetching details, comments and reviews. Returned comments and reviews are
  restricted to the period by their own timestamps; undated reviews are omitted.
  The PR's current state, changes and comment totals remain totals for the object,
  not historical snapshots or period-only counts.
- GitHub participation rejects periods explicitly because weekly aggregates
  cannot represent arbitrary inclusive days. Use `github.commit` instead.

Objects updated after `to` are excluded even if they had earlier activity in
the period. Calls without a period continue to retrieve their existing history.
The host also checks timestamps before truncating the returned dataset.

## Commands

```sh
npm test
npm run typecheck
npm run build
```
