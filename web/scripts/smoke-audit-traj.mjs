// Local read-only smoke for the audit trajectory viewers.
//   node scripts/smoke-audit-traj.mjs <rollout_id>
// Verifies the verdict page links to both viewers and that each viewer renders
// steps (client-fetched from /audit-traj/). Screenshots to /tmp.
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const ID = process.argv[2] || "seal0-second-largest-rice-producer__bea09334-e34e-4677-9fed-7b069590945e";

const browser = await chromium.launch();
const page = await browser.newPage();
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };

try {
  // 1) verdict page has both links
  await page.goto(`${BASE}/audit/${ID}/`, { waitUntil: "networkidle" });
  const agentLink = await page.getByRole("link", { name: /Agent rollout trajectory/ }).count();
  const judgeLink = await page.getByRole("link", { name: /Judge audit trace/ }).count();
  console.log(`verdict page: agent-link=${agentLink} judge-link=${judgeLink}`);
  if (!agentLink || !judgeLink) fail("missing trajectory link(s) on verdict page");

  // 2) each viewer renders steps
  for (const which of ["agent", "judge"]) {
    await page.goto(`${BASE}/audit/${ID}/${which}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => {
        const ol = document.querySelector("ol");
        const err = [...document.querySelectorAll("p")].some((p) => /not available/i.test(p.textContent || ""));
        return (ol && ol.querySelectorAll("li").length > 0) || err;
      },
      { timeout: 15000 },
    ).catch(() => {});
    const nSteps = await page.locator("ol > li").count();
    const header = (await page.locator("header").innerText().catch(() => "")) || "";
    const hasModel = /model/i.test(header);
    console.log(`  ${which}: steps=${nSteps} header-has-model=${hasModel}`);
    if (nSteps === 0) fail(`${which} viewer rendered 0 steps`);
    await page.screenshot({ path: `/tmp/audit-${which}.png`, fullPage: false });
  }
  console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
}
