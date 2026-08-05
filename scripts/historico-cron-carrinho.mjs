#!/usr/bin/env node
/**
 * Reconstrói a SÉRIE HISTÓRICA da recuperação de carrinho a partir dos logs do
 * GitHub Actions — sem tocar no banco de produção e sem pedir clique a ninguém.
 *
 * POR QUE ESTE CAMINHO EXISTE
 * O job "Cart Recovery" do workflow `crm-cron.yml` imprime, a cada execução, a
 * resposta crua de `POST /api/cron/send-cart-recovery`: quantos rascunhos foram
 * checados, quantos ficaram elegíveis, quantos saíram, quantos falharam e por
 * qual motivo cada um foi pulado. Ou seja: o histórico do motor já está gravado,
 * datado e público. Foi assim que se provou, em 05/08/2026, que entre 19/05 e
 * 05/08 saíram **4 mensagens no total** enquanto a tela dizia "Ativa".
 *
 * Isto responde "o que aconteceu ao longo do tempo". Para "qual é o estado
 * agora", use `GET /api/admin/diagnostics/recovery-scheduler`, que já devolve o
 * bloco `health` do `CartRecoveryHealthService`.
 *
 * SOMENTE LEITURA. Não dispara workflow, não envia mensagem, não escreve nada.
 *
 * Uso:
 *   GH_TOKEN=... node scripts/historico-cron-carrinho.mjs
 *   PAGINAS=8 node scripts/historico-cron-carrinho.mjs     # ~800 execuções
 *
 * O log do Actions é público, então esta saída não pode ganhar dado pessoal: os
 * contadores do cron são agregados e não trazem telefone nem nome. Ao adicionar
 * campo aqui, pergunte antes se ele pode ficar visível para qualquer pessoa.
 */

const TOKEN    = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const REPO     = process.env.REPO || "diolisantos10/FOOCCI";
const WORKFLOW = process.env.WORKFLOW || "crm-cron.yml";
const JOB      = process.env.JOB || "Cart Recovery";
const PAGINAS  = Number(process.env.PAGINAS || "3");

if (!TOKEN) {
  console.error("❌ GH_TOKEN ausente — sem ele a API do GitHub não devolve o log do job.");
  process.exit(1);
}

const HDR = { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" };

/**
 * O `fetch` embutido do Node (undici) IGNORA HTTPS_PROXY. Dentro do runner do
 * Actions isso é irrelevante — não há proxy —, mas em qualquer ambiente que
 * fale com a internet por proxy o `fetch` sai por fora e volta 403/401, o que
 * se lê como "token errado" quando na verdade é rota errada. Por isso a chamada
 * passa pelo `curl`, que respeita as variáveis de proxy do ambiente.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

async function curl(url, comAuth = true) {
  const args = ["-sSL", "--max-time", "60"];
  if (comAuth) args.push("-H", `Authorization: Bearer ${TOKEN}`, "-H", `Accept: ${HDR.Accept}`);
  const { stdout } = await exec("curl", [...args, url], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function api(caminho) {
  for (let i = 0; i < 4; i++) {
    try { return JSON.parse(await curl(`https://api.github.com${caminho}`)); }
    catch { await new Promise((s) => setTimeout(s, 2000)); }
  }
  return null;
}

async function logDoJob(jobId) {
  for (let i = 0; i < 4; i++) {
    try { return await curl(`https://api.github.com/repos/${REPO}/actions/jobs/${jobId}/logs`); }
    catch { await new Promise((s) => setTimeout(s, 2000)); }
  }
  return "";
}

/** A resposta do curl sai impressa pelo jq, uma chave por linha com timestamp. */
function extrairJson(log) {
  const linhas = log.split("\n").map((l) => l.replace(/^\S+Z /, ""));
  const inicioResposta = linhas.indexOf("← Response:");
  if (inicioResposta < 0) return null;
  const i = linhas.indexOf("{", inicioResposta);
  const j = linhas.indexOf("}", i);
  if (i < 0 || j < 0) return null;
  try { return JSON.parse(linhas.slice(i, j + 1).join("\n")); } catch { return null; }
}

const COLUNAS = [
  "checked", "eligible", "sent", "failed", "skippedTooOld", "skippedNoConfig",
  "skippedRestaurantClosed", "skippedTemplateRequired", "skippedNoPhone",
  "skippedDailyLimit", "skippedOrderedAfter",
];

const main = async () => {
  const wf = await api(`/repos/${REPO}/actions/workflows`);
  const alvo = wf?.workflows?.find((w) => w.path.endsWith(WORKFLOW));
  if (!alvo) { console.error(`❌ workflow ${WORKFLOW} não encontrado em ${REPO}`); process.exit(1); }

  let execucoes = [];
  for (let p = 1; p <= PAGINAS; p++) {
    const d = await api(`/repos/${REPO}/actions/workflows/${alvo.id}/runs?per_page=100&page=${p}`);
    if (d?.workflow_runs?.length) execucoes = execucoes.concat(d.workflow_runs);
  }
  if (!execucoes.length) { console.error("❌ nenhuma execução encontrada"); process.exit(1); }

  console.log(`Execuções varridas: ${execucoes.length}`);
  console.log(`Janela: ${execucoes[execucoes.length - 1].created_at} → ${execucoes[0].created_at}\n`);

  const ticks = [];
  for (const r of execucoes) {
    const d = await api(`/repos/${REPO}/actions/runs/${r.id}/jobs`);
    const j = d?.jobs?.find((x) => x.name === JOB && x.conclusion === "success");
    if (!j) continue;                      // "skipped" = aquele agendamento não era o do carrinho
    const res = extrairJson(await logDoJob(j.id));
    if (res) ticks.push([r.created_at, res]);
  }
  ticks.sort();

  console.log("quando".padEnd(21) + COLUNAS.map((c) => c.slice(0, 9).padStart(10)).join(""));
  for (const [quando, res] of ticks) {
    console.log(quando.padEnd(21) + COLUNAS.map((c) => String(res[c] ?? "-").padStart(10)).join(""));
  }

  const soma = Object.fromEntries(COLUNAS.map((c) => [c, ticks.reduce((a, [, r]) => a + (r[c] || 0), 0)]));
  console.log(`\nTicks com resposta: ${ticks.length}`);
  console.log("SOMA no período:", JSON.stringify(soma));
  console.log(
    `\nLeitura: 'eligible' muito maior que 'sent' significa que o motor DECLAROU ` +
    `carrinho cobrável e nada saiu — o pior modo de falha, porque nem falha aparece.`,
  );
};

main().catch((e) => { console.error("❌", e); process.exit(1); });
