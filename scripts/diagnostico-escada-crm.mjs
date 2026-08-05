#!/usr/bin/env node
/**
 * Responde, com dado de PRODUÇÃO, a pergunta que decide a promoção do Agente de
 * CRM: *o tempo em SHADOW_ONLY produziu EVIDÊNCIA ou produziu SILÊNCIO?*
 *
 * Três perguntas, nesta ordem — porque a segunda só importa se a primeira tem
 * número, e a terceira explica as duas quando o número é zero:
 *   1. quantas amostras de sombra do agente "crm" existem (7d / 30d / total)?
 *   2. qual a coerência PASS delas, contra a régua de CRM_SHADOW_EVIDENCE?
 *   3. a sombra é SEQUER exercitada? (a chave CRM_BRAIN_SHADOW_ENABLED e o
 *      volume de envios de campanha — sem envio real, `_runCrmShadow` nunca roda)
 *
 * Como alcança produção sem humano: mesmo molde de scripts/diagnostico-crm-
 * instagram.mjs — o RAILWAY_TOKEN vive nos segredos do repositório, o
 * ADMIN_SECRET vive nas variáveis do serviço, e o script lê um pelo outro sem
 * jamais imprimir nenhum dos dois.
 *
 * ⚠️ O log do Actions deste repositório é PÚBLICO. Por isso:
 *   • nenhuma mensagem de sombra (`wouldReply`) é impressa — ela cita cliente;
 *   • das variáveis do Railway só se imprime uma ALLOWLIST de chaves de
 *     liga/desliga, e ainda assim com o valor normalizado;
 *   • restaurante aparece por slug (já público na URL da loja), nunca por
 *     e-mail, telefone ou dado de dono.
 *
 * SOMENTE LEITURA. Nenhuma rota consultada aqui promove, envia, cria ou altera
 * coisa alguma — a promoção na escada é ato humano e continua sendo.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE = process.env.BASE_URL || "https://foocci.com.br";
/** Quantos restaurantes examinar (os mais recentes). 0 = todos. */
const LIMITE = Number(process.env.LIMITE_RESTAURANTES ?? 12) || 12;

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

let segredos = [TOKEN].filter(Boolean);
const limpar = (t) => segredos.reduce((s, seg) => s.split(seg).join("<oculto>"), String(t ?? ""));
const p = (t = "") => console.log(limpar(t));

/**
 * As ÚNICAS variáveis do serviço cujo valor pode ir para um log público: são
 * chaves de liga/desliga do experimento, não credenciais. Adicionar chave aqui
 * exige perguntar antes "isso pode ficar visível para qualquer pessoa?".
 */
const FLAGS_PUBLICAVEIS = [
  "CRM_BRAIN_SHADOW_ENABLED",
  "CRM_BRAIN_SHADOW_SAMPLE",
  "CRM_OFICINA_SHADOW_ENABLED",
  "BRAIN_FREE_FORM_ENABLED",
];

async function railway(query, variables) {
  for (const headers of [{ Authorization: `Bearer ${TOKEN}` }, { "Project-Access-Token": TOKEN }]) {
    const r = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json().catch(() => null);
    if (j?.data && !j.errors) return j.data;
  }
  return null;
}

/** ADMIN_SECRET + o retrato das flags. O segredo entra na lista de mascarados. */
async function lerAmbiente() {
  const tok = await railway(`query { projectToken { projectId environmentId } }`, {});
  const projectId = PROJECT_ID || tok?.projectToken?.projectId;
  const proj = await railway(
    `query P($id: String!) { project(id: $id) {
       environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
    { id: projectId },
  );
  const env = (proj?.project?.environments?.edges || []).map((e) => e.node).find((e) => e.name === "production");
  const svc = (proj?.project?.services?.edges || []).map((e) => e.node).find((s) => s.name === "FOOCCI");
  if (!env || !svc) fail("Não achei o ambiente/serviço no Railway.");

  const vars = await railway(
    `query V($projectId: String!, $environmentId: String!, $serviceId: String!) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
    { projectId, environmentId: env.id, serviceId: svc.id },
  );
  const todas = vars?.variables ?? {};
  const secret = todas.ADMIN_SECRET;
  if (!secret) fail("ADMIN_SECRET não está nas variáveis do serviço.");
  segredos.push(secret);

  // "AUSENTE" é diferente de "false": a chave que não existe cai no default do
  // código (OFF), e é exatamente esse o caso que precisamos enxergar.
  const flags = {};
  for (const k of FLAGS_PUBLICAVEIS) flags[k] = k in todas ? String(todas[k]) : "AUSENTE";
  return { secret, flags };
}

async function get(caminho, secret) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "x-admin-secret": secret } });
  const texto = await r.text();
  try { return { status: r.status, json: JSON.parse(texto) }; }
  catch { return { status: r.status, json: null, texto: texto.slice(0, 200) }; }
}

const pct = (n) => (typeof n === "number" ? `${(n * 100).toFixed(0)}%` : "—");
const dia = (d) => (d ? String(d).slice(0, 10) : "nunca");

/** Régua vigente — espelha CRM_SHADOW_EVIDENCE em src/services/crm/crmAgentGovernance.ts:25. */
const REGUA = {
  ALLOWLIST: { minSamples: 20, minPassRate: 0.7 },
  RESTAURANT_WIDE: { minSamples: 100, minPassRate: 0.85 },
};

const main = async () => {
  const { secret, flags } = await lerAmbiente();
  p("🔑 ADMIN_SECRET lido do Railway (não impresso).\n");

  /* ── 1. A sombra está LIGADA? ─────────────────────────────────────────── */
  p("═══ 1. A CHAVE DA SOMBRA — o caminho é sequer exercitado? ═══");
  for (const [k, v] of Object.entries(flags)) p(`   · ${k}: ${v}`);
  const sombraLigada = flags.CRM_BRAIN_SHADOW_ENABLED === "true";
  p(sombraLigada
    ? "   → LIGADA. `_runCrmShadow` roda ao fim de cada disparo com envio real."
    : "   → DESLIGADA. ScheduledCampaignRunnerService.ts:1518 exige a string \"true\";\n" +
      "     sem ela, crmShadowEnabled=false e NENHUMA amostra é gravada — nunca.");

  /* ── 2. Onde cada restaurante está na escada ──────────────────────────── */
  p("\n═══ 2. A ESCADA, RESTAURANTE A RESTAURANTE ═══");
  const rs = await get("/api/admin/restaurants", secret);
  const lista = Array.isArray(rs.json) ? rs.json : Array.isArray(rs.json?.restaurants) ? rs.json.restaurants : [];
  if (!lista.length) {
    p(`   (não consegui listar restaurantes — HTTP ${rs.status}. Sem lista, NÃO concluo nada.)`);
    return;
  }
  const alvos = LIMITE > 0 ? lista.slice(0, LIMITE) : lista;
  p(`   ${lista.length} restaurante(s) na base; examinando ${alvos.length}.\n`);

  let totalSombra7d = 0;
  let algumComAmostra = false;

  for (const r of alvos) {
    const id = r.id;
    const nome = r.slug ?? "sem-slug";
    const [status, casa] = await Promise.all([
      get(`/api/admin/crm/agent/pilot-status?restaurantId=${id}&dias=30`, secret),
      get(`/api/admin/crm/agent/pilot?restaurantId=${id}`, secret),
    ]);

    if (status.status !== 200 || !status.json?.ok) {
      p(`   · ${nome}: pilot-status HTTP ${status.status} — ${JSON.stringify(status.json?.error ?? status.texto ?? "")}`);
      continue;
    }
    const j = status.json;
    const g = j.gates;

    // Decisões recentes: contamos e datamos, NUNCA imprimimos a mensagem.
    const dec = Array.isArray(casa.json?.decisoes) ? casa.json.decisoes : [];
    const sombra = dec.filter((d) => d.origem === "SOMBRA");
    const reais = dec.filter((d) => d.origem === "ENVIO_REAL");

    totalSombra7d += g?.shadowSamples ?? 0;
    if ((g?.shadowSamples ?? 0) > 0 || sombra.length > 0) algumComAmostra = true;

    p(`   ┌─ ${nome} — degrau ${j.modo}${j.pausado ? " (PAUSADO)" : ""}`);
    p(`   │  próximo degrau: ${j.proximoDegrau ?? "— (topo)"}`);
    if (g) {
      const alvo = REGUA[j.proximoDegrau] ?? REGUA.ALLOWLIST;
      p(`   │  sombra (janela de 7 dias, que é a do gate): ${g.shadowSamples} amostra(s) LLM, ` +
        `coerência PASS ${pct(g.shadowPassRate)}`);
      p(`   │  régua do degrau: ≥${alvo.minSamples} amostras e ≥${pct(alvo.minPassRate)} — ` +
        `${g.shadowEvidence ? "ATENDIDA" : "NÃO atendida"}`);
      p(`   │  quality gate (p0=0): ${g.gatePass ? "PASS" : "FAIL"} — ${g.gateReason}`);
    } else {
      p("   │  gates: não avaliados (topo da escada ou falha de leitura)");
    }
    p(`   │  amostras de sombra nas últimas decisões: ${sombra.length} (mais recente: ${dia(sombra[0]?.quando)})`);
    p(`   │  envios REAIS do agente nas últimas decisões: ${reais.length} (mais recente: ${dia(reais[0]?.quando)})`);
    p(`   │  A/B — agente ${j.ab?.agente?.envios ?? 0} envio(s) × sorteio ${j.ab?.controle?.envios ?? 0} (30 dias)`);
    p(`   │  veredito da casa: ${j.prontoParaPromover ? "PRONTO" : "NÃO pronto"}`);
    for (const b of j.bloqueios ?? []) p(`   │   ✗ ${b}`);
    p("   └─");
  }

  /* ── 3. A conclusão ───────────────────────────────────────────────────── */
  p("\n═══ 3. EVIDÊNCIA OU SILÊNCIO? ═══");
  p(`   Amostras de sombra do agente "crm" na janela do gate (7 dias), somando todos: ${totalSombra7d}`);
  if (!algumComAmostra) {
    p("   → SILÊNCIO. Não existe amostra de sombra do CRM em restaurante nenhum.");
    p("     O tempo em SHADOW_ONLY não produziu teste: produziu a APARÊNCIA de teste.");
    if (!sombraLigada) p("     Causa direta e suficiente: CRM_BRAIN_SHADOW_ENABLED não é \"true\".");
  } else {
    p("   → Existe evidência. Os números por restaurante acima é que decidem o degrau.");
  }
  p("\n   (Este script não promove nada. A promoção na escada é ato humano.)");
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
