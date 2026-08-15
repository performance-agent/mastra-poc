import assert from "node:assert/strict";
import test from "node:test";
import type { PluginExecutionContext, PluginResource } from "@pa/core";
import { PluginValidationError } from "@pa/core";
import {
  createRestSalesforceClient,
  createSalesforcePlugin,
  salesforceSecrets,
  type SalesforceAccount,
  type SalesforceClient,
  type SalesforceClientFactory,
  type SalesforceFetch,
  type SalesforceOpportunity,
  type SalesforceSecrets,
  type SalesforceUser,
} from "@pa/plugin-salesforce";
import { createSecretReader } from "@pa/sdk";

const opportunityId = "006000000000001AAA";
const accountId = "001000000000001AAA";
const userId = "005000000000001AAA";
const secondOpportunityId = "006000000000002AAA";

const values: SalesforceSecrets = {
  loginUrl: "https://acme.my.salesforce.com",
  clientId: "salesforce-client",
  clientSecret: "salesforce-secret",
  apiVersion: undefined,
};

const opportunity: SalesforceOpportunity = {
  id: opportunityId,
  name: "Platform renewal",
  accountId,
  ownerId: userId,
  stageName: "Closed Won",
  amount: 25000,
  probability: 100,
  closeDate: "2026-08-31",
  isClosed: true,
  isWon: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const account: SalesforceAccount = {
  id: accountId,
  name: "Acme",
  ownerId: userId,
  industry: "Technology",
  numberOfEmployees: 100,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const user: SalesforceUser = {
  id: userId,
  username: "ada@acme.example",
  name: "Ada Lovelace",
  email: "ada@acme.example",
  active: true,
  userType: "Standard",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function context(): PluginExecutionContext<SalesforceSecrets> {
  return {
    organizationId: "org-1",
    pluginId: "salesforce",
    pluginVersion: "1.0.0",
    installationId: "install-1",
    secrets: createSecretReader(salesforceSecrets, (key) => values[key]),
  };
}

function fakeFactory(overrides: Partial<SalesforceClient> = {}): SalesforceClientFactory {
  return {
    create() {
      return {
        async listOpportunities() {
          return [{ id: opportunityId, name: opportunity.name, description: "Stage: Closed Won" }];
        },
        async listAccounts() { return [{ id: accountId, name: account.name }]; },
        async listUsers() { return [{ id: userId, name: user.name, description: `${user.username} (active)` }]; },
        async getOpportunity() { return opportunity; },
        async getAccount() { return account; },
        async getUser() { return user; },
        ...overrides,
      };
    },
  };
}

const opportunityResource: PluginResource = {
  name: opportunity.name,
  externalId: opportunityId,
  type: "salesforce.opportunity",
};
const accountResource: PluginResource = {
  name: account.name,
  externalId: accountId,
  type: "salesforce.account",
};

test("Salesforce manifest declares secrets, resources and native data without values", () => {
  const manifest = createSalesforcePlugin({ clientFactory: fakeFactory() }).manifest;
  assert.equal(manifest.id, "salesforce");
  assert.deepEqual(manifest.resourceTypes.map((item) => item.key), [
    "salesforce.opportunity", "salesforce.account", "salesforce.user",
  ]);
  assert.deepEqual(manifest.dataTypes.map((item) => item.key), [
    "salesforce.opportunity", "salesforce.account", "salesforce.user",
  ]);
  assert.deepEqual(manifest.secrets.map((item) => item.key), ["loginUrl", "clientId", "clientSecret", "apiVersion"]);
  assert.equal(manifest.secrets.find((item) => item.key === "clientSecret")?.sensitive, true);
  assert.equal(manifest.secrets.find((item) => item.key === "apiVersion")?.required, false);
  assert.equal(manifest.dataTypes[0]?.schema.type, "object");
  assert.doesNotMatch(JSON.stringify(manifest), /salesforce-secret/);
});

test("Salesforce secret definitions require authentication values", async () => {
  const reader = createSecretReader(salesforceSecrets, (key) => key === "clientSecret" ? undefined : values[key]);
  await assert.rejects(reader.get("clientSecret"), PluginValidationError);
});

test("Salesforce discovers individual opportunities, accounts and users", async () => {
  const plugin = createSalesforcePlugin({ clientFactory: fakeFactory() });
  assert.deepEqual(await plugin.resourceProviders[0].discover(context()), [{
    name: opportunity.name, description: "Stage: Closed Won", externalId: opportunityId, type: "salesforce.opportunity",
  }]);
  assert.deepEqual(await plugin.resourceProviders[1].discover(context()), [{
    name: account.name, externalId: accountId, type: "salesforce.account",
  }]);
  assert.deepEqual(await plugin.resourceProviders[2].discover(context()), [{
    name: user.name, description: `${user.username} (active)`, externalId: userId, type: "salesforce.user",
  }]);
});

test("Salesforce providers fetch only matching assigned record types", async () => {
  const requested: string[] = [];
  const plugin = createSalesforcePlugin({
    clientFactory: fakeFactory({
      async getOpportunity(id) { requested.push(id); return opportunity; },
    }),
  });
  assert.deepEqual(await plugin.dataProviders[0].provide(context(), accountResource), []);
  assert.deepEqual(await plugin.dataProviders[0].provide(context(), opportunityResource), [opportunity]);
  assert.deepEqual(requested, [opportunityId]);
});

test("Salesforce provider rejects invalid client output", async () => {
  const plugin = createSalesforcePlugin({
    clientFactory: fakeFactory({ async getOpportunity() { return { invalid: true } as never; } }),
  });
  await assert.rejects(plugin.dataProviders[0].provide(context(), opportunityResource), PluginValidationError);
});

test("REST client authenticates, paginates SOQL and maps assigned records", async () => {
  const requests: Array<{ url: string; method: string; authorization?: string; body?: string }> = [];
  const responses: Array<{ ok: boolean; status: number; value: unknown }> = [
    token("token-1"),
    success({
      done: false,
      nextRecordsUrl: "/services/data/v67.0/query/01g000000000001-2000",
      records: [{ Id: opportunityId, Name: "Platform renewal", StageName: "Closed Won" }],
    }),
    success({ done: true, records: [{ Id: secondOpportunityId, Name: "Expansion", StageName: "Prospecting" }] }),
    success({
      Id: opportunityId, Name: "Platform renewal", AccountId: null, OwnerId: userId, StageName: "Closed Won",
      Amount: null, Probability: 100, CloseDate: "2026-08-31", IsClosed: true, IsWon: true,
      CreatedDate: "2026-01-01T00:00:00Z", LastModifiedDate: "2026-08-01T00:00:00Z",
    }),
  ];
  const fetcher: SalesforceFetch = async (url, init) => {
    requests.push({
      url, method: init.method,
      ...(init.headers.Authorization === undefined ? {} : { authorization: init.headers.Authorization }),
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    const response = responses.shift();
    assert.ok(response);
    return { ok: response.ok, status: response.status, async json() { return response.value; } };
  };

  const client = await createRestSalesforceClient(values, fetcher);
  assert.equal((await client.listOpportunities()).length, 2);
  const record = await client.getOpportunity(opportunityId);
  assert.equal(record.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(record.probability, 100);
  assert.equal("accountId" in record, false);
  assert.equal("amount" in record, false);

  assert.equal(requests[0]?.url, "https://acme.my.salesforce.com/services/oauth2/token");
  assert.equal(requests[0]?.method, "POST");
  const tokenBody = new URLSearchParams(requests[0]?.body);
  assert.equal(tokenBody.get("grant_type"), "client_credentials");
  assert.equal(tokenBody.get("client_id"), values.clientId);
  assert.equal(tokenBody.get("client_secret"), values.clientSecret);
  assert.match(requests[1]?.url ?? "", /\/services\/data\/v67\.0\/query\?q=SELECT%20Id/);
  assert.equal(requests[2]?.url, "https://acme.my.salesforce.com/services/data/v67.0/query/01g000000000001-2000");
  assert.equal(requests[3]?.authorization, "Bearer token-1");
  assert.match(requests[3]?.url ?? "", new RegExp(`/sobjects/Opportunity/${opportunityId}\\?fields=Id%2CName`));
});

test("REST client refreshes once after 401 and reports safe errors", async () => {
  const requests: Array<{ url: string; authorization?: string }> = [];
  const responses = [token("token-1"), failure(401), token("token-2"), failure(401)];
  const fetcher: SalesforceFetch = async (url, init) => {
    requests.push({ url, ...(init.headers.Authorization === undefined ? {} : { authorization: init.headers.Authorization }) });
    const response = responses.shift();
    assert.ok(response);
    return { ok: response.ok, status: response.status, async json() { return response.value; } };
  };
  const client = await createRestSalesforceClient(values, fetcher);
  await assert.rejects(client.listAccounts(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /GET \/services\/data\/v67\.0\/query/);
    assert.match(error.message, /401/);
    assert.doesNotMatch(error.message, /salesforce-secret|salesforce-client|token-[12]/);
    return true;
  });
  assert.equal(requests[1]?.authorization, "Bearer token-1");
  assert.equal(requests[3]?.authorization, "Bearer token-2");
});

test("REST client rejects unsafe configuration, IDs and authentication failures", async () => {
  await assert.rejects(
    createRestSalesforceClient({ ...values, loginUrl: "https://example.com" }, unexpectedFetch),
    /Invalid Salesforce loginUrl/,
  );
  await assert.rejects(
    createRestSalesforceClient({ ...values, apiVersion: "latest" }, unexpectedFetch),
    /Invalid Salesforce API version/,
  );
  const authenticationFailure: SalesforceFetch = async () => ({ ok: false, status: 400, async json() { return {}; } });
  await assert.rejects(createRestSalesforceClient(values, authenticationFailure), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /authentication failed \(400\)/);
    assert.doesNotMatch(error.message, /salesforce-secret|salesforce-client/);
    return true;
  });

  const client = await createRestSalesforceClient(values, tokenOnlyFetch);
  await assert.rejects(client.getUser("not-an-id"), /Invalid Salesforce record ID/);
});

function token(value: string) {
  return success({ access_token: value, instance_url: "https://acme.my.salesforce.com" });
}

function success(value: unknown) {
  return { ok: true, status: 200, value } as const;
}

function failure(status: number) {
  return { ok: false, status, value: {} } as const;
}

const unexpectedFetch: SalesforceFetch = async () => {
  throw new Error("fetch should not execute");
};

const tokenOnlyFetch: SalesforceFetch = async () => ({
  ok: true,
  status: 200,
  async json() { return { access_token: "token", instance_url: "https://acme.my.salesforce.com" }; },
});
