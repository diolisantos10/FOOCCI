#!/usr/bin/env node
/**
 * Reconstrói a SÉRIE HISTÓRICA de disparo do CRM INTEIRO a partir dos logs do
 * GitHub Actions — sem tocar no banco de produção e sem pedir clique a ninguém.
 *
 * POR QUE ESTE CAMINHO EXISTE
 * O workflow `crm-cron.yml` imprime, a cada execução, a resposta crua dos dois
 * motores do CRM:
 *
 *   • job "Scheduled Campaigns"  → POST /api/cron/run-scheduled-campaigns
 *     devolve `{ campaignsProcessed, totalEligible, totalSent, totalFailed,
 *     totalBlocked, totalSkipped, results[] }`, e cada item de `results[]` traz
 *     campanha, elegíveis, enviados, falhos, bloqueados e o `reason` textual de
 *     quem não saiu. É o histórico do motor, já gravado, datado e público.
 *   • job "CRM Automations"      → POST /api/cron/execute-crm-automations
 *     o motor legado, aposentado por teste (`AutomationRetired.test.ts`). Fica
 *     aqui para PROVAR o zero, em vez de supor.
 *
 * Isto responde "o que aconteceu ao longo do tempo". Para "qual é o estado
 * agora" (audiência viva, teto por campanha, canal conectado), use
 * `scripts/raio-x-envios-crm-agora.mjs`, que fala com as rotas de diagnóstico.
 *
 * SOMENTE LEITURA. Não dispara workflow, não envia mensagem, não escreve nada.
 *
 * Uso:
 *   GH_TOKEN=... node scripts/raio-x-envios-crm.mjs
 *   DIAS=90 PAGINAS=40 node scripts/raio-x-envios-crm.mjs
 *
 * ⚠️ O log do Actions é PÚBLICO. Esta saída não pode ganhar dado pessoal: os
 * contadores do cron são agregados e não trazem telefone, nome nem texto de
 * mensagem. O NOME da campanha é do restaurante (não do cliente) e já sai hoje
 * no log público do próprio cron. Ao adicionar campo aqui, pergunte antes se
 * ele pode ficar visível para qualquer pessoa.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

const TOKEN    = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const REPO     = process.env.REPO || "diolisantos10/FOOCCI";
const WORKFLOW = process.env.WORKFLOW || "crm-cron.yml";
const PAGINAS  = Number(process.env.PAGINAS || "40");
const DIAS     = Number(process.env.DIAS || "90");
const CONC     = Number(process.env.CONCORRENCIA || "8");

if (!TOKEN) {
  console.error("❌ GH_TOKEN ausente — sem ele a API do GitHub não devolve o log do job.");
  process.exit(1);
}

/**
 * O `fetch` embutido do Node (undici) IGNORA HTTPS_PROXY. Dentro do runner do
 * Actions isso é irrelevante — não há proxy —, mas em qualquer ambiente que
 * fale com a internet por proxy o `fetch` sai por fora e volta 403/401, o que
 * se lê como "token errado" quando na verdade é rota errada. Por isso a chamada
 * passa pelo `curl`, que respeita as variáveis de proxy do ambiente.
 */
async function curl(url, comAuth = true) {
  const args = ["-sSL", "--max-time", "90"];
  if (comAuth) {
    args.push("-H", `Authorization: Bearer ${TOKEN}`, "-H", "Accept: application/vnd.github+json");
  }
  const { stdout } = await exec("curl", [...args, url], { maxBuffer: 128 * 1024 * 1024 });
  return stdout;
}

async function api(caminho) {
  for (let i = 0; i < 4; i++) {
    try { return JSON.parse(await curl(`https://api.github.com${caminho}`)); }
    catch { await new Promise((s) => setTimeout(s, 1500)); }
  }
  return null;
}

async function logDoJob(jobId) {
  for (let i = 0; i < 3; i++) {
    try { return await curl(`https://api.github.com/repos/${REPO}/actions/jobs/${jobId}/logs`); }
    catch { await new Promise((s) => setTimeout(s, 1500)); }
  }
  return "";
}

/**
 * O `jq .` do workflow imprime o JSON indentado, uma chave por linha, cada linha
 * prefixada pelo timestamp do runner. O JSON do cron de campanhas é ANINHADO
 * (`results[]`), então não dá para procurar o primeiro `}` como no carrinho:
 * é preciso contar chaves balanceadas, ignorando chave dentro de string.
 */
function extrairJson(log) {
  const linhas = log.split("\n").map((l) => l.replace(/^\S+Z /, "").replace(/\r$/, ""));
  const inicio = linhas.findIndex((l) => l.trim() === "← Response:");
  if (inicio < 0) return null;
  let i = inicio + 1;
  while (i < linhas.length && linhas[i].trim() === "") i++;
  if (i >= linhas.length || !linhas[i].trim().startsWith("{")) return null;

  let profundidade = 0, dentroDeString = false, escapado = false;
  const pedaco = [];
  for (; i < linhas.length; i++) {
    const linha = linhas[i];
    pedaco.push(linha);
    for (const ch of linha) {
      if (escapado) { escapado = false; continue; }
      if (ch === "\\") { escapado = true; continue; }
      if (ch === '"') { dentroDeString = !dentroDeString; continue; }
      if (dentroDeString) continue;
      if (ch === "{") profundidade++;
      else if (ch === "}") profundidade--;
    }
    if (profundidade === 0 && pedaco.length > 0) {
      try { return JSON.parse(pedaco.join("\n")); } catch { return null; }
    }
  }
  return null;
}

/** Roda `fn` sobre `itens` com concorrência limitada, preservando a ordem. */
async function emParalelo(itens, fn, concorrencia) {
  const saida = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(concorrencia, itens.length) }, async () => {
      for (;;) {
        const i = proximo++;
        if (i >= itens.length) return;
        saida[i] = await fn(itens[i], i);
      }
    }),
  );
  return saida;
}

/**
 * Classifica o `reason` do runner nas TRÊS FAMÍLIAS do diagnóstico do carrinho —
 * a pergunta do CEO é se o padrão se repete no CRM inteiro.
 *
 *   NUNCA_DISPARA  — o gatilho não chega a rodar / sai na primeira condição
 *   SEM_AUDIENCIA  — roda, e não acha ninguém
 *   BLOQUEADO      — acha gente e a proteção segura
 *   ENVIOU         — saiu mensagem
 */
function familia(reason, r) {
  if ((r?.sent ?? 0) > 0) return "ENVIOU";
  const t = String(reason ?? "").toLowerCase();
  if (!t) return (r?.eligible ?? 0) > 0 ? "BLOQUEADO" : "SEM_AUDIENCIA";
  if (t.includes("not due") || t.includes("not found") || t.includes("aguardando")) return "NUNCA_DISPARA";
  if (t.includes("no new eligible") || t.includes("audience exhausted") ||
      t.includes("elegíveis") || t.includes("elegiveis")) return "SEM_AUDIENCIA";
  if (t.includes("daily limit") || t.includes("cap global") || t.includes("silêncio") ||
      t.includes("silencio") || t.includes("quiet") || t.includes("fim de semana") ||
      t.includes("weekend") || t.includes("intervalo mínimo") || t.includes("intervalo minimo")) return "BLOQUEADO";
  if (t.includes("dry run")) return "NUNCA_DISPARA";
  return "OUTRO";
}

/** Normaliza o `reason` para virar chave de histograma (tira números variáveis). */
function chaveDoMotivo(reason) {
  return String(reason ?? "(sem motivo)")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const somaVazia = () => ({
  ticks: 0, eligible: 0, sent: 0, failed: 0, blocked: 0, skipped: 0,
  motivos: new Map(), familias: new Map(),
});

function acumular(acc, r) {
  acc.ticks += 1;
  acc.eligible += r.eligible ?? 0;
  acc.sent += r.sent ?? 0;
  acc.failed += r.failed ?? 0;
  acc.blocked += r.blocked ?? 0;
  acc.skipped += r.skipped ?? 0;
  const m = chaveDoMotivo(r.reason);
  acc.motivos.set(m, (acc.motivos.get(m) ?? 0) + 1);
  const f = familia(r.reason, r);
  acc.familias.set(f, (acc.familias.get(f) ?? 0) + 1);
}

const topN = (mapa, n = 4) =>
  [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${k} ×${v}`).join(" · ");

const main = async () => {
  const wf = await api(`/repos/${REPO}/actions/workflows?per_page=100`);
  const alvo = wf?.workflows?.find((w) => w.path.endsWith(WORKFLOW));
  if (!alvo) { console.error(`❌ workflow ${WORKFLOW} não encontrado em ${REPO}`); process.exit(1); }

  const corte = new Date(Date.now() - DIAS * 86_400_000);
  let execucoes = [];
  for (let p = 1; p <= PAGINAS; p++) {
    const d = await api(`/repos/${REPO}/actions/workflows/${alvo.id}/runs?per_page=100&page=${p}`);
    const lote = d?.workflow_runs ?? [];
    if (!lote.length) break;
    execucoes = execucoes.concat(lote);
    if (new Date(lote[lote.length - 1].created_at) < corte) break;
  }
  execucoes = execucoes.filter((r) => new Date(r.created_at) >= corte);
  if (!execucoes.length) { console.error("❌ nenhuma execução na janela"); process.exit(1); }

  console.log(`Repositório: ${REPO} · workflow: ${WORKFLOW} · janela: ${DIAS} dias`);
  console.log(`Execuções na janela: ${execucoes.length}`);
  console.log(`De ${execucoes[execucoes.length - 1].created_at} a ${execucoes[0].created_at}\n`);

  const jobsPorRun = await emParalelo(
    execucoes,
    async (r) => ({ run: r, jobs: (await api(`/repos/${REPO}/actions/runs/${r.id}/jobs`))?.jobs ?? [] }),
    CONC,
  );

  const alvos = [];
  for (const { run, jobs } of jobsPorRun) {
    for (const j of jobs) {
      if (j.conclusion !== "success") continue;              // "skipped" = aquele agendamento não era deste job
      if (j.name === "Scheduled Campaigns" || j.name === "CRM Automations") {
        alvos.push({ quando: run.created_at, job: j.name, id: j.id });
      }
    }
  }
  console.log(`Jobs com conclusão "success": ${alvos.length} ` +
    `(campanhas: ${alvos.filter((a) => a.job === "Scheduled Campaigns").length}, ` +
    `automações legadas: ${alvos.filter((a) => a.job === "CRM Automations").length})\n`);

  const respostas = await emParalelo(
    alvos,
    async (a) => ({ ...a, res: extrairJson(await logDoJob(a.id)) }),
    CONC,
  );

  const ticksCampanha = respostas.filter((r) => r.job === "Scheduled Campaigns" && r.res);
  const ticksAutomacao = respostas.filter((r) => r.job === "CRM Automations" && r.res);

  /* ── 1. O motor legado ─────────────────────────────────────────────────── */
  console.log("═".repeat(78));
  console.log("1. MOTOR LEGADO DE AUTOMAÇÕES (aposentado) — provar o zero, não supor");
  console.log("═".repeat(78));
  if (!ticksAutomacao.length) {
    console.log("   Nenhuma resposta legível na janela.");
  } else {
    const enviado = ticksAutomacao.reduce((s, t) => s + (t.res.totalSent ?? 0), 0);
    const rodadas = ticksAutomacao.reduce((s, t) => s + (t.res.automationsRun ?? 0), 0);
    console.log(`   Execuções com resposta: ${ticksAutomacao.length}`);
    console.log(`   automationsRun somado: ${rodadas} · totalSent somado: ${enviado}`);
  }

  /* ── 2. Campanhas: totais por janela ───────────────────────────────────── */
  const janelas = [...new Set([30, 90].filter((d) => d <= DIAS).concat(DIAS < 30 ? [DIAS] : []))]
    .sort((a, b) => a - b);
  console.log("\n" + "═".repeat(78));
  console.log("2. CAMPANHAS AGENDADAS — o total, por janela");
  console.log("═".repeat(78));
  for (const d of janelas) {
    const c = new Date(Date.now() - d * 86_400_000);
    const t = ticksCampanha.filter((x) => new Date(x.quando) >= c);
    const s = (k) => t.reduce((a, x) => a + (x.res[k] ?? 0), 0);
    console.log(
      `   ${String(d).padStart(2)}d · ticks ${String(t.length).padStart(5)} · ` +
      `campanhas processadas ${String(s("campaignsProcessed")).padStart(6)} · ` +
      `elegíveis ${String(s("totalEligible")).padStart(6)} · ` +
      `ENVIADOS ${String(s("totalSent")).padStart(6)} · ` +
      `falhos ${String(s("totalFailed")).padStart(5)} · ` +
      `bloqueados ${String(s("totalBlocked")).padStart(5)} · ` +
      `pulados ${String(s("totalSkipped")).padStart(6)}`,
    );
  }

  /* ── 3. Campanha a campanha ────────────────────────────────────────────── */
  for (const d of janelas) {
    const c = new Date(Date.now() - d * 86_400_000);
    const porCampanha = new Map();   // campaignId → { nome, acc }
    for (const t of ticksCampanha) {
      if (new Date(t.quando) < c) continue;
      for (const r of t.res.results ?? []) {
        const k = r.campaignId ?? "(sem id)";
        if (!porCampanha.has(k)) porCampanha.set(k, { nome: r.campaignName || "(sem nome)", acc: somaVazia() });
        acumular(porCampanha.get(k).acc, r);
      }
    }
    console.log("\n" + "═".repeat(78));
    console.log(`3. CAMPANHA A CAMPANHA — últimos ${d} dias (${porCampanha.size} campanhas vistas pelo motor)`);
    console.log("═".repeat(78));
    const linhas = [...porCampanha.entries()].sort((a, b) => b[1].acc.sent - a[1].acc.sent || b[1].acc.ticks - a[1].acc.ticks);
    for (const [id, { nome, acc }] of linhas) {
      const familiaDominante = [...acc.familias.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
      console.log(
        `   ${nome.slice(0, 34).padEnd(34)} ${id.slice(0, 8)} | ` +
        `ticks ${String(acc.ticks).padStart(5)} | eleg ${String(acc.eligible).padStart(6)} | ` +
        `ENV ${String(acc.sent).padStart(5)} | falh ${String(acc.failed).padStart(4)} | ` +
        `bloq ${String(acc.blocked).padStart(4)} | pul ${String(acc.skipped).padStart(5)} | ${familiaDominante}`,
      );
      console.log(`      motivos: ${topN(acc.motivos)}`);
    }
  }

  /* ── 4. As três famílias, somadas ──────────────────────────────────────── */
  const global = somaVazia();
  const corte30 = new Date(Date.now() - 30 * 86_400_000);
  for (const t of ticksCampanha) {
    if (new Date(t.quando) < corte30) continue;
    for (const r of t.res.results ?? []) acumular(global, r);
  }
  console.log("\n" + "═".repeat(78));
  console.log("4. AS TRÊS FAMÍLIAS — avaliações campanha×tick nos últimos 30 dias");
  console.log("═".repeat(78));
  const totalAval = [...global.familias.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [f, n] of [...global.familias.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${f.padEnd(16)} ${String(n).padStart(6)}  (${((n / totalAval) * 100).toFixed(1)}%)`);
  }
  console.log("\n   Motivos mais frequentes (30d):");
  for (const [m, n] of [...global.motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`   · ${String(n).padStart(6)} × ${m}`);
  }

  console.log(
    "\nLeitura: 'eleg' muito maior que 'ENV' significa que o motor DECLAROU gente " +
    "cobrável e nada saiu — o pior modo de falha, porque nem falha aparece.\n" +
    "(Este script é somente leitura. Nenhuma mensagem foi enviada.)",
  );
};

main().catch((e) => { console.error("❌", e?.stack || e); process.exit(1); });
