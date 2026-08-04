const { chromium } = require("playwright");
const BASE = "http://localhost:3111";
const OUT = process.env.OUT || "/tmp/claude-0/-home-user-FOOCCI/b9c343fc-6047-5924-8ea8-b9312faba7f6/scratchpad/shots";
const SIZES = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 900 },
];
const PAGES = (process.env.PAGES || "/site/experimente,/site/precos,/site/como-funciona").split(",");
(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  for (const path of PAGES) {
    for (const s of SIZES) {
      const ctx = await browser.newContext({
        viewport: { width: s.width, height: s.height },
        deviceScaleFactor: 2,
        isMobile: s.width < 768,
      });
      const page = await ctx.newPage();
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(1200);
      await page.evaluate(async () => {
        await new Promise((r) => {
          let y = 0;
          const step = () => {
            window.scrollTo(0, y);
            y += window.innerHeight;
            if (y < document.body.scrollHeight) setTimeout(step, 80);
            else { window.scrollTo(0, 0); setTimeout(r, 300); }
          };
          step();
        });
      });
      const slug = path.replace(/\//g, "_").replace(/^_/, "");
      const file = `${OUT}/${slug}-${s.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const metrics = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt"));
        const nameless = [...document.querySelectorAll("a,button")].filter(
          (e) => !(e.textContent || "").trim() && !e.getAttribute("aria-label") && !e.querySelector("img[alt]:not([alt=''])"),
        );
        return {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          h1: document.querySelectorAll("h1").length,
          h2: document.querySelectorAll("h2").length,
          imgsNoAlt: imgs.length,
          namelessInteractive: nameless.length,
        };
      });
      report.push({ path, size: s.name, file, ...metrics });
      await ctx.close();
    }
  }
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
