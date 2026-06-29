# Performance Platform plugin core

Minimal TypeScript core for plugins that discover external resources and provide native data.

The plugin layer does not define canonical platform `DataType` records or mappings. Those belong to the host platform. A plugin only declares its secrets, resources and native output schemas.

## Packages

- `@pa/core`: host/plugin contracts and serializable manifest types.
- `@pa/sdk`: typed DSL, Zod v4 validation and JSON Schema generation.
- `@pa/plugin-github`: GitHub App implementation using Octokit.
- `@pa/plugin-jira`: Jira Cloud implementation using an Atlassian API token.

## Plugin shape

```ts
import { definePlugin, defineSecrets, secret, resourceType, resourcesProvider, dataType, providesData } from "@pa/sdk";
import { z } from "zod";

const secrets = defineSecrets({
  token: secret({ label: "API token", sensitive: true, schema: z.string().min(1) }),
});

const project = resourceType({ key: "example.project", name: "Project" });
const issue = dataType({
  key: "example.issue",
  schema: z.object({ id: z.string(), project: z.string(), title: z.string() }),
});

const discovered = resourcesProvider({
  secrets,
  resourceTypes: [project],
  async discover(ctx) {
    const token = await ctx.secrets.get("token");
    return loadProjects(token);
  },
});

const issues = providesData(issue, {
  secrets,
  async provide(ctx, assignedResource) {
    const token = await ctx.secrets.get("token");
    return loadIssues(token, assignedResource);
  },
});

export const plugin = definePlugin({
  id: "example",
  name: "Example",
  version: "1.0.0",
  secrets,
  resourcesProvider: discovered,
  dataProviders: [issues] as const,
});
```

The host creates a scoped `SecretReader`, invokes resource discovery, persists the returned snapshot, and calls each data provider once per assigned resource. SDK wrappers validate the resource and provider output.

## Commands

```sh
npm test
npm run typecheck
npm run build
```
