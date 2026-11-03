import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { savedGroupReport } from "./fixtures/workspace-people.mjs";
const base = process.env.KNOWLEDGE_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const evidence = resolve("../artifacts/knowledge-base/implementation/ui");
let browser;
before(async () => {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });
  if (process.env.UI_TEST_SCREENSHOTS !== "0") await mkdir(evidence, { recursive: true });
});
after(async () => {
  await browser?.close();
});
const root = "/organizations/org-a/workspaces/ws-a";
const project = root + "/groups/group-a";
const preferences = () => ({
  version: 1,
  theme: "system",
  motion: "reduce",
  blocks: null,
  favorites: [],
  recent: [],
});
function initialNodes() {
  const node = {
    workspaceId: "ws-a",
    groupId: null,
    parentId: null,
    connectionId: null,
    name: "Project brief.pdf",
    kind: "DOCUMENT",
    origin: "UPLOAD",
    usage: "CONTEXT",
    status: "READY",
    mimeType: "text/plain",
    bytes: 1200,
    sourceUrl: null,
    sourceRevision: "v1",
    error: null,
    syncedAt: null,
    updatedAt: "2026-11-03T10:00:00Z",
    version: {
      id: "version-brief",
      revision: "v1",
      digest: "test-digest",
      createdAt: "2026-11-02T10:00:00Z",
      bytes: 1200,
      mimeType: "text/plain",
    },
  };
  return [
    { ...node, id: "folder", name: "Documentation", kind: "FOLDER", version: null },
    { ...node, id: "brief", parentId: "folder" },
    {
      ...node,
      id: "architecture",
      name: "Architecture decisions.docx",
      parentId: "folder",
      usage: "BOTH",
      version: { ...node.version, id: "version-architecture" },
    },
    { ...node, id: "processing", name: "Workshop slides.pdf", status: "PROCESSING", version: null },
    {
      ...node,
      id: "sprint",
      name: "Sprint review.pdf",
      usage: "EVIDENCE",
      groupId: "group-a",
      version: { ...node.version, id: "version-sprint" },
    },
  ];
}
async function setup(t, { mobile = false, viewer = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 },
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  const state = {
    nodes: initialNodes(),
    excluded: new Set(),
    uploads: 0,
    selection: null,
    driveSelection: null,
    failUpload: false,
    reports: [],
    reconnect: false,
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
      body: 'export const firebaseApp={};export const googleProvider={};export function getFirebaseAuth(){return {authStateReady:async()=>{},currentUser:{getIdToken:async()=>"simulated-token"}};}',
    }),
  );
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace(/^\/api/, ""),
      method = req.method();
    let data = [];
    let status = 200;
    if (path === "/users/me")
      data = {
        id: "user-a",
        firebaseUid: "test-user",
        name: "Alex Rivera",
        email: "alex@example.test",
      };
    else if (path.endsWith("/preferences"))
      data = method === "PATCH" ? req.postDataJSON() : preferences();
    else if (path.endsWith("/appearance"))
      data = { version: 1, color: "#7262d9", cover: "", blocks: [], canEdit: !viewer };
    else if (path.endsWith("/me/setup"))
      data = {
        version: 1,
        step: 0,
        workspaceId: "ws-a",
        groupId: "group-a",
        dismissed: true,
        seen: true,
      };
    else if (path === "/organizations") data = [{ id: "org-a", name: "Northstar Studio" }];
    else if (path === "/organizations/org-a") data = { id: "org-a", name: "Northstar Studio" };
    else if (path === "/workspaces/ws-a")
      data = {
        id: "ws-a",
        organizationId: "org-a",
        name: "Product & Engineering",
        description: "Shared context for teams building what comes next.",
      };
    else if (path.endsWith("/workspaces"))
      data = [{ id: "ws-a", organizationId: "org-a", name: "Product & Engineering" }];
    else if (path.endsWith("/groups"))
      data = [{ id: "group-a", workspaceId: "ws-a", name: "Platform team" }];
    else if (path === "/groups/group-a")
      data = { id: "group-a", workspaceId: "ws-a", name: "Platform team" };
    else if (path.endsWith("/members"))
      data = [
        {
          userId: "user-a",
          role: viewer ? "VIEWER" : "OWNER",
          user: {
            id: "user-a",
            firebaseUid: "test-user",
            name: "Alex Rivera",
            email: "alex@example.test",
          },
        },
      ];
    else if (path === "/knowledge") {
      const group = url.searchParams.get("groupId");
      data = {
        canManage: !viewer,
        nodes: state.nodes
          .filter((n) => !n.deleted && (!n.groupId || n.groupId === group))
          .map((n) => ({
            ...n,
            inherited: Boolean(group && !n.groupId),
            excluded: Boolean(
              group && (state.excluded.has(n.id) || (n.parentId && state.excluded.has(n.parentId))),
            ),
            directlyExcluded: Boolean(group && state.excluded.has(n.id)),
          })),
      };
    } else if (path === "/knowledge/folders" && method === "POST") {
      const b = req.postDataJSON();
      data = {
        ...state.nodes[0],
        id: "new-folder-" + state.nodes.length,
        name: b.name,
        parentId: b.parentId ?? null,
        groupId: b.groupId ?? null,
      };
      state.nodes.push(data);
    } else if (path === "/knowledge/uploads") {
      if (state.failUpload) {
        status = 503;
        data = { message: "Upload connection interrupted. Retry this file." };
        state.failUpload = false;
      } else {
        state.uploads++;
        data = { id: "uploaded-" + state.uploads, status: "PROCESSING" };
        state.nodes.push({
          ...state.nodes[0],
          id: data.id,
          name: "Uploaded requirements.txt",
          kind: "DOCUMENT",
          parentId: null,
          status: "PROCESSING",
          version: null,
        });
      }
    } else if (/^\/knowledge\/projects\/[^/]+\/exclusions\//.test(path)) {
      const id = path.split("/").at(-1);
      if (req.postDataJSON().excluded) state.excluded.add(id);
      else state.excluded.delete(id);
      data = {};
    } else if (/^\/knowledge\/nodes\/[^/]+$/.test(path)) {
      const n = state.nodes.find((n) => n.id === path.split("/").at(-1));
      if (method === "PATCH") Object.assign(n, req.postDataJSON());
      if (method === "DELETE") n.deleted = true;
      data = {
        ...n,
        canManage: !viewer,
        version: n?.version
          ? {
              ...n.version,
              text: "Captured project requirements. This is fictional browser-test content.",
            }
          : null,
      };
    } else if (path === "/knowledge/drive/connections")
      data = {
        configured: true,
        connections: [
          {
            id: "drive-1",
            workspaceId: "ws-a",
            groupId: null,
            email: "alex@example.test",
            rootIds: ["course"],
            destinationId: null,
            usage: "CONTEXT",
            status: state.reconnect ? "RECONNECT" : "CONNECTED",
            lastSyncedAt: "2026-11-03T10:30:00Z",
            nextSyncAt: "2026-11-03T10:35:00Z",
            error: state.reconnect ? "Authorization expired. Reconnect the account." : null,
          },
        ],
      };
    else if (path === "/knowledge/drive/connections/drive-1/files")
      data = {
        files: [
          {
            id: "course",
            name: "Course materials",
            mimeType: "application/vnd.google-apps.folder",
            supported: true,
          },
          {
            id: "drive-brief",
            name: "Project objectives",
            mimeType: "application/vnd.google-apps.document",
            supported: true,
          },
          { id: "unsupported", name: "Video.mov", mimeType: "video/quicktime", supported: false },
        ],
      };
    else if (path.endsWith("/selection")) {
      state.driveSelection = req.postDataJSON();
      data = { id: "drive-1", status: "QUEUED" };
    } else if (path.endsWith("/sync")) data = { status: "QUEUED" };
    else if (path.endsWith("/resources"))
      data = [{ id: "resource-1", name: "platform-api", type: "github.repository", active: true }];
    else if (path.endsWith("/evaluators"))
      data = [
        {
          id: "e1",
          name: "Balanced",
          scope: "WORKSPACE",
          workspaceId: "ws-a",
          avatar: 0,
          effort: "MEDIUM",
          personality: { name: "Neutral" },
          rules: [],
          questions: [],
        },
      ];
    else if (path === "/groups/group-a/reports" && method === "POST") {
      state.selection = req.postDataJSON();
      data = { jobs: [{ jobId: "job-1", evaluatorId: "e1", status: "queued" }] };
    } else if (path.endsWith("/reports")) data = state.reports;
    else if (path.endsWith("/generation-jobs/job-1"))
      data = {
        jobId: "job-1",
        status: "running",
        stage: "generating",
        kind: "group_report",
        progress: {
          stage: "generating",
          completedStages: ["preparing", "collecting_evidence"],
          totalSteps: 4,
          updatedAt: new Date().toISOString(),
        },
      };
    else if (path.endsWith("/generation-jobs")) data = [];
    else if (path.endsWith("/revisions"))
      data = state.reports.map((r) => ({
        id: "revision-1",
        position: 0,
        data: r.data,
        notes: [],
        createdAt: r.createdAt,
      }));
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  async function shot(name) {
    if (process.env.UI_TEST_SCREENSHOTS === "0") return;
    await page.evaluate(() => {
      if (!document.getElementById("knowledge-test-label")) {
        const label = document.createElement("div");
        label.id = "knowledge-test-label";
        label.textContent = "UI TEST / SIMULATED API RESPONSES / NOT A LIVE EVALUATION";
        label.style.cssText =
          "position:fixed;bottom:0;left:0;right:0;z-index:100;background:#fff4c6;padding:5px;text-align:center;font-size:9px;color:#856b24";
        document.body.append(label);
      }
    });
    await page.screenshot({ path: resolve(evidence, name + ".png"), fullPage: true });
  }
  return { page, state, shot };
}
test("knowledge library separates plugins, creates folders, retries uploads and previews files", async (t) => {
  const { page, state, shot } = await setup(t);
  await page.goto(base + root + "?tab=resources");
  await page.getByRole("heading", { name: "Knowledge base", exact: true }).waitFor();
  await page.getByRole("button", { name: "Plugin resources", exact: true }).click();
  await page.getByText("Assigned resources", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Knowledge base", exact: true }).click();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder or source name" }).fill("Research references");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await page.getByRole("button", { name: "Research references", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await page.getByRole("menuitem", { name: "Upload files", exact: true }).click();
  await page
    .getByLabel("Choose knowledge files")
    .setInputFiles({
      name: "requirements.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Fictional upload"),
    });
  state.failUpload = true;
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await page.getByText("Upload failed", { exact: true }).waitFor();
  await shot("01-upload-retry");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("Uploaded · Processing", { exact: true }).waitFor();
  assert.equal(state.uploads, 1);
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Search knowledge sources" }).fill("brief");
  await page.getByRole("button", { name: /^Project brief.pdf/ }).click();
  await page.getByText("Captured project requirements.", { exact: false }).waitFor();
  await shot("02-document-details");
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Search knowledge sources" }).fill("");
  await shot("03-workspace-library");
});
test("project exclusions and explicit report source selection are sent to report generation", async (t) => {
  const { page, state, shot } = await setup(t);
  await page.goto(base + project + "?tab=resources");
  await page.getByRole("heading", { name: "Knowledge base", exact: true }).waitFor();
  await page.getByRole("button", { name: "Exclude", exact: true }).first().click();
  await page.getByRole("button", { name: "Include", exact: true }).first().waitFor();
  assert.equal(state.excluded.has("folder"), true);
  await shot("04-project-library");
  await page.getByRole("button", { name: "Include", exact: true }).first().click();
  await page.goto(base + project + "?tab=reports");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByTestId("knowledge-source-picker").waitFor();
  await page
    .getByRole("checkbox", { name: "Use Architecture decisions.docx", exact: true })
    .uncheck();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Select Documentation", exact: true })
      .getAttribute("data-state"),
    "indeterminate",
  );
  await shot("05-report-source-selection");
  await page
    .getByRole("checkbox", { name: "Use Workshop slides.pdf", exact: true })
    .isDisabled()
    .then((value) => assert.equal(value, true));
  await page.getByRole("dialog").getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="knowledge-source-picker"]'),
  );
  assert.deepEqual(state.selection.knowledgeSelection, { sourceIds: ["brief", "sprint"] });
});
test("Drive picker supports folder and file selection, disabled formats and connection status", async (t) => {
  const { page, state, shot } = await setup(t);
  await page.goto(base + root + "?tab=resources");
  await page.getByRole("heading", { name: "Knowledge base", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await page.getByRole("menuitem", { name: "Connect Google Drive", exact: true }).click();
  await page.getByRole("checkbox", { name: "Connect Course materials", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("checkbox", { name: "Connect Video.mov", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("checkbox", { name: "Connect Course materials", exact: true }).uncheck();
  assert.equal(
    await page.getByRole("button", { name: "Connect selected", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("checkbox", { name: "Connect Project objectives", exact: true }).check();
  await shot("06-drive-picker");
  await page.getByRole("button", { name: "Connect selected", exact: true }).click();
  await page.getByRole("heading", { name: "Connections", exact: true }).waitFor();
  assert.deepEqual(state.driveSelection.rootIds, ["drive-brief"]);
  await shot("07-connections");
});
test("saved report exposes immutable document references and the exact supplied excerpts", async (t) => {
  const { page, state, shot } = await setup(t);
  state.reports = [
    {
      id: "r1",
      groupId: "group-a",
      evaluatorId: "e1",
      type: "GROUP_REPORT",
      createdAt: "2026-11-03T10:42:00Z",
      data: {
        ...structuredClone(savedGroupReport),
        evaluator: { id: "e1", name: "Balanced" },
        knowledgeSources: {
          capturedAt: "2026-11-03T10:40:00Z",
          unavailable: 1,
          sources: [
            {
              id: "brief",
              versionId: "version-brief",
              name: "Project brief.pdf",
              usage: "CONTEXT",
              scope: "workspace",
              origin: "UPLOAD",
              revision: "v1",
              digest: "sha",
              totalCharacters: 200,
              includedCharacters: 60,
              excerpts: [
                {
                  reference: "knowledge:version-brief:0",
                  offset: 0,
                  text: "Original captured requirement. Later document edits are absent.",
                },
              ],
            },
          ],
        },
      },
    },
  ];
  await page.goto(base + project + "?tab=reports&reportId=r1");
  await page.getByRole("heading", { name: "Knowledge used", exact: true }).waitFor();
  await page.getByRole("button", { name: /Project brief.pdf/ }).click();
  await page
    .getByText("Original captured requirement. Later document edits are absent.", { exact: true })
    .waitFor();
  await shot("08-saved-report-references");
});
test("mobile knowledge and source selection fit the viewport; viewers cannot manage knowledge", async (t) => {
  const { page, shot } = await setup(t, { mobile: true });
  await page.goto(base + root + "?tab=resources");
  await page.getByRole("heading", { name: "Knowledge base", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await shot("09-mobile-library");
  await page.goto(base + project + "?tab=reports");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByTestId("knowledge-source-picker").waitFor();
  await page.getByRole("button", { name: "Deselect all", exact: true }).click();
  await page.getByText("No knowledge selected.", { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await shot("10-mobile-source-selection");
  const viewer = await setup(t, { viewer: true });
  await viewer.page.goto(base + root + "?tab=resources");
  await viewer.page.getByRole("heading", { name: "Knowledge base", exact: true }).waitFor();
  assert.equal(
    await viewer.page.getByRole("button", { name: "Add sources", exact: true }).count(),
    0,
  );
  await viewer.shot("11-viewer-library");
});
