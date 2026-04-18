/**
 * Scraper for Sushi Cazza public menu via Neemo API.
 *
 * Strategy:
 *  1. Open the page in Playwright so the SPA fires its own authenticated API calls
 *  2. Intercept the /menu response and save the raw JSON
 *  3. Parse the Neemo menu schema into the Foocci import format
 *  4. Fall back to DOM scraping if API capture fails
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "https://web-ecommerce-git-ecommerceweb571-appneemo.vercel.app/sushicazza";
const OUT = path.join(__dirname, "../data/sushi-cazza-scraped.json");
const RAW_OUT = "/tmp/sushi-cazza-raw-api.json";

// Delivery categories the user asked to scope to (all others still included)
const SKIP_CATEGORIES = []; // extract everything visible

function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function parsePrice(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Neemo schema → Foocci schema ─────────────────────────────────────────────

function buildDescription(item) {
  const parts = [];
  if (item.description && item.description.trim()) {
    parts.push(norm(item.description.replace(/<[^>]+>/g, " ")));
  }
  return parts.join(" ") || null;
}

/**
 * Returns { price, channelNote }
 * - price: the best delivery price, or 0 for modifier-based items
 * - channelNote: "presencial_only" if the item has no delivery price configured
 */
function resolvePrice(item) {
  const hasComplements = (item.complement_categories || []).some(cc => (cc.complements || cc.items || []).length > 0);

  // Modifier-based items: base price is always 0 — variants carry the price
  if (hasComplements) {
    const prices = item.prices || [];
    const directDelivery = prices.find(p => p.delivery?.value > 0)?.delivery?.value ?? null;
    // Only use direct delivery price if it's a fixed price (not just the lower_price min)
    // For complement items the direct delivery value is 0; lower_price.delivery is the floor
    if (directDelivery === null) return { price: 0, channelNote: null };
    return { price: 0, channelNote: null };
  }

  // Fixed-price items
  const prices = item.prices || [];
  for (const p of prices) {
    const del = p.delivery?.value;
    if (del != null && del > 0) return { price: del, channelNote: null };
  }

  // lower_price fallback
  const ld = item.lower_price?.delivery;
  if (ld != null && ld > 0) return { price: ld, channelNote: null };

  // top-level value
  if (item.value && item.value > 0) return { price: item.value, channelNote: null };

  // Table-only: presencial item
  const lt = item.lower_price?.table ?? 0;
  const tablePrice = prices.find(p => p.table?.value > 0)?.table?.value ?? lt;
  if (tablePrice > 0) return { price: tablePrice, channelNote: "presencial_only" };

  return { price: 0, channelNote: null };
}

function resolveImage(item) {
  // Neemo item.image is an object with original/large/small/medium URLs
  if (item.image?.large) return item.image.large;
  if (item.image?.original) return item.image.original;
  if (typeof item.image === "string" && item.image) return item.image;
  if (item.photo?.url) return item.photo.url;
  return null;
}

function buildModifiers(item) {
  const mods = [];
  const compCats = item.complement_categories || item.complements_categories || item.complementCategories || [];
  for (const cc of compCats) {
    if (!cc.enabled && cc.enabled !== undefined) continue;
    const options = [];
    const comps = cc.complements || cc.items || [];
    for (const c of comps) {
      if (!c.enabled && c.enabled !== undefined) continue;
      const optName = norm(c.title || c.name || "");
      if (!optName) continue;
      // Neemo complement price field is simply "price"
      const p = parsePrice(c.price ?? c.delivery_price ?? c.value ?? 0);
      options.push({ name: optName, price: p ?? 0 });
    }
    if (options.length > 0) {
      const ccName = norm(cc.title || cc.name || "Escolha sua opção");
      // minimum_choice > 0 means required
      const required = (cc.minimum_choice ?? cc.min_quantity ?? 0) > 0;
      mods.push({ name: ccName, required, options });
    }
  }
  return mods;
}

function catDescription(catName) {
  const map = {
    "festival": "Combo completo especial com entradas, pratos quentes, frios e sobremesa.",
    "entrada": "Entradas leves e saborosas para começar o pedido com clássicos da culinária japonesa.",
    "combo": "Combinações completas pensadas para dividir ou aproveitar sozinho.",
    "quente": "Pratos quentes como yakisoba, teppan e frango empanado.",
    "lámen": "Sopas quentes no estilo japonês com caldo encorpado e macarrão.",
    "porção": "Porções para compartilhar — entrada ou prato principal.",
    "hot roll": "Sushis empanados e quentinhos, crocantes por fora e macios por dentro.",
    "poke": "Bowls com base de arroz ou mix de folhas, coberturas e molhos variados.",
    "temaki": "Cones de alga com arroz e recheios variados, feitos na hora.",
    "jhow": "Especialidades exclusivas da casa com combinações autorais.",
    "sashimi": "Fatias frescas de salmão, ideais para quem prefere o sabor puro do peixe sem arroz.",
    "niguiri": "Bolinhos de arroz prensado com cobertura de peixe fresco.",
    "uramaki": "Sushis enrolados com arroz por fora, com combinações clássicas e especiais.",
    "hossomaki": "Enrolados finos e tradicionais, simples e saborosos.",
    "bebida": "Bebidas para acompanhar o pedido, das opções clássicas às mais refrescantes.",
    "molho": "Molhos, extras e hashi para personalizar seu pedido.",
    "cazza hot": "Versões exclusivas da Cazza com ingredientes especiais e finalização diferenciada.",
  };
  const n = (catName || "").toLowerCase();
  for (const [kw, desc] of Object.entries(map)) {
    if (n.includes(kw)) return desc;
  }
  return "Seleção especial da Cazza.";
}

function transformNeemoMenu(rawData) {
  // rawData.data may be the payload
  const root = rawData.data ?? rawData;

  // Neemo structure: root.categories[] or root.menu[] or root itself is array
  let categories = [];
  if (Array.isArray(root)) {
    categories = root;
  } else if (Array.isArray(root.categories)) {
    categories = root.categories;
  } else if (Array.isArray(root.menu)) {
    categories = root.menu;
  } else {
    // Try to find a key that holds an array of objects with "name" and "items"
    for (const v of Object.values(root)) {
      if (Array.isArray(v) && v[0]?.name && (v[0]?.items || v[0]?.products)) {
        categories = v;
        break;
      }
    }
  }

  const result = [];
  for (const cat of categories) {
    const catName = norm(cat.name || cat.title || "");
    if (!catName) continue;

    const rawItems = cat.items || cat.products || cat.menu_items || [];
    const items = [];

    for (const raw of rawItems) {
      if (!raw.enabled && raw.enabled !== undefined) continue; // skip disabled
      const name = norm(raw.name || raw.title || "");
      if (!name) continue;

      const { price, channelNote } = resolvePrice(raw);
      const modifiers = buildModifiers(raw);

      const itemObj = {
        name,
        description: buildDescription(raw) || null,
        price,
        image: resolveImage(raw),
        modifiers,
      };
      if (channelNote) itemObj.channelNote = channelNote;

      items.push(itemObj);
    }

    result.push({
      name: catName,
      description: catDescription(catName),
      items,
    });
  }

  return result;
}

// ── DOM fallback scraper ──────────────────────────────────────────────────────

async function domScrape(page) {
  console.log("\nFalling back to DOM scraping...");

  // Dismiss cookie banner if present
  try {
    await page.locator('button:has-text("Aceitar"), button:has-text("Accept")').first().click({ timeout: 3000 });
    await page.waitForTimeout(500);
  } catch {}

  // Collect category sections visible on page
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log("Page text length:", pageText.length);

  // Extract from rendered HTML structure
  const extracted = await page.evaluate(() => {
    const result = [];

    // Look for category sections — Neemo typically renders category title + item grid
    // Try multiple structural patterns
    const sectionPatterns = [
      { section: '[class*="category-section"]', title: '[class*="category-title"], h2, h3', item: '[class*="product"], [class*="item-card"]' },
      { section: 'section', title: 'h2, h3', item: '[class*="card"], [class*="item"]' },
      { section: '[class*="group"]', title: 'h2, h3, [class*="name"]', item: '[class*="product"]' },
    ];

    for (const pattern of sectionPatterns) {
      const sections = document.querySelectorAll(pattern.section);
      if (sections.length === 0) continue;

      for (const section of sections) {
        const titleEl = section.querySelector(pattern.title);
        if (!titleEl) continue;
        const catName = titleEl.innerText?.trim();
        if (!catName || catName.length > 80) continue;

        const items = [];
        const itemEls = section.querySelectorAll(pattern.item);
        for (const itemEl of itemEls) {
          const text = itemEl.innerText?.trim();
          if (!text) continue;
          const img = itemEl.querySelector("img");
          const imgSrc = img?.src || img?.dataset?.src || null;

          const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
          const name = lines[0];
          const priceLine = lines.find(l => l.includes("R$"));
          const price = priceLine ? parseFloat(priceLine.replace(/[^0-9,]/g, "").replace(",", ".")) : 0;
          const desc = lines.slice(1).filter(l => !l.includes("R$")).join(" ");

          if (name && name.length > 1) {
            items.push({ name, description: desc || null, price: price || 0, image: imgSrc, modifiers: [] });
          }
        }

        if (items.length > 0) {
          result.push({ name: catName, description: "", items });
        }
      }
      if (result.length > 0) break;
    }

    return result;
  });

  return extracted;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Sushi Cazza — full menu scraper");
  console.log(`Source: ${URL}`);
  console.log(`Output: ${OUT}\n`);

  let capturedMenuData = null;
  let allNetworkData = [];

  const browser = await chromium.launch({
    headless: true,
    args: ["--ignore-certificate-errors", "--disable-web-security"],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Intercept all JSON API responses
  page.on("response", async (response) => {
    try {
      const url = response.url();
      const status = response.status();
      if (status !== 200) return;
      const ct = response.headers()["content-type"] || "";
      if (!ct.includes("json")) return;

      const body = await response.json().catch(() => null);
      if (!body) return;

      allNetworkData.push({ url, body });

      // Specifically capture the menu endpoint
      if (url.includes("/menu") && !url.includes("menu_settings")) {
        console.log(`\n✓ Captured menu API: ${url}`);
        capturedMenuData = body;
        fs.writeFileSync(RAW_OUT, JSON.stringify(body, null, 2));
        console.log(`  Raw API response saved to ${RAW_OUT}`);
      }
    } catch {}
  });

  try {
    console.log("Loading page (waiting for network idle)...");
    await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(4000);

    console.log(`Intercepted ${allNetworkData.length} JSON API calls total`);
    for (const { url } of allNetworkData) {
      console.log(`  - ${url}`);
    }

    let categories = [];

    // ── Path 0: use cached raw API file if live capture failed ────────────────
    if (!capturedMenuData && fs.existsSync(RAW_OUT)) {
      console.log(`\nUsing cached raw API data from ${RAW_OUT}`);
      capturedMenuData = JSON.parse(fs.readFileSync(RAW_OUT, "utf-8"));
    }

    // ── Path 1: use captured API data ────────────────────────────────────────
    if (capturedMenuData) {
      console.log("\nParsing captured API data...");
      console.log("Raw keys:", Object.keys(capturedMenuData));
      fs.writeFileSync(RAW_OUT, JSON.stringify(capturedMenuData, null, 2));
      categories = transformNeemoMenu(capturedMenuData);
      console.log(`Parsed ${categories.length} categories from API`);
    }

    // ── Path 2: check other intercepted data ──────────────────────────────────
    if (categories.length === 0) {
      for (const { url, body } of allNetworkData) {
        const trial = transformNeemoMenu(body);
        if (trial.length > 0) {
          console.log(`\nFound menu data in: ${url}`);
          categories = trial;
          break;
        }
      }
    }

    // ── Path 3: DOM scrape ─────────────────────────────────────────────────────
    if (categories.length === 0) {
      categories = await domScrape(page);
    }

    // ── Validate & write output ───────────────────────────────────────────────
    const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
    const totalVariants = categories.reduce((s, c) =>
      s + c.items.reduce((si, i) => si + i.modifiers.reduce((sm, m) => sm + m.options.length, 0), 0), 0);

    console.log("\n━━━ Extraction Results ━━━");
    for (const cat of categories) {
      const variants = cat.items.reduce((s, i) => s + i.modifiers.reduce((sm, m) => sm + m.options.length, 0), 0);
      console.log(`  [${cat.name}] ${cat.items.length} items, ${variants} variant options`);
    }
    console.log(`\n  Total categories : ${categories.length}`);
    console.log(`  Total items      : ${totalItems}`);
    console.log(`  Total variants   : ${totalVariants}`);

    if (categories.length === 0) {
      console.error("\nERROR: No menu data could be extracted.");
      process.exit(1);
    }

    const output = {
      _meta: {
        source: "Sushi Cazza — live scrape via Neemo ecommerce API",
        scraped: new Date().toISOString().slice(0, 10),
        url: URL,
        total_categories: categories.length,
        total_items: totalItems,
      },
      categories,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
    console.log(`\n✓ Saved to ${OUT}`);

    // Validate JSON
    JSON.parse(fs.readFileSync(OUT, "utf-8"));
    console.log("✓ JSON is valid");

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
