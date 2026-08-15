import { z } from "zod";
import type {
  SalesforceAccount,
  SalesforceClient,
  SalesforceClientFactory,
  SalesforceFetch,
  SalesforceOpportunity,
  SalesforceResourceSummary,
  SalesforceSecrets,
  SalesforceUser,
} from "./types.js";

const DEFAULT_API_VERSION = "67.0";
const salesforceIdPattern = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const apiVersionPattern = /^[1-9]\d{1,2}\.0$/;

const tokenSchema = z.object({ access_token: z.string().min(1), instance_url: z.string().min(1) });
const opportunitySummarySchema = z.object({ Id: z.string(), Name: z.string(), StageName: z.string() });
const accountSummarySchema = z.object({ Id: z.string(), Name: z.string() });
const userSummarySchema = z.object({ Id: z.string(), Name: z.string(), Username: z.string(), IsActive: z.boolean() });

const opportunityRecordSchema = z.object({
  Id: z.string(), Name: z.string(), AccountId: z.string().nullish(), OwnerId: z.string(), StageName: z.string(),
  Amount: z.number().nullish(), Probability: z.number().nullish(), CloseDate: z.string(), IsClosed: z.boolean(),
  IsWon: z.boolean(), CreatedDate: z.string(), LastModifiedDate: z.string(),
});
const accountRecordSchema = z.object({
  Id: z.string(), Name: z.string(), OwnerId: z.string(), Type: z.string().nullish(), Industry: z.string().nullish(),
  Website: z.string().nullish(), Phone: z.string().nullish(), AnnualRevenue: z.number().nullish(),
  NumberOfEmployees: z.number().int().nullish(), CreatedDate: z.string(), LastModifiedDate: z.string(),
});
const userRecordSchema = z.object({
  Id: z.string(), Username: z.string(), Name: z.string(), Email: z.string().nullish(), Title: z.string().nullish(),
  Department: z.string().nullish(), IsActive: z.boolean(), UserType: z.string(), CreatedDate: z.string(), LastModifiedDate: z.string(),
});

const opportunityFields = [
  "Id", "Name", "AccountId", "OwnerId", "StageName", "Amount", "Probability", "CloseDate",
  "IsClosed", "IsWon", "CreatedDate", "LastModifiedDate",
] as const;
const accountFields = [
  "Id", "Name", "OwnerId", "Type", "Industry", "Website", "Phone", "AnnualRevenue",
  "NumberOfEmployees", "CreatedDate", "LastModifiedDate",
] as const;
const userFields = [
  "Id", "Username", "Name", "Email", "Title", "Department", "IsActive", "UserType", "CreatedDate", "LastModifiedDate",
] as const;

const nativeFetch: SalesforceFetch = async (url, init) => fetch(url, init);

export const restSalesforceClientFactory: SalesforceClientFactory = {
  async create(secrets) {
    return createRestSalesforceClient(secrets);
  },
};

export async function createRestSalesforceClient(
  secrets: SalesforceSecrets,
  fetcher: SalesforceFetch = nativeFetch,
): Promise<SalesforceClient> {
  const client = new RestSalesforceClient(secrets, fetcher);
  await client.authenticate();
  return client;
}

class RestSalesforceClient implements SalesforceClient {
  private readonly loginUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiVersion: string;
  private accessToken = "";
  private instanceUrl = "";

  constructor(secrets: SalesforceSecrets, private readonly fetcher: SalesforceFetch) {
    this.loginUrl = salesforceOrigin(secrets.loginUrl, "loginUrl");
    if (!secrets.clientId.trim() || !secrets.clientSecret) throw new Error("Salesforce client ID and secret are required");
    this.clientId = secrets.clientId;
    this.clientSecret = secrets.clientSecret;
    this.apiVersion = secrets.apiVersion ?? DEFAULT_API_VERSION;
    if (!apiVersionPattern.test(this.apiVersion)) throw new Error(`Invalid Salesforce API version: ${this.apiVersion}`);
  }

  async authenticate(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    }).toString();
    const response = await this.fetcher(`${this.loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error(`Salesforce authentication failed (${response.status})`);
    const token = tokenSchema.parse(await response.json());
    this.accessToken = token.access_token;
    this.instanceUrl = salesforceOrigin(token.instance_url, "instance URL");
  }

  async listOpportunities(): Promise<readonly SalesforceResourceSummary[]> {
    const records = await this.query("SELECT Id, Name, StageName FROM Opportunity ORDER BY Name, Id", opportunitySummarySchema);
    return records.map((record) => ({ id: validSalesforceId(record.Id), name: record.Name, description: `Stage: ${record.StageName}` }));
  }

  async listAccounts(): Promise<readonly SalesforceResourceSummary[]> {
    const records = await this.query("SELECT Id, Name FROM Account ORDER BY Name, Id", accountSummarySchema);
    return records.map((record) => ({ id: validSalesforceId(record.Id), name: record.Name }));
  }

  async listUsers(): Promise<readonly SalesforceResourceSummary[]> {
    const records = await this.query("SELECT Id, Name, Username, IsActive FROM User ORDER BY Name, Id", userSummarySchema);
    return records.map((record) => ({
      id: validSalesforceId(record.Id), name: record.Name,
      description: `${record.Username} (${record.IsActive ? "active" : "inactive"})`,
    }));
  }

  async getOpportunity(id: string): Promise<SalesforceOpportunity> {
    const record = opportunityRecordSchema.parse(await this.getRecord("Opportunity", id, opportunityFields));
    return {
      id: validSalesforceId(record.Id), name: record.Name, ownerId: validSalesforceId(record.OwnerId), stageName: record.StageName,
      closeDate: record.CloseDate, isClosed: record.IsClosed, isWon: record.IsWon,
      createdAt: isoDate(record.CreatedDate), updatedAt: isoDate(record.LastModifiedDate),
      ...(record.AccountId == null ? {} : { accountId: validSalesforceId(record.AccountId) }),
      ...(record.Amount == null ? {} : { amount: record.Amount }),
      ...(record.Probability == null ? {} : { probability: record.Probability }),
    };
  }

  async getAccount(id: string): Promise<SalesforceAccount> {
    const record = accountRecordSchema.parse(await this.getRecord("Account", id, accountFields));
    return {
      id: validSalesforceId(record.Id), name: record.Name, ownerId: validSalesforceId(record.OwnerId),
      createdAt: isoDate(record.CreatedDate), updatedAt: isoDate(record.LastModifiedDate),
      ...(record.Type == null ? {} : { type: record.Type }),
      ...(record.Industry == null ? {} : { industry: record.Industry }),
      ...(record.Website == null ? {} : { website: record.Website }),
      ...(record.Phone == null ? {} : { phone: record.Phone }),
      ...(record.AnnualRevenue == null ? {} : { annualRevenue: record.AnnualRevenue }),
      ...(record.NumberOfEmployees == null ? {} : { numberOfEmployees: record.NumberOfEmployees }),
    };
  }

  async getUser(id: string): Promise<SalesforceUser> {
    const record = userRecordSchema.parse(await this.getRecord("User", id, userFields));
    return {
      id: validSalesforceId(record.Id), username: record.Username, name: record.Name, active: record.IsActive,
      userType: record.UserType, createdAt: isoDate(record.CreatedDate), updatedAt: isoDate(record.LastModifiedDate),
      ...(record.Email == null ? {} : { email: record.Email }),
      ...(record.Title == null ? {} : { title: record.Title }),
      ...(record.Department == null ? {} : { department: record.Department }),
    };
  }

  private async query<TSchema extends z.ZodType>(soql: string, recordSchema: TSchema): Promise<z.infer<TSchema>[]> {
    const records: z.infer<TSchema>[] = [];
    let endpoint: string | undefined = `${this.apiBase}/query?q=${encodeURIComponent(soql)}`;
    while (endpoint !== undefined) {
      const pageSchema = z.object({
        records: z.array(recordSchema), done: z.boolean(), nextRecordsUrl: z.string().nullish(),
      });
      const page = pageSchema.parse(await this.request(endpoint));
      records.push(...page.records);
      if (page.done || page.nextRecordsUrl == null || page.records.length === 0) return records;
      endpoint = this.validApiEndpoint(page.nextRecordsUrl);
    }
    return records;
  }

  private getRecord(objectName: "Opportunity" | "Account" | "User", id: string, fields: readonly string[]): Promise<unknown> {
    const recordId = validSalesforceId(id);
    const endpoint = `${this.apiBase}/sobjects/${objectName}/${recordId}?fields=${encodeURIComponent(fields.join(","))}`;
    return this.request(endpoint);
  }

  private async request(endpoint: string): Promise<unknown> {
    const safeEndpoint = this.validApiEndpoint(endpoint);
    let response = await this.send(safeEndpoint);
    if (response.status === 401) {
      await this.authenticate();
      response = await this.send(safeEndpoint);
    }
    if (!response.ok) throw new Error(`Salesforce request failed: GET ${safeEndpoint} (${response.status})`);
    return response.json();
  }

  private send(endpoint: string) {
    return this.fetcher(`${this.instanceUrl}${endpoint}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
    });
  }

  private validApiEndpoint(endpoint: string): string {
    if (!endpoint.startsWith(`${this.apiBase}/`) || endpoint.startsWith("//")) {
      throw new Error("Invalid Salesforce REST endpoint");
    }
    return endpoint;
  }

  private get apiBase(): string {
    return `/services/data/v${this.apiVersion}`;
  }
}

function salesforceOrigin(value: string, label: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`Invalid Salesforce ${label}`); }
  if (
    parsed.protocol !== "https:" || !parsed.hostname.endsWith(".my.salesforce.com") ||
    parsed.username || parsed.password || parsed.search || parsed.hash || !["", "/"].includes(parsed.pathname)
  ) throw new Error(`Invalid Salesforce ${label}`);
  return parsed.origin;
}

function validSalesforceId(value: string): string {
  if (!salesforceIdPattern.test(value)) throw new Error(`Invalid Salesforce record ID: ${value}`);
  return value;
}

function isoDate(value: string): string {
  return new Date(value).toISOString();
}
