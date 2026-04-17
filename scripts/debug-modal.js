const { chromium } = require("playwright");
const fs = require("fs");
const URL = "https://web-ecommerce-git-ecommerceweb571-appneemo.vercel.app/sushicazza";

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors", "--no-sandbox"] });
  const ctx  = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Navigate directly to REFRIGERANTE modal (item ID 1155041 from API data)
  // First load base page to establish cookies/session
  await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Aceitar")').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Scroll to BEBIDAS, click REFRIGERANTE via direct click with force
  await page.evaluate(() => {
    const el = document.getElementById("143252");
    if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await page.waitForTimeout(2000);

  const items = await page.locator('[id="143252"] [data-test^="item-"]').all();
  console.log("BEBIDAS items:", items.length);

  // Click REFRIGERANTE using force + wait for URL change
  let targetItem = null;
  for (const it of items) {
    const t = await it.innerText().catch(()=>"");
    if (t.includes("REFRI")) { targetItem = it; break; }
  }

  if (!targetItem) {
    console.log("REFRIGERANTE not found. Items:");
    for (const it of items) console.log(" -", (await it.innerText().catch(()=>"")).split("\n")[0]);
    await browser.close(); return;
  }

  console.log("Clicking REFRIGERANTE (force)...");
  await targetItem.click({ force: true, timeout: 5000 }).catch(e => console.log("Force click error:", e.message));
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log("URL after click:", url);

  // Check for modal
  const modalRoot = page.locator('.MuiModal-root, [id^="modal_item_"]').first();
  const isVisible = await modalRoot.isVisible({ timeout: 2000 }).catch(() => false);
  console.log("MuiModal-root visible:", isVisible);

  if (!isVisible) {
    // Navigate directly to modal URL
    const itemTestId = await targetItem.getAttribute("data-test").catch(()=>"");
    const itemId = itemTestId.replace("item-", "");
    const modalUrl = `${URL}?modal=menuItem&modalId=${itemId}`;
    console.log("Navigating directly to:", modalUrl);
    await page.goto(modalUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
  }

  // Find the modal
  const modalEl = page.locator('.MuiModal-root').first();
  const finalVisible = await modalEl.isVisible({ timeout: 3000 }).catch(() => false);
  console.log("Final modal visible:", finalVisible);

  // Dump ALL elements with [id^="modal_item"]
  const modals = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[id^="modal_item"]')).map(el => ({
      id: el.id,
      class: el.className.slice(0, 60),
      text: el.innerText.slice(0, 200)
    }));
  });
  console.log("modal_item elements:", JSON.stringify(modals, null, 2));

  // Dump full page modal content
  const allPresentation = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="presentation"]')).map(el => ({
      id: el.id,
      class: el.className.slice(0, 60),
      visible: el.offsetHeight > 0,
      text: el.innerText.slice(0, 300)
    }));
  });
  console.log("\nrole=presentation elements:", JSON.stringify(allPresentation.filter(e=>e.text), null, 2));

  // Save full HTML for analysis
  const html = await page.content();
  fs.writeFileSync("/tmp/modal-page.html", html.replace(/ style="[^"]{20,}"/g, ""));
  console.log("\nFull page HTML saved to /tmp/modal-page.html");

  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
