#!/usr/bin/env node
/**
 * Responde, com dado de PRODUÇÃO, duas perguntas do CEO:
 *   1. por que o CRM mandou tão poucas mensagens hoje?
 *   2. por que a DM do Instagram não cai na central de conversas?
 *
 * Como ele alcança produção sem humano: o `ADMIN_SECRET` vive nas variáveis do
 * serviço no Railway, e o RAILWAY_TOKEN vive nos segredos do repositório — que
 * só existem dentro do GitHub Actions. O script lê o segredo pela API do
 * Railway, usa no cabeçalho `x-admin-secret` e NUNCA o imprime.
 *
 * ⚠️ O log do Actions deste repositório é PÚBLICO. Por isso o script **projeta
 * campos escolhidos a dedo** em vez de imprimir a resposta crua: o diagnóstico
 * de contact-safety devolve nome e telefone de cliente real, e despejar o JSON
 * inteiro publicaria dado pessoal. Ao adicionar campo aqui, pergunte primeiro
 * "isso pode ficar visível para qualquer pessoa na internet?".
 *
 * Somente leitura: nenhuma das rotas consultadas envia, cria ou altera nada.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE = process.env.BASE_URL || "https://foocci.com.br";
const SLUG = process.env.SLUG || "sushi-cazza";

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

/** Nunca deixa um segredo escapar para o log, venha de onde vier. */
let segredos = [TOKEN].filter(Boolean);
const limpar = (t) => segredos.reduce((s, seg) => s.split(seg).join("<oculto>"), String(t ?? ""));
const p = (t = "") => console.log(limpar(t));

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

/** Pega o ADMIN_SECRET das variáveis do serviço, sem imprimir. */
async function lerAdminSecret() {
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
  const secret = vars?.variables?.ADMIN_SECRET;
  if (!secret) fail("ADMIN_SECRET não está nas variáveis do serviço.");
  segredos.push(secret); // a partir daqui, qualquer eco dele vira <oculto>
  return secret;
}

async function get(caminho, secret) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "x-admin-secret": secret } });
  const texto = await r.text();
  try { return { status: r.status, json: JSON.parse(texto) }; }
  catch { return { status: r.status, json: null, texto: texto.slice(0, 200) }; }
}

const main = async () => {
  const secret = await lerAdminSecret();
  p("🔑 ADMIN_SECRET lido do Railway (não impresso).\n");

  /* ── 1. Instagram ─────────────────────────────────────────────────────── */
  p("═══ INSTAGRAM — por que a DM não cai na central ═══");
  const ig = await get(`/api/admin/settings/integrations/instagram?restaurantSlug=${SLUG}`, secret);
  if (ig.status !== 200) {
    p(`   HTTP ${ig.status} — ${JSON.stringify(ig.json ?? ig.texto)}`);
  } else if (!ig.json?.configPresent) {
    p("   ❌ NÃO EXISTE configuração de Instagram para este restaurante.");
    p("      Sem config, o webhook não acha dono para a conta e descarta a mensagem.");
  } else {
    const c = ig.json.config || {};
    for (const [rotulo, valor] of [
      ["enabled (canal ligado)", c.enabled],
      ["paused (pausado)", c.paused],
      ["mode (DISABLED bloqueia tudo)", c.mode],
      ["scope (RESTAURANT_WIDE = todos)", c.scope],
      ["allowlistCount (quantos liberados)", c.allowlistCount],
      ["instagramBusinessAccountId", c.instagramBusinessAccountId ? "presente" : "AUSENTE"],
      ["facebookPageId", c.facebookPageId ? "presente" : "AUSENTE"],
      ["tokenConfigured", c.tokenConfigured],
      ["verifyTokenConfigured", c.verifyTokenConfigured],
      ["lastWebhookAt (último evento recebido)", c.lastWebhookAt ?? "NUNCA"],
      ["lastError", c.lastError ?? "—"],
    ]) p(`   · ${rotulo}: ${valor}`);
    p(`   · env INSTAGRAM_WEBHOOK_VERIFY_TOKEN: ${ig.json.envVerifyTokenConfigured}`);
    p(`   · env INSTAGRAM_APP_SECRET: ${ig.json.envAppSecretConfigured}`);
  }

  const restaurantId = ig.json?.restaurant?.id ?? null;

  /* ── 2. CRM ───────────────────────────────────────────────────────────── */
  p("\n═══ CRM — por que só saíram poucas mensagens hoje ═══");
  if (!restaurantId) {
    p("   (sem restaurantId — pulando; confira o SLUG)");
  } else {
    const cs = await get(`/api/admin/diagnostics/contact-safety?restaurantId=${restaurantId}&limit=25`, secret);
    if (cs.status !== 200) {
      p(`   contact-safety: HTTP ${cs.status} — ${JSON.stringify(cs.json ?? cs.texto)}`);
    } else {
      const j = cs.json || {};
      const s = j.safety || {};
      p("   Limites em vigor (o que a máquina realmente aplica):");
      for (const k of Object.keys(s)) p(`     · ${k}: ${JSON.stringify(s[k])}`);
      // Só o AGREGADO das decisões — nunca cliente, nome ou telefone.
      const amostras = Array.isArray(j.samples) ? j.samples : Array.isArray(j.decisions) ? j.decisions : [];
      if (amostras.length) {
        const tally = {};
        for (const a of amostras) {
          const motivo = a?.decision?.blockReason ?? a?.blockReason ?? (a?.decision?.sendable ?? a?.sendable ? "LIBERADO" : "desconhecido");
          tally[motivo] = (tally[motivo] || 0) + 1;
        }
        p(`   Amostra de ${amostras.length} clientes — por que cada um passou ou não:`);
        for (const [motivo, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) p(`     · ${motivo}: ${n}`);
      }
      for (const extra of ["todayGlobalSendCount", "sentToday", "globalSendCountToday", "numberAgeDays", "evolutionConnected"]) {
        if (j[extra] !== undefined) p(`   · ${extra}: ${JSON.stringify(j[extra])}`);
      }
    }

    const camp = await get(`/api/admin/diagnostics/crm-campaigns?restaurantId=${restaurantId}&limit=25`, secret);
    if (camp.status !== 200) {
      p(`   crm-campaigns: HTTP ${camp.status} — ${JSON.stringify(camp.json ?? camp.texto)}`);
    } else {
      const j = camp.json || {};
      if (j.cronBranchWarning) p(`   ⚠️ cronBranchWarning: ${JSON.stringify(j.cronBranchWarning)}`);
      const lista = Array.isArray(j.campaigns) ? j.campaigns : [];
      p(`   ${lista.length} campanha(s):`);
      for (const c of lista) {
        p(`     · "${c.name ?? c.id}" — status ${c.status ?? "?"} · due ${JSON.stringify(c.due ?? c.isDue)} · motivo: ${c.notDueReason ?? c.dueReason ?? "—"}`);
        if (c.audience) p(`        audiência: total ${c.audience.total} · novos elegíveis ${c.audience.newEligible}${c.audience.error ? ` · erro: ${c.audience.error}` : ""}`);
      }
    }
  }
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
