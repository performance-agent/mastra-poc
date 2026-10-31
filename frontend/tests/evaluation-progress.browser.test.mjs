import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.PROGRESS_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const evidence = resolve("../artifacts/evaluation-progress/ui-tests");
const stages = [
  "preparing",
  "rule_input",
  "resource_catalog",
  "rule_understanding",
  "resource_selection",
  "resource_operation_deduplication",
  "evaluation_plan",
  "resource_execution",
  "rule_assessment",
  "saving",
];
let browser;
before(async () => {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });
  await mkdir(evidence, { recursive: true });
});
after(async () => {
  await browser?.close();
});

function job(id = "evaluation-test") {
  return { id, status: "queued", progress: null, result: null, error: null };
}
function progress(target, stage, completed = stages.slice(0, stages.indexOf(stage)), total = 10) {
  target.status = "running";
  target.progress = { stage, completed, total, updatedAt: new Date().toISOString() };
}
function report() {
  return {
    evaluationId: "report-test",
    createdAt: new Date().toISOString(),
    status: "ready",
    individualInsightsJobId: "synthesis-test",
    limitations: [],
    execution: { total: 1, successful: 1, failed: 0 },
    diagnostics: {},
    assessments: {
      delivery: {
        ruleName: "Delivery",
        overview: "Saved report remains available during individual synthesis.",
        verdict: "supported",
        rationale: "Fixture evidence",
        evidence: [],
        criteria: [],
        limitations: [],
      },
    },
  };
}
async function setup(t, initialJob) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const state = {
    jobs: { "group-a": initialJob ?? null, "group-b": null },
    synthesis: job("synthesis-test"),
    posts: 0,
    failPolls: false,
    forbidden: false,
    pollCount: 0,
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body = [];
    let status = 200;
    if (url.pathname.endsWith("/rule-packages"))
      body = [
        {
          id: "package-test",
          name: "Engineering delivery",
          evaluates: "Observable delivery evidence",
          scope: "PUBLIC",
          rules: [
            {
              id: "rule-test",
              name: "Delivery",
              description: "Assess attributable delivery and reviews using repository evidence.",
              valuation: 5,
              position: 0,
            },
          ],
        },
      ];
    else if (url.pathname.endsWith("/grading-settings"))
      body = {
        minimum: 0,
        maximum: 10,
        passingGrade: 4,
        rounding: "integer",
        minimumCoverage: 1,
        summaryLength: 240,
        met: 1,
        partially_met: 0.5,
        not_met: 0,
      };
    else if (url.pathname.endsWith("/jobs/latest"))
      body = state.jobs[url.searchParams.get("groupId")];
    else if (url.pathname.includes("/jobs/")) {
      state.pollCount++;
      if (state.forbidden) {
        status = 403;
        body = { message: "Insufficient permissions" };
      } else if (state.failPolls) {
        status = 503;
        body = { message: "Temporary connection failure" };
      } else
        body = url.pathname.endsWith("synthesis-test")
          ? state.synthesis
          : Object.values(state.jobs).find((j) => j?.id === url.pathname.split("/").at(-1));
    } else if (url.pathname.endsWith("/evaluations") && request.method() === "POST") {
      state.posts++;
      const group = request.postDataJSON().groupId;
      state.jobs[group] = job();
      body = { jobId: state.jobs[group].id, status: "queued" };
    } else if (url.pathname.endsWith("/evaluations")) body = { items: [], nextCursor: null };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body ?? null),
    });
  });
  await page.goto(`${baseURL}/tests/fixtures/evaluation-workbench.html`);
  t.after(() => assert.deepEqual(errors, [], "No browser runtime errors"));
  return { page, state };
}
async function visible(page, text, panel = "evaluation-progress") {
  await page.getByTestId(panel).getByText(text, { exact: true }).waitFor({ timeout: 15000 });
}
async function screenshot(page, name) {
  await page.screenshot({ path: resolve(evidence, `${name}.png`), fullPage: true });
}

test(
  "submission, real polling, reload, reconnection and independent synthesis",
  { timeout: 65000 },
  async (t) => {
    const { page, state } = await setup(t);
    const generate = page.getByRole("button", { name: "Generate Evaluation Report" });
    await generate.waitFor();
    await generate.click();
    await visible(page, "Queued — waiting to start");
    await screenshot(page, "01-queued-simulated");
    const evaluation = state.jobs["group-a"];
    progress(evaluation, "rule_understanding");
    await visible(page, "3 of 10 steps completed");
    await screenshot(page, "02-interpreting-simulated");
    await page.reload();
    await visible(page, "3 of 10 steps completed");
    assert.equal(state.posts, 1, "Reload resumes the existing job");
    progress(evaluation, "resource_execution");
    await visible(page, "7 of 10 steps completed");
    await screenshot(page, "03-evidence-simulated");
    state.failPolls = true;
    await page
      .getByText("Connection interrupted. Retrying progress updates…", { exact: true })
      .waitFor({ timeout: 15000 });
    await screenshot(page, "04-reconnecting-simulated");
    state.failPolls = false;
    progress(evaluation, "rule_assessment");
    await visible(page, "8 of 10 steps completed");
    assert.equal(state.posts, 1, "Connection failures do not submit another evaluation");
    evaluation.status = "succeeded";
    evaluation.progress = {
      stage: "saving",
      completed: stages,
      total: 10,
      updatedAt: new Date().toISOString(),
    };
    evaluation.result = report();
    progress(state.synthesis, "generating", ["preparing"], 4);
    await visible(page, "Evaluation saved");
    await visible(page, "1 of 4 steps completed", "synthesis-progress");
    await page
      .getByText("Saved report remains available during individual synthesis.", { exact: true })
      .waitFor();
    await screenshot(page, "05-report-and-synthesis-simulated");
    state.synthesis.status = "succeeded";
    state.synthesis.progress = {
      stage: "finalizing",
      completed: ["preparing", "generating", "validating", "finalizing"],
      total: 4,
      updatedAt: new Date().toISOString(),
    };
    state.synthesis.result = {
      schemaVersion: 2,
      generationStatus: "succeeded",
      people: [],
      limitations: [],
    };
    await visible(page, "Individual insights completed", "synthesis-progress");
    await screenshot(page, "06-completed-simulated");
  },
);

test(
  "navigation isolates groups and restores the active evaluation",
  { timeout: 25000 },
  async (t) => {
    const evaluation = job();
    progress(evaluation, "rule_understanding");
    const { page, state } = await setup(t, evaluation);
    await visible(page, "3 of 10 steps completed");
    await page.getByRole("button", { name: "Test group B", exact: true }).click();
    await page.getByRole("button", { name: "Generate Evaluation Report" }).waitFor();
    assert.equal(await page.getByTestId("evaluation-progress").count(), 0);
    await page.getByRole("button", { name: "Test group A", exact: true }).click();
    await visible(page, "3 of 10 steps completed");
    assert.equal(state.posts, 0);
  },
);

test("expiration retains the last stage and stops polling", { timeout: 20000 }, async (t) => {
  const evaluation = job();
  progress(evaluation, "resource_execution");
  evaluation.status = "failed";
  evaluation.error = "Generation expired or worker was interrupted. Submit a new job.";
  const { page, state } = await setup(t, evaluation);
  await visible(page, "Could not complete");
  await visible(page, "7 of 10 steps completed");
  await screenshot(page, "07-expired-simulated");
  const count = state.pollCount;
  await page.waitForTimeout(2500);
  assert.equal(state.pollCount, count, "Terminal jobs stop polling");
  assert.equal(state.posts, 0);
});

test(
  "permission failures stop automatic polling and allow a manual retry",
  { timeout: 25000 },
  async (t) => {
    const evaluation = job();
    progress(evaluation, "rule_assessment");
    const { page, state } = await setup(t, evaluation);
    state.forbidden = true;
    await visible(page, "Progress unavailable");
    const count = state.pollCount;
    await page.waitForTimeout(2500);
    assert.equal(state.pollCount, count);
    state.forbidden = false;
    await page.getByRole("button", { name: "Retry progress updates" }).click();
    await visible(page, "8 of 10 steps completed");
    assert.equal(state.posts, 0);
  },
);
