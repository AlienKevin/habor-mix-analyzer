// Verify the audit UI changes: markdown rendering in trajectory viewers, the
// two-column verdict layout, and footnote → grounding scroll. Read-only.
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const VID = process.argv[2] || "featurebench-add-feature-lightning-hooks__f5d8cd96-9374-4ce6-9053-ec9d1a11093f";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };

try {
  // 1) markdown rendering on the judge trace
  await page.goto(`${BASE}/audit/${VID}/judge/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll("ol > li").length > 0, { timeout: 20000 }).catch(() => {});
  const md = await page.evaluate(() => {
    const blocks = document.querySelectorAll(".instruction-markdown");
    const rich = document.querySelectorAll(".instruction-markdown :is(h1,h2,h3,strong,ul,ol,code,pre)").length;
    const rawHash = [...document.querySelectorAll(".trajectory-markdown")].some((e) => /^#\s/m.test(e.textContent || "") && !e.querySelector("h1,h2,h3"));
    return { mdBlocks: blocks.length, richEls: rich, rawHashLeak: rawHash };
  });
  console.log(`markdown: blocks=${md.mdBlocks} richEls=${md.richEls} rawHashLeak=${md.rawHashLeak}`);
  if (md.mdBlocks === 0 || md.richEls === 0) fail("markdown not rendering rich elements");
  await page.screenshot({ path: "/tmp/audit-md.png" });

  // 2) two-column layout on the verdict page (wide)
  await page.goto(`${BASE}/audit/${VID}/`, { waitUntil: "networkidle" });
  const layout = await page.evaluate(() => {
    const sig = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim().startsWith("Verifier signal"));
    const grd = [...document.querySelectorAll("h2")].find((h) => /^Grounding/.test(h.textContent || ""));
    if (!sig || !grd) return { ok: false, why: "missing sig/grounding" };
    const a = sig.getBoundingClientRect(), b = grd.getBoundingClientRect();
    return { ok: true, sigLeft: Math.round(a.left), grdLeft: Math.round(b.left), sameRow: Math.abs(a.top - b.top) < 200, sideBySide: b.left > a.right };
  });
  console.log(`layout: sigLeft=${layout.sigLeft} grdLeft=${layout.grdLeft} sideBySide=${layout.sideBySide} sameRow=${layout.sameRow}`);
  if (!layout.ok || !layout.sideBySide) fail("grounding not to the right of signals on wide screen");
  await page.screenshot({ path: "/tmp/audit-layout.png", fullPage: false });

  // 3) footnote → grounding scroll
  const fnote = page.locator('a[href^="#ev-"]').first();
  if (await fnote.count()) {
    const href = await fnote.getAttribute("href");
    const before = await page.evaluate(() => window.scrollY);
    await fnote.click();
    await page.waitForTimeout(900); // smooth scroll
    const after = await page.evaluate(() => window.scrollY);
    const inView = await page.evaluate((id) => {
      const el = document.querySelector(id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= -5 && r.top < window.innerHeight * 0.6;
    }, href);
    console.log(`footnote: ${href} scrollY ${before}->${after} targetInView=${inView}`);
    if (!inView) fail("footnote did not bring grounding item into view");
  } else {
    console.log("footnote: none on this verdict (ok)");
  }
  console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
}
