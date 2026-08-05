#!/usr/bin/env node
/**
 * SOS Instagram — por que nenhuma DM chega desde 23/07, com PROVA de produção.
 *
 * O diagnóstico anterior parou no config do restaurante e concluiu "token morto +
 * Página do Facebook ausente". Faltava a peça que decide: **a assinatura de webhook
 * do APLICATIVO**. Ela se lê com a chave do app (`{appId}|{appSecret}`) e NÃO
 * depende do token do cliente — que está morto e portanto não responde nada.
 *
 * Se `object: instagram` não estiver assinado no app, a Meta nem tenta entregar o
 * evento: reconectar o cliente não resolve, e o CEO clicaria em vão.
 *
 * Como alcança produção sem humano: RAILWAY_TOKEN vive nos segredos do repositório;
 * o script lê as variáveis do serviço, usa o ADMIN_SECRET no header `x-admin-secret`
 * e monta o app access token. NENHUM segredo é impresso — todos entram na lista de
 * mascaramento assim que são lidos.
 *
 * ⚠️ O log do Actions deste repositório é PÚBLICO. Só campos escolhidos a dedo.
 *
 * MODO PADRÃO: somente leitura. Nada é enviado, criado ou alterado.
 * MODO ESCRITA (APLICAR=1): apenas duas ações, ambas restritas ao Instagram —
 *   1. garante INSTAGRAM_WEBHOOK_VERIFY_TOKEN nas variáveis do Railway (se ausente);
 *   2. (re)assina `object=instagram` no app.
 * A assinatura de `whatsapp_business_account` NUNCA é tocada: cada `object` é uma
 * entrada independente em /subscriptions, e o WhatsApp é o produto no ar.
 */

import { randomBytes } from "crypto";

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE = process.env.BASE_URL || "https://foocci.com.br";
const SLUG = process.env.SLUG || "sushi-cazza";
const APLICAR = process.env.APLICAR === "1";
const GRAPH = "https://graph.facebook.com/v21.0";

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

/** Nunca deixa um segredo escapar para o log, venha de onde vier. */
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

async function lerAmbiente() {
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
  if (!env || !svc) fail("Não achei o ambiente/serviço no Railway.");
  const vars = await gql(
    `query V($projectId: String!, $environmentId: String!, $serviceId: String!) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
    { projectId, environmentId: env.id, serviceId: svc.id },
  );
  if (!vars.ok) fail(`não consegui ler as variáveis: ${vars.erro}`);
  const v = vars.data.variables || {};
  for (const k of Object.keys(v)) if (/SECRET|TOKEN|KEY|PASSWORD/i.test(k)) guardar(v[k]);
  return { projectId, environmentId: env.id, serviceId: svc.id, vars: v };
}

async function get(caminho, secret) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "x-admin-secret": secret } });
  const texto = await r.text();
  try { return { status: r.status, json: JSON.parse(texto) }; }
  catch { return { status: r.status, json: null, texto: texto.slice(0, 200) }; }
}

async function graph(caminho, appToken, metodo = "GET") {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(appToken)}`, { method: metodo });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, json: j };
}

const main = async () => {
  const amb = await lerAmbiente();
  const V = amb.vars;
  const secret = V.ADMIN_SECRET;
  if (!secret) fail("ADMIN_SECRET não está nas variáveis do serviço.");
  p("🔑 Variáveis do Railway lidas (nenhum valor será impresso).\n");

  /* ── 1. Quais credenciais existem (só presença) ──────────────────────────── */
  p("═══ 1. CREDENCIAIS NO RAILWAY — presença, nunca valor ═══");
  const chaves = [
    "META_APP_ID", "META_APP_SECRET", "META_CONFIG_ID", "META_GRAPH_VERSION",
    "META_WEBHOOK_VERIFY_TOKEN", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET",
    "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", "FOOCCI_BASE_URL", "ENCRYPTION_KEY",
  ];
  for (const k of chaves) p(`   · ${k}: ${V[k] ? "presente" : "AUSENTE"}`);
  // O App ID não é segredo (vai no HTML do embedded signup) — imprimir ajuda a
  // provar se Instagram e WhatsApp estão no mesmo aplicativo.
  p(`   · META_APP_ID (valor, público): ${V.META_APP_ID ?? "—"}`);
  p(`   · INSTAGRAM_APP_ID (valor, público): ${V.INSTAGRAM_APP_ID ?? "—"}`);
  p(`   · mesmo aplicativo? ${V.META_APP_ID && V.INSTAGRAM_APP_ID ? (V.META_APP_ID === V.INSTAGRAM_APP_ID ? "IDs IGUAIS" : "IDs DIFERENTES (normal: o IG tem app id próprio dentro do mesmo app)") : "não dá para dizer"}`);

  // Para onde um aviso poderia ir hoje. NOMES, nunca valores.
  const nomesTelefone = Object.keys(V).filter((k) => /PHONE|TELEFONE|WHATSAPP|BUILDOS|SUPPORT|ALERT/i.test(k)).sort();
  p(`   · variáveis que podem endereçar um aviso: ${nomesTelefone.join(", ") || "(nenhuma)"}`);

  /* ── 2. Config do restaurante ────────────────────────────────────────────── */
  p("\n═══ 2. CONFIG DO RESTAURANTE ═══");
  const ig = await get(`/api/admin/settings/integrations/instagram?restaurantSlug=${SLUG}`, secret);
  let restaurantId = null;
  if (ig.status !== 200) {
    p(`   HTTP ${ig.status} — ${JSON.stringify(ig.json ?? ig.texto)}`);
  } else {
    restaurantId = ig.json?.restaurant?.id ?? null;
    const c = ig.json.config || {};
    for (const [rot, val] of [
      ["enabled", c.enabled], ["paused", c.paused], ["mode", c.mode], ["scope", c.scope],
      ["instagramBusinessAccountId", c.instagramBusinessAccountId ? `presente (${c.instagramBusinessAccountId})` : "AUSENTE"],
      ["facebookPageId", c.facebookPageId ? "presente" : "AUSENTE (esperado no fluxo Instagram Login)"],
      ["connectedVia", c.connectedVia], ["connectedAt", c.connectedAt],
      ["instagramUsername", c.instagramUsername],
      ["tokenConfigured", c.tokenConfigured], ["verifyTokenConfigured", c.verifyTokenConfigured],
      ["lastWebhookAt", c.lastWebhookAt ?? "NUNCA"], ["lastError", c.lastError ?? "—"],
    ]) p(`   · ${rot}: ${val}`);
    p(`   · env INSTAGRAM_WEBHOOK_VERIFY_TOKEN visto pelo app: ${ig.json.envVerifyTokenConfigured}`);
    p(`   · env INSTAGRAM_APP_SECRET visto pelo app: ${ig.json.envAppSecretConfigured}`);
    p(`   · webhookUrl que o app publica: ${ig.json.webhookUrl}`);
  }

  /* ── 3. Token do cliente, ao vivo ────────────────────────────────────────── */
  p("\n═══ 3. TOKEN DO CLIENTE (graph-check ao vivo) ═══");
  if (!restaurantId) {
    p("   (sem restaurantId — pulando)");
  } else {
    const gc = await get(`/api/admin/settings/integrations/instagram/graph-check?restaurantId=${restaurantId}`, secret);
    if (gc.status !== 200) {
      p(`   HTTP ${gc.status} — ${JSON.stringify(gc.json ?? gc.texto)}`);
    } else {
      const j = gc.json;
      p(`   · tokenValid: ${j.tokenValid}`);
      p(`   · tokenExpiresAt: ${j.tokenExpiresAt ?? "—"} · expiresInDays: ${j.expiresInDays ?? "—"}`);
      p(`   · tokenLooksShortLived: ${j.tokenLooksShortLived}`);
      p(`   · graphBase: ${j.graphBase} · connectedVia: ${j.connectedVia}`);
      p(`   · erro do /me: ${JSON.stringify(j.me?.error?.message ?? j.me?.username ?? j.me)}`);
      p(`   · subscribedApps: ${JSON.stringify(j.subscribedApps).slice(0, 300)}`);
    }
  }

  /* ── 4. A PEÇA QUE FALTAVA: assinaturas do APLICATIVO ────────────────────── */
  p("\n═══ 4. ASSINATURAS DE WEBHOOK DO APLICATIVO (chave do app, não do cliente) ═══");
  const apps = [];
  if (V.META_APP_ID && V.META_APP_SECRET) apps.push(["META", V.META_APP_ID, V.META_APP_SECRET]);
  if (V.INSTAGRAM_APP_ID && V.INSTAGRAM_APP_SECRET && V.INSTAGRAM_APP_ID !== V.META_APP_ID) {
    apps.push(["INSTAGRAM", V.INSTAGRAM_APP_ID, V.INSTAGRAM_APP_SECRET]);
  }
  if (apps.length === 0) p("   (sem par appId+appSecret no Railway — não dá para consultar)");

  const achados = {};
  for (const [rotulo, appId, appSecret] of apps) {
    const appToken = `${appId}|${appSecret}`;
    p(`\n   ── app ${rotulo} (${appId}) ──`);
    const subs = await graph(`${appId}/subscriptions`, appToken);
    if (!subs.ok) {
      p(`   ❌ HTTP ${subs.status} — ${JSON.stringify(subs.json?.error?.message ?? subs.json).slice(0, 300)}`);
      continue;
    }
    const linhas = Array.isArray(subs.json?.data) ? subs.json.data : [];
    if (linhas.length === 0) p("   ⚠️ NENHUM objeto assinado neste app.");
    for (const s of linhas) {
      const campos = (s.fields || []).map((f) => `${f.name}${f.version ? `@${f.version}` : ""}`).join(", ");
      p(`   · object=${s.object} · active=${s.active} · callback=${s.callback_url}`);
      p(`       fields: ${campos || "(nenhum)"}`);
      if (s.object === "instagram") achados.instagram = { appId, appSecret, s };
      if (s.object === "whatsapp_business_account") achados.whatsapp = { appId, s };
    }
  }

  p("\n   ── LEITURA ──");
  if (!achados.instagram) {
    p("   🔴 `object=instagram` NÃO está assinado em nenhum app. A Meta não entrega");
    p("      DM nenhuma — reconectar o cliente não resolveria sozinho.");
  } else {
    const s = achados.instagram.s;
    const temMessages = (s.fields || []).some((f) => f.name === "messages");
    p(`   ${s.active ? "🟢" : "🔴"} instagram assinado · active=${s.active} · campo "messages": ${temMessages ? "SIM" : "NÃO"}`);
    p(`      callback conferido: ${s.callback_url === `${BASE}/api/webhooks/instagram` ? "✅ bate com a produção" : `⚠️ DIVERGE — esperado ${BASE}/api/webhooks/instagram`}`);
  }
  p(`   ${achados.whatsapp ? "🟢" : "⚪"} whatsapp_business_account: ${achados.whatsapp ? `assinado, active=${achados.whatsapp.s.active} (NÃO TOCADO por este script)` : "não visto"}`);

  /* ── 5. Escrita, só se pedida explicitamente ─────────────────────────────── */
  if (!APLICAR) {
    p("\n(modo somente leitura — rode com APLICAR=1 para corrigir o que for do app)");
    return;
  }

  p("\n═══ 5. CORREÇÃO (APLICAR=1) — escopo Instagram apenas ═══");

  // 5a. verify token no Railway: sem ele o handshake GET do webhook devolve 403 e
  // ninguém — nem o CEO no painel da Meta — consegue (re)assinar o webhook.
  let verify = V.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (verify) {
    p("   · INSTAGRAM_WEBHOOK_VERIFY_TOKEN já existe — mantido como está.");
  } else {
    verify = `foocci-ig-${randomBytes(12).toString("hex")}`;
    guardar(verify);
    const r = await gql(
      `mutation U($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      { input: { projectId: amb.projectId, environmentId: amb.environmentId, serviceId: amb.serviceId,
                 name: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", value: verify } },
    );
    p(r.ok ? "   ✅ INSTAGRAM_WEBHOOK_VERIFY_TOKEN criado (valor não impresso)."
           : `   ❌ não consegui criar: ${r.erro}`);
    if (r.ok) {
      p("   ⚠️ O app só passa a enxergar a variável no PRÓXIMO deploy do Railway.");
      p("      Até lá, (re)assinar o webhook falha no handshake — é esperado.");
    }
  }

  // 5b. (re)assinar object=instagram. NUNCA whatsapp_business_account.
  const alvo = apps.find(([r]) => r === "INSTAGRAM") ?? apps[0];
  if (!alvo) { p("   (sem credencial de app — não dá para assinar)"); return; }
  const [rotulo, appId, appSecret] = alvo;
  const appToken = `${appId}|${appSecret}`;
  const callback = `${BASE}/api/webhooks/instagram`;
  const corpo = new URLSearchParams({
    object: "instagram",
    callback_url: callback,
    fields: "messages,messaging_seen,comments",
    verify_token: verify,
    include_values: "true",
    access_token: appToken,
  });
  const res = await fetch(`${GRAPH}/${appId}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo.toString(),
  });
  const jr = await res.json().catch(() => ({}));
  p(`   · POST subscriptions object=instagram no app ${rotulo}: HTTP ${res.status} — ${limpar(JSON.stringify(jr)).slice(0, 400)}`);

  const depois = await graph(`${appId}/subscriptions`, appToken);
  const linhas = Array.isArray(depois.json?.data) ? depois.json.data : [];
  p("   · estado depois:");
  for (const s of linhas) {
    p(`       object=${s.object} · active=${s.active} · fields: ${(s.fields || []).map((f) => f.name).join(", ")}`);
  }
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
