import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { savedGroupReport } from "./fixtures/workspace-people.mjs";

const base = process.env.EVALUATORS_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const root = "/organizations/org-a/workspaces/ws-a";
const project = root + "/groups/group-a";
const evidence = resolve("../artifacts/workspace-evaluators/implementation");
let browser;
before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(evidence, { recursive: true });
});
after(async () => browser?.close());
const prefs = () => ({
  version: 1,
  theme: "system",
  motion: "reduce",
  blocks: null,
  favorites: [],
  recent: [],
});

async function setup(
  t,
  {
    role = "owner",
    empty = false,
    mobile = false,
    reports = [],
    revisions = [],
    path = root + "?tab=evaluators&evaluatorId=shared-ada",
  } = {},
) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 },
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const voice = { id: "voice", name: "Direct", instruction: "Be direct." };
  const evaluator = {
    workspaceId: "ws-a",
    description: "A thoughtful look at collaboration.",
    effort: "MEDIUM",
    personalityId: "voice",
    personality: voice,
    evaluationEmphasis: [],
    evaluationNotes: null,
    rules: [
      {
        id: "rule",
        name: "Collaboration",
        description: "Look for shared ownership.",
        valuation: 5,
      },
    ],
    questions: [{ id: "question", text: "How does the team share ownership?" }],
    disabledKnowledgeNodeIds: ["legacy-document"],
    disabledResourceIds: ["legacy-resource"],
    reportBlocks: [{ id: "summary", kind: "SUMMARY" }],
  };
  const state = {
    reports,
    revisions,
    evaluators: empty
      ? []
      : [
          {
            ...structuredClone(evaluator),
            id: "shared-ada",
            name: "Ada",
            scope: "WORKSPACE",
            groupId: null,
            avatar: 15,
          },
          {
            ...structuredClone(evaluator),
            id: "grace",
            name: "Grace",
            scope: "WORKSPACE",
            groupId: null,
            avatar: 24,
          },
          {
            ...structuredClone(evaluator),
            id: "project-ada",
            name: "Ada",
            scope: "GROUP",
            groupId: "group-a",
            avatar: 33,
          },
          {
            ...structuredClone(evaluator),
            id: "linus",
            name: "Linus",
            scope: "GROUP",
            groupId: "group-a",
            avatar: 42,
          },
        ],
    writes: [],
    reads: [],
    voices: [voice],
    noSources: false,
    failList: false,
    failSave: false,
    setup: {
      version: 2,
      step: "evaluator",
      workspaceId: "ws-a",
      groupId: "group-a",
      evaluatorId: "shared-ada",
      dismissed: false,
      seen: true,
      completed: false,
      skipped: [],
      teamDraft: {
        creating: false,
        workspaceName: "",
        groupName: "",
        description: "",
        invitations: [],
      },
      resourceIds: ["resource"],
      resourcesInitialized: true,
      evaluatorDraft: null,
      period: { preset: "30" },
    },
  };
  const workspace = {
    id: "ws-a",
    organizationId: "org-a",
    name: "Product & Engineering",
    description: "Shared context for teams building what comes next.",
  };
  const group = {
    id: "group-a",
    workspaceId: "ws-a",
    name: "Platform team",
    description: "Build the platform, together.",
  };
  await page.route(/\/src\/lib\/auth\.tsx(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'export function AuthProvider({children}) {return children;} export function useAuth(){return {firebaseUser:{uid:"test-user",email:"alex@example.test",displayName:"Alex Rivera"},isLoading:false,signOut:async()=>{}};}',
    }),
  );
  await page.route(/\/src\/lib\/firebase\.ts(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'export const firebaseApp={}; export const googleProvider={}; export function getFirebaseAuth(){return {authStateReady:async()=>{},currentUser:{getIdToken:async()=>"simulated-token"}};}',
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    let status = 200,
      data = [];
    if (method === "GET") state.reads.push(path + url.search);
    else
      state.writes.push({ path, method, body: request.postData() ? request.postDataJSON() : null });
    const member = (memberRole) => [
      {
        userId: "user-a",
        role: memberRole,
        user: {
          id: "user-a",
          firebaseUid: "test-user",
          name: "Alex Rivera",
          email: "alex@example.test",
        },
      },
    ];
    if (path === "/users/me")
      data = {
        id: "user-a",
        firebaseUid: "test-user",
        name: "Alex Rivera",
        email: "alex@example.test",
      };
    else if (path.endsWith("/preferences")) data = prefs();
    else if (path.endsWith("/appearance"))
      data = {
        version: 1,
        color: "#7560e3",
        cover: "",
        blocks: ["welcome", "setup"],
        canEdit: role === "owner",
      };
    else if (path.endsWith("/me/setup")) {
      if (method === "PATCH") state.setup = request.postDataJSON();
      data = state.setup;
    } else if (path === "/organizations") data = [{ id: "org-a", name: "Northstar Studio" }];
    else if (path === "/organizations/org-a") data = { id: "org-a", name: "Northstar Studio" };
    else if (path.endsWith("/workspaces")) data = [workspace];
    else if (path === "/workspaces/ws-a") data = workspace;
    else if (path.endsWith("/groups")) data = empty ? [] : [group];
    else if (path === "/groups/group-a") data = group;
    else if (path.endsWith("/members")) {
      data =
        role === "owner"
          ? member("OWNER")
          : role === "viewer"
            ? member("VIEWER")
            : path.startsWith("/groups/")
              ? member("ADMIN")
              : [];
    } else if (path.endsWith("/personalities")) {
      if (method === "POST") state.voices.push({ id: "voice-new", ...request.postDataJSON() });
      data = method === "POST" ? state.voices.at(-1) : state.voices;
    } else if (/\/evaluators$/.test(path)) {
      if (state.failList) {
        status = 503;
        data = { message: "Evaluator list unavailable" };
      } else if (method === "POST") {
        const body = request.postDataJSON();
        data = {
          ...body,
          id: "created-" + state.evaluators.length,
          workspaceId: "ws-a",
          groupId: body.scope === "GROUP" ? "group-a" : null,
          personality: voice,
          rules: (body.rules ?? []).map((r, i) => ({ ...r, id: "new-rule-" + i })),
          questions: (body.questions ?? []).map((q, i) => ({ ...q, id: "new-question-" + i })),
          disabledKnowledgeNodeIds: body.disabledKnowledgeNodeIds ?? [],
          disabledResourceIds: body.disabledResourceIds ?? [],
        };
        state.evaluators.push(data);
      } else
        data = state.evaluators.filter((item) =>
          path.startsWith("/workspaces/")
            ? item.scope === "WORKSPACE"
            : item.scope === "WORKSPACE" || item.groupId === "group-a",
        );
    } else if (path.startsWith("/evaluators/")) {
      const current = state.evaluators.find((item) => item.id === path.split("/").at(-1));
      if (state.failSave) {
        status = 503;
        data = { message: "Save unavailable" };
      } else if (method === "DELETE") {
        state.evaluators = state.evaluators.filter((item) => item !== current);
        data = null;
      } else {
        Object.assign(current, request.postDataJSON());
        data = current;
      }
    } else if (path === "/knowledge") {
      const document = {
        id: "workspace-doc",
        name: "Workspace handbook",
        kind: "DOCUMENT",
        groupId: null,
        inherited: url.searchParams.has("groupId"),
        excluded: false,
        usage: "CONTEXT",
        status: "READY",
        canRead: true,
        canUseInReports: true,
      };
      data = {
        canManage: role === "owner",
        nodes: state.noSources
          ? []
          : [
              document,
              ...(url.searchParams.has("groupId")
                ? [
                    {
                      ...document,
                      id: "project-doc",
                      name: "Project notes",
                      groupId: "group-a",
                      inherited: false,
                    },
                  ]
                : []),
            ],
      };
    } else if (path.endsWith("/resources")) {
      data = state.noSources
        ? []
        : [
            {
              id: "resource",
              name: "platformance/app",
              type: "github_repository",
              active: true,
              pluginInstallation: { id: "plugin", name: "GitHub", status: "ACTIVE" },
            },
          ];
    } else if (path.endsWith("/reports")) {
      data = state.reports;
    } else if (path.endsWith("/revisions")) {
      data = state.revisions;
    } else if (path.endsWith("/people")) {
      data = { evaluators: state.evaluators, evaluatorId: "shared-ada", groups: [] };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  t.after(() => assert.deepEqual(errors, [], "No browser runtime errors"));
  await page.goto(base + path);
  return { page, state };
}

test(
  "merged dashboard opens saved reports and exports legacy PDFs",
  { timeout: 60000 },
  async (t) => {
    const report = {
      id: "legacy-report",
      groupId: "group-a",
      type: "GROUP_REPORT",
      createdAt: "2026-11-05T12:00:00Z",
      data: savedGroupReport,
    };
    const { page } = await setup(t, { path: project, reports: [report] });
    await page.getByRole("heading", { name: "Project overview", exact: true }).waitFor();
    await page.getByText("No numeric scores are available yet.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "View full report", exact: true }).click();
    await page.waitForURL("**tab=reports&reportId=legacy-report");
    await page.getByText(savedGroupReport.summary, { exact: true }).waitFor();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), "platform-team-group-report-2026-11-05.pdf");
    const bytes = await readFile(await download.path());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(bytes.length > 1000);
  },
);

test("merged dashboard and PDF support partial report blocks", { timeout: 60000 }, async (t) => {
  const report = {
    id: "block-report",
    groupId: "group-a",
    type: "GROUP_REPORT",
    createdAt: "2026-11-05T12:00:00Z",
    data: {
      blocks: [
        { id: "overall", kind: "OVERALL", overallAssessment: savedGroupReport.overallAssessment },
        {
          id: "custom",
          kind: "CUSTOM",
          title: "Release outlook",
          summary: "Keep release checks visible.",
          positiveSignals: [],
          concerns: [],
          limitations: [],
        },
        {
          id: "questions",
          kind: "QUESTIONS",
          questionAnswers: [{ question: "What comes next?", answer: "Review the release checks." }],
        },
      ],
      evidence: [],
    },
  };
  const { page } = await setup(t, { path: project, reports: [report] });
  await page.getByRole("heading", { name: "Project overview", exact: true }).waitFor();
  await page.getByText("No people assessments are available.", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "View full report", exact: true }).click();
  await page.getByText("Release outlook", { exact: true }).waitFor();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const download = await downloading;
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length > 1000);
});

test(
  "merged dashboard handles reports without overall assessment",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, {
      path: project,
      reports: [
        {
          id: "summary-only",
          type: "GROUP_REPORT",
          data: {
            blocks: [{ id: "summary", kind: "SUMMARY", summary: "A short assessment." }],
            evidence: [],
          },
        },
      ],
    });
    await page.getByText("No dashboard data yet", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Open evaluators", exact: true }).first().click();
    await page.waitForURL((url) => url.searchParams.get("tab") === "evaluation");
    await page.getByRole("button", { name: /^Ada/ }).first().waitFor();
    assert.equal(state.writes.filter((item) => item.path.endsWith("/reports")).length, 0);
  },
);

test("merged PDF exports the selected report revision", { timeout: 60000 }, async (t) => {
  const report = {
    id: "revised-report",
    type: "GROUP_REPORT",
    createdAt: "2026-11-05T12:00:00Z",
    data: savedGroupReport,
  };
  const original = { ...savedGroupReport, summary: "The original saved assessment." };
  const { page } = await setup(t, {
    path: project + "?tab=reports&reportId=revised-report",
    reports: [report],
    revisions: [
      {
        id: "revision-1",
        position: 0,
        createdAt: "2026-10-01T12:00:00Z",
        data: original,
        notes: [],
      },
      { id: "revision-2", position: 1, createdAt: report.createdAt, data: report.data, notes: [] },
    ],
  });
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByText(original.summary, { exact: true }).waitFor();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), "platform-team-group-report-2026-10-01.pdf");
  assert.equal((await readFile(await download.path())).subarray(0, 5).toString(), "%PDF-");
});

test(
  "shared edits refresh cached project choices through SPA navigation",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, {
      path: project + "?tab=evaluation&evaluatorId=shared-ada",
    });
    await page.getByRole("link", { name: "Manage in workspace" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Updated shared Ada");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Save anyway", exact: true }).click();
    await page.getByText("Evaluator saved", { exact: true }).waitFor();
    await page.getByRole("button", { name: /^Projects/ }).click();
    await page.getByRole("link", { name: /Platform team/ }).click();
    await page.getByRole("button", { name: "Evaluators", exact: true }).click();
    await sharedSection(page)
      .getByRole("button", { name: /^Updated shared Ada/ })
      .waitFor();
    assert.equal(state.evaluators.filter((item) => item.scope === "WORKSPACE").length, 2);
  },
);

test(
  "list errors can be retried and report/people selectors expose both levels",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByLabel("Name", { exact: true }).waitFor();
    state.failList = true;
    await page.reload();
    await page.getByText("Evaluator list unavailable", { exact: true }).waitFor();
    state.failList = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).waitFor();
    await page.goto(base + root + "?tab=people");
    await page.getByRole("combobox", { name: "Evaluator", exact: true }).click();
    assert.equal(
      await page.getByRole("option", { name: /Ada.*Workspace.*Product & Engineering/ }).count(),
      1,
    );
    assert.equal(await page.getByRole("option", { name: /Ada.*Project/ }).count(), 1);
    await page.keyboard.press("Escape");
    await page.goto(base + project + "?tab=reports");
    await page.getByRole("button", { name: /Ada.*Workspace/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Ada.*Project/ }).count(), 1);
  },
);

async function shot(page, name) {
  await page.evaluate(() => {
    const marker = document.createElement("div");
    marker.textContent = "IMPLEMENTATION / SIMULATED API DATA";
    marker.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;padding:4px;background:#fef3c7;color:#78350f;font:10px system-ui;text-align:center;z-index:99999";
    document.body.appendChild(marker);
  });
  await page.screenshot({ path: resolve(evidence, name + ".png"), fullPage: true });
}
const sharedSection = (page) => page.getByRole("region", { name: "From workspace", exact: true });
const localSection = (page) =>
  page.getByRole("region", { name: "Project evaluators", exact: true });

test(
  "workspace edits, scoped sources, legacy exclusions and inherited cache refresh",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByLabel("Name", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Ada");
    assert.equal(
      await page
        .getByRole("region", { name: "Workspace evaluators", exact: true })
        .getByRole("button")
        .count(),
      2,
    );
    await shot(page, "01-workspace-evaluators");
    await page.getByLabel("Name", { exact: true }).fill("Ada shared");
    await page.getByRole("button", { name: "Configure", exact: true }).click();
    await page.getByRole("dialog").getByText("Workspace handbook", { exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").getByText("Project notes").count(), 0);
    await page.getByRole("dialog").getByText("Workspace handbook", { exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Save anyway" }).click();
    await page.getByText("Evaluator saved", { exact: true }).waitFor();
    const saved = state.evaluators.find((item) => item.id === "shared-ada");
    assert.deepEqual(saved.disabledKnowledgeNodeIds, ["legacy-document", "workspace-doc"]);
    assert.deepEqual(saved.disabledResourceIds, ["legacy-resource"]);
    await page.goto(base + project + "?tab=evaluation&evaluatorId=shared-ada");
    await sharedSection(page)
      .getByRole("button", { name: /^Ada shared/ })
      .waitFor();
    assert.equal(await page.getByLabel("Name", { exact: true }).count(), 0);
    assert.equal(state.writes.filter((r) => r.path.endsWith("/reports")).length, 0);
  },
);

test(
  "workspace creation works without projects and becomes available to projects",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, { empty: true, path: root + "?tab=evaluators" });
    await page.getByRole("heading", { name: "No evaluators yet" }).waitFor();
    await page
      .getByRole("button", { name: "New workspace evaluator", exact: true })
      .first()
      .click();
    await page.getByLabel("Name", { exact: true }).fill("Morgan");
    await shot(page, "02-create-workspace-evaluator");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByText("Evaluator created", { exact: true }).waitFor();
    assert.equal(state.evaluators[0].scope, "WORKSPACE");
    assert.equal(state.evaluators[0].groupId, null);
    assert.equal(
      state.writes.some((r) => r.path === "/workspaces/ws-a/evaluators"),
      true,
    );
    await page.goto(base + project + "?tab=evaluation");
    await sharedSection(page)
      .getByRole("button", { name: /^Morgan/ })
      .waitFor();
  },
);

test(
  "project separates duplicate names, preserves permissions and deep links to shared origin",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, {
      role: "project-admin",
      path: project + "?tab=evaluation&evaluatorId=project-ada",
    });
    await page.getByLabel("Name", { exact: true }).waitFor();
    assert.equal(await localSection(page).getByRole("button", { name: /^Ada / }).count(), 1);
    assert.equal(await sharedSection(page).getByRole("button", { name: /^Ada / }).count(), 1);
    await shot(page, "03-project-evaluators");
    await sharedSection(page).getByRole("button", { name: /^Ada/ }).click();
    await page.getByText("Shared from Product & Engineering", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Delete", exact: true }).count(), 0);
    assert.equal(await page.locator("[draggable=true]").count(), 0);
    await page
      .getByText("Workspace admin permissions required to edit.", { exact: true })
      .waitFor();
    await shot(page, "04-inherited-workspace-evaluator");
    await page.getByRole("link", { name: "Manage in workspace" }).click();
    await page.waitForURL(/tab=evaluators&evaluatorId=shared-ada/);
    await page.getByRole("heading", { name: "Ada", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "New workspace evaluator", exact: true }).count(),
      0,
    );
    assert.equal(
      state.writes.some((r) => r.path.startsWith("/evaluators/")),
      false,
    );
  },
);

test(
  "project creation uses GROUP scope and viewers cannot create or edit",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, {
      role: "project-admin",
      path: project + "?tab=evaluation",
    });
    await page.getByRole("button", { name: "New project evaluator", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Local evaluator");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByText("Evaluator created", { exact: true }).waitFor();
    assert.equal(state.evaluators.at(-1).scope, "GROUP");
    assert.equal(state.evaluators.at(-1).groupId, "group-a");
    const viewer = await setup(t, {
      role: "viewer",
      path: project + "?tab=evaluation&evaluatorId=project-ada",
    });
    await viewer.page.getByRole("heading", { name: "Ada", exact: true }).waitFor();
    assert.equal(await viewer.page.getByRole("button", { name: /^New .* evaluator$/ }).count(), 0);
    assert.equal(await viewer.page.getByLabel("Name", { exact: true }).count(), 0);
  },
);

test(
  "setup groups levels, links configuration, selects without running and creates a project copy",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, {
      role: "project-admin",
      path: "/organizations/org-a/setup/evaluator",
    });
    await sharedSection(page).getByRole("button", { name: /^Ada/ }).waitFor();
    await sharedSection(page).getByRole("button", { name: /^Ada/ }).click();
    const configuration = page.getByRole("link", { name: "View evaluator configuration" });
    assert.equal(
      await configuration.getAttribute("href"),
      root + "?tab=evaluators&evaluatorId=shared-ada",
    );
    await page.getByText(/Choosing an evaluator does not start/).waitFor();
    await shot(page, "05-setup-evaluator-selection");
    assert.equal(state.writes.filter((r) => r.path.endsWith("/reports")).length, 0);
    await page.getByRole("button", { name: "Customize a copy", exact: true }).click();
    await page.getByText("New copy in Platform team", { exact: true }).waitFor();
    await page.getByLabel("Name", { exact: true }).fill("Ada project copy");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(/setup\/review/);
    const copy = state.evaluators.at(-1);
    assert.equal(copy.name, "Ada project copy");
    assert.equal(copy.scope, "GROUP");
    assert.equal(copy.groupId, "group-a");
    assert.equal(state.evaluators.find((item) => item.id === "shared-ada").name, "Ada");
    assert.equal(state.writes.filter((r) => r.path.endsWith("/reports")).length, 0);
  },
);

test(
  "invalid selection stays explicit, deletion reconciles selection and save failure preserves draft",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, {
      path: root + "?tab=evaluators&evaluatorId=foreign-evaluator",
    });
    await page.getByText(/This evaluator is no longer available/).waitFor();
    await page
      .getByRole("region", { name: "Workspace evaluators", exact: true })
      .getByRole("button", { name: /^Ada/ })
      .click();
    await page.getByLabel("Name", { exact: true }).fill("Unsaved draft");
    state.failSave = true;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Save anyway" }).click();
    await page.getByText("Save unavailable", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Unsaved draft");
    state.failSave = false;
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector("#evaluator-name")?.value === "Grace");
    assert.equal(
      state.evaluators.some((item) => item.id === "shared-ada"),
      false,
    );
  },
);

test(
  "mobile scoped lists fit, workspace personality creation and empty sources",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, { mobile: true });
    await page.getByLabel("Name", { exact: true }).waitFor();
    await shot(page, "06-workspace-mobile");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.getByLabel("Name", { exact: true }).fill("Ada draft");
    await page.getByRole("button", { name: "New", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("Coaching");
    await dialog.getByLabel("Instruction").fill("Offer practical suggestions.");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByText("Personality created", { exact: true }).waitFor();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Ada draft");
    assert.equal(
      state.writes.some((r) => r.path === "/workspaces/ws-a/personalities"),
      true,
    );
    state.noSources = true;
    await page.reload();
    await page.getByRole("button", { name: "Configure", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByText("No plugin resources assigned to this workspace.", { exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await page.goto(base + project + "?tab=evaluation&evaluatorId=shared-ada");
    await page.getByText("Shared from Product & Engineering", { exact: true }).waitFor();
    await shot(page, "07-project-mobile");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  },
);
