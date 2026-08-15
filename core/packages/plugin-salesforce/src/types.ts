import type { InferSchema } from "@pa/core";
import type { InferSecrets } from "@pa/sdk";
import type {
  salesforceAccountSchema,
  salesforceOpportunitySchema,
  salesforceSecrets,
  salesforceUserSchema,
} from "./plugin.js";

export type SalesforceSecrets = InferSecrets<typeof salesforceSecrets>;

export type SalesforceOpportunity = InferSchema<typeof salesforceOpportunitySchema>;
export type SalesforceAccount = InferSchema<typeof salesforceAccountSchema>;
export type SalesforceUser = InferSchema<typeof salesforceUserSchema>;

export type SalesforceResourceSummary = {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
};

export interface SalesforceClient {
  listOpportunities(): Promise<readonly SalesforceResourceSummary[]>;
  listAccounts(): Promise<readonly SalesforceResourceSummary[]>;
  listUsers(): Promise<readonly SalesforceResourceSummary[]>;
  getOpportunity(id: string): Promise<SalesforceOpportunity>;
  getAccount(id: string): Promise<SalesforceAccount>;
  getUser(id: string): Promise<SalesforceUser>;
}

export interface SalesforceClientFactory {
  create(secrets: SalesforceSecrets): Promise<SalesforceClient> | SalesforceClient;
}

export interface SalesforceHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type SalesforceFetch = (
  url: string,
  init: Readonly<{
    method: "GET" | "POST";
    headers: Readonly<Record<string, string>>;
    body?: string;
  }>,
) => Promise<SalesforceHttpResponse>;

export type SalesforcePluginOptions = {
  readonly clientFactory?: SalesforceClientFactory;
};
