/**
 * DOM-based Playwright scraper — Sushi Cazza live storefront.
 * Resumable: saves per-category progress to /tmp/sushi-cazza-progress.json
 *
 * Confirmed selectors (from live DOM inspection):
 *   sections    : div[id=NUMERIC] with .mui-gfpd5k category name child
 *   item cards  : [data-test^="item-"]  inside section
 *   item name   : h2.mui-gaq71s  (in modal) / first text line (in card)
 *   item desc   : .mui-hkubne p  (in modal)
 *   modal open  : .MuiModal-root  (role="presentation", NOT role="dialog")
 *   modal click : force:true required (modal backdrop can intercept)
 *   comp groups : [data-test^="complement-group-header-"]
 *   comp options: p elements with dark class (name) and mui-12n5y6l class (price)
 *   close modal : .icon-close element
 */

const { chromium } = require("playwright");
const fs   = require("fs");
const path = require("path");

const URL      = "https://web-ecommerce-git-ecommerceweb571-appneemo.vercel.app/sushicazza";
const PROGRESS = "/tmp/sushi-cazza-progress.json";
const OUT      = path.join(__dirname, "../data/sushi-cazza-scraped-dom.json");

// ── helpers ───────────────────────────────────────────────────────────────────

const norm = s => (s || "").replace(/[\u00a0\s]+/g, " ").replace(/<[^>]+>/g, " ").trim();

function parsePrice(s) {
  const m = String(s || "").replace(/\./g, "").replace(",", ".").match(/\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}

function catDesc(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("festival"))          return "Combo completo especial da Cazza com entradas, pratos quentes, frios e sobremesa.";
  if (n.includes("entrada"))           return "Entradas leves para começar com clássicos da culinária japonesa.";
  if (n.includes("combo"))             return "Combinações completas pensadas para dividir ou aproveitar sozinho.";
  if (n.includes("quente"))            return "Pratos quentes como yakisoba, teppan e frango empanado.";
  if (n.includes("lámen")||n.includes("lamen")) return "Sopas quentes no estilo japonês com caldo encorpado e macarrão.";
  if (n.includes("porção")||n.includes("porcao")) return "Porções generosas para compartilhar — entrada ou prato principal.";
  if (n.includes("cazza hot"))         return "Versões exclusivas da Cazza com ingredientes especiais e finalização diferenciada.";
  if (n.includes("hot roll"))          return "Sushis empanados e quentinhos, crocantes por fora e macios por dentro.";
  if (n.includes("poke"))              return "Bowls com base de arroz, coberturas de salmão e molhos especiais.";
  if (n.includes("temaki"))            return "Cones de alga recheados com arroz e ingredientes frescos, feitos na hora.";
  if (n.includes("jhow"))              return "Criação exclusiva da Cazza — arroz envolto em lâmina de salmão.";
  if (n.includes("sashimi"))           return "Fatias frescas de salmão, puro sabor sem arroz.";
  if (n.includes("niguiri"))           return "Bolinhos de arroz prensado cobertos com salmão fresco.";
  if (n.includes("uramaki"))           return "Sushis enrolados com arroz por fora e gergelim, recheados de salmão.";
  if (n.includes("hossomaki"))         return "Enrolados finos e tradicionais, simples e saborosos.";
  if (n.includes("bebida"))            return "Bebidas geladas para acompanhar — refrigerantes, sucos, cervejas e caipirinhas.";
  if (n.includes("molho")||n.includes("hashi")) return "Molhos, extras e utensílios para personalizar seu pedido.";
  if (n.includes("rodizio")||n.includes("presencial")) return "Experiência presencial com rodízio de pratos da Cazza.";
  return "Seleção especial da Cazza.";
}

function loadProgress() {
  try { if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, "utf-8")); } catch {}
  return { done: [], categories: [] };
}
function saveProgress(s) { fs.writeFileSync(PROGRESS, JSON.stringify(s, null, 2)); }

// ── section discovery ─────────────────────────────────────────────────────────

async function discoverSections(page) {
  return page.evaluate(() => {
    const result = [];
    document.querySelectorAll("div[id]").forEach(el => {
      if (!/^\d+$/.test(el.id)) return;
      const firstChild = el.firstElementChild;
      if (!firstChild) return;
      const text = (firstChild.innerText || "").trim();
      if (!text || text.length > 80 || text.length < 2) return;
      if (/^\d/.test(text) || /R\$/.test(text)) return;
      result.push({ id: el.id, name: text });
    });
    const seen = new Set();
    return result.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
  });
}

// ── modal extractor ───────────────────────────────────────────────────────────

async function extractFromModal(page, itemId) {
  const modal = page.locator('.MuiModal-root').first();
  await modal.waitFor({ state: "visible", timeout: 5000 });

  // Name
  const name = norm(await page.locator(`#modal_item_${itemId} h2`).first().innerText().catch(() => ""));

  // Description
  const desc = norm(await page.locator(`#modal_item_${itemId} .mui-hkubne p`).first().innerText().catch(() => ""));

  // Price — first h4 containing R$
  let price = null;
  const h4s = await page.locator(`#modal_item_${itemId} h4`).all();
  for (const h4 of h4s) {
    const t = await h4.innerText().catch(() => "");
    if (/R\$/.test(t)) { price = parsePrice(t); break; }
  }

  // Image
  const imgSrc = await page.locator(`#modal_item_${itemId} img`).first().getAttribute("src").catch(() => null);

  // Modifier groups — stable data-test attributes
  const modifiers = [];
  const groupEls = await page.locator(`#modal_item_${itemId} [data-test^="complement-group-header-"]`).all();

  for (const groupEl of groupEls) {
    // Group name: h4 inside the header
    const groupName = norm(await groupEl.locator("h4").first().innerText().catch(() => ""));
    if (!groupName) continue;

    // Required: text contains "Obrigatório"
    const groupText = await groupEl.innerText().catch(() => "");
    const required  = /obrigatório/i.test(groupText);

    // Options: sibling div after this group header that contains option rows
    // Options are in the next sibling of the group header's parent
    const options = await groupEl.evaluate(headerEl => {
      const opts = [];
      // Options div is the next sibling of headerEl inside the group container
      let sibling = headerEl.nextElementSibling;
      while (sibling) {
        // Each option row is a flex div with name paragraph + price paragraph
        const rows = sibling.querySelectorAll("div");
        for (const row of rows) {
          const ps = row.querySelectorAll("p");
          if (ps.length < 2) continue;
          const nameTxt  = (ps[0].innerText || "").replace(/\s+/g, " ").trim();
          const priceTxt = (ps[1].innerText || "").replace(/[\u00a0\s]+/g, " ").trim();
          if (!nameTxt || nameTxt.length < 1) continue;
          const priceMatch = priceTxt.match(/[\d.,]+/);
          const priceVal   = priceMatch ? parseFloat(priceMatch[0].replace(/\./g, "").replace(",", ".")) : 0;
          if (nameTxt.length < 100 && !nameTxt.startsWith("+") && !/R\$/.test(nameTxt)) {
            opts.push({ name: nameTxt, price: priceVal });
          }
        }
        sibling = sibling.nextElementSibling;
      }
      return opts;
    });

    if (options.length > 0) {
      modifiers.push({ name: groupName, required, options });
    }
  }

  // Fallback: if no modifier groups found via data-test, parse innerText
  if (modifiers.length === 0) {
    const fullText = await modal.innerText().catch(() => "");
    const parsed = parseModifiersFromText(fullText, name);
    modifiers.push(...parsed);
  }

  return { name, desc, price, imgSrc, modifiers };
}

function parseModifiersFromText(text, itemName) {
  // Text format:
  //   ITEM NAME
  //   description
  //   A partir de R$ X,XX   (optional)
  //   GROUP NAME
  //   Escolha entre X e Y opções
  //   Obrigatório / Opcional
  //   OPTION NAME
  //   + R$ X,XX
  //   ...
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const groups = [];
  let i = 0;

  // Skip header lines (item name, description, price header)
  while (i < lines.length && !(/Escolha|obrigatório|opcional/i.test(lines[i]))) i++;

  while (i < lines.length) {
    // Find a group: look for "Escolha" marker
    if (!/Escolha/i.test(lines[i])) { i++; continue; }

    // Group name is the line BEFORE "Escolha"
    const groupName = norm(lines[i - 1] || "Opção");
    const required  = i + 1 < lines.length && /obrigatório/i.test(lines[i + 1]);
    i += required ? 2 : 1; // skip Escolha + Obrigatório/Opcional

    const options = [];
    while (i < lines.length) {
      const line = lines[i];
      // Stop at next group
      if (/Escolha/i.test(line)) break;
      // Price line
      if (/^\+\s*R\$/.test(line)) {
        const price = parsePrice(line);
        if (options.length > 0 && options[options.length-1].price === 0) {
          options[options.length-1].price = price ?? 0;
        }
        i++; continue;
      }
      // Option name (not a price, not Obrigatório)
      if (!/obrigatório|opcional|Grátis|A partir/i.test(line) && !/R\$/.test(line) && line.length > 0 && line !== itemName) {
        options.push({ name: norm(line), price: 0 });
      }
      i++;
    }

    if (options.length > 0) {
      groups.push({ name: norm(groupName), required, options });
    }
  }
  return groups;
}

async function closeModal(page) {
  try {
    // Click the .icon-close element
    await page.locator('.icon-close').first().click({ force: true, timeout: 2000 });
    await page.waitForTimeout(400);
  } catch {}
  // Ensure modal is gone
  await page.locator('.MuiModal-root').waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);
}

// ── section scraper ───────────────────────────────────────────────────────────

async function scrapeSection(page, sectionId, sectionName) {
  const PRESENCIAL = /rodizio|presencial/i.test(sectionName);

  // Scroll section into viewport center (not too far — virtual DOM unmounts off-screen items)
  await page.evaluate(id => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
  }, sectionId).catch(() => {});
  await page.waitForTimeout(1500);

  const itemSel = `[id="${sectionId}"] [data-test^="item-"]`;
  const appeared = await page.waitForSelector(itemSel, { timeout: 8000 }).catch(() => null);
  if (!appeared) return [];

  // Gently scroll to end of section to reveal remaining items (without leaving section)
  let prev = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await page.locator(itemSel).count();
    if (count === prev && attempt > 1) break;
    prev = count;
    await page.evaluate(id => {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        window.scrollBy(0, rect.height * 0.5);
      }
    }, sectionId).catch(() => {});
    await page.waitForTimeout(700);
    // Re-center on section
    await page.evaluate(id => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
    }, sectionId).catch(() => {});
    await page.waitForTimeout(400);
  }

  const itemCards = await page.locator(itemSel).all();
  const items     = [];

  for (let idx = 0; idx < itemCards.length; idx++) {
    const card = itemCards[idx];
    try {
      // Get item ID from data-test attribute
      const dataTest = await card.getAttribute("data-test").catch(() => "");
      const itemId   = dataTest.replace("item-", "");

      // Card-level extraction (fast, no click needed)
      const cardData = await card.evaluate(el => {
        // Name
        const nameEl = el.querySelector('[class*="1f26v1o"]') || el.querySelector('h2, h3');
        const name   = (nameEl?.innerText || "").replace(/\s+/g, " ").trim();

        // Description
        const descEl = el.querySelector('[class*="1banjbe"]') || el.querySelector('p');
        const desc   = (descEl?.innerText || "").replace(/\s+/g, " ").trim();

        // Price: leaf text nodes containing R$
        let price = null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const t = (node.textContent || "").replace(/\u00a0/g, " ").trim();
          if (/R\$/.test(t)) {
            const m = t.replace(/\./g, "").replace(",", ".").match(/\d+\.?\d*/);
            if (m) { price = parseFloat(m[0]); break; }
          }
        }

        // Image
        const img = el.querySelector("img");
        return {
          name,
          desc: desc !== name ? desc : "",
          price: price ?? 0,
          image: img?.src || img?.dataset?.src || null,
        };
      });

      if (!cardData.name) continue;

      // Click item to open modal and get richer data + modifiers
      let modifiers  = [];
      let finalName  = cardData.name;
      let finalDesc  = cardData.desc || null;
      let finalPrice = cardData.price;
      let finalImg   = cardData.image;

      try {
        // Keep section in view before clicking
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(200);

        // Force-click to open modal (backdrop may intercept otherwise)
        await card.click({ force: true, timeout: 4000 });
        await page.waitForTimeout(800);

        const modalOpen = await page.locator('.MuiModal-root').isVisible({ timeout: 2000 }).catch(() => false);

        if (modalOpen) {
          const modal = await extractFromModal(page, itemId);
          modifiers = modal.modifiers;
          if (modal.name  && modal.name.trim())  finalName  = modal.name.trim();
          if (modal.desc  && modal.desc.trim())  finalDesc  = modal.desc.trim();
          if (modal.price !== null && modal.price >= 0 && (finalPrice === 0 || modal.price > 0)) finalPrice = modal.price;
          if (modal.imgSrc) finalImg = modal.imgSrc;
          await closeModal(page);
        } else {
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(200);
        }
      } catch {
        await page.keyboard.press("Escape").catch(() => {});
        await closeModal(page).catch(() => {});
      }

      // For modifier-based items (variants carry price), keep base=0 if all options have prices
      const hasVariants = modifiers.length > 0 && modifiers.some(m => m.options.some(o => o.price > 0));

      items.push({
        name:        norm(finalName),
        description: finalDesc ? norm(finalDesc) : null,
        price:       hasVariants ? 0 : finalPrice,
        image:       finalImg,
        modifiers,
        channelNote: PRESENCIAL ? "presencial_only" : "",
      });
    } catch (err) {
      console.error(`    item[${idx}] ERR: ${(err.message||"").slice(0,80)}`);
    }
  }
  return items;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const state = loadProgress();
  if (state.done.length > 0) console.log(`Resuming. Completed: [${state.done.join(", ")}]`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--ignore-certificate-errors", "--disable-web-security", "--no-sandbox"],
  });
  const ctx  = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  try {
    await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(4000);
    await page.locator('button:has-text("Aceitar")').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);

    const sections = await discoverSections(page);
    console.log(`Sections: ${sections.length} — ${sections.map(s => s.name).join(", ")}`);

    for (const sec of sections) {
      if (state.done.includes(sec.name)) { console.log(`  skip: ${sec.name}`); continue; }

      process.stdout.write(`  ${sec.name} ... `);
      const items = await scrapeSection(page, sec.id, sec.name);

      const mods = items.reduce((s,i) => s+i.modifiers.length, 0);
      const opts = items.reduce((s,i) => s+i.modifiers.reduce((sm,m)=>sm+m.options.length,0), 0);
      console.log(`${items.length} items, ${mods} modifier groups, ${opts} options`);

      state.categories.push({ name: sec.name, description: catDesc(sec.name), items });
      state.done.push(sec.name);
      saveProgress(state);
    }

    // Compile
    const totalItems = state.categories.reduce((s,c)=>s+c.items.length,0);
    const totalOpts  = state.categories.reduce((s,c)=>s+c.items.reduce((si,i)=>si+i.modifiers.reduce((sm,m)=>sm+m.options.length,0),0),0);
    const totalMods  = state.categories.reduce((s,c)=>s+c.items.reduce((si,i)=>si+i.modifiers.length,0),0);

    const output = {
      _meta: {
        source:           "DOM scrape — Sushi Cazza live storefront via Playwright",
        url:              URL,
        scraped:          new Date().toISOString().slice(0,10),
        total_categories: state.categories.length,
        total_items:      totalItems,
        total_mod_options: totalOpts,
      },
      categories: state.categories,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
    JSON.parse(fs.readFileSync(OUT, "utf-8"));

    console.log(`\n━━━ COMPLETE ━━━`);
    console.log(`  categories   : ${state.categories.length}`);
    console.log(`  items        : ${totalItems}`);
    console.log(`  mod groups   : ${totalMods}`);
    console.log(`  mod options  : ${totalOpts}`);
    console.log(`  output       : ${OUT}`);

  } finally {
    await browser.close();
    if (fs.existsSync(PROGRESS)) fs.unlinkSync(PROGRESS);
  }
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
