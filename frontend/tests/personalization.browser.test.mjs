import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { savedGroupReport, workspacePeople } from "./fixtures/workspace-people.mjs";
const base = process.env.PROGRESS_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const evidence = resolve("../artifacts/personalization/revision-simulated");
let browser;
before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  if (process.env.UI_TEST_SCREENSHOTS !== "0") await mkdir(evidence, { recursive: true });
});
after(async () => {
  await browser?.close();
});
const prefs = () => ({
  version: 1,
  theme: "system",
  motion: "system",
  blocks: null,
  favorites: [],
  recent: [],
});
async function setup(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = {
    personal: prefs(),
    orgPrefs: prefs(),
    appearance: {
      version: 1,
      color: "#7262d9",
      cover: "",
      blocks: ["setup", "welcome", "favorites", "recent", "evaluations"],
      canEdit: true,
    },
    setup: {
      version: 1,
      step: 0,
      workspaceId: "",
      groupId: "",
      dismissed: false,
      seen: options.firstVisit !== true,
    },
    profile: {
      id: "user-a",
      firebaseUid: "test-user",
      name: "Alex Rivera",
      email: "alex@example.test",
      photoUrl: "avatar:iris",
    },
    posts: 0,
    noResources: false,
    setupSaveFails: false,
    mcpClients: [],
    connections: [
      {
        id: "inst-a",
        pluginId: "github",
        name: "acme-team",
        status: "ACTIVE",
        lastSyncedAt: "2026-11-01T00:00:00Z",
      },
    ],
    assigned: ["res-a"],
    evaluatorCopies: [],
    activeReports: [],
    saveFails: false,
    createFails: false,
    spaces: [],
    uploadFails: false,
  };
  await page.route(/\/src\/lib\/auth\.tsx(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'export function AuthProvider({children}) { return children; } export function useAuth() { return { firebaseUser: {uid:"test-user", displayName:"Alex Rivera", email:"alex@example.test"}, isLoading:false, signOut:async()=>{} }; }',
    }),
  );
  await page.route(/\/src\/lib\/firebase\.ts(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'export const firebaseApp={}; export const googleProvider={}; export function getFirebaseAuth(){return {authStateReady:async()=>{},currentUser:{getIdToken:async()=>"simulated-token"}};}',
    }),
  );
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace(/^\/api/, ""),
      patch = req.method() === "PATCH";
    let data = {},
      status = 200;
    if (path === "/knowledge") data = { canManage: true, nodes: [] };
    else if (path === "/knowledge/drive/connections") data = { configured: false, connections: [] };
    else if (path.endsWith("/team-space")) {
      if (state.createFails) {
        status = 503;
        data = { message: "Creation temporarily unavailable" };
      } else {
        const body = req.postDataJSON();
        const workspace = { id: "new-space", name: body.workspaceName };
        const group = { id: "new-group", workspaceId: workspace.id, name: body.groupName };
        state.spaces.push(workspace);
        data = { workspace, group };
      }
    } else if (path === "/users/me/personalization") {
      if (state.saveFails) {
        status = 503;
        data = { message: "Save temporarily unavailable" };
      } else {
        const body = req.postDataJSON();
        Object.assign(state.profile, body.profile);
        Object.assign(state.personal, body.personal);
        Object.assign(state.orgPrefs, body.home);
        if (body.organization) Object.assign(state.appearance, body.organization.appearance);
        data = { saved: true };
      }
    } else if (path === "/users/me") {
      if (patch) Object.assign(state.profile, req.postDataJSON());
      data = state.profile;
    } else if (path === "/users/me/preferences") {
      if (patch) state.personal = req.postDataJSON();
      data = state.personal;
    } else if (path.endsWith("/me/preferences")) {
      if (patch) state.orgPrefs = req.postDataJSON();
      data = state.orgPrefs;
    } else if (path.endsWith("/appearance")) {
      if (patch) Object.assign(state.appearance, req.postDataJSON());
      data = state.appearance;
    } else if (path.endsWith("/me/setup")) {
      if (patch && state.setupSaveFails)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Setup save unavailable" }),
        });
      if (patch) state.setup = req.postDataJSON();
      data = state.setup;
    } else if (path === "/organizations")
      data = [
        {
          id: "org-a",
          name: "Northstar Studio",
          description: "Build thoughtfully. Grow together.",
        },
        { id: "org-b", name: "Fieldwork" },
      ];
    else if (/^\/organizations\/[^/]+$/.test(path))
      data = {
        id: "org-a",
        name: "Northstar Studio",
        description: "Build thoughtfully. Grow together.",
      };
    else if (path.endsWith("/workspaces"))
      data = [
        ...(!options.firstVisit
          ? [
              {
                id: "ws-a",
                name: "Product & Engineering",
                description: "A shared space for the next big idea.",
              },
              {
                id: "ws-b",
                name: "Research lab",
                description: "Turn curiosity into understanding.",
              },
            ]
          : []),
        ...state.spaces,
      ];
    else if (/^\/workspaces\/[^/]+$/.test(path))
      data = { id: "ws-a", organizationId: "org-a", name: "Product & Engineering" };
    else if (path.endsWith("/groups"))
      data = [
        ...state.spaces.map((space) => ({
          id: "new-group",
          name: "Engineering",
          workspaceId: space.id,
        })),
        {
          id: "group-a",
          workspaceId: "ws-a",
          name: "Platform team",
          description: "The people behind the platform.",
        },
      ];
    else if (/^\/groups\/[^/]+$/.test(path))
      data = { id: "group-a", workspaceId: "ws-a", name: "Platform team" };
    else if (path.endsWith("/members"))
      data = ["Alex Rivera", "Sam Chen", "Jordan Lee", "Morgan Hayes"].map((name, i) => ({
        userId: i ? "user-" + i : "user-a",
        role: i ? "VIEWER" : "OWNER",
        user: {
          id: i ? "user-" + i : "user-a",
          name,
          email: name.split(" ")[0].toLowerCase() + "@example.test",
          photoUrl: ["avatar:iris", "avatar:fern", "avatar:rose", "avatar:sun"][i],
        },
      }));
    else if (path.endsWith("/people"))
      data = workspacePeople(new URL(req.url()).searchParams.get("evaluatorId") ?? undefined);
    else if (path === "/mcp/connection")
      data = { serverUrl: "https://api.example.test/api/mcp", clients: state.mcpClients };
    else if (path === "/plugins")
      data = [
        {
          id: "github",
          name: "GitHub",
          installable: true,
          setupUrl: "https://github.com/apps/test/installations/new",
          configurationFields: [],
          resourceTypes: [],
          dataTypes: [],
        },
        {
          id: "jira",
          name: "Jira",
          installable: true,
          resourceTypes: [],
          dataTypes: [],
          configurationFields: [
            { key: "siteUrl", label: "Site URL", required: true, configurable: true },
            { key: "email", label: "Email", required: true, configurable: true },
            {
              key: "apiToken",
              label: "API token",
              required: true,
              configurable: true,
              sensitive: true,
            },
          ],
        },
        {
          id: "mcp",
          name: "MCP connection",
          version: "2.0.0",
          installable: false,
          category: "assistant",
          configurationKind: "mcp",
          description:
            "Analyze and save reports from your preferred assistant, using your workspace evaluators.",
          configurationFields: [],
          resourceTypes: [],
          dataTypes: [],
        },
      ];
    else if (path.endsWith("/plugin-installations")) data = state.connections;
    else if (path.endsWith("/jira/setup")) {
      data = { id: "inst-jira", pluginId: "jira", name: "Jira", status: "ACTIVE" };
      state.connections.push(data);
    } else if (path.endsWith("/sync"))
      data = state.connections.find((item) => path.includes(item.id));
    else if (/\/resources\/[^/]+$/.test(path) && req.method() === "PUT") {
      if (path.startsWith("/groups/")) state.assigned.push(path.split("/").pop());
      data = {};
    } else if (/\/resources\/[^/]+$/.test(path) && req.method() === "DELETE") {
      state.assigned = state.assigned.filter((id) => id !== path.split("/").pop());
      data = {};
    } else if (path.endsWith("/resources")) {
      data = state.noResources
        ? []
        : [
            {
              id: "res-a",
              name: "platformance/app",
              type: "github_repository",
              installationId: "inst-a",
              active: true,
            },
            ...(state.connections.some((item) => item.pluginId === "jira")
              ? [
                  {
                    id: "res-jira",
                    name: "Engineering tickets",
                    installationId: "inst-jira",
                    active: true,
                  },
                ]
              : []),
          ];
      if (path.startsWith("/groups/"))
        data = data.filter((item) => state.assigned.includes(item.id));
    } else if (path.endsWith("/personalities"))
      data = [
        { id: "voice-direct", name: "Direct", instruction: "Be direct" },
        { id: "voice-careful", name: "Careful", instruction: "Be careful" },
      ];
    else if (path.endsWith("/evaluators")) {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        data = { ...body, id: "copy-" + state.evaluatorCopies.length };
        state.evaluatorCopies.push(data);
      } else
        data = ["Ada", "Grace"]
          .map((name, i) => ({
            id: i ? "eva-b" : "eva-a",
            name,
            avatar: i ? 24 : 15,
            scope: "GROUP",
            workspaceId: "ws-a",
            groupId: "group-a",
            disabledKnowledgeNodeIds: [],
            disabledResourceIds: [],
            effort: "MEDIUM",
            personalityId: "voice-direct",
            personality: { id: "voice-direct", name: "Direct" },
            evaluationEmphasis: ["ENGINEERING"],
            evaluationNotes: "",
            rules: [],
            questions: [],
            description: "A thoughtful look at collaboration.",
          }))
          .concat(state.evaluatorCopies);
    } else if (path.endsWith("/generation-jobs")) data = state.activeReports;
    else if (path.endsWith("/reports")) {
      if (req.method() === "POST") {
        state.posts++;
        state.reportBody = req.postDataJSON();
        data = { jobs: [{ jobId: "job-a", evaluatorId: "eva-a", status: "queued" }] };
      } else data = [];
    } else if (path === "/media") {
      status = state.uploadFails ? 503 : 200;
      data = state.uploadFails
        ? { message: "Storage temporarily unavailable" }
        : { id: "asset-a", photoUrl: "media:asset-a" };
    } else if (path === "/media/asset-a") {
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3uoAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    } else data = [];
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(base + "/?org=org-a");
  await page
    .getByRole("heading", {
      name: options.firstVisit ? "Welcome, Alex." : "Welcome back, Alex.",
    })
    .waitFor();
  t.after(() => assert.deepEqual(errors, [], "No browser runtime errors"));
  return { page, state };
}
async function choose(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function screenshot(page, name, directory = evidence) {
  if (process.env.UI_TEST_SCREENSHOTS === "0") return;
  await page.evaluate(() => {
    let marker = document.getElementById("simulated-evidence");
    if (!marker) {
      marker = document.createElement("div");
      marker.id = "simulated-evidence";
      document.body.appendChild(marker);
    }
    marker.textContent = "UI TEST / SIMULATED DATA / NOT A LIVE EVALUATION";
    Object.assign(marker.style, {
      position: "fixed",
      bottom: "0",
      left: "0",
      right: "0",
      background: "#fef3c7",
      color: "#78350f",
      font: "11px system-ui",
      padding: "5px 12px",
      textAlign: "center",
      zIndex: "99999",
    });
  });
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, name + ".png"), fullPage: true });
}
test(
  "home personalization persists, restores inheritance, and renders on mobile",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await screenshot(page, "01-home-desktop");
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page.getByRole("button", { name: "Your home", exact: true }).click();
    await page.getByRole("checkbox", { name: "Welcome", exact: true }).uncheck();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.orgPrefs.blocks.includes("welcome"), false);
    await page.reload();
    await page.getByRole("heading", { name: "Your shortcuts" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Welcome back, Alex." }).count(), 0);
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page.getByRole("button", { name: "Your home", exact: true }).click();
    await page.getByRole("button", { name: "Use organization defaults" }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("heading", { name: "Welcome back, Alex." }).waitFor();
    assert.equal(state.orgPrefs.blocks, null);
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page.getByRole("button", { name: "Your profile", exact: true }).click();
    await choose(page, "Theme", "Dark");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
    await screenshot(page, "02-home-dark");
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "03-home-mobile");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
  },
);
test(
  "full-screen setup resumes and does not start evaluations implicitly",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: "Continue setup", exact: true }).click();
    await page
      .getByRole("button", { name: "Already have a team? Choose existing", exact: true })
      .click();
    await choose(page, "Workspace", "Product & Engineering");
    await choose(page, "Team", "Platform team");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Connect your tools" }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.getByRole("button", { name: "Save & exit" }).click();
    await page.getByRole("button", { name: "Continue setup", exact: true }).click();
    await page.getByRole("heading", { name: "Connect your tools" }).waitFor();
    assert.equal(state.setup.step, "plugins");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /Grace/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Ready for your first evaluation" }).waitFor();
    assert.equal(state.setup.evaluatorId, "eva-b");
    assert.equal(state.posts, 0);
    await page.getByRole("button", { name: "Finish setup only" }).click();
    await page.getByRole("heading", { name: "Welcome back, Alex." }).waitFor();
    assert.equal(state.setup.completed, true);
    assert.equal(state.posts, 0);
  },
);

test(
  "member cards retain compact mode and failed uploads preserve the saved photo",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.goto(base + "/organizations/org-a?tab=members");
    await page.getByText("4 people, one team").waitFor();
    await screenshot(page, "06-members");
    await page.getByRole("button", { name: "Show compact members" }).click();
    await page.getByRole("button", { name: "Show member cards" }).waitFor();
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    const before = state.profile.photoUrl;
    state.uploadFails = true;
    await page
      .getByLabel("Choose image")
      .first()
      .setInputFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3uoAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Storage temporarily unavailable" })
      .first()
      .waitFor();
    assert.equal(state.profile.photoUrl, before);
    await screenshot(page, "07-upload-error");
    state.uploadFails = false;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.profile.photoUrl, "media:asset-a");
    await page.reload();
    await page.locator('header img[src^="blob:"]').waitFor();
    await screenshot(page, "10-photo-saved");
  },
);

test("organization branding and favorites remain configurable", { timeout: 60000 }, async (t) => {
  const { page, state } = await setup(t);
  await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await page.getByRole("button", { name: "Accent color", exact: true }).click();
  await page.getByRole("button", { name: "Use accent #176c65", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Accent color", exact: true })
    .waitFor({ state: "hidden" });
  await screenshot(page, "08-brand-editor");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(state.appearance.color, "#176c65");
  await page.goto(base + "/organizations/org-a/workspaces/ws-a");
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await page.getByRole("button", { name: "Remove from favorites" }).waitFor();
  assert.equal(state.orgPrefs.favorites[0].id, "ws-a");
  await page.goto(base + "/?org=org-a");
  await page.getByRole("heading", { name: "Your shortcuts" }).waitFor();
  assert.equal(state.orgPrefs.recent[0].id, "ws-a");
  await screenshot(page, "09-personal-home");
});

test(
  "viewers can personalize themselves but cannot edit organization branding",
  { timeout: 30000 },
  async (t) => {
    const { page, state } = await setup(t);
    state.appearance.canEdit = false;
    await page.reload();
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page.getByRole("button", { name: "Your home", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Organization", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Your profile", exact: true }).click();
    await page.getByRole("button", { name: "Choose fern avatar" }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.profile.photoUrl, "avatar:fern");
  },
);

test(
  "login and signup keep their form flow on desktop and mobile",
  { timeout: 30000 },
  async (t) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(/\/src\/lib\/auth\.tsx(?:\?|$)/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "export function AuthProvider({children}) { return children; } export function useAuth() { return { firebaseUser: null, isLoading:false, signIn:async()=>{}, signUp:async()=>{}, signInWithGoogle:async()=>{} }; }",
      }),
    );
    await page.goto(base + "/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    await screenshot(page, "11-login-desktop");
    await page.getByRole("button", { name: "Need an account? Create one", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).waitFor();
    await page.getByLabel("Name", { exact: true }).fill("Alex Rivera");
    await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "12-signup-mobile");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  "first visit opens a focused welcome and setup can finish without plugins",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, { firstVisit: true });
    state.noResources = true;
    assert.match(new URL(page.url()).pathname, /setup\/welcome$/);
    await page.getByRole("button", { name: "Set up my team", exact: true }).click();
    await page.getByLabel("Workspace", { exact: true }).fill("Product");
    await page.getByLabel("Team", { exact: true }).fill("Engineering");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Connect your tools" }).waitFor();
    await page.getByRole("button", { name: "Set up later", exact: true }).click();
    await page.getByRole("heading", { name: "Choose your evaluator" }).waitFor();
    await page.getByRole("button", { name: "Set up later", exact: true }).click();
    await page.getByRole("button", { name: "Finish setup only" }).click();
    await page.getByRole("heading", { name: "Welcome back, Alex." }).waitFor();
    assert.equal(state.setup.completed, true);
    assert.deepEqual(state.setup.skipped, ["plugins", "evaluator"]);
    assert.equal(state.posts, 0);
    await page.reload();
    await page.getByRole("heading", { name: "Getting started" }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
  },
);

test(
  "one save commits every tab and closing protects the full draft",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page.getByLabel("Display name").fill("Alex Updated");
    await page.getByRole("button", { name: "Your home", exact: true }).click();
    await page.getByRole("checkbox", { name: "Recently visited", exact: true }).uncheck();
    await page.getByRole("button", { name: "Organization", exact: true }).click();
    await page.getByRole("button", { name: "Accent color", exact: true }).click();
    await page.getByRole("button", { name: "Use accent #176c65", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Accent color", exact: true })
      .waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    state.saveFails = true;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Save temporarily unavailable").waitFor();
    assert.equal(state.profile.name, "Alex Rivera");
    state.saveFails = false;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.profile.name, "Alex Updated");
    assert.equal(state.orgPrefs.blocks.includes("recent"), false);
    assert.equal(state.appearance.color, "#176c65");
  },
);

test(
  "combined creation keeps failed drafts and creates workspace plus group once",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.goto(base + "/organizations/org-a?tab=workspaces");
    await page.getByRole("button", { name: "New workspace", exact: true }).click();
    await page.getByLabel("New workspace name").fill("Customer experience");
    await page.getByLabel("First project name").fill("Design");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Keep editing" }).click();
    state.createFails = true;
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByText("Creation temporarily unavailable").waitFor();
    assert.equal(state.spaces.length, 0);
    assert.equal(await page.getByLabel("First project name").inputValue(), "Design");
    state.createFails = false;
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.spaces.length, 1);
    await page.getByText("Customer experience", { exact: true }).waitFor();
  },
);
test(
  "entry restores last organization and falls back to the directory without a valid choice",
  { timeout: 60000 },
  async (t) => {
    const { page } = await setup(t);
    await page.goto(base + "/");
    await page.getByRole("heading", { name: "Welcome back, Alex." }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/organizations/org-a");
    await page.evaluate(() => localStorage.setItem("platformance:last-org:user-a", "inaccessible"));
    await page.goto(base + "/");
    await page.getByRole("heading", { name: "Find your space" }).waitFor();
    assert.match(new URL(page.url()).pathname, /^\/organizations\/?$/);
    await screenshot(page, "13-organization-directory");
  },
);

test(
  "unchanged and reverted forms close directly; edited forms require explicit discard",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    const open = () =>
      page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await open();
    await page.getByLabel("Display name").fill("Temporary");
    await page.getByLabel("Display name").fill("Alex Rivera");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    await open();
    await page.getByLabel("Display name").fill("Discard me");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.profile.name, "Alex Rivera");
    await open();
    assert.equal(await page.getByLabel("Display name").inputValue(), "Alex Rivera");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  },
);

test(
  "shared selectors keep focus and Escape closes only the open selector",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    const theme = page.getByRole("combobox", { name: "Theme", exact: true });
    await theme.click();
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("listbox").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    assert.equal(await theme.evaluate((el) => el === document.activeElement), true);
    await theme.press("Enter");
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("End");
    await page.waitForFunction(() => document.activeElement?.textContent === "Dark");
    await page.keyboard.press("Enter");
    await page.getByRole("listbox").waitFor({ state: "hidden" });
    assert.equal(await theme.textContent(), "Dark");
    await choose(page, "Movement", "Reduce decorative motion");
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.personal.theme, "dark");
    assert.equal(state.personal.motion, "reduced");
  },
);
test(
  "custom color validates without an extra save and popover dismissals retain the form",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page.getByRole("button", { name: "Organization", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Accent color", exact: true });
    await trigger.click();
    const hex = page.getByRole("textbox", { name: "Hex color", exact: true });
    await hex.fill("#oops");
    await page.keyboard.press("Escape");
    await hex.waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Enter a valid six-digit hex color before saving.").waitFor();
    assert.equal(state.appearance.color, "#7262d9");
    await trigger.click();
    await hex.fill("#123456");
    await hex.press("Enter");
    await hex.waitFor({ state: "hidden" });
    assert.equal(state.appearance.color, "#7262d9");
    await trigger.click();
    await page.getByText("Default home", { exact: true }).click();
    await hex.waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.appearance.color, "#123456");
  },
);
test(
  "crop sliders support keyboard editing and protect the pending image",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page
      .getByLabel("Choose image")
      .first()
      .setInputFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3uoAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    const zoom = page.getByRole("slider", { name: "Crop zoom", exact: true });
    await zoom.focus();
    await zoom.press("ArrowRight");
    assert.equal(await zoom.getAttribute("aria-valuenow"), "1.05");
    const position = page.getByRole("slider", { name: "Crop vertical position", exact: true });
    await position.focus();
    await position.press("End");
    assert.equal(await position.getAttribute("aria-valuenow"), "100");
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.profile.photoUrl, "media:asset-a");
  },
);

test(
  "forms lock their controls while a combined save is pending",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/api/users/me/personalization", async (route) => {
      await pending;
      await route.fallback();
    });
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await page.getByLabel("Display name").fill("Saved together");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    try {
      assert.equal(await page.getByLabel("Display name").isDisabled(), true);
      assert.equal(
        await page.getByRole("combobox", { name: "Theme", exact: true }).isDisabled(),
        true,
      );
      assert.equal(
        await page.getByRole("button", { name: "Cancel", exact: true }).isDisabled(),
        true,
      );
    } finally {
      release();
    }
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.profile.name, "Saved together");
  },
);

test(
  "image controls stay compact and accessible on desktop and mobile",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    const photo = dialog.getByRole("button", { name: "Change photo", exact: true });
    await photo.waitFor();
    await dialog.evaluate(async (el) => {
      await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished));
    });
    const bounds = await photo.boundingBox();
    assert.equal(bounds.width, 80);
    assert.equal(bounds.height, 80);
    await photo.focus();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (
      await chooser
    ).setFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3uoAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await dialog.getByAltText("Crop preview").waitFor();
    assert.equal(await dialog.getByAltText("photo preview").count(), 0);
    await dialog.getByRole("button", { name: "Cancel adjustment" }).click();
    await photo.waitFor();
    assert.equal(state.profile.photoUrl, "avatar:iris");
    await dialog.getByRole("button", { name: "Remove image" }).click();
    await dialog.getByRole("button", { name: "Upload photo", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Organization", exact: true }).click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const logo = dialog.getByRole("button", { name: /^(Change|Upload) logo$/ });
      const cover = dialog.getByRole("button", { name: /^(Change|Upload) cover$/ });
      await logo.waitFor();
      assert.equal((await logo.boundingBox()).width, 80);
      const coverBounds = await cover.boundingBox();
      assert.ok(Math.abs(coverBounds.width / coverBounds.height - 3.2) < 0.05);
      assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
    }
  },
);

test(
  "preset avatars render as icons in the image picker and persist",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    const preview = page.getByRole("button", { name: "Change photo", exact: true });
    for (const [avatar, icon] of [
      ["iris", "sparkles"],
      ["fern", "leaf"],
      ["sun", "sun"],
      ["rose", "flower-2"],
    ]) {
      await page.getByRole("button", { name: `Choose ${avatar} avatar`, exact: true }).click();
      await preview.locator(`svg.lucide-${icon}`).waitFor();
      assert.equal(await preview.locator("img").count(), 0);
      assert.equal(await page.locator('img[src^="avatar:"]').count(), 0);
    }
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.profile.photoUrl, "avatar:rose");
    await page.reload();
    await page.getByRole("button", { name: "Personalize", exact: true }).first().click();
    await preview.locator("svg.lucide-flower-2").waitFor();
    assert.equal(await preview.locator("img").count(), 0);
  },
);

async function enterSetup(t, step = "plugins") {
  const result = await setup(t);
  result.state.setup = {
    version: 1,
    step: 2,
    seen: true,
    workspaceId: "ws-a",
    groupId: "group-a",
    evaluatorId: "eva-a",
    dismissed: false,
  };
  await result.page.goto(base + "/organizations/org-a/setup/" + step);
  await result.page
    .getByRole("heading", {
      name:
        step === "plugins"
          ? "Connect your tools"
          : step === "evaluator"
            ? "Choose your evaluator"
            : "Ready for your first evaluation",
    })
    .waitFor();
  return result;
}

test(
  "Jira connects inline and credentials never enter the saved setup",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t);
    await page.getByRole("button", { name: "Jira Connect", exact: true }).click();
    await page.getByLabel("Site URL", { exact: true }).fill("https://example.atlassian.net");
    await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
    await page.getByLabel("API token", { exact: true }).fill("private-test-token");
    await page.getByRole("button", { name: "Connect and sync", exact: true }).click();
    await page.getByRole("checkbox", { name: "Engineering tickets" }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.getByRole("checkbox", { name: "Engineering tickets" }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Choose your evaluator" }).waitFor();
    assert.ok(state.assigned.includes("res-jira"));
    assert.equal(JSON.stringify(state.setup).includes("private-test-token"), false);
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify({ ...sessionStorage, ...localStorage }).includes("private-test-token"),
      ),
      false,
    );
  },
);

test(
  "GitHub authorization returns automatically to the same plugin step",
  { timeout: 60000 },
  async (t) => {
    const { page } = await enterSetup(t);
    await page.route("https://github.com/apps/test/installations/new", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(base + "/integrations/github/setup?installation_id=123&setup_action=install")})</script>`,
      }),
    );
    await page.getByRole("button", { name: "Add connection", exact: true }).click();
    await page.getByRole("button", { name: "Authorize GitHub", exact: true }).click();
    await page.waitForURL("**/organizations/org-a/setup/plugins");
    await page.getByRole("heading", { name: "Connect your tools" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/organizations/org-a/setup/plugins");
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("performance-agent:github-setup")),
      null,
    );
  },
);

test(
  "custom evaluators resume as drafts and create only a team copy",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t, "evaluator");
    await page.getByRole("button", { name: "Customize a copy", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Engineering coach");
    await page.getByRole("button", { name: "Careful", exact: true }).click();
    await page.getByRole("button", { name: "Use Cloud character", exact: true }).click();
    await page.getByRole("button", { name: "Save & exit" }).click();
    await page.getByRole("button", { name: "Continue setup", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Engineering coach");
    assert.equal(state.evaluatorCopies.length, 0);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Ready for your first evaluation" }).waitFor();
    assert.equal(state.evaluatorCopies.length, 1);
    assert.equal(state.evaluatorCopies[0].scope, "GROUP");
    assert.equal(state.evaluatorCopies[0].personalityId, "voice-careful");
    assert.equal(state.setup.evaluatorId, "copy-0");
    assert.equal(state.posts, 0);
  },
);

test(
  "setup saves drafts and keeps failed saves visible before exit",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: "Continue setup", exact: true }).click();

    await page.getByLabel("Workspace", { exact: true }).fill("My product team");
    await page.getByRole("button", { name: "Save & exit" }).click();
    assert.equal(state.setup.teamDraft.workspaceName, "My product team");
    await page.getByRole("button", { name: "Continue setup", exact: true }).click();
    assert.equal(
      await page.getByLabel("Workspace", { exact: true }).inputValue(),
      "My product team",
    );
    state.setupSaveFails = true;
    await page.getByLabel("Team", { exact: true }).fill("Unsaved team");
    await page.getByRole("button", { name: "Save & exit" }).click();
    await page.getByRole("alert").filter({ hasText: "Setup save unavailable" }).waitFor();
    assert.match(new URL(page.url()).pathname, /setup\/team$/);
    assert.equal(await page.getByLabel("Team", { exact: true }).inputValue(), "Unsaved team");
    state.setupSaveFails = false;
    await page.getByRole("button", { name: "Retry saving" }).click();
    await page.getByRole("status").filter({ hasText: "Progress saved" }).waitFor();
    await page.getByRole("button", { name: "Save & exit" }).click();
    await page.getByRole("heading", { name: "Welcome back, Alex." }).waitFor();
    assert.equal(state.setup.teamDraft.groupName, "Unsaved team");
  },
);

test(
  "review validates dates and starts exactly one evaluation with its period",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t, "review");
    await choose(page, "Evaluation period", "Custom dates");
    await page.getByLabel("From", { exact: true }).fill("2026-10-31");
    await page.getByLabel("To", { exact: true }).fill("2026-10-01");
    await page.getByRole("button", { name: "Start evaluation", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Choose both dates" }).waitFor();
    assert.equal(state.posts, 0);
    await page.getByLabel("From", { exact: true }).fill("2026-10-01");
    await page.getByLabel("To", { exact: true }).fill("2026-10-31");
    await page.getByRole("button", { name: "Start evaluation", exact: true }).evaluate((button) => {
      button.click();
      button.click();
    });
    await page.waitForURL("**/groups/group-a?tab=reports");
    assert.equal(state.posts, 1);
    assert.deepEqual(state.reportBody.period, { from: "2026-10-01", to: "2026-10-31" });
  },
);

test("setup stays usable on mobile and honors reduced motion", { timeout: 60000 }, async (t) => {
  const { page } = await enterSetup(t, "review");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const step of ["review", "evaluator", "plugins", "team"]) {
    await page.goto(base + "/organizations/org-a/setup/" + step);
    await page.locator(".setup-main h1").waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      JSON.stringify(
        await page.locator("body *").evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 12)
            .map((node) => ({
              tag: node.tagName,
              cls: node.className,
              width: node.getBoundingClientRect().width,
            })),
        ),
      ),
    );
    assert.equal(
      await page.locator(".setup-enter").evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.equal(await page.locator("select").count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 0);
  }
});
test(
  "pending plugin credentials are protected when leaving setup",
  { timeout: 60000 },
  async (t) => {
    const { page } = await enterSetup(t);
    await page.getByRole("button", { name: "Jira Connect", exact: true }).click();
    await page.getByLabel("API token", { exact: true }).fill("pending-secret");
    assert.equal(
      await page.getByRole("button", { name: "Set up later", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Save & exit" }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(
      await page.getByLabel("API token", { exact: true }).inputValue(),
      "pending-secret",
    );
    await page.getByRole("button", { name: "Cancel connection", exact: true }).click();
    await page.getByRole("button", { name: "Set up later", exact: true }).click();
    await page.getByRole("heading", { name: "Choose your evaluator" }).waitFor();
  },
);

test(
  "viewers can resume setup but cannot configure plugins or launch evaluations",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t);
    state.appearance.canEdit = false;
    await page.route("**/api/**/members", async (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ userId: "user-a", role: "VIEWER", user: state.profile }]),
      }),
    );
    await page.reload();
    await page.getByRole("heading", { name: "Connect your tools" }).waitFor();
    await page.getByRole("button", { name: "Jira Connect", exact: true }).click();
    await page
      .getByText("An organization admin can connect this plugin.", { exact: false })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Connect and sync", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Set up later", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "Customize a copy", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Ready for your first evaluation" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Start evaluation", exact: true }).isDisabled(),
      true,
    );
    assert.equal(state.posts, 0);
  },
);

test(
  "an existing evaluator job is reused instead of submitting another",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t, "review");
    state.activeReports = [{ jobId: "existing-job", evaluatorId: "eva-a", status: "running" }];
    await page.getByRole("button", { name: "Start evaluation", exact: true }).click();
    await page.waitForURL("**/groups/group-a?tab=reports");
    assert.equal(state.posts, 0);
  },
);

test(
  "plugin synchronization errors retain selections and allow retry",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t);
    await page.route("**/api/plugin-installations/inst-a/sync", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Plugin temporarily unavailable" }),
      }),
    );
    await page.getByRole("button", { name: "Sync plugin", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Plugin temporarily unavailable" }).waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "platformance/app" }).isChecked(), true);
    await page.unroute("**/api/plugin-installations/inst-a/sync");
    await page.getByRole("button", { name: "Sync plugin", exact: true }).click();
    await page.getByRole("checkbox", { name: "platformance/app" }).waitFor();
    assert.equal(state.posts, 0);
  },
);

test(
  "advanced evaluator settings keep the primary action visible",
  { timeout: 60000 },
  async (t) => {
    const { page } = await enterSetup(t, "evaluator");
    await page.getByRole("button", { name: "Customize a copy", exact: true }).click();
    await page.getByRole("button", { name: "Advanced settings", exact: true }).click();
    await page.getByRole("button", { name: "Add rule", exact: true }).click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await page.locator(".setup-footer").boundingBox();
      assert.ok(
        (bounds.top >= 0 && bounds.bottom <= 845) ||
          (bounds.y >= 0 && bounds.y + bounds.height <= 845),
        JSON.stringify(bounds),
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
    }
  },
);

const peopleMcpEvidence = resolve("../artifacts/people-mcp/implementation");

test(
  "people workspace filters, opens a person, handles missing evidence and deep-links to its report",
  { timeout: 60000 },
  async (t) => {
    const { page } = await setup(t);
    await page.route("**/api/groups/group-a/evaluators", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            ...savedGroupReport.evaluator,
            id: "first-other",
            name: "Another evaluator",
            personality: { name: "Neutral" },
          },
          { ...savedGroupReport.evaluator, personality: { name: "Neutral" } },
        ]),
      }),
    );
    await page.route("**/api/groups/group-a/reports", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "report-people",
            groupId: "group-a",
            evaluatorId: "eva-a",
            type: "GROUP_REPORT",
            createdAt: "2026-11-02T12:00:00Z",
            data: savedGroupReport,
          },
        ]),
      }),
    );
    await page.goto(base + "/organizations/org-a/workspaces/ws-a?tab=people");
    await page.getByRole("button", { name: "View Lucía Fernández in Platform team" }).waitFor();
    await screenshot(page, "01-workspace-people", peopleMcpEvidence);
    await choose(page, "Filter people by status", "Insufficient evidence");
    assert.equal(
      await page.getByRole("button", { name: "View Lucía Fernández in Platform team" }).count(),
      0,
    );
    await page.getByRole("button", { name: "View Ana Torres in Platform team" }).waitFor();
    await choose(page, "Filter people by status", "All statuses");
    await page.getByPlaceholder("Search people or projects").fill("Lucía");
    assert.equal(
      await page.getByRole("button", { name: "View Ana Torres in Platform team" }).count(),
      0,
    );
    await page.getByPlaceholder("Search people or projects").fill("");
    await page.getByRole("button", { name: "View Lucía Fernández in Platform team" }).click();
    await page.getByRole("heading", { name: "At a glance" }).waitFor();
    await page.getByRole("link", { name: "Review #142" }).waitFor();
    await screenshot(page, "02-person-detail", peopleMcpEvidence);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await screenshot(page, "03-people-mobile", peopleMcpEvidence);
    await choose(page, "Evaluator", "Careful Project · Platform team");
    await page.getByText("No report from this evaluator yet.", { exact: true }).waitFor();
    await page.getByText("This evaluator belongs to another project.", { exact: true }).waitFor();
    await choose(page, "Evaluator", "Balanced Workspace · Product & Engineering");
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole("link", { name: "View report", exact: true }).click();
    await page.waitForURL("**/groups/group-a?tab=reports&reportId=report-people");
    await page.getByText("A steady month of reviewed delivery.", { exact: true }).first().waitFor();
  },
);

test(
  "MCP catalog separates assistants and copies provider configuration without inventing authorization",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(base + "/organizations/org-a?tab=plugins");
    await page.getByRole("button", { name: "Configure MCP", exact: true }).waitFor();
    await screenshot(page, "04-plugin-catalog", peopleMcpEvidence);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await screenshot(page, "07-plugin-catalog-mobile", peopleMcpEvidence);
    await page.setViewportSize({ width: 1440, height: 1050 });
    const github = page.getByRole("region", { name: "GitHub plugin", exact: true });
    await github.getByRole("button", { name: "Manage connection", exact: true }).click();
    const connections = page.getByRole("dialog", { name: "GitHub connections", exact: true });
    await connections.getByText("acme-team", { exact: true }).waitFor();
    await connections.getByRole("button", { name: "Sync", exact: true }).click();
    await page.getByText("acme-team synced", { exact: true }).waitFor();
    await connections.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit plugin connection", exact: true });
    await edit.waitFor();
    assert.equal(await edit.getByLabel("Name", { exact: true }).inputValue(), "acme-team");
    await page.keyboard.press("Escape");
    await edit.waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await connections.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Connect Jira", exact: true }).click();
    await page.getByRole("dialog", { name: "Connect Jira", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByPlaceholder("Search plugins", { exact: true }).fill("Jira");
    assert.equal(await github.count(), 0);
    await page.getByRole("region", { name: "Jira plugin", exact: true }).waitFor();
    await page.getByPlaceholder("Search plugins", { exact: true }).fill("");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole("button", { name: "Configure MCP", exact: true }).click();
    await page.getByText("Not authorized yet", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Cursor", exact: true }).click();
    await page.getByRole("button", { name: "Copy config", exact: true }).click();
    const cursor = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    assert.equal(cursor.mcpServers.platformance.url, "https://api.example.test/api/mcp");
    await page.getByRole("button", { name: "VS Code", exact: true }).click();
    await page.getByRole("button", { name: "Copy config", exact: true }).click();
    const vscode = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    assert.equal(vscode.servers.platformance.type, "http");
    await page.getByRole("button", { name: "Local agent", exact: true }).click();
    await page.getByRole("button", { name: "Copy agent instructions", exact: true }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /list_evaluators/);
    await page.getByText("Not authorized yet", { exact: true }).waitFor();
    await screenshot(page, "05-mcp-setup", peopleMcpEvidence);
    state.mcpClients = [{ id: "client-a", name: "Cursor desktop" }];
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await page.getByText("Cursor desktop", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  },
);

test(
  "MCP setup preserves client selection and continues without authorizing an assistant",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t);
    await page
      .getByRole("button", { name: "MCP connection Optional · AI assistant", exact: true })
      .click();
    await page.getByRole("button", { name: "Local agent", exact: true }).click();
    await page.getByText("Not authorized yet", { exact: true }).waitFor();
    await screenshot(page, "06-setup-wizard", peopleMcpEvidence);
    await page.getByRole("button", { name: "Save & exit", exact: true }).click();
    assert.equal(state.setup.pluginSelection, "mcp");
    assert.equal(state.setup.mcpClient, "local");
    await page.getByRole("button", { name: "Continue setup", exact: true }).click();
    await page.getByRole("heading", { name: "Local agent setup" }).waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Choose your evaluator" }).waitFor();
    assert.equal(state.mcpClients.length, 0);
    assert.equal(state.posts, 0);
  },
);

for (const [scope, membersPath] of [
  ["organizations/org-a", "/organizations/org-a?tab=members"],
  ["workspaces/ws-a", "/organizations/org-a/workspaces/ws-a?tab=members"],
  ["groups/group-a", "/organizations/org-a/workspaces/ws-a/groups/group-a?tab=members"],
]) {
  test(`invitation revocation requires confirmation in ${scope}`, { timeout: 60000 }, async (t) => {
    const { page } = await setup(t);
    let deletes = 0;
    await page.route(
      /\/api\/(organizations|workspaces|groups)\/[^/]+\/invitations(?:\/[^/?]+)?$/,
      async (route) => {
        if (route.request().method() === "DELETE") {
          assert.equal(
            new URL(route.request().url()).pathname,
            `/api/${scope}/invitations/pending-a`,
          );
          deletes += 1;
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(
            deletes
              ? []
              : [
                  {
                    id: "pending-a",
                    email: "invitee@example.test",
                    role: "VIEWER",
                    status: "PENDING",
                    expiresAt: "2026-12-01T00:00:00Z",
                    inviteUrl: "https://example.test/invite/pending-a",
                  },
                ],
          ),
        });
      },
    );
    await page.goto(base + membersPath);
    const revoke = page.getByRole("button", { name: "Revoke invitation", exact: true });
    await revoke.click();
    const confirmation = page.getByRole("alertdialog", { name: "Revoke invitation?" });
    await confirmation.getByText(/invitee@example\.test/).waitFor();
    assert.equal(deletes, 0);
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await confirmation.waitFor({ state: "hidden" });
    assert.equal(deletes, 0);
    await revoke.click();
    await page.keyboard.press("Escape");
    await confirmation.waitFor({ state: "hidden" });
    assert.equal(deletes, 0);
    await revoke.click();
    await confirmation.getByRole("button", { name: "Revoke invitation", exact: true }).click();
    await page.getByText("Invitation revoked", { exact: true }).waitFor();
    await revoke.waitFor({ state: "hidden" });
    assert.equal(deletes, 1);
  });
}

test(
  "removed plugin resources can be cleared without losing setup progress",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await enterSetup(t);
    await page.getByRole("checkbox", { name: "platformance/app" }).waitFor();
    await page.getByRole("button", { name: "Save & exit" }).click();
    state.noResources = true;
    await page.getByRole("button", { name: "Continue setup", exact: true }).click();
    await page.getByRole("button", { name: "Remove unavailable resources", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Choose your evaluator" }).waitFor();
    assert.deepEqual(state.setup.resourceIds, []);
    assert.equal(state.setup.groupId, "group-a");
  },
);
function comparedPeopleFixture({ stale = false, canGenerate = true } = {}) {
  const data = workspacePeople();
  data.capabilities = { canRead: true, canGenerate };
  const source = data.groups[0].report;
  source.people.forEach((person, index) => {
    person.personId = `report-people:${index}`;
  });
  data.groups[1].report = {
    ...structuredClone(source),
    id: "report-research",
    people: [
      {
        ...structuredClone(source.people[0]),
        personId: "report-research:0",
        displayName: "Mateo Silva",
      },
    ],
  };
  const conclusion = (person, status, changeReason) => ({
    personId: person.personId,
    assessment: {
      ...person.assessment,
      status,
      summary: "Recalibrated using comparable delivery evidence.",
    },
    changeReason,
    suggestions: ["Review delivery evidence."],
    evidenceIds: [],
  });
  data.comparison = {
    summary:
      "Research shipped reviewed work; Platform needs delivery follow-up despite its favorable report.",
    generatedAt: "2026-11-05T12:00:00Z",
    stale,
    version: "people-comparison-v1",
    limitations: ["Periods differ by one week."],
    groups: data.groups.map((group, index) => ({
      groupId: group.id,
      rank: index ? 1 : 2,
      rankReason: index
        ? "More complete reviewed delivery."
        : "Less evidence of completed delivery.",
      assessment: {
        ...source.people[0].assessment,
        status: index ? "GOOD" : "RISK",
        summary: index
          ? "Reviewed delivery is supported."
          : "The original favorable status overlooked unfinished work.",
      },
      changeReason: "Compared delivered work rather than activity volume.",
      suggestions: ["Check delivery outcomes."],
      evidenceIds: [],
      people: group.report.people.map((person, personIndex) =>
        conclusion(
          person,
          personIndex ? "INSUFFICIENT_DATA" : index ? "GOOD" : "WATCH",
          "Own contribution evidence supports a follow-up instead of the original favorable status.",
        ),
      ),
    })),
  };
  data.comparisonJob = null;
  return data;
}

test(
  "people comparison ranks teams and explains recalibrated individual states",
  { timeout: 60000 },
  async (t) => {
    const { page } = await setup(t);
    const data = comparedPeopleFixture();
    await page.route("**/api/workspaces/ws-a/people**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(data) }),
    );
    await page.goto(base + "/organizations/org-a/workspaces/ws-a?tab=people");
    await page.getByRole("region", { name: "Workspace comparison", exact: true }).waitFor();
    await page.getByText("Team rank #1", { exact: true }).waitFor();
    const panels = page.getByRole("region").filter({ has: page.getByText(/Team rank #/) });
    assert.match(await panels.first().innerText(), /Research lab/);
    const person = page.getByRole("button", { name: "View Lucía Fernández in Platform team" });
    assert.match(await person.innerText(), /Follow-up/);
    await person.click();
    const detail = page.getByRole("region", { name: "Individual comparison rationale" });
    await detail.waitFor();
    assert.match(await detail.innerText(), /Original report assessment/);
    assert.match(await detail.innerText(), /On track/);
    assert.match(await detail.innerText(), /Own contribution evidence/);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  },
);

test(
  "people comparison generates manually, shows progress and preserves stale results on failure",
  { timeout: 60000 },
  async (t) => {
    const { page } = await setup(t);
    const data = comparedPeopleFixture({ stale: true });
    let posts = 0;
    await page.route("**/api/workspaces/ws-a/people**", async (route) => {
      if (route.request().method() === "POST") {
        assert.equal(route.request().postDataJSON().evaluatorId, "eva-a");
        posts++;
        data.comparisonJob = {
          id: "comparison-job",
          status: "running",
          progress: { stage: "generating", completed: ["preparing"], total: 4 },
          error: null,
        };
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ jobId: "comparison-job", status: "queued" }),
        });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.goto(base + "/organizations/org-a/workspaces/ws-a?tab=people");
    await page.getByText(/Outdated comparison/).waitFor();
    assert.match(
      await page.getByRole("button", { name: "View Lucía Fernández in Platform team" }).innerText(),
      /On track/,
    );
    await page.getByRole("button", { name: "Regenerate comparison" }).click();
    await page.getByText("Comparing saved reports - generating").waitFor();
    assert.equal(await page.getByRole("button", { name: "Comparing teams..." }).isDisabled(), true);
    assert.equal(posts, 1);
    data.comparisonJob = {
      ...data.comparisonJob,
      status: "failed",
      error: "Model temporarily unavailable",
    };
    await page.getByRole("button", { name: "Refresh people", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Model temporarily unavailable" }).waitFor();
    await page.getByText(data.comparison.summary, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Regenerate comparison" }).click();
    assert.equal(posts, 2);
    data.comparisonJob.status = "succeeded";
    data.comparison.stale = false;
    await page.getByRole("button", { name: "Refresh people", exact: true }).click();
    await page.getByText(/Outdated comparison/).waitFor({ state: "hidden" });
    assert.match(
      await page.getByRole("button", { name: "View Lucía Fernández in Platform team" }).innerText(),
      /Follow-up/,
    );
  },
);

test(
  "people comparison keeps viewers read-only and project-only access on original reports",
  { timeout: 60000 },
  async (t) => {
    const { page } = await setup(t);
    let data = comparedPeopleFixture({ canGenerate: false });
    await page.route("**/api/workspaces/ws-a/people**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(data) }),
    );
    await page.goto(base + "/organizations/org-a/workspaces/ws-a?tab=people");
    await page.getByText("Team rank #1", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Regenerate comparison" }).count(), 0);
    data = workspacePeople();
    data.capabilities = { canRead: false, canGenerate: false };
    data.comparison = null;
    data.comparisonJob = null;
    await page.getByRole("button", { name: "Refresh people", exact: true }).click();
    await page
      .getByRole("region", { name: "Workspace comparison", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(await page.getByText("Team rank #1", { exact: true }).count(), 0);
    assert.match(
      await page.getByRole("button", { name: "View Lucía Fernández in Platform team" }).innerText(),
      /On track/,
    );
  },
);
