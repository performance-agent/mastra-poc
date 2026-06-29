import type { PluginExecutionContext } from "@pa/core";
import { dataType, definePlugin, defineSecrets, providesData, resourceType, resourcesProvider, secret } from "@pa/sdk";
import { z } from "zod";
import { restJiraClientFactory } from "./jira-client.js";
import type { JiraClientFactory, JiraPluginOptions, JiraSecrets } from "./types.js";

const jiraCloudUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname.endsWith(".atlassian.net");
}, "Must be an HTTPS atlassian.net Jira Cloud URL");

export const jiraSecrets = defineSecrets({
  siteUrl: secret({ label: "Jira Cloud site URL", sensitive: false, schema: jiraCloudUrl }),
  email: secret({ label: "Atlassian account email", sensitive: false, schema: z.email() }),
  apiToken: secret({ label: "Atlassian API token", sensitive: true, schema: z.string().min(1) }),
});

export const jiraIssueSchema = z.object({
  id: z.string().min(1), key: z.string().min(1), project: z.string().min(1), summary: z.string(),
  issueType: z.string(), status: z.string(), statusCategory: z.string().optional(), priority: z.string().optional(),
  labels: z.array(z.string()), assignee: z.string().optional(), reporter: z.string().optional(),
  parentKey: z.string().optional(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(), dueDate: z.iso.date().optional(),
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
    resourcesProvider: createResourcesProvider(clients),
    dataProviders: [providesData(jiraIssue, {
      secrets: jiraSecrets,
      async provide(context, resource) {
        const client = await clients.create(await readSecrets(context));
        return client.listIssues(resource.externalId);
      },
    })] as const,
  });
}

function createResourcesProvider(clients: JiraClientFactory) {
  return resourcesProvider({
    secrets: jiraSecrets, resourceTypes: [jiraProject],
    async discover(context) {
      const client = await clients.create(await readSecrets(context));
      return (await client.listProjects()).map((project) => ({
        name: project.name, externalId: project.key, type: jiraProject.key,
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
