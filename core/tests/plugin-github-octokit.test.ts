import assert from "node:assert/strict";
import test from "node:test";
import { createOctokitGitHubClient } from "../packages/plugin-github/src/octokit.js";

test("Octokit client loads paginated raw pull request context without embedding files or commits", async () => {
  const endpoints = {
    listPulls: async () => undefined,
    listFiles: async () => undefined,
    listIssueComments: async () => undefined,
    listReviewComments: async () => undefined,
    listReviews: async () => undefined,
    listPullCommits: async () => undefined,
  };
  const requests: Array<{ endpoint: string; params: Record<string, unknown> }> = [];
  const endpointName = new Map<unknown, string>([
    [endpoints.listPulls, "pulls.list"],
    [endpoints.listFiles, "pulls.listFiles"],
    [endpoints.listIssueComments, "issues.listComments"],
    [endpoints.listReviewComments, "pulls.listReviewComments"],
    [endpoints.listReviews, "pulls.listReviews"],
    [endpoints.listPullCommits, "pulls.listCommits"],
  ]);

  const octokit = {
    rest: {
      pulls: {
        list: endpoints.listPulls,
        listFiles: endpoints.listFiles,
        listReviewComments: endpoints.listReviewComments,
        listReviews: endpoints.listReviews,
        listCommits: endpoints.listPullCommits,
        async get(params: Record<string, unknown>) {
          requests.push({ endpoint: "pulls.get", params });
          return { data: {
            id: 20, number: 2, title: "Fix raw context", body: "## Raw\n\n_Do not transform_",
            state: "closed", draft: false, merged_at: "2026-01-03T00:00:00Z", closed_at: "2026-01-03T00:00:00Z",
            labels: [{ name: "bug" }], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-03T00:00:00Z",
            comments: 2, review_comments: 2, additions: 8, deletions: 3, changed_files: 2,
            user: { login: "author" }, html_url: "https://github.com/acme/api/pull/2",
            base: { ref: "main" }, head: { ref: "fix/raw-context" },
          } };
        },
      },
      issues: { listComments: endpoints.listIssueComments },
      apps: { listReposAccessibleToInstallation: async () => undefined },
      repos: { listCommits: async () => undefined },
    },
    async paginate(endpoint: unknown, params: Record<string, unknown>) {
      const name = endpointName.get(endpoint);
      assert.ok(name, "unexpected paginated endpoint");
      requests.push({ endpoint: name, params });
      if (endpoint === endpoints.listPulls) return [{ number: 2 }];
      if (endpoint === endpoints.listFiles) return [
        { filename: "src/a.ts", status: "modified", additions: 5, deletions: 1, changes: 6, patch: "@@ -1 +1 @@\n-old\n+new" },
        { filename: "src/b.ts", status: "added", additions: 3, deletions: 2, changes: 5 },
      ];
      if (endpoint === endpoints.listIssueComments) return [
        { user: { login: "alice" }, body: "General **raw** comment", created_at: "2026-01-02T00:00:00Z" },
        { user: null, body: "Deleted author", created_at: "2026-01-02T00:30:00Z" },
      ];
      if (endpoint === endpoints.listReviewComments) return [
        { user: { login: "bob" }, body: "Use `const`", path: "src/a.ts", line: 8, created_at: "2026-01-02T01:00:00Z" },
        { user: null, body: "File-level note", path: "src/b.ts", line: null, created_at: "2026-01-02T01:30:00Z" },
      ];
      if (endpoint === endpoints.listReviews) return [
        { user: { login: "carol" }, state: "APPROVED", body: "Ship it", submitted_at: "2026-01-02T02:00:00Z" },
        { user: { login: "dave" }, state: "CHANGES_REQUESTED", body: "Please revise", submitted_at: "2026-01-02T03:00:00Z" },
        { user: { login: "erin" }, state: "COMMENTED", body: "Non-blocking note", submitted_at: "2026-01-02T04:00:00Z" },
        { user: null, state: "PENDING", body: "Draft review" },
      ];
      throw new Error(`Unexpected endpoint: ${name}`);
    },
  };

  const client = createOctokitGitHubClient(octokit as never);
  const [pull] = await client.listPullRequests("acme/api");

  assert.equal(pull?.body, "## Raw\n\n_Do not transform_");
  assert.deepEqual(pull?.files, []);
  assert.deepEqual(pull?.issueComments[1], { body: "Deleted author", createdAt: "2026-01-02T00:30:00.000Z" });
  assert.deepEqual(pull?.reviewCommentsData[1], {
    body: "File-level note", path: "src/b.ts", createdAt: "2026-01-02T01:30:00.000Z",
  });
  assert.deepEqual(pull?.reviews.map(({ state }) => state), ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "PENDING"]);
  assert.deepEqual(pull?.reviews[3], { state: "PENDING", body: "Draft review" });
  assert.deepEqual(
    requests.map(({ endpoint }) => endpoint),
    ["pulls.list", "pulls.get", "issues.listComments", "pulls.listReviewComments", "pulls.listReviews"],
  );
  assert.equal(requests.some(({ endpoint }) => endpoint === "pulls.listFiles"), false);
  assert.equal(requests.some(({ endpoint }) => endpoint === "pulls.listCommits"), false);
  for (const request of requests.filter(({ endpoint }) => endpoint !== "pulls.get")) {
    assert.equal(request.params.per_page, 100);
  }
  for (const request of requests.filter(({ endpoint }) => endpoint !== "pulls.list")) {
    assert.equal(request.params.pull_number ?? request.params.issue_number, 2);
  }
});
