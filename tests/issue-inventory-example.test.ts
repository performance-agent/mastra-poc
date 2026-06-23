import test from "node:test";
import assert from "node:assert/strict";
import { runIssueInventoryExample } from "../examples/issue-inventory/run.js";

test("issue inventory example runs the provider-agnostic vertical slice", async () => {
  const result = await runIssueInventoryExample();

  assert.equal(result.report.total, 2);
  assert.deepEqual(result.report.byProvider, { github: 1, jira: 1 });
  assert.deepEqual(result.report.titles, [
    "GitHub API issue visible to workspace-a",
    "Jira platform issue visible to workspace-a",
  ]);
});
