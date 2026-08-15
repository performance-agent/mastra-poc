import type { PluginExecutionContext } from "@pa/core";
import {
  dataType,
  definePlugin,
  defineSecrets,
  providesData,
  providesResources,
  resourceType,
  schema,
  secret,
} from "@pa/sdk";
import { restSalesforceClientFactory } from "./salesforce-client.js";
import type {
  SalesforceClientFactory,
  SalesforcePluginOptions,
  SalesforceSecrets,
} from "./types.js";

export const salesforceSecrets = defineSecrets([
  secret({
    key: "loginUrl",
    label: "Salesforce My Domain URL",
    description: "HTTPS My Domain URL used for OAuth client credentials",
    sensitive: false,
  }),
  secret({ key: "clientId", label: "Salesforce client ID", sensitive: false }),
  secret({ key: "clientSecret", label: "Salesforce client secret", sensitive: true }),
  secret({
    key: "apiVersion",
    label: "Salesforce API version",
    description: "Optional REST API version; defaults to 67.0",
    sensitive: false,
    required: false,
  }),
]);

const salesforceId = schema.string({ pattern: "^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$" });

export const salesforceOpportunitySchema = schema.object({
  id: salesforceId,
  name: schema.string(),
  accountId: schema.optional(salesforceId),
  ownerId: salesforceId,
  stageName: schema.string(),
  amount: schema.optional(schema.number()),
  probability: schema.optional(schema.number({ minimum: 0, maximum: 100 })),
  closeDate: schema.string({ format: "date" }),
  isClosed: schema.boolean(),
  isWon: schema.boolean(),
  createdAt: schema.string({ format: "date-time" }),
  updatedAt: schema.string({ format: "date-time" }),
});

export const salesforceAccountSchema = schema.object({
  id: salesforceId,
  name: schema.string(),
  ownerId: salesforceId,
  type: schema.optional(schema.string()),
  industry: schema.optional(schema.string()),
  website: schema.optional(schema.string()),
  phone: schema.optional(schema.string()),
  annualRevenue: schema.optional(schema.number()),
  numberOfEmployees: schema.optional(schema.integer({ minimum: 0 })),
  createdAt: schema.string({ format: "date-time" }),
  updatedAt: schema.string({ format: "date-time" }),
});

export const salesforceUserSchema = schema.object({
  id: salesforceId,
  username: schema.string(),
  name: schema.string(),
  email: schema.optional(schema.string()),
  title: schema.optional(schema.string()),
  department: schema.optional(schema.string()),
  active: schema.boolean(),
  userType: schema.string(),
  createdAt: schema.string({ format: "date-time" }),
  updatedAt: schema.string({ format: "date-time" }),
});

export const salesforceOpportunity = dataType({ key: "salesforce.opportunity", schema: salesforceOpportunitySchema });
export const salesforceAccount = dataType({ key: "salesforce.account", schema: salesforceAccountSchema });
export const salesforceUser = dataType({ key: "salesforce.user", schema: salesforceUserSchema });

export const salesforceOpportunityResource = resourceType({
  key: "salesforce.opportunity",
  name: "Salesforce opportunity",
  description: "An Opportunity visible to the configured Salesforce integration user",
});
export const salesforceAccountResource = resourceType({
  key: "salesforce.account",
  name: "Salesforce account",
  description: "An Account visible to the configured Salesforce integration user",
});
export const salesforceUserResource = resourceType({
  key: "salesforce.user",
  name: "Salesforce user",
  description: "A User visible to the configured Salesforce integration user",
});

export function createSalesforcePlugin(options: SalesforcePluginOptions = {}) {
  const clients = options.clientFactory ?? restSalesforceClientFactory;
  return definePlugin({
    id: "salesforce",
    name: "Salesforce",
    version: "1.0.0",
    description: "Provides native Salesforce opportunities, accounts and users",
    secrets: salesforceSecrets,
    resourceProviders: [
      createResourceProvider(salesforceOpportunityResource, clients, (client) => client.listOpportunities()),
      createResourceProvider(salesforceAccountResource, clients, (client) => client.listAccounts()),
      createResourceProvider(salesforceUserResource, clients, (client) => client.listUsers()),
    ],
    dataProviders: [
      providesData(salesforceOpportunity, {
        secrets: salesforceSecrets,
        async provide(context, resource) {
          if (resource.type !== salesforceOpportunityResource.key) return [];
          const client = await clients.create(await readSecrets(context));
          return [await client.getOpportunity(resource.externalId)];
        },
      }),
      providesData(salesforceAccount, {
        secrets: salesforceSecrets,
        async provide(context, resource) {
          if (resource.type !== salesforceAccountResource.key) return [];
          const client = await clients.create(await readSecrets(context));
          return [await client.getAccount(resource.externalId)];
        },
      }),
      providesData(salesforceUser, {
        secrets: salesforceSecrets,
        async provide(context, resource) {
          if (resource.type !== salesforceUserResource.key) return [];
          const client = await clients.create(await readSecrets(context));
          return [await client.getUser(resource.externalId)];
        },
      }),
    ] as const,
  });
}

function createResourceProvider<TResource extends { readonly key: string; readonly name: string; readonly description?: string }>(
  type: TResource,
  clients: SalesforceClientFactory,
  list: (client: Awaited<ReturnType<SalesforceClientFactory["create"]>>) => Promise<readonly { id: string; name: string; description?: string }[]>,
) {
  return providesResources(type, {
    secrets: salesforceSecrets,
    async discover(context) {
      const client = await clients.create(await readSecrets(context));
      return (await list(client)).map((item) => ({
        name: item.name,
        externalId: item.id,
        ...(item.description === undefined ? {} : { description: item.description }),
      }));
    },
  });
}

async function readSecrets(context: PluginExecutionContext<SalesforceSecrets>): Promise<SalesforceSecrets> {
  const [loginUrl, clientId, clientSecret, apiVersion] = await Promise.all([
    context.secrets.get("loginUrl"),
    context.secrets.get("clientId"),
    context.secrets.get("clientSecret"),
    context.secrets.get("apiVersion"),
  ]);
  return { loginUrl, clientId, clientSecret, apiVersion };
}
