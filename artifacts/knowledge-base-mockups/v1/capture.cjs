// Run from the repository root: node artifacts/knowledge-base-mockups/v1/capture.cjs
// Uses the frontend's existing Playwright dependency and installed Chrome.
const { createRequire } = require("node:module");
const { resolve, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mkdir, writeFile } = require("node:fs/promises");
const assert = require("node:assert/strict");
const requireFrontend = createRequire(
  resolve(__dirname, "../../../frontend/package.json"),
);
const { chromium } = requireFrontend("playwright");

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  const directory = join(__dirname, "screenshots");
  await mkdir(directory, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const base = pathToFileURL(join(__dirname, "index.html")).href;
  const externalRequests = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });
  const checks = [];
  async function screen(name) {
    await page.goto(base + "#" + name);
    // Reset ephemeral demo edits so every capture is reproducible and toast-free.
    await page.reload();
    await page.locator("#app h2").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function capture(name) {
    await page.screenshot({
      path: join(directory, name + ".png"),
      fullPage: true,
    });
  }
  try {
    for (const [hash, file] of [
      ["workspace", "01-workspace"],
      ["project", "02-project"],
      ["upload", "03-upload"],
      ["drive", "04-google-drive"],
      ["detail", "05-document-detail"],
      ["connections", "06-connections"],
      ["sources", "07-report-sources"],
      ["report", "08-saved-report"],
      ["empty", "09-empty-state"],
      ["plugins", "10-plugin-resources"],
      ["sources-partial", "11-partial-selection"],
      ["sources-none", "12-no-knowledge"],
      ["drive-expired", "13-reconnect-drive"],
      ["upload-done", "14-upload-result"],
      ["detail-unavailable", "15-unavailable-source"],
    ]) {
      await screen(hash);
      await capture(file);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        hash + " overflows horizontally",
      );
    }
    checks.push("15 desktop screens render without horizontal overflow");

    await screen("sources");
    assert.equal(await page.locator("[data-source-id]:checked").count(), 5);
    assert.equal(await page.locator("[data-source-id]:disabled").count(), 2);
    assert.equal(await page.locator("#select-all").isChecked(), true);
    await page
      .getByRole("checkbox", {
        name: "Use Architecture decisions.docx",
        exact: true,
      })
      .uncheck();
    assert.equal(
      await page
        .locator('[data-folder-check="documentation"]')
        .evaluate((el) => el.indeterminate),
      true,
    );
    assert.equal(
      await page.locator("#select-all").evaluate((el) => el.indeterminate),
      true,
    );
    assert.match(
      await page.locator("#source-summary").innerText(),
      /4\s*documents selected/,
    );
    await page
      .getByRole("checkbox", { name: "Select Documentation", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Select Documentation", exact: true })
      .uncheck();
    assert.equal(await page.locator("[data-source-id]:checked").count(), 3);
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    assert.equal(await page.locator("[data-source-id]:checked").count(), 5);
    await page
      .getByRole("button", { name: "Deselect all", exact: true })
      .click();
    assert.match(
      await page.locator("#source-summary").innerText(),
      /No knowledge selected/,
    );
    await page.getByRole("button", { name: "Generate demo report" }).click();
    assert.match(
      await page.locator(".sources-aside").innerText(),
      /0 documents/,
    );
    assert.match(
      await page.locator(".sources-aside").innerText(),
      /No knowledge documents were used/,
    );
    checks.push(
      "Default selection, unavailable files, nested and partial folder state, select all, deselect all and plugin-only report",
    );

    await screen("sources");
    await page
      .getByRole("checkbox", {
        name: "Use Architecture decisions.docx",
        exact: true,
      })
      .uncheck();
    await page.getByRole("button", { name: "Generate demo report" }).click();
    assert.match(
      await page.locator(".sources-aside").innerText(),
      /4 documents/,
    );
    assert.doesNotMatch(
      await page.locator(".sources-aside").innerText(),
      /Architecture decisions/,
    );
    await page
      .getByRole("button", { name: "Open source 1", exact: true })
      .click();
    assert.match(
      await page.getByRole("dialog").innerText(),
      /v3 · Nov 2, 2026/,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    checks.push(
      "Report preserves exact selected source set and versioned references",
    );

    await screen("project");
    await page
      .getByRole("button", { name: "Exclude Project brief.pdf", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Report sources", exact: true })
      .click();
    assert.equal(await page.locator('[data-source-id="brief"]').count(), 0);
    await page.goto(base + "#workspace");
    assert.match(
      await page.locator("#library-rows").innerText(),
      /Project brief.pdf/,
    );
    checks.push(
      "Project exclusion removes source from report choices without changing workspace",
    );

    await screen("workspace");
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Folder name", exact: true })
      .fill("Research references");
    await page
      .getByRole("button", { name: "Create folder", exact: true })
      .click();
    assert.match(
      await page.locator("#library-rows").innerText(),
      /Research references/,
    );
    await page
      .getByRole("textbox", { name: "Search knowledge sources", exact: true })
      .fill("Architecture");
    assert.match(
      await page.locator("#library-rows").innerText(),
      /Architecture decisions/,
    );
    assert.doesNotMatch(
      await page.locator("#library-rows").innerText(),
      /Project brief/,
    );
    checks.push("Folder creation and library search");

    await screen("upload");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    assert.doesNotMatch(
      await page.locator(".workflow-card").innerText(),
      /Upload failed/,
    );
    await page.locator("#file-input").setInputFiles({
      name: "Demo deliverable.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("Fictional placeholder"),
    });
    assert.match(
      await page.locator(".workflow-card").innerText(),
      /Demo deliverable.pdf/,
    );
    await page
      .getByRole("button", { name: "Upload files", exact: true })
      .click();
    assert.match(
      await page.locator(".workflow-card").innerText(),
      /Upload complete/,
    );
    checks.push(
      "Per-file upload retry and local filename-only upload simulation",
    );

    await screen("drive");
    assert.equal(await page.locator("[data-drive-id]:checked").count(), 2);
    await page.locator('[data-drive-id="drive-course"]').uncheck();
    await page.locator('[data-drive-id="drive-objectives"]').uncheck();
    assert.equal(
      await page
        .getByRole("button", { name: "Connect selected", exact: true })
        .isDisabled(),
      true,
    );
    await page.locator('[data-drive-id="drive-course"]').check();
    await page
      .getByRole("button", { name: "Connect selected", exact: true })
      .click();
    assert.match(
      await page.locator(".connection-grid").innerText(),
      /Connection added/,
    );
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    assert.match(await page.locator("#last-sync").innerText(), /Just now/);
    await screen("drive-expired");
    assert.equal(
      await page
        .getByRole("button", { name: "Connect selected", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-action="connect-drive"]').disabled,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Connect selected", exact: true })
        .isDisabled(),
      false,
    );
    checks.push(
      "Drive selection, empty selection, simulated connection, sync and expired authorization recovery",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    for (const [hash, file] of [
      ["workspace", "16-mobile-library"],
      ["sources", "17-mobile-sources"],
      ["upload", "18-mobile-upload"],
      ["drive", "19-mobile-drive"],
      ["connections", "20-mobile-connections"],
      ["report", "21-mobile-report"],
    ]) {
      await screen(hash);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        hash + " mobile overflow",
      );
      await capture(file);
    }
    checks.push("Six mobile screens at 390 px without horizontal overflow");
    await page.setViewportSize({ width: 1600, height: 1150 });
    await page.goto(pathToFileURL(join(__dirname, "gallery.html")).href);
    await page.locator(".card").first().waitFor();
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = "eager";
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    assert.equal(await page.locator(".card").count(), 21);
    assert.equal(
      await page.evaluate(() =>
        Array.from(document.images).every((image) => image.naturalWidth > 0),
      ),
      true,
    );
    await page.screenshot({ path: join(__dirname, "overview.png") });
    checks.push(
      "Review gallery contains all 21 captures with no missing images",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    checks.push("No browser errors and no HTTP/API requests");
    const result = {
      type: "Simulated UI prototype verification; not production integration evidence",
      screenshots: 21,
      checks,
      errors,
      externalRequests,
    };
    await writeFile(
      join(__dirname, "verification.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
