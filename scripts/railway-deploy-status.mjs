#!/usr/bin/env node
/**
 * Diz o que está acontecendo com o último deploy do FOOCCI no Railway.
 *
 * Por que existe: o workflow de deploy usa `railway up --detach` — ele entrega o
 * pacote e sai, sem esperar a construção. A verificação seguinte só confere se
 * "alguma coisa" responde 200, e a versão ANTIGA responde 200 perfeitamente.
 * Resultado: o deploy aparece como sucesso mesmo quando a construção falhou e
 * produção continua na versão velha. Foi exatamente o que aconteceu em 05/08.
 *
 * Este script pergunta ao Railway o que o workflow não pergunta: qual o estado
 * real do último deploy e, se falhou, o que o log diz.
 *
 * O token vive nos segredos do repositório e nunca é impresso.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const SERVICE_NAME = process.env.SERVICE_NAME || "FOOCCI";
const ENVIRONMENT_NAME = process.env.ENVIRONMENT_NAME || "production";

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }
const limpar = (t) => String(t ?? "").split(TOKEN).join("<oculto>");
const p = (t = "") => console.log(limpar(t));

async function gql(query, variables) {
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

const main = async () => {
  const tok = await gql(`query { projectToken { projectId environmentId } }`, {});
  const projectId = PROJECT_ID || tok?.projectToken?.projectId;

  const proj = await gql(
    `query P($id: String!) { project(id: $id) {
       environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
    { id: projectId },
  );
  const env = (proj?.project?.environments?.edges || []).map((e) => e.node).find((e) => e.name === ENVIRONMENT_NAME);
  const svc = (proj?.project?.services?.edges || []).map((e) => e.node).find((s) => s.name === SERVICE_NAME);
  if (!env || !svc) fail("Não achei o ambiente/serviço no Railway.");

  const deps = await gql(
    `query D($input: DeploymentListInput!) {
       deployments(first: 5, input: $input) {
         edges { node { id status createdAt staticUrl canRedeploy meta } } } }`,
    { input: { projectId, environmentId: env.id, serviceId: svc.id } },
  );

  const lista = (deps?.deployments?.edges || []).map((e) => e.node);
  if (!lista.length) { p("Nenhum deploy encontrado."); return; }

  p(`\n═══ Últimos deploys de ${SERVICE_NAME} (${ENVIRONMENT_NAME}) ═══`);
  for (const d of lista) {
    const sha = (d.meta && (d.meta.commitHash || d.meta.commit)) || "";
    p(`  · ${d.createdAt}  ${String(d.status).padEnd(10)}  ${String(sha).slice(0, 8)}`);
  }

  const ultimo = lista[0];
  p(`\n▸ Mais recente: ${ultimo.status} (id ${ultimo.id})`);

  // Só puxa log quando interessa: falhou, ou está preso construindo.
  if (["FAILED", "CRASHED", "BUILDING", "DEPLOYING", "INITIALIZING"].includes(String(ultimo.status))) {
    for (const [rotulo, campo] of [["CONSTRUÇÃO", "buildLogs"], ["EXECUÇÃO", "deploymentLogs"]]) {
      const logs = await gql(
        `query L($id: String!) { ${campo}(deploymentId: $id, limit: 60) { message severity timestamp } }`,
        { id: ultimo.id },
      );
      const linhas = logs?.[campo] || [];
      if (!linhas.length) continue;
      p(`\n── LOG DE ${rotulo} (últimas ${linhas.length}) ──`);
      for (const l of linhas) p(`   ${l.message}`);
    }
  }
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
