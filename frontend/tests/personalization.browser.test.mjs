import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
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
    if (path.endsWith("/team-space")) {
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
        {
          id: "ws-a",
          name: "Product & Engineering",
          description: "A shared space for the next big idea.",
        },
        { id: "ws-b", name: "Research lab", description: "Turn curiosity into understanding." },
        ...state.spaces,
      ];
    else if (/^\/workspaces\/[^/]+$/.test(path))
      data = { id: "ws-a", organizationId: "org-a", name: "Product & Engineering" };
    else if (path.endsWith("/groups"))
      data = [
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
    else if (path.endsWith("/resources"))
      data = state.noResources
        ? []
        : [{ id: "res-a", name: "platformance/app", type: "github_repository" }];
    else if (path.endsWith("/evaluators"))
      data = [
        {
          id: "eva-a",
          name: "Ada",
          avatar: 15,
          scope: "GROUP",
          effort: "MEDIUM",
          personality: "direct",
          rules: [],
          questions: [],
          description: "A thoughtful look at collaboration.",
        },
      ];
    else if (path.endsWith("/generation-jobs")) data = [];
    else if (path.endsWith("/reports")) {
      if (req.method() === "POST") {
        state.posts++;
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
    if (path.endsWith("/evaluators"))
      data.push({ ...data[0], id: "eva-b", name: "Grace", avatar: 24 });
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(base + "/?org=org-a");
  await page
    .getByRole("heading", {
      name: options.firstVisit ? "Make room for your team" : "Welcome back, Alex.",
    })
    .waitFor();
  t.after(() => assert.deepEqual(errors, [], "No browser runtime errors"));
  return { page, state };
}
async function choose(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function screenshot(page, name) {
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
  await page.screenshot({ path: resolve(evidence, name + ".png"), fullPage: true });
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
  "wizard resumes and does not submit evaluations during setup",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t);
    await page.getByRole("button", { name: /Continue setup|Review setup/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await choose(page, "Workspace", "Product & Engineering");
    await choose(page, "Group", "Platform team");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await screenshot(page, "04-setup-resources");
    await page.getByRole("button", { name: "Finish later" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Continue setup|Review setup/ }).click();
    await page.getByRole("heading", { name: "Connect evidence", exact: true }).waitFor();
    assert.equal(state.setup.step, 2);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /Ada/ }).waitFor();
    await page.getByRole("button", { name: /Grace/ }).click();
    await screenshot(page, "05-setup-evaluator");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Start evaluation", exact: true }).waitFor();
    assert.equal(state.setup.evaluatorId, "eva-b");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Continue setup|Review setup/ }).click();
    await page.getByRole("dialog").getByText("Grace", { exact: true }).waitFor();
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
  "first visit opens once and setup finishes without integrations",
  { timeout: 60000 },
  async (t) => {
    const { page, state } = await setup(t, { firstVisit: true });
    state.noResources = true;
    await page.getByRole("heading", { name: "Make room for your team" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/organizations/org-a");
    assert.equal(new URL(page.url()).search, "");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await choose(page, "Workspace", "Product & Engineering");
    await choose(page, "Group", "Platform team");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Set up later", exact: true }).click();
    await page.getByRole("button", { name: "Set up later", exact: true }).click();
    await page.getByRole("button", { name: "Finish setup", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(state.setup.completed, true);
    assert.deepEqual(state.setup.skipped, [2, 3]);
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
    await page.getByLabel("First group name").fill("Design");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Keep editing" }).click();
    state.createFails = true;
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByText("Creation temporarily unavailable").waitFor();
    assert.equal(state.spaces.length, 0);
    assert.equal(await page.getByLabel("First group name").inputValue(), "Design");
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
