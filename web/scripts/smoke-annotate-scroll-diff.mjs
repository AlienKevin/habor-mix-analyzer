import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3456";
const TRIAL = process.env.SMOKE_TRIAL ?? "trial-06";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    "harbor-annotate-v2",
    JSON.stringify({ version: 1, annotator: "smoke-test", reviews: {} }),
  );
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(String(err)));

await page.goto(`${BASE}/annotate/${TRIAL}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector("text=Signed in as", { timeout: 30_000 }).catch(() => {});

let maxDiff = 0;
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => window.scrollBy(0, Math.max(500, window.innerHeight * 0.6)));
  await page.waitForTimeout(250);
  const n = await page.locator(".annotate-diff").count();
  if (n > maxDiff) maxDiff = n;
}

console.log(JSON.stringify({ trial: TRIAL, base: BASE, maxDiffViews: maxDiff, pageErrors }, null, 2));
await browser.close();
process.exit(pageErrors.length ? 1 : 0);
