/**
 * scrape-menu.js
 * Fetches the Sushi Cazza menu from the Neemo ecommerce API.
 *
 * Strategy:
 *   1. GET the storefront page to extract the access_token from __NEXT_DATA__
 *   2. Call the menu API directly with that token
 *   3. Save the raw JSON to cardapio.json
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const STOREFRONT_URL = "https://web-ecommerce-git-ecommerceweb571-appneemo.vercel.app/sushicazza";
const MENU_URL       = "https://ecommerce-api.prod.neemo.com.br/api/ecommerce/v1/merchants/sushicazza/menu";
const OUT_FILE       = path.join(__dirname, "../cardapio.json");

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 scraper" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "accept":        "application/json",
        "authorization": token,
        "origin":        "https://web-ecommerce-git-ecommerceweb571-appneemo.vercel.app",
        "referer":       "https://web-ecommerce-git-ecommerceweb571-appneemo.vercel.app/",
        "user-agent":    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      },
    };
    https.get(url, opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse failed: " + e.message)); }
      });
    }).on("error", reject);
  });
}

(async () => {
  // ── Step 1: extract access token ────────────────────────────────────────────
  console.log("Fetching storefront to extract token…");
  const html = await fetchText(STOREFRONT_URL);

  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(\{.*?\})<\/script>/s);
  if (!match) {
    console.error("❌  Could not locate __NEXT_DATA__ in page HTML.");
    process.exit(1);
  }

  let token;
  try {
    const nextData = JSON.parse(match[1]);
    token = nextData?.props?.pageProps?.preloadedState?.global?.access_token;
  } catch (e) {
    console.error("❌  Failed to parse __NEXT_DATA__:", e.message);
    process.exit(1);
  }

  if (!token) {
    console.error("❌  access_token not found in __NEXT_DATA__.");
    process.exit(1);
  }

  console.log("✓ Token extracted:", token.slice(0, 12) + "…");

  // ── Step 2: call the menu API ────────────────────────────────────────────────
  console.log("Fetching menu…");
  let menuJson;
  try {
    menuJson = await fetchJson(MENU_URL, token);
  } catch (e) {
    console.error("❌  Menu API request failed:", e.message);
    process.exit(1);
  }

  // ── Step 3: normalise + save ─────────────────────────────────────────────────
  const root       = menuJson.data ?? menuJson;
  const categories = root.categories ?? root.sections ?? [];

  const totalItems = categories.reduce((sum, cat) => {
    return sum + (cat.items ?? cat.products ?? []).length;
  }, 0);

  fs.writeFileSync(OUT_FILE, JSON.stringify(menuJson, null, 2), "utf-8");

  console.log("\n━━━ RESULTADO ━━━");
  console.log(`  Categorias : ${categories.length}`);
  console.log(`  Itens      : ${totalItems}`);
  console.log(`  Arquivo    : ${OUT_FILE}`);
  console.log("\nPrimeiras categorias:");
  categories.slice(0, 8).forEach((c, i) => {
    const name  = c.name ?? c.title ?? c.label ?? "(sem nome)";
    const count = (c.items ?? c.products ?? []).length;
    console.log(`  [${i + 1}] ${name} (${count} itens)`);
  });
})();
