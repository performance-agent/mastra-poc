import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
let browser;
before(async () => {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });
});
after(async () => {
  await browser?.close();
});
const baseURL = process.env.PROGRESS_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const reports = [
  {
    id: "attenti-2022",
    type: "GROUP_REPORT",
    title: "ATTENTI — Informe 2022",
    createdAt: "2022-12-20T20:34:09Z",
    data: {
      summary: "Punto de partida del equipo",
      period: { from: "2022-01-01", to: "2022-12-01" },
    },
  },
  {
    id: "attenti-2026",
    type: "GROUP_REPORT",
    title: "ATTENTI — Septiembre 2026",
    createdAt: "2026-09-22T20:34:09Z",
    data: { summary: "Cambios en la colaboración" },
  },
  { id: "github", type: "GITHUB_ACTIVITY", title: "Actividad de GitHub", data: {} },
];
async function setup(t, snapshots = reports) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [],
    posts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route(/\/src\/lib\/auth\.tsx(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'export function useAuth(){return {firebaseUser:{uid:"rules-test"},isLoading:false};}',
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    let body = [];
    if (url.pathname.endsWith("/rule-packages"))
      body = [
        {
          id: "package-test",
          name: "Colaboración",
          evaluates: "Evolución",
          rules: [{ name: "Revisión", valuation: 5 }],
        },
      ];
    else if (url.pathname === "/api/groups/attenti/reports") body = snapshots;
    else if (url.pathname.endsWith("/evaluation-models"))
      body = [{ key: "balanced", label: "Gemini", model: "test" }];
    else if (url.pathname === "/api/knowledge") body = { canManage: true, nodes: [] };
    else if (url.pathname.endsWith("/jobs/latest")) body = null;
    else if (url.pathname.includes("/jobs/"))
      body = { id: "job-test", status: "queued", result: null };
    else if (url.pathname.endsWith("/evaluations") && request.method() === "POST") {
      posts.push(request.postDataJSON());
      body = { jobId: "job-test", status: "queued" };
    } else if (url.pathname.endsWith("/evaluations")) body = { items: [], nextCursor: null };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`${baseURL}/tests/fixtures/rules-reports.html`);
  await page.getByRole("button", { name: "Analizar progreso", exact: true }).click();
  return { page, posts };
}
test("Rules selects project snapshots separately from knowledge and submits exact IDs", async (t) => {
  const { page, posts } = await setup(t);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Reportes del proyecto", exact: true }).waitFor();
  assert.equal(await dialog.getByTestId("knowledge-source-picker").count(), 0);
  assert.equal(
    await dialog.getByRole("button", { name: "Continuar con knowledge" }).isDisabled(),
    true,
  );
  assert.equal(await dialog.getByText("Actividad de GitHub", { exact: true }).count(), 0);
  const search = dialog.getByRole("textbox", {
    name: "Buscar por nombre, fecha, año o identificador",
  });
  await search.fill("2022");
  await dialog.getByRole("checkbox", { name: /ATTENTI — Informe 2022/ }).check();
  await dialog.getByText("Ver resumen", { exact: true }).click();
  await dialog.getByText("Punto de partida del equipo", { exact: true }).waitFor();
  await search.fill("2026-09");
  await dialog.getByRole("button", { name: "Seleccionar visibles" }).click();
  await dialog.getByRole("status").filter({ hasText: "2 reportes seleccionados" }).waitFor();
  await dialog.getByRole("button", { name: "Continuar con knowledge" }).click();
  await dialog.getByTestId("knowledge-source-picker").waitFor();
  assert.equal(
    await dialog
      .getByRole("textbox", { name: "Buscar por nombre, fecha, año o identificador" })
      .count(),
    0,
  );
  await dialog.getByRole("button", { name: "Cambiar reportes" }).click();
  assert.equal(await dialog.getByRole("checkbox", { checked: true }).count(), 2);
  await page.waitForTimeout(250);
  if (process.env.RULES_TEST_SCREENSHOT)
    await page.screenshot({ path: process.env.RULES_TEST_SCREENSHOT });
  await dialog.getByRole("button", { name: "Continuar con knowledge" }).click();
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/evaluations"),
  );
  await dialog.getByRole("button", { name: "Analizar progreso", exact: true }).click();
  await response;
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].sourceReportIds, ["attenti-2022", "attenti-2026"]);
  assert.equal(posts[0].groupId, "attenti");
  assert.deepEqual(posts[0].knowledgeSelection, { sourceIds: [] });
});
test("Rules prevents comparison when the project has no reports", async (t) => {
  const { page, posts } = await setup(t, []);
  await page.getByText("Generá primero un reporte de este proyecto en Reports.").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Continuar con knowledge" }).isDisabled(),
    true,
  );
  assert.deepEqual(posts, []);
});
