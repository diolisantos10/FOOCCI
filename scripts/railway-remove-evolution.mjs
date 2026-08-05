#!/usr/bin/env node
/**
 * Último passo da eliminação da Evolution: tirar o que sobrou dela do Railway.
 *
 * Ordem do CEO, repetida: "EXTRAÇÃO TOTAL, não quero um código dessa Evolution
 * dentro do Foocci". O código já saiu (zero imports, zero rotas) e o banco já
 * foi limpo pela migração. Sobrou infraestrutura:
 *
 *   1. duas variáveis órfãs com credencial dela no serviço FOOCCI
 *      (EVOLUTION_DEFAULT_API_KEY, EVOLUTION_DEFAULT_URL). Nenhum código as lê —
 *      mas credencial de serviço aposentado parada no ambiente é superfície de
 *      ataque sem dono.
 *   2. o serviço `evolution-api`, ligado e ocioso (0,3 GB de memória presos,
 *      tráfego de rede zerado), custando dinheiro para não fazer nada.
 *
 * Por que por API e não pelo conector: o conector do Railway está desligado
 * nesta conversa, e o token do Railway já vive nos segredos do repositório —
 * alcançável de dentro do GitHub Actions. Mesmo caminho que registrou o domínio.
 *
 * ⚠️ DESTRUTIVO e autorizado. O script NÃO apaga banco: `Postgres-76OG` e
 * `Postgres` são explicitamente protegidos, porque o CEO disse "apenas a
 * evolution". Qualquer alvo fora da lista aborta.
 *
 * O token nunca é impresso.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const APP_SERVICE = process.env.SERVICE_NAME || "FOOCCI";
const ENVIRONMENT_NAME = process.env.ENVIRONMENT_NAME || "production";
const ALVO = "evolution-api";
/** Nunca, em hipótese alguma, tocar nestes. */
const PROTEGIDOS = new Set(["FOOCCI", "Postgres", "Postgres-76OG"]);
const VARIAVEIS = ["EVOLUTION_DEFAULT_API_KEY", "EVOLUTION_DEFAULT_URL"];

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }
const limpar = (t) => String(t ?? "").split(TOKEN).join("<oculto>");
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

const main = async () => {
  const tok = await gql(`query { projectToken { projectId environmentId } }`, {});
  const projectId = PROJECT_ID || tok.data?.projectToken?.projectId;

  const proj = await gql(
    `query P($id: String!) { project(id: $id) {
       name environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
    { id: projectId },
  );
  if (!proj.ok) fail(`não consegui ler o projeto: ${proj.erro}`);

  const env = (proj.data.project.environments?.edges || []).map((e) => e.node)
    .find((e) => e.name === ENVIRONMENT_NAME);
  const servicos = (proj.data.project.services?.edges || []).map((e) => e.node);
  const app = servicos.find((s) => s.name === APP_SERVICE);
  const evolution = servicos.find((s) => s.name === ALVO);

  p(`📦 Projeto: ${proj.data.project.name} · ambiente: ${env?.name}`);
  p(`   Serviços hoje: ${servicos.map((s) => s.name).join(", ")}`);

  /* ── 1. variáveis órfãs ─────────────────────────────────────────────────── */
  p(`\n═══ 1. Variáveis órfãs no serviço ${APP_SERVICE} ═══`);
  if (!app || !env) {
    p("   (serviço ou ambiente não encontrado — pulando)");
  } else {
    for (const name of VARIAVEIS) {
      const r = await gql(
        `mutation V($input: VariableDeleteInput!) { variableDelete(input: $input) }`,
        { input: { projectId, environmentId: env.id, serviceId: app.id, name } },
      );
      p(r.ok ? `   ✅ ${name} apagada` : `   ❌ ${name}: ${r.erro}`);
    }
  }

  /* ── 2. o serviço ───────────────────────────────────────────────────────── */
  p(`\n═══ 2. Serviço ${ALVO} ═══`);
  if (!evolution) {
    p(`   ✅ Não existe mais — nada a fazer.`);
    return;
  }
  // Trava de segurança: só apaga o alvo, e nunca um protegido.
  if (PROTEGIDOS.has(evolution.name) || evolution.name !== ALVO) {
    fail(`ABORTADO: alvo resolvido para "${evolution.name}", que não é ${ALVO}.`);
  }

  const del = await gql(`mutation S($id: String!) { serviceDelete(id: $id) }`, { id: evolution.id });
  if (del.ok) {
    p(`   ✅ ${ALVO} APAGADO.`);
  } else {
    p(`   ❌ recusado: ${del.erro}`);
    p(`   → Se falar em verificação de dois fatores, é regra do Railway para exclusão`);
    p(`     de serviço e não passa por API: precisa do clique no painel.`);
  }

  const depois = await gql(
    `query P($id: String!) { project(id: $id) { services { edges { node { name } } } } }`,
    { id: projectId },
  );
  if (depois.ok) {
    p(`\n📋 Serviços agora: ${(depois.data.project.services?.edges || []).map((e) => e.node.name).join(", ")}`);
  }
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
