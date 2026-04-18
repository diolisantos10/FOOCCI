/**
 * Phase 1: DOM reconnaissance — capture the live rendered structure
 * after clicking through categories, so we know the exact selectors
 * before writing the full extractor.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const URL = "https://web-ecommerce-git-ecommerceweb571-appneemo.vercel.app/sushicazza";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--ignore-certificate-errors", "--disable-web-security"],
  });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  console.log("Loading page...");
  await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);

  // Dismiss cookie banner
  try {
    await page.locator('button:has-text("Aceitar")').first().click({ timeout: 3000 });
    await page.waitForTimeout(500);
  } catch {}

  // Find category buttons
  const catButtons = await page.locator('[data-test^="category-button"]').all();
  console.log(`Category buttons found: ${catButtons.length}`);
  for (let i = 0; i < catButtons.length; i++) {
    const btn = catButtons[i];
    const text = await btn.innerText().catch(() => "");
    const testId = await btn.getAttribute("data-test").catch(() => "");
    console.log(`  [${i}] ${testId}: "${text.trim()}"`);
  }

  // Click the first real category and inspect the item structure
  if (catButtons.length > 0) {
    console.log("\nClicking first category...");
    await catButtons[0].click();
    await page.waitForTimeout(2000);

    // Save HTML after category click
    const html = await page.content();
    fs.writeFileSync("/tmp/sushi-after-click.html", html);
    console.log(`HTML after click: ${html.length} bytes`);

    // Try to find item cards
    const allTestIds = await page.evaluate(() => {
      const els = document.querySelectorAll('[data-test]');
      const ids = new Set();
      for (const el of els) ids.add(el.getAttribute('data-test'));
      return [...ids];
    });
    console.log("\nAll data-test attributes on page:", allTestIds.filter(id => id).sort());

    // Try common selectors
    for (const sel of [
      '[data-test^="product"]',
      '[data-test*="item"]',
      '[data-test*="card"]',
      '[class*="product"]',
      '[class*="item-card"]',
      '[class*="ProductCard"]',
      'article',
    ]) {
      const count = await page.locator(sel).count();
      if (count > 0) console.log(`  Selector "${sel}": ${count} matches`);
    }

    // Look for elements containing R$ with price pattern
    const priceEls = await page.evaluate(() => {
      const results = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (/R\$\s*\d+/.test(text) || /^\d+[,.]\d+$/.test(text)) {
          const parent = node.parentElement;
          results.push({
            text,
            tag: parent?.tagName,
            className: parent?.className?.slice(0, 80),
            parentClassName: parent?.parentElement?.className?.slice(0, 80),
          });
        }
      }
      return results.slice(0, 20);
    });
    console.log("\nElements with prices:", JSON.stringify(priceEls, null, 2));
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
