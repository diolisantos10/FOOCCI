/**
 * Roda os simuladores do Garçom sem banco e sem OpenAI, e imprime o resultado.
 *
 * Serve para responder "o Garçom piorou?" com evidência, não com fé no verde do
 * vitest: (1) golden set determinístico contra um cardápio clássico e contra a
 * padaria; (2) simulação de conversas do adapter; (3) o fechamento da padaria
 * turno a turno, com a fala e os cards que o cliente veria.
 *
 * Uso: npx tsx scripts/simular-garcom-upsell.ts
 */

import { WAITER_TEST_CASES } from "@/services/ai/waiter/testing/waiterScenarios";
import { evaluateAll } from "@/services/ai/waiter/testing/waiterEvaluator";
import { waiterSyntheticCatalog } from "@/services/simulation/waiter/waiterSyntheticCatalog";
import { runWaiterSimulation } from "@/services/simulation/waiter/runWaiterSimulation";
import {
  decide,
  createWaiterMemory,
  type V2CatalogItem,
  type WaiterMemory,
} from "@/services/ai/WaiterBrainV2";
import { BAKERY_UPSELL_CATEGORIES } from "@/services/demo/foocci-bakery.data";

const PADARIA: V2CatalogItem[] = [
  { id: "pao-frances", name: "Pão Francês",    categoryName: "Padaria",        price: 1.4,  sortOrder: 1 },
  { id: "coxinha",     name: "Coxinha",        categoryName: "Salgados",       price: 9.9,  sortOrder: 3 },
  { id: "cafe",        name: "Café Coado",     categoryName: "Café & Bebidas", price: 6.0,  sortOrder: 10 },
  { id: "capuccino",   name: "Cappuccino",     categoryName: "Café & Bebidas", price: 12.0, sortOrder: 11 },
  { id: "bolo-fuba",   name: "Bolo de Fubá",   categoryName: "Confeitaria",    price: 14.0, sortOrder: 20 },
  { id: "torta-limao", name: "Torta de Limão", categoryName: "Confeitaria",    price: 18.0, sortOrder: 21 },
];

function fechamento(catalog: V2CatalogItem[], cfg: readonly string[] | null, titulo: string) {
  console.log(`\n── Fechamento: ${titulo} ─────────────────────────────`);
  let mem: WaiterMemory = createWaiterMemory();
  for (let turno = 1; turno <= 4; turno++) {
    const out = decide({
      event: "ON_CHECKOUT_STARTED",
      cartItemIds: ["pao-frances"],
      cartValue: 1.4,
      catalog,
      memory: mem,
      upsellCategories: cfg,
    });
    mem = { ...mem, ...(out.memoryPatch ?? {}) };
    const nomes = out.cards.map((id) => catalog.find((i) => i.id === id)?.name ?? id);
    console.log(`  turno ${turno} [${out.mode}] "${out.message}"`);
    console.log(`           cards: ${nomes.length ? nomes.join(", ") : "(nenhum)"}`);
    if (out.mode === "CHECKOUT_SUPPORT") break;
  }
}

async function main() {
  // ── 1. Golden set determinístico ──────────────────────────────────────────
  const classico = waiterSyntheticCatalog();
  const g1 = evaluateAll(WAITER_TEST_CASES, classico, "sim-classico", "Restaurante clássico (sem config)", new Date());
  console.log(`\n═══ GOLDEN SET — cardápio clássico, SEM configuração ═══`);
  console.log(`   ${g1.summary.passed}/${g1.summary.total} cenários · score ${g1.summary.score}`);
  for (const r of g1.results.filter((r) => !r.pass)) {
    console.log(`   ✗ ${r.id} — ${r.description}`);
    for (const c of r.checks.filter((c) => !c.pass)) console.log(`       ${c.type}: ${c.detail}`);
  }

  const g2 = evaluateAll(WAITER_TEST_CASES, PADARIA, "sim-padaria", "Padaria", new Date());
  console.log(`\n═══ GOLDEN SET — cardápio de padaria ═══`);
  console.log(`   ${g2.summary.passed}/${g2.summary.total} cenários · score ${g2.summary.score}`);

  // ── 2. Simulação de conversas ─────────────────────────────────────────────
  const sim = await runWaiterSimulation({ scenarioCount: 24, seed: "upsell-categorias-20260804" });
  console.log(`\n═══ SIMULADOR DE CONVERSAS (Waiter adapter) ═══`);
  console.log(`   status: ${sim.status} · driver: ${sim.driver}`);
  console.log(`   cenários: ${sim.scenariosTotal} · ok: ${sim.scenariosPassed} · aviso: ${sim.scenariosWarning} · falha: ${sim.scenariosFailed}`);
  console.log(`   P0: ${sim.p0Count} · P1: ${sim.p1Count} · P2: ${sim.p2Count} · oportunidades: ${sim.opportunityCount}`);
  for (const o of sim.opportunities.slice(0, 6)) {
    console.log(`   • [${o.severity}] ${o.title ?? ""} ${(o.description ?? "").slice(0, 120)}`);
  }

  // ── 3. O que o cliente da padaria ouve no fechamento ──────────────────────
  fechamento(PADARIA, null, "padaria SEM configuração (o bug de origem)");
  fechamento(PADARIA, BAKERY_UPSELL_CATEGORIES, "Foocci Bakery configurada (Bebidas → Confeitaria)");
  fechamento(classico, null, "restaurante clássico sem config (não pode mudar)");
}

main().catch((e) => { console.error(e); process.exit(1); });
