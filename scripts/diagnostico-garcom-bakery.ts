/**
 * Diagnóstico do Garçom na `foocci-bakery` — a loja de vitrine.
 *
 * Roda as MESMAS conversas do laudo de 07/08/2026 contra o catálogo real da
 * padaria, para que "melhorou" seja uma leitura e não uma nota.
 *
 * Só leitura: nenhum banco, nenhuma chamada de rede, nenhuma mensagem enviada.
 * O catálogo sai de `foocci-bakery.data.ts` (a fonte do seed) e pode ser
 * conferido contra produção com:
 *
 *   curl -s https://foocci.com.br/api/pedido/foocci-bakery > /tmp/bakery.json
 *   npx tsx scripts/diagnostico-garcom-bakery.ts /tmp/bakery.json
 *
 * Sem argumento, roda sem a conferência (e diz isso).
 */
import { readFileSync } from "node:fs";
import {
  decide,
  createWaiterMemory,
  type V2CatalogItem,
  type V2Output,
  type WaiterMemory,
} from "@/services/ai/WaiterBrainV2";
import { BAKERY_MENU, BAKERY_UPSELL_CATEGORIES } from "@/services/demo/foocci-bakery.data";
import { WAITER_TEST_CASES } from "@/services/ai/waiter/testing/waiterScenarios";
import { evaluateAll } from "@/services/ai/waiter/testing/waiterEvaluator";

// ─── catálogo ────────────────────────────────────────────────────────────────

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function bakeryCatalog(): V2CatalogItem[] {
  const out: V2CatalogItem[] = [];
  let sort = 0;
  for (const cat of BAKERY_MENU) {
    for (const it of cat.items) {
      if (it.showInDelivery === false) continue;
      out.push({
        id: slugify(it.name), name: it.name, categoryName: cat.name,
        price: it.price, sortOrder: sort++,
        description: it.description ?? null,
        servingSize: it.servingSize ?? null,
        portionInfo: it.portionInfo ?? null,
        tagFunil: it.tagFunil ?? null,
        perfilPaladar: it.perfilPaladar ?? null,
        harmonizacaoSugerida: it.harmonizacaoSugerida ?? null,
        alergenosDetalhados: it.alergenosDetalhados ?? null,
        storytellingIA: it.storytellingIA ?? null,
        salesCount: null, isBestSeller: null,
      });
    }
  }
  return out;
}

const catalog = bakeryCatalog();
const nome = (id: string) => catalog.find((i) => i.id === id)?.name ?? id;

// ─── conferência opcional contra produção ────────────────────────────────────

const prodPath = process.argv[2];
console.log("═══ CATÁLOGO ═══");
if (prodPath) {
  const payload = JSON.parse(readFileSync(prodPath, "utf8")) as {
    data: { categories: Array<{ items: Array<{ name: string; price: number }> }> };
  };
  const prod = new Map<string, number>();
  for (const c of payload.data.categories) for (const i of c.items) prod.set(i.name, i.price);
  const div: string[] = [];
  for (const i of catalog) {
    const p = prod.get(i.name);
    if (p === undefined) { div.push(`SÓ LOCAL: ${i.name}`); continue; }
    if (Math.abs(p - i.price) > 0.001) div.push(`PREÇO: ${i.name} ${i.price} ≠ ${p}`);
    prod.delete(i.name);
  }
  for (const n of prod.keys()) div.push(`SÓ PRODUÇÃO: ${n}`);
  console.log(`  local ${catalog.length} itens · produção ${payload.data.categories.reduce((a, c) => a + c.items.length, 0)}`);
  console.log(div.length ? `  DIVERGÊNCIAS:\n    ${div.join("\n    ")}` : "  idêntico em nome e preço");
} else {
  console.log(`  ${catalog.length} itens (sem conferência contra produção — passe o JSON como argumento)`);
}

// ─── roteiro ─────────────────────────────────────────────────────────────────

interface Turno { fala?: string; event?: "ON_USER_MESSAGE" | "ON_ITEM_ADDED" | "ON_CHECKOUT_STARTED"; addId?: string }

function roteiro(titulo: string, turnos: Turno[]) {
  console.log(`\n╔══ ${titulo}`);
  let mem: WaiterMemory = createWaiterMemory();
  const cart: string[] = [];
  for (const t of turnos) {
    const event = t.event ?? "ON_USER_MESSAGE";
    if (event === "ON_ITEM_ADDED" && t.addId) cart.push(t.addId);
    const out: V2Output = decide({
      event, message: t.fala, cartItemIds: cart,
      cartValue: cart.reduce((a, id) => a + (catalog.find((i) => i.id === id)?.price ?? 0), 0),
      lastAddedId: t.addId, catalog, memory: mem,
      upsellCategories: BAKERY_UPSELL_CATEGORIES,
      storeChannels: { whatsapp: null, instagram: null, tiktok: null },
    });
    mem = { ...mem, ...(out.memoryPatch ?? {}) };
    console.log(t.fala ? `║ cliente: ${t.fala}` : `║ [${event}${t.addId ? " " + nome(t.addId) : ""}]`);
    console.log(`║ garçom : ${out.requiresAI ? "«CAI NA IA»" : `"${out.message}"`}`);
    console.log(`║          mode=${out.mode} cards=${out.cards.length}${
      out.cards.length ? " [" + out.cards.slice(0, 8).map(nome).join(" · ") + (out.cards.length > 8 ? " …" : "") + "]" : ""
    }${out.options.length ? " botões=[" + out.options.map((o) => o.label).join(" | ") + "]" : ""}`);
  }
}

const uma = (fala: string) => roteiro(fala, [{ fala }]);

console.log("\n\n████ 1. AS PERGUNTAS DO CEO ████");
uma("o que vocês têm?");
uma("qual você recomenda?");
uma("vocês têm pizza?");
uma("tem lasanha?");
uma("quanto custa o pão de queijo?");
uma("vocês entregam no Butantã?");

console.log("\n\n████ 2. SEGURANÇA ALIMENTAR ████");
uma("tem alguma coisa sem glúten?");
uma("sou celíaco, o que posso comer?");
uma("tem algo sem lactose?");
uma("sou alérgico a castanha");
uma("sou alérgico");
uma("vocês têm opção vegana?");

console.log("\n\n████ 3. O PLURAL ████");
for (const p of ["tem bolos?", "tem tortas?", "tem sucos?", "tem sobremesas?",
                 "tem sanduíches?", "tem geleias?", "tem brownies?",
                 "quais sobremesas vocês têm?", "vocês têm pizza?", "tem lámen?"]) uma(p);

console.log("\n\n████ 4. PEDIDO DE PONTA A PONTA ████");
roteiro("Pão francês, de ponta a ponta", [
  { fala: "quero um pão francês" },
  { event: "ON_ITEM_ADDED", addId: "pao-frances" },
  { event: "ON_CHECKOUT_STARTED" },
  { event: "ON_CHECKOUT_STARTED" },
  { event: "ON_CHECKOUT_STARTED" },
]);

// ─── medição do repertório ───────────────────────────────────────────────────

const PERGUNTAS = [
  "oi", "bom dia", "o que vocês têm?", "me mostra o cardápio", "qual você recomenda?",
  "me indica alguma coisa", "o que é bom aqui?", "o que tem de mais vendido?",
  "quero algo doce", "quero algo salgado", "tem café?", "tem bolo?", "tem pão?",
  "quero um lanche", "algo leve", "algo mais barato", "quero o melhor de vocês",
  "o que combina com café?", "quero algo pra dividir", "tem suco?", "quero uma torta",
  "me vê um croissant", "tem sanduíche?", "quero uma cesta", "tem pão de queijo?",
  "quanto custa o pão francês?", "o pão de fermentação natural é bom?",
  "o que é levain?", "vocês fazem café da manhã?", "tem alguma coisa pra presente?",
  "quero comprar café em grãos", "tem quiche?", "e de bebida?", "tem chocolate quente?",
  "o brownie é bom?", "qual o doce mais gostoso?", "vocês têm opção vegana?",
  "tem alguma coisa sem glúten?", "tem lasanha?", "vocês têm pizza?",
];

console.log(`\n\n████ 5. MEDIÇÃO DO REPERTÓRIO — ${PERGUNTAS.length} perguntas ████\n`);
const linhas = PERGUNTAS.map((p) => {
  const o = decide({
    event: "ON_USER_MESSAGE", message: p, cartItemIds: [], cartValue: 0,
    catalog, memory: createWaiterMemory(), upsellCategories: BAKERY_UPSELL_CATEGORIES,
  });
  return { p, msg: o.message, ia: o.requiresAI, cards: o.cards.map(nome).join("|") };
});
for (const l of linhas) console.log(`  "${l.p}"\n     → ${l.ia ? "«IA»" : l.msg}`);

const det = linhas.filter((l) => !l.ia);
const porFrase = new Map<string, string[]>();
for (const l of det) porFrase.set(l.msg, [...(porFrase.get(l.msg) ?? []), l.p]);
console.log(`\n  IA: ${linhas.length - det.length}/${linhas.length} · determinístico: ${det.length}/${linhas.length}`);
console.log(`  Frases distintas: ${porFrase.size} para ${det.length} respostas`);
for (const [m, ps] of [...porFrase.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
  console.log(`   ${String(ps.length).padStart(2)}×  "${m}"`);
}

const idem = new Map<string, string[]>();
for (const l of det) { const k = l.msg + "␟" + l.cards; idem.set(k, [...(idem.get(k) ?? []), l.p]); }
const colisoes = [...idem.values()].filter((ps) => ps.length > 1);
console.log(`  Respostas IDÊNTICAS (frase + cards): ${colisoes.length} grupos, ${colisoes.reduce((a, p) => a + p.length, 0)} perguntas`);
for (const ps of colisoes) console.log(`     • ${ps.map((x) => `"${x}"`).join("  =  ")}`);

const cats = [...new Set(catalog.map((i) => i.categoryName.toLowerCase()))];
const cita = det.filter((l) => {
  const m = l.msg.toLowerCase();
  return catalog.some((i) => m.includes(i.name.toLowerCase().slice(0, 12))) || cats.some((c) => m.includes(c));
});
console.log(`  Citam produto/categoria pelo nome: ${cita.length}/${det.length}`);

console.log(`\n  ── ON_ITEM_ADDED (o "ótima escolha") ──`);
for (const it of catalog.slice(0, 6)) {
  const vistas = new Set<string>();
  for (let k = 0; k < 300; k++) {
    vistas.add(decide({
      event: "ON_ITEM_ADDED", lastAddedId: it.id, cartItemIds: [it.id], cartValue: it.price,
      catalog, memory: createWaiterMemory(),
    }).message);
  }
  console.log(`   ${it.name.padEnd(34).slice(0, 34)} → ${[...vistas].map((v) => `"${v}"`).join(" / ")}`);
}

// ─── golden set ──────────────────────────────────────────────────────────────

const g = evaluateAll(WAITER_TEST_CASES, catalog, "foocci-bakery", "Foocci Bakery", new Date());
console.log(`\n\n████ 6. GOLDEN SET contra o catálogo da bakery ████`);
console.log(`   ${g.summary.passed}/${g.summary.total} · score ${g.summary.score}`);
for (const r of g.results.filter((x) => !x.pass)) {
  console.log(`   ✗ ${r.id} — ${r.description}`);
  for (const c of r.checks.filter((x) => !x.pass)) console.log(`       ${c.type}: ${c.detail}`);
}
for (const r of g.results.filter((x) => x.group === "restrictions")) {
  console.log(`   ${r.pass ? "✅" : "❌"} ${r.id}  "${r.message}"`);
  console.log(`        → "${r.aiResponse.message}"`);
  console.log(`        cards: ${r.aiResponse.cards.map(nome).join(" · ") || "(nenhum)"}`);
}
