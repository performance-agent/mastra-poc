import assert from "node:assert/strict";
import test from "node:test";
import { createOctokitGitHubClient } from "../packages/plugin-github/src/octokit.js";

const options = { period: { from: "2026-06-10", to: "2026-06-20" } };
const dates = ["2026-06-09T23:59:59.999Z", "2026-06-10T00:00:00.000Z", "2026-06-20T23:59:59.999Z", "2026-06-21T00:00:00.000Z"];

test("GitHub commits narrow the API query and filter exact inclusive bounds with author-date fallback", async () => {
  const requests: Record<string, unknown>[] = [];
  const commits = dates.map((date, index) => ({ sha: String(index), commit: { message: "commit", committer: { date }, author: { date: dates[1] } } }));
  const client = createOctokitGitHubClient({
    rest: { repos: { listCommits: async () => undefined } },
    async paginate(_endpoint: unknown, params: Record<string, unknown>) {
      requests.push(params);
      return [...commits, { sha: "fallback", commit: { message: "author-date", author: { date: dates[1] } } }, { sha: "unknown", commit: { message: "no date" } }];
    },
  } as never);
  const result = await client.listCommits("acme/api", options);
  assert.deepEqual(result.map((commit) => commit.sha), ["1", "2", "fallback", "unknown"]);
  assert.deepEqual(requests[0], { owner: "acme", repo: "api", per_page: 100, since: "2026-06-09T23:59:59.000Z", until: "2026-06-21T00:00:00.000Z" });
  assert.equal((await client.listCommits("acme/api")).length, 6);
  assert.equal("since" in requests[1]!, false);
  assert.equal("until" in requests[1]!, false);
  await assert.rejects(client.listCommits("acme/api", { period: { from: "2026-02-30", to: "2026-03-01" } }));
  assert.equal(requests.length, 2);
});

test("GitHub issues use since and filter by updated time, excluding pull requests", async () => {
  const requests: Record<string, unknown>[] = [];
  const issues = dates.map((date, index) => ({
    id: index, number: index + 1, title: "Issue", state: "open", labels: [], assignees: [],
    created_at: "2025-01-01T00:00:00Z", updated_at: date, comments: 0, body: null,
  }));
  const client = createOctokitGitHubClient({
    rest: { issues: { listForRepo: async () => undefined } },
    async paginate(_endpoint: unknown, params: Record<string, unknown>) { requests.push(params); return [...issues, { ...issues[1], pull_request: {} }]; },
  } as never);
  assert.deepEqual((await client.listIssues("acme/api", options)).map((issue) => issue.id), ["1", "2"]);
  assert.equal(requests[0]!.since, "2026-06-09T23:59:59.000Z");
  assert.equal((await client.listIssues("acme/api")).length, 4);
  assert.equal("since" in requests[1]!, false);
});

function periodPullClient(pages: Array<Array<{ number: number; updated_at: string }>>) {
  const requests: Array<{ endpoint: string; params: Record<string, unknown> }> = [];
  const listPulls = async () => undefined;
  const listComments = async () => undefined;
  const listReviewComments = async () => undefined;
  const listReviews = async () => undefined;
  let visitedPages = 0;
  const paginate = Object.assign(async (endpoint: unknown, params: Record<string, unknown>) => {
    requests.push({ endpoint: endpoint === listComments ? "comments" : endpoint === listReviewComments ? "reviewComments" : "reviews", params });
    if (endpoint === listReviews) return [...dates.map((date) => ({ state: "APPROVED", body: date, submitted_at: date })), { state: "PENDING", body: "no date", submitted_at: null }];
    return dates.map((date) => ({ body: date, created_at: date, path: "file.ts" }));
  }, {
    async *iterator(endpoint: unknown, params: Record<string, unknown>) {
      assert.equal(endpoint, listPulls);
      requests.push({ endpoint: "list", params });
      for (const data of pages) { visitedPages++; yield { data }; }
    },
  });
  const client = createOctokitGitHubClient({
    paginate,
    rest: {
      pulls: {
        list: listPulls, listReviewComments, listReviews,
        async get(params: Record<string, unknown>) {
          requests.push({ endpoint: "get", params });
          const number = Number(params.pull_number);
          const updated = pages.flat().find((pull) => pull.number === number)!.updated_at;
          return { data: { id: number, number, title: "Pull", state: "open", draft: false, labels: [],
            created_at: "2025-01-01T00:00:00Z", updated_at: updated, comments: 4, review_comments: 4,
            additions: 10, deletions: 2, changed_files: 1, base: { ref: "main" }, head: { ref: "branch" }, body: null,
          } };
        },
      },
      issues: { listComments },
    },
  } as never);
  return { client, requests, visitedPages: () => visitedPages };
}

test("GitHub PRs stop paging below from and hydrate only selected candidates and dated activity", async () => {
  const { client, requests, visitedPages } = periodPullClient([
    [{ number: 1, updated_at: dates[3]! }, { number: 2, updated_at: dates[2]! }],
    [{ number: 3, updated_at: dates[1]! }, { number: 4, updated_at: dates[0]! }],
    [{ number: 5, updated_at: "2025-01-01T00:00:00Z" }],
  ]);
  const result = await client.listPullRequests("acme/api", options);
  assert.deepEqual(result.map((pull) => pull.number), [2, 3]);
  assert.equal(visitedPages(), 2);
  assert.deepEqual(requests[0]!.params, { owner: "acme", repo: "api", state: "all", sort: "updated", direction: "desc", per_page: 100 });
  assert.deepEqual(requests.filter((request) => request.endpoint === "get").map((request) => request.params.pull_number), [2, 3]);
  for (const request of requests.filter((request) => request.endpoint !== "list")) assert.ok([2, 3].includes(Number(request.params.pull_number ?? request.params.issue_number)));
  for (const pull of result) {
    assert.deepEqual(pull.issueComments.map((comment) => comment.createdAt), [dates[1], dates[2]]);
    assert.deepEqual(pull.reviewCommentsData.map((comment) => comment.createdAt), [dates[1], dates[2]]);
    assert.deepEqual(pull.reviews.map((review) => review.submittedAt), [dates[1], dates[2]]);
    assert.equal(pull.comments, 4);
    assert.equal(pull.additions, 10);
  }
});

test("GitHub PRs return an empty range without any detail or activity calls", async () => {
  const { client, requests } = periodPullClient([[{ number: 1, updated_at: dates[3]! }], [{ number: 2, updated_at: dates[0]! }]]);
  assert.deepEqual(await client.listPullRequests("acme/api", options), []);
  assert.deepEqual(requests.map((request) => request.endpoint), ["list"]);
});

test("GitHub participation rejects periods before making any API request", async () => {
  const client = createOctokitGitHubClient({} as never);
  await assert.rejects(client.getParticipation("acme/api", options), /Use github.commit instead/);
});
