import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "/tmp/claude-0/-home-user-FOOCCI/b9c343fc-6047-5924-8ea8-b9312faba7f6/scratchpad/assist";
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: "375", width: 375, height: 780 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
];
const BASE = "http://localhost:3000";
const PAGE = process.env.SHOT_PAGE ?? "/menu";

const browser = await chromium.launch();

for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", size.name, e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@pizzaria-demo.com");
  await page.fill('input[type="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  await page.screenshot({ path: `${OUT}/a-barra-${size.name}.png` });

  await page.click('input[aria-label="Perguntar ao assistente Foocci"]', { force: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/b-sugestoes-${size.name}.png` });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("foocci:help-open", { detail: { tab: "ajuda" } })));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/c-conversa-${size.name}.png` });

  const expand = page.locator('button[aria-label="Expandir"]');
  if (await expand.count()) {
    await expand.first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/d-expandida-${size.name}.png` });
  }

  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: window.innerWidth }));
  console.log(size.name, JSON.stringify(w));
  await ctx.close();
}
await browser.close();
console.log("ok");
