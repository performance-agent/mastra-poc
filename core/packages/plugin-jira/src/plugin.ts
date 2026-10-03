import type { PluginExecutionContext } from "@pa/core";
import { dataType, definePlugin, defineSecrets, providesData, providesResources, resourceType, schema, secret } from "@pa/sdk";
import { restJiraClientFactory } from "./jira-client.js";
import type { JiraClientFactory, JiraPluginOptions, JiraSecrets } from "./types.js";

export const jiraSecrets = defineSecrets([
  secret({ key: "siteUrl", label: "Jira Cloud site URL", sensitive: false }),
  secret({ key: "email", label: "Atlassian account email", sensitive: false }),
  secret({ key: "apiToken", label: "Atlassian API token", sensitive: true }),
]);

export const jiraIssueSchema = schema.object({
  id: schema.string({ minLength: 1 }), key: schema.string({ minLength: 1 }), project: schema.string({ minLength: 1 }), summary: schema.string(),
  issueType: schema.string(), status: schema.string(), statusCategory: schema.optional(schema.string()), priority: schema.optional(schema.string()),
  labels: schema.array(schema.string()), assignee: schema.optional(schema.string()), reporter: schema.optional(schema.string()),
  parentKey: schema.optional(schema.string()), createdAt: schema.string({ format: "date-time" }), updatedAt: schema.string({ format: "date-time" }),
  resolvedAt: schema.optional(schema.string({ format: "date-time" })), dueDate: schema.optional(schema.string({ format: "date" })),
});
export const jiraIssue = dataType({ key: "jira.issue", schema: jiraIssueSchema });
const jiraProject = resourceType({
  key: "jira.project", name: "Jira project",
  description: "A Jira Cloud project visible to the configured Atlassian account",
});

export function createJiraPlugin(options: JiraPluginOptions = {}) {
  const clients = options.clientFactory ?? restJiraClientFactory;
  return definePlugin({
    id: "jira", name: "Jira", version: "1.0.0", description: "Provides native Jira Cloud issues",
    secrets: jiraSecrets,
    resourceProviders: [createProjectProvider(clients)],
    dataProviders: [providesData(jiraIssue, {
      secrets: jiraSecrets,
      async provide(context, resource, options) {
        const client = await clients.create(await readSecrets(context));
        return client.listIssues(resource.externalId, options);
      },
    })] as const,
  });
}

function createProjectProvider(clients: JiraClientFactory) {
  return providesResources(jiraProject, {
    secrets: jiraSecrets,
    async discover(context) {
      const client = await clients.create(await readSecrets(context));
      return (await client.listProjects()).map((project) => ({
        name: project.name, externalId: project.key,
        ...(project.description === undefined ? {} : { description: project.description }),
      }));
    },
  });
}

async function readSecrets(context: PluginExecutionContext<JiraSecrets>): Promise<JiraSecrets> {
  const [siteUrl, email, apiToken] = await Promise.all([
    context.secrets.get("siteUrl"), context.secrets.get("email"), context.secrets.get("apiToken"),
  ]);
  return { siteUrl, email, apiToken };
}
