#!/usr/bin/env node
/**
 * Prova hermética: o `client_secret` que a troca do token de 60 dias usa é o CERTO?
 *
 * Fatos já provados: a Meta está entregando (object=instagram assinado e ativo), e a
 * reconexão de 04/08 00:06Z nasceu com um token de 1 HORA — o fallback de
 * `instagramLoginOAuth.ts:165`, depois de três tentativas fracassadas de
 * `ig_exchange_token`. Isso já aconteceu antes (25/07). Duas vezes seguidas não é azar.
 *
 * A troca usa `client_secret = INSTAGRAM_APP_SECRET ?? META_APP_SECRET`
 * (instagramLoginOAuth.ts:45). O Instagram App Secret é OUTRO valor, diferente do
 * Facebook App Secret — e o fallback esconde a troca errada sem nenhum erro.
 *
 * Como se distingue sem um código de autorização real: chamamos os dois endpoints da
 * troca com um code/token propositalmente inválido. A Meta responde coisas DIFERENTES:
 *   • credencial de app errada → reclama do APP / client_secret
 *   • credencial certa        → reclama do CODE / do access token
 * A mensagem de erro é a evidência. Nada é criado, alterado ou enviado.
 *
 * Nenhum valor de segredo é impresso.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE = process.env.BASE_URL || "https://foocci.com.br";
const REDIRECT = `${BASE}/api/integrations/instagram/login/callback`;

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");
function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

const segredos = [TOKEN].filter(Boolean);
const guardar = (v) => { if (v && String(v).length >= 8) segredos.push(String(v)); return v; };
const limpar = (t) => segredos.reduce((s, seg) => s.split(seg).join("<oculto>"), String(t ?? ""));
const p = (t = "") => console.log(limpar(t));

async function gql(query, variables) {
  for (const headers of [{ Authorization: `Bearer ${TOKEN}` }, { "Project-Access-Token": TOKEN }]) {
    const r = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json().catch(() => null);
    if (j?.data && !j.errors) return j.data;
  }
  return null;
}

const main = async () => {
  const tok = await gql(`query { projectToken { projectId environmentId } }`, {});
  const projectId = PROJECT_ID || tok?.projectToken?.projectId;
  const proj = await gql(
    `query P($id: String!) { project(id: $id) {
       environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
    { id: projectId },
  );
  const env = (proj?.project?.environments?.edges || []).map((e) => e.node).find((e) => e.name === "production");
  const svc = (proj?.project?.services?.edges || []).map((e) => e.node).find((s) => s.name === "FOOCCI");
  const vars = await gql(
    `query V($projectId: String!, $environmentId: String!, $serviceId: String!) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
    { projectId, environmentId: env.id, serviceId: svc.id },
  );
  const V = vars?.variables || {};
  for (const k of Object.keys(V)) if (/SECRET|TOKEN|KEY|PASSWORD/i.test(k)) guardar(V[k]);

  const igId = V.INSTAGRAM_APP_ID;
  const igSec = V.INSTAGRAM_APP_SECRET;
  const fbSec = V.META_APP_SECRET ?? V.FACEBOOK_APP_SECRET;

  /* ── Passo 1 da troca: code → token curto ────────────────────────────────── */
  p("═══ PASSO 1 — POST api.instagram.com/oauth/access_token (code inválido de propósito) ═══");
  p(`   redirect_uri usado: ${REDIRECT}`);
  for (const [rotulo, sec] of [["INSTAGRAM_APP_SECRET", igSec], ["META_APP_SECRET", fbSec]]) {
    if (!igId || !sec) { p(`   · com ${rotulo}: incompleto — pulado`); continue; }
    const form = new URLSearchParams({
      client_id: igId, client_secret: sec, grant_type: "authorization_code",
      redirect_uri: REDIRECT, code: "PROPOSITALMENTE_INVALIDO",
    });
    const r = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
    });
    const j = await r.json().catch(() => ({}));
    p(`   · com ${rotulo}: HTTP ${r.status} — ${limpar(JSON.stringify(j)).slice(0, 300)}`);
  }

  /* ── Passo 2 da troca: token curto → 60 dias (é AQUI que quebra) ─────────── */
  p("\n═══ PASSO 2 — GET graph.instagram.com/access_token?grant_type=ig_exchange_token ═══");
  p("   (token de entrada inválido de propósito — o que importa é DE QUE a Meta reclama)");
  for (const [rotulo, sec] of [["INSTAGRAM_APP_SECRET", igSec], ["META_APP_SECRET", fbSec]]) {
    if (!sec) { p(`   · com ${rotulo}: ausente — pulado`); continue; }
    const url = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token`
      + `&client_secret=${encodeURIComponent(sec)}&access_token=PROPOSITALMENTE_INVALIDO`;
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    p(`   · com ${rotulo}: HTTP ${r.status} — ${limpar(JSON.stringify(j)).slice(0, 300)}`);
  }

  p("\n═══ COMO LER ═══");
  p("   Reclamou do CODE / do access token  → a credencial passou: o segredo está certo.");
  p("   Reclamou do APP / do client_secret  → achamos a causa: o segredo do Instagram");
  p("                                          no Railway não é o do app do Instagram.");
  p("   As DUAS reclamam igual              → o teste não discrimina; não concluir nada.");
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
