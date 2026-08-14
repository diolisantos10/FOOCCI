#!/usr/bin/env node
/**
 * RAIO-X DO APLICATIVO META — o estado inteiro da chave, numa rodada, sem humano.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Toda vez que se pergunta "o que está travado na Meta?", a resposta vinha de memória,
 * de documento velho ou de um selo de tela que não prova nada. Este script pergunta à
 * própria Meta e à própria produção, e imprime só o que ELAS responderam.
 *
 * Ele responde, com prova:
 *   1. Quais credenciais existem no Railway (PRESENÇA, nunca valor)
 *   2. O aplicativo: nome, domínios, termos, privacidade — o que a App Review cobra
 *   3. As assinaturas de webhook do APP (a leitura que não depende de token de cliente)
 *   4. Cada restaurante: WABA, número, templates, e a CREDENCIAL VIVA OU MORTA
 *   5. Quais PERMISSÕES a Meta de fato concedeu (prova indireta de App Review)
 *   6. O Instagram de cada restaurante, com validade real do token
 *
 * SOMENTE LEITURA. Nada é criado, alterado, registrado, enviado ou apagado. Nenhuma
 * chamada deste script muda estado do lado da Meta.
 *
 * ⚠️ O log do Actions deste repositório é PÚBLICO. Todo segredo lido do Railway entra
 * na lista de mascaramento no instante em que é lido, e só campos escolhidos a dedo
 * são impressos. App ID e Config ID NÃO são segredos (viajam no HTML do embedded
 * signup) e são impressos de propósito, porque provam "um só aplicativo".
 */

const TOKEN      = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE       = (process.env.BASE_URL || "https://foocci.com.br").replace(/\/$/, "");
const GRAPH_VER  = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH      = `https://graph.facebook.com/${GRAPH_VER}`;

if (!TOKEN) fail("RAILWAY_TOKEN ausente — sem ele não há como ler as variáveis de produção.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

/* ── Mascaramento: nenhum segredo escapa, venha de onde vier ─────────────────── */
const segredos = [TOKEN].filter(Boolean);
const guardar  = (v) => { if (v && String(v).length >= 8) segredos.push(String(v)); return v; };
const limpar   = (t) => segredos.reduce((s, seg) => s.split(seg).join("<oculto>"), String(t ?? ""));
const p        = (t = "") => console.log(limpar(t));
const jsonCurto = (v, n = 400) => limpar(JSON.stringify(v)).slice(0, n);

/* ── Railway ─────────────────────────────────────────────────────────────────── */
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

async function lerVariaveis() {
  const tok = await gql(`query { projectToken { projectId environmentId } }`, {});
  const projectId = PROJECT_ID || tok.data?.projectToken?.projectId;
  const proj = await gql(
    `query P($id: String!) { project(id: $id) {
       environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
    { id: projectId },
  );
  if (!proj.ok) fail(`não consegui ler o projeto no Railway: ${proj.erro}`);
  const env = (proj.data.project.environments?.edges || []).map((e) => e.node).find((e) => e.name === "production");
  const svc = (proj.data.project.services?.edges || []).map((e) => e.node).find((s) => s.name === "FOOCCI");
  if (!env || !svc) fail("não achei o ambiente `production` / serviço `FOOCCI` no Railway.");
  const vars = await gql(
    `query V($projectId: String!, $environmentId: String!, $serviceId: String!) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
    { projectId, environmentId: env.id, serviceId: svc.id },
  );
  if (!vars.ok) fail(`não consegui ler as variáveis: ${vars.erro}`);
  const v = vars.data.variables || {};
  for (const k of Object.keys(v)) if (/SECRET|TOKEN|KEY|PASSWORD|PIN/i.test(k)) guardar(v[k]);
  return v;
}

/* ── Produção e Graph ────────────────────────────────────────────────────────── */
async function admin(caminho, secret) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "x-admin-secret": secret } });
  const texto = await r.text();
  try { return { status: r.status, json: JSON.parse(texto) }; }
  catch { return { status: r.status, json: null, texto: texto.slice(0, 160) }; }
}

async function graph(caminho, appToken) {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(appToken)}`);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, json: j };
}

/* ═══════════════════════════════════════════════════════════════════════════════ */
const main = async () => {
  const V = await lerVariaveis();
  const secret = V.ADMIN_SECRET;
  p("🔑 Variáveis de produção lidas. Nenhum valor de segredo será impresso.\n");

  /* ── 1. PRESENÇA de credencial ──────────────────────────────────────────────── */
  p("═══ 1 · CREDENCIAIS NO RAILWAY — presença, nunca valor ═══");
  const obrigatorias = [
    "META_APP_ID", "META_APP_SECRET", "META_CONFIG_ID", "META_WEBHOOK_VERIFY_TOKEN",
    "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
    "ADMIN_SECRET", "CRON_SECRET", "ENCRYPTION_KEY",
  ];
  const opcionais = [
    "META_COEXISTENCE_CONFIG_ID", "META_GRAPH_VERSION", "META_WHATSAPP_ENABLED", "META_TEST_PHONE",
    "NEXT_PUBLIC_META_APP_ID", "NEXT_PUBLIC_META_CONFIG_ID", "NEXT_PUBLIC_WHATSAPP_SALES_NUMBER",
    "META_ALERT_PHONE", "INSTAGRAM_ALERT_PHONE",
    "BUILDOS_META_PHONE_NUMBER_ID", "BUILDOS_META_ACCESS_TOKEN",
    "SUPPORT_META_PHONE_NUMBER_ID", "SUPPORT_META_ACCESS_TOKEN",
  ];
  const faltando = [];
  for (const k of obrigatorias) { const tem = !!V[k]; if (!tem) faltando.push(k); p(`   ${tem ? "✅" : "🔴"} ${k}`); }
  p("   ── opcionais / recursos que se desligam sozinhos ──");
  for (const k of opcionais) p(`   ${V[k] ? "✅" : "⚪"} ${k}`);

  // Os IDs públicos, impressos de propósito: são a prova de "um só aplicativo".
  p(`\n   · META_APP_ID (público): ${V.META_APP_ID ?? "—"}`);
  p(`   · INSTAGRAM_APP_ID (público): ${V.INSTAGRAM_APP_ID ?? "—"}`);
  p(`   · META_CONFIG_ID (público): ${V.META_CONFIG_ID ?? "—"}`);
  if (V.META_CONFIG_ID && V.META_CONFIG_ID === V.META_APP_ID) {
    p("   🔴 META_CONFIG_ID == META_APP_ID — é a armadilha de 02/08: o ID do app colado no campo do Config.");
  }
  // O navegador usa NEXT_PUBLIC_*, que é congelado no BUILD. Divergir do server é falha muda.
  for (const [pub, srv] of [["NEXT_PUBLIC_META_APP_ID", "META_APP_ID"], ["NEXT_PUBLIC_META_CONFIG_ID", "META_CONFIG_ID"]]) {
    if (V[pub] && V[srv] && V[pub] !== V[srv]) p(`   🔴 ${pub} diverge de ${srv} — o navegador abre o signup com outro app.`);
  }
  p(`\n   Faltando obrigatória: ${faltando.length ? faltando.join(", ") : "NENHUMA ✅"}`);

  // Esta flag NÃO governa mais o envio (canal único desde 04/08), mas ainda é portão
  // de ONBOARDING/UI: com ela diferente de "true", ninguém consegue CONFIGURAR nada
  // novo na Meta pelo painel — e a leitura de fora disso é "a Meta está parada".
  if (V.META_WHATSAPP_ENABLED !== "true") {
    p(`   🔴 META_WHATSAPP_ENABLED = ${V.META_WHATSAPP_ENABLED ?? "(ausente)"} — as telas de onboarding da Meta estão FECHADAS.`);
    p("      (não afeta quem já está conectado; afeta conectar qualquer coisa nova)");
  } else {
    p("   ✅ META_WHATSAPP_ENABLED = true — as telas de onboarding da Meta estão abertas.");
  }

  // O aviso automático só sai com TRÊS variáveis. Meio-configurado é desligado — e
  // desligado, hoje, é silencioso. Foi assim que 13 dias de canal mudo passaram.
  const destino = V.META_ALERT_PHONE || V.INSTAGRAM_ALERT_PHONE;
  const transporte = V.BUILDOS_META_PHONE_NUMBER_ID && V.BUILDOS_META_ACCESS_TOKEN;
  p(`   ${destino && transporte ? "✅" : "🔴"} aviso automático por WhatsApp: ${destino ? "" : "sem destino (META_ALERT_PHONE)"}${destino || transporte ? "" : " e "}${transporte ? "" : "sem transporte (canal Master do Build OS)"}${destino && transporte ? "ligado" : " → NENHUM alerta sai"}`);

  /* ── 2. O aplicativo, pela chave do app ─────────────────────────────────────── */
  p("\n═══ 2 · O APLICATIVO — o que a App Review cobra ═══");
  if (!V.META_APP_ID || !V.META_APP_SECRET) {
    p("   ⛔ sem META_APP_ID + META_APP_SECRET não dá para perguntar nada ao aplicativo.");
  } else {
    const appToken = `${V.META_APP_ID}|${V.META_APP_SECRET}`;
    const campos = "id,name,category,link,app_domains,privacy_policy_url,terms_of_service_url,app_type,restrictions";
    const app = await graph(`${V.META_APP_ID}?fields=${campos}`, appToken);
    if (!app.ok) {
      p(`   ❌ HTTP ${app.status} — ${jsonCurto(app.json?.error?.message ?? app.json)}`);
      p("   (se der 'Cannot get application info', a chave do app não está valendo — é o item mais grave possível)");
    } else {
      const a = app.json;
      p(`   · nome: ${a.name} · id: ${a.id} · tipo: ${a.app_type ?? "—"}`);
      p(`   ${a.privacy_policy_url ? "✅" : "🔴"} política de privacidade: ${a.privacy_policy_url || "VAZIO — a App Review reprova"}`);
      p(`   ${a.terms_of_service_url ? "✅" : "🔴"} termos de serviço: ${a.terms_of_service_url || "VAZIO — a App Review reprova"}`);
      const dominios = Array.isArray(a.app_domains) ? a.app_domains : [];
      p(`   ${dominios.length ? "✅" : "🔴"} domínios: ${dominios.join(", ") || "VAZIO — a App Review reprova"}`);
      if (a.restrictions) p(`   ⚠️ restrições declaradas: ${jsonCurto(a.restrictions)}`);
    }

    /* ── 3. Assinaturas de webhook do APP ────────────────────────────────────── */
    p("\n═══ 3 · ASSINATURAS DE WEBHOOK DO APLICATIVO ═══");
    p("   (esta leitura NÃO depende do token de nenhum cliente — é a que sobra quando o cliente morre)");
    const subs = await graph(`${V.META_APP_ID}/subscriptions`, appToken);
    if (!subs.ok) {
      p(`   ❌ HTTP ${subs.status} — ${jsonCurto(subs.json?.error?.message ?? subs.json)}`);
    } else {
      const linhas = Array.isArray(subs.json?.data) ? subs.json.data : [];
      if (!linhas.length) p("   🔴 NENHUM objeto assinado. A Meta não entrega evento nenhum, de canal nenhum.");
      const esperado = {
        instagram: { callback: `${BASE}/api/webhooks/instagram`, campo: "messages" },
        whatsapp_business_account: { callback: `${BASE}/api/webhooks/meta/whatsapp`, campo: "messages" },
      };
      const vistos = new Set();
      for (const s of linhas) {
        vistos.add(s.object);
        const campos = (s.fields || []).map((f) => f.name);
        const exp = esperado[s.object];
        p(`   · object=${s.object} · active=${s.active}`);
        p(`       callback: ${s.callback_url}${exp ? (s.callback_url === exp.callback ? " ✅" : ` 🔴 esperado ${exp.callback}`) : ""}`);
        p(`       fields: ${campos.join(", ") || "(nenhum)"}${exp ? (campos.includes(exp.campo) ? " ✅" : ` 🔴 falta "${exp.campo}"`) : ""}`);
      }
      for (const obj of Object.keys(esperado)) {
        if (!vistos.has(obj)) p(`   🔴 object=${obj} NÃO está assinado — este canal não recebe nada.`);
      }
    }
  }

  /* ── 4. Cada restaurante: WABA, número, template, CREDENCIAL VIVA ───────────── */
  p("\n═══ 4 · WHATSAPP DE CADA RESTAURANTE ═══");
  if (!secret) {
    p("   ⛔ ADMIN_SECRET ausente no Railway — não dá para consultar a produção.");
  } else {
    const diag = await admin("/api/admin/meta/diag", secret);
    if (diag.status !== 200) {
      p(`   ❌ HTTP ${diag.status} — ${jsonCurto(diag.json ?? diag.texto, 200)}`);
    } else {
      const cfgs = diag.json?.data?.configs ?? diag.json?.configs ?? [];
      p(`   · configurações encontradas: ${cfgs.length}`);
      if (cfgs.length === 0) p("   🔴 NENHUM restaurante com WhatsApp configurado.");
      for (const c of cfgs) {
        p(`\n   ── restaurante ${c.restaurantId} · ${c.displayPhoneNumber ?? "(sem número)"} ──`);
        p(`      status guardado no banco: ${c.connectionStatus}  ← isto é o que o painel mostra`);
        const t = c.tokenHealth ?? null;
        if (!t) {
          p("      ⚠️ este deploy ainda não devolve `tokenHealth` — atualize a produção para ver a verdade da credencial.");
        } else if (!t.answered) {
          p(`      ⚠️ NÃO deu para perguntar à Meta: ${t.error ?? "motivo não informado"}`);
        } else {
          p(`      credencial VIVA segundo a Meta: ${t.isValid ? "✅ sim" : "🔴 NÃO"}`);
          p(`      vence em: ${t.neverExpires ? "nunca (token de usuário de sistema)" : `${t.expiresInDays ?? "?"} dia(s) — ${t.expiresAt ?? "?"}`}`);
          p(`      emitida pelo NOSSO app: ${t.appIdMatches === null ? "não deu para dizer" : t.appIdMatches ? "✅ sim" : `🔴 NÃO (app ${t.tokenAppId})`}`);
          // As permissões concedidas são a prova INDIRETA de App Review: um cliente que
          // não é testador só consegue conceder permissão já aprovada pela Meta.
          p(`      permissões concedidas: ${t.scopes?.join(", ") || "(a Meta não listou)"}`);
        }
        p(`      nosso app assinado na WABA: ${c.ourAppSubscribed ? "✅ sim" : "🔴 NÃO — sem isso não chega mensagem"}`);
        p(`      templates aprovados: ${c.approvedTemplateCount ?? 0} · por status: ${jsonCurto(c.templatesByStatus, 200)}`);
        const ph = c.phone ?? {};
        p(`      número: verificação=${ph.code_verification_status ?? "?"} · nome=${ph.name_status ?? "?"} · plataforma=${ph.platform_type ?? "?"} · qualidade=${ph.quality_rating ?? "?"}`);
        const todos = c.wabaPhones?.data ?? [];
        if (todos.length) {
          p(`      TODOS os números desta WABA (${todos.length}):`);
          for (const n of todos) {
            p(`        · ${n.display_phone_number ?? n.id} — verificação=${n.code_verification_status ?? "?"} · nome=${n.name_status ?? "?"} · plataforma=${n.platform_type ?? "?"} · modo=${n.account_mode ?? "?"}`);
          }
        }
      }
    }
  }

  /* ── 5. Instagram ───────────────────────────────────────────────────────────── */
  p("\n═══ 5 · INSTAGRAM ═══");
  if (!secret) {
    p("   ⛔ sem ADMIN_SECRET.");
  } else {
    const slugs = (process.env.SLUGS || "sushi-cazza").split(",").map((s) => s.trim()).filter(Boolean);
    for (const slug of slugs) {
      p(`\n   ── ${slug} ──`);
      const ig = await admin(`/api/admin/settings/integrations/instagram?restaurantSlug=${slug}`, secret);
      if (ig.status !== 200) { p(`      HTTP ${ig.status} — ${jsonCurto(ig.json ?? ig.texto, 200)}`); continue; }
      const c = ig.json?.config ?? {};
      const restaurantId = ig.json?.restaurant?.id ?? null;
      p(`      enabled=${c.enabled} · paused=${c.paused} · mode=${c.mode} · scope=${c.scope}`);
      p(`      último evento recebido: ${c.lastWebhookAt ?? "NUNCA"}  ← congelado = a Meta parou de entregar`);
      p(`      último erro: ${c.lastError ?? "—"}`);
      if (!restaurantId) continue;
      const gc = await admin(`/api/admin/settings/integrations/instagram/graph-check?restaurantId=${restaurantId}`, secret);
      if (gc.status !== 200) { p(`      graph-check HTTP ${gc.status}`); continue; }
      const j = gc.json ?? {};
      p(`      token válido: ${j.tokenValid ? "✅ sim" : "🔴 NÃO — só o dono reconecta, com login pessoal"}`);
      p(`      vence em: ${j.expiresInDays ?? "?"} dia(s) · nasceu curto? ${j.tokenLooksShortLived}`);
      if (j.tokenLooksShortLived === true) {
        p("      🔴 TOKEN CURTO: 60 dias é o certo. Curto significa que a troca `ig_exchange_token`");
        p("         está falhando em produção — o defeito é ESSE, não a expiração.");
      }
    }
  }

  p("\n═══ FIM — nada foi alterado. Esta rodada foi somente leitura. ═══");
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
