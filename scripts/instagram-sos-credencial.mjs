#!/usr/bin/env node
/**
 * Perícia da credencial do Instagram — por que a troca do token de 60 dias falha.
 *
 * O SOS provou que a Meta ESTÁ entregando (object=instagram assinado, active, campo
 * "messages", callback certo) e que a reconexão de 04/08 00:06Z nasceu com um token
 * de **1 hora**. Ou seja: o defeito não é expiração, é a troca `ig_exchange_token`
 * (instagramLoginOAuth.ts:142) falhando em produção. Ela usa
 * `client_secret = INSTAGRAM_APP_SECRET ?? META_APP_SECRET` (linha 45) — e esse
 * fallback silencioso é o suspeito número um: o Instagram App Secret é DIFERENTE do
 * Facebook App Secret, e usar o errado faz a troca falhar sempre.
 *
 * Este script NÃO imprime nenhum valor. Ele imprime apenas COMPARAÇÕES e o que a
 * Meta responde a cada par. Também varre os logs do deploy atrás das linhas
 * `[ig-oauth]`, que carregam o erro exato da Meta naquela noite.
 *
 * Somente leitura.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const GRAPH = "https://graph.facebook.com/v21.0";

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");
function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

const segredos = [TOKEN].filter(Boolean);
const guardar = (v) => { if (v && String(v).length >= 8) segredos.push(String(v)); return v; };
const limpar = (t) => segredos.reduce((s, seg) => s.split(seg).join("<oculto>"), String(t ?? ""));
const p = (t = "") => console.log(limpar(t));

async function gql(query, variables) {
  let ultimoErro = "sem resposta";
  for (const headers of [{ Authorization: `Bearer ${TOKEN}` }, { "Project-Access-Token": TOKEN }]) {
    const r = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json().catch(() => null);
    if (j?.data && !j.errors) return { ok: true, data: j.data };
    if (j?.errors) ultimoErro = j.errors.map((e) => e.message).join("; ");
  }
  return { ok: false, erro: limpar(ultimoErro) };
}

async function graph(caminho, token) {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, json: j };
}

const main = async () => {
  const tok = await gql(`query { projectToken { projectId environmentId } }`, {});
  const projectId = PROJECT_ID || tok.data?.projectToken?.projectId;
  const proj = await gql(
    `query P($id: String!) { project(id: $id) {
       environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
    { id: projectId },
  );
  if (!proj.ok) fail(`não consegui ler o projeto: ${proj.erro}`);
  const env = (proj.data.project.environments?.edges || []).map((e) => e.node).find((e) => e.name === "production");
  const svc = (proj.data.project.services?.edges || []).map((e) => e.node).find((s) => s.name === "FOOCCI");
  const vars = await gql(
    `query V($projectId: String!, $environmentId: String!, $serviceId: String!) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
    { projectId, environmentId: env.id, serviceId: svc.id },
  );
  const V = vars.data?.variables || {};
  for (const k of Object.keys(V)) if (/SECRET|TOKEN|KEY|PASSWORD/i.test(k)) guardar(V[k]);

  /* ── 1. Comparações, nunca valores ───────────────────────────────────────── */
  p("═══ 1. AS DUAS CREDENCIAIS SÃO A MESMA? (comparação, sem valor) ═══");
  const igSec = V.INSTAGRAM_APP_SECRET;
  const fbSec = V.META_APP_SECRET ?? V.FACEBOOK_APP_SECRET;
  p(`   · INSTAGRAM_APP_SECRET: ${igSec ? `presente (${igSec.length} caracteres)` : "AUSENTE"}`);
  p(`   · META_APP_SECRET:      ${fbSec ? `presente (${fbSec.length} caracteres)` : "AUSENTE"}`);
  if (igSec && fbSec) {
    p(`   · são IGUAIS? ${igSec === fbSec ? "🔴 SIM — o Instagram está usando o segredo do app do Facebook" : "🟢 NÃO — são segredos distintos, como deve ser"}`);
  }

  /* ── 2. Cada par é um app token válido para a Meta? ──────────────────────── */
  p("\n═══ 2. A META ACEITA CADA PAR COMO CREDENCIAL DE APP? ═══");
  const pares = [
    ["META_APP_ID|META_APP_SECRET", V.META_APP_ID, fbSec],
    ["INSTAGRAM_APP_ID|INSTAGRAM_APP_SECRET", V.INSTAGRAM_APP_ID, igSec],
    ["INSTAGRAM_APP_ID|META_APP_SECRET", V.INSTAGRAM_APP_ID, fbSec],
  ];
  for (const [rot, id, sec] of pares) {
    if (!id || !sec) { p(`   · ${rot}: incompleto — pulado`); continue; }
    const r = await graph(`debug_token?input_token=${encodeURIComponent(`${id}|${sec}`)}`, `${id}|${sec}`);
    const d = r.json?.data;
    if (d?.app_id) {
      p(`   · ${rot}: 🟢 aceito · app_id=${d.app_id} · type=${d.type} · valid=${d.is_valid}`);
    } else {
      p(`   · ${rot}: 🔴 recusado — ${limpar(JSON.stringify(r.json?.error?.message ?? r.json)).slice(0, 200)}`);
    }
  }

  /* ── 3. O que a Meta diz do App ID do Instagram ──────────────────────────── */
  p("\n═══ 3. O QUE A META SABE DO INSTAGRAM_APP_ID ═══");
  if (V.META_APP_ID && fbSec && V.INSTAGRAM_APP_ID) {
    const appToken = `${V.META_APP_ID}|${fbSec}`;
    const r = await graph(`${V.INSTAGRAM_APP_ID}?fields=id,name,link`, appToken);
    p(`   · GET /${V.INSTAGRAM_APP_ID} com a chave do app Meta: HTTP ${r.status} — ${limpar(JSON.stringify(r.json)).slice(0, 300)}`);
    const r2 = await graph(`${V.META_APP_ID}?fields=id,name,link,category`, appToken);
    p(`   · GET /${V.META_APP_ID} (o app do WhatsApp): HTTP ${r2.status} — ${limpar(JSON.stringify(r2.json)).slice(0, 300)}`);
  }

  /* ── 4. O log daquela noite ──────────────────────────────────────────────── */
  p("\n═══ 4. LOGS DE PRODUÇÃO — as linhas [ig-oauth] da reconexão ═══");
  const dep = await gql(
    `query D($serviceId: String!, $environmentId: String!) {
       deployments(first: 3, input: { serviceId: $serviceId, environmentId: $environmentId }) {
         edges { node { id status createdAt } } } }`,
    { serviceId: svc.id, environmentId: env.id },
  );
  const deploys = (dep.data?.deployments?.edges || []).map((e) => e.node);
  if (deploys.length === 0) { p(`   (não consegui listar deploys: ${dep.erro ?? "sem dados"})`); }
  for (const d of deploys.slice(0, 2)) {
    p(`   ── deploy ${d.id.slice(0, 8)} · ${d.status} · ${d.createdAt}`);
    const logs = await gql(
      `query L($deploymentId: String!, $filter: String, $limit: Int) {
         deploymentLogs(deploymentId: $deploymentId, filter: $filter, limit: $limit) { timestamp message } }`,
      { deploymentId: d.id, filter: "ig-oauth", limit: 200 },
    );
    const linhas = logs.data?.deploymentLogs || [];
    if (!logs.ok) { p(`      (sem logs: ${logs.erro})`); continue; }
    if (linhas.length === 0) { p("      (nenhuma linha [ig-oauth] nesta janela de retenção)"); continue; }
    for (const l of linhas) p(`      ${l.timestamp} ${limpar(l.message).slice(0, 300)}`);
  }

  // As linhas do webhook contam se a Meta bateu na porta e foi recusada por assinatura.
  for (const d of deploys.slice(0, 1)) {
    p(`\n   ── [ig-wh] no deploy ${d.id.slice(0, 8)} (a Meta bateu na porta?)`);
    const logs = await gql(
      `query L($deploymentId: String!, $filter: String, $limit: Int) {
         deploymentLogs(deploymentId: $deploymentId, filter: $filter, limit: $limit) { timestamp message } }`,
      { deploymentId: d.id, filter: "ig-wh", limit: 100 },
    );
    const linhas = logs.data?.deploymentLogs || [];
    p(linhas.length === 0 ? "      (nenhuma — nenhum evento de Instagram chegou nesta janela)" : "");
    for (const l of linhas.slice(-30)) p(`      ${l.timestamp} ${limpar(l.message).slice(0, 250)}`);
  }
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
