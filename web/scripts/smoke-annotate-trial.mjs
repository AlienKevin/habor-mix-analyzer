import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3456";
const TRIALS = (process.env.SMOKE_TRIALS ?? "trial-06,trial-04,trial-12").split(",").map((s) => s.trim());

async function smokeTrial(page, trialId) {
  const url = `${BASE}/annotate/${trialId}/`;
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });

  const gate = page.getByRole("heading", { name: "Sign in to annotate" });
  if (await gate.isVisible().catch(() => false)) {
    await page.getByLabel("Your name").fill("smoke-test");
    const tokenField = page.getByLabel(/API token/i);
    if (await tokenField.isVisible().catch(() => false)) {
      await tokenField.fill(process.env.ANNOTATION_API_TOKEN ?? "smoke-token");
    }
    await page.getByRole("button", { name: "Load my annotations" }).click();
    await page.waitForLoadState("networkidle");
  }

  await page.waitForTimeout(1500);

  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.85));
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  const workspace = page.getByText(/Workspace at step/i);
  const hasWorkspace = await workspace.isVisible().catch(() => false);
  const diffView = page.locator(".annotate-diff");
  const hasDiff = await diffView.count().then((n) => n > 0);

  return { trialId, url, hasWorkspace, hasDiff, consoleErrors, pageErrors };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    "harbor-annotate-v2",
    JSON.stringify({ version: 1, annotator: "smoke-test", reviews: {} }),
  );
});
const page = await context.newPage();

const results = [];
for (const trialId of TRIALS) {
  try {
    results.push(await smokeTrial(page, trialId));
  } catch (err) {
    results.push({
      trialId,
      url: `${BASE}/annotate/${trialId}/`,
      fatal: String(err),
      consoleErrors: [],
      pageErrors: [],
    });
  }
}

await browser.close();

let failed = false;
for (const r of results) {
  console.log(`\n=== ${r.trialId} ===`);
  console.log(`url: ${r.url}`);
  if (r.fatal) {
    console.log("FATAL:", r.fatal);
    failed = true;
    continue;
  }
  console.log(`workspace visible: ${r.hasWorkspace}`);
  console.log(`diff rendered: ${r.hasDiff}`);
  if (r.pageErrors.length) {
    console.log("page errors:");
    for (const e of r.pageErrors) console.log(" ", e);
    failed = true;
  }
  const badConsole = r.consoleErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("404") && !e.includes("Failed to load resource"),
  );
  if (badConsole.length) {
    console.log("console errors:");
    for (const e of badConsole) console.log(" ", e);
    failed = true;
  }
  if (!r.pageErrors.length && !badConsole.length) console.log("OK — no client errors while scrolling");
}

process.exit(failed ? 1 : 0);
