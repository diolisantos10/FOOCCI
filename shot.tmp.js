const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-FOOCCI/b9c343fc-6047-5924-8ea8-b9312faba7f6/scratchpad/';
const URL = 'http://localhost:3010/site';
const SIZES = [
  { name: '375', w: 375, h: 812, heroH: 1000 },
  { name: '768', w: 768, h: 1024, heroH: 1200 },
  { name: '1280', w: 1280, h: 800, heroH: 900 },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const s of SIZES) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}home-${s.name}-hero.png`, clip: { x: 0, y: 0, width: s.w, height: s.heroH } });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const totalH = await page.evaluate(() => document.documentElement.scrollHeight);
    const calc = page.locator('#calculadora');
    await calc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await calc.screenshot({ path: `${OUT}calc-${s.name}-vazio.png` });
    await page.fill('#faturamento', '40000');
    await page.waitForTimeout(500);
    await calc.screenshot({ path: `${OUT}calc-${s.name}-40k.png` });
    console.log(`${s.name}: scrollWidth=${scrollW} (viewport ${s.w}) alturaTotal=${totalH}px`);
    await page.close();
  }
  await browser.close();
})();
