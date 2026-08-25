#!/usr/bin/env node
/**
 * QUANTO O RECEPCIONISTA ATENDE AO VIVO — o número que faltava quando a régua do
 * topo escolheu 30 amostras / janela de 50 / 7 dias.
 *
 * POR QUE ESTE SCRIPT EXISTE
 * A régua do topo (LiveStageHealth) só decide quando junta 30 amostras dentro da
 * janela de tempo. A janela de 7 dias veio da evidência de SOMBRA, onde amostra é
 * barata. Ao vivo ela é rara: cada amostra é um turno de cliente real. Se o
 * restaurante não produz 30 turnos em 7 dias, a janela esvazia por um lado
 * enquanto enche pelo outro e o degrau alto fica em SEM_AMOSTRA para sempre —
 * aberto a cliente real, sem régua que decida.
 *
 * A pergunta é de VOLUME, e volume não se deduz: se mede. Este script mede.
 *
 * A FONTE, E O QUE ELA NÃO É
 * A marca `stage='LIVE'` no brain_shadow_logs só existe desde 24/08/2026 — não
 * há histórico nela. O histórico honesto de "turno de cliente ao vivo" são as
 * mensagens INBOUND de conversas de WhatsApp classificadas como CUSTOMER: é
 * exatamente o gatilho que faz o recepcionista rodar e, no topo, gravar uma
 * amostra.
 *
 * É um PROXY, e ele é um LIMITE SUPERIOR do que viraria amostra:
 *   • turno com allowlist fora da lista, IA travada ou pausada não chega ao Brain;
 *   • falha de rede da Meta não vira amostra.
 * Nenhum desses inflaria o risco — todos empurram o volume real para BAIXO do que
 * este script mostra. Ou seja: se o proxy já não alcança o mínimo, o real também não.
 *
 * ⚠️ O log deste repositório é PÚBLICO. Sai daqui apenas CONTAGEM, slug de
 * restaurante (já público na URL da loja) e hora do dia. Nunca nome, telefone,
 * e-mail ou texto de mensagem.
 *
 * SOMENTE LEITURA. Nenhuma escrita, nenhum envio, nenhuma promoção.
 *
 * Uso:  RAILWAY_TOKEN=... node scripts/volume-topo-ao-vivo.mjs
 */

import { PrismaClient } from "@prisma/client";

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const DIAS = Number(process.env.DIAS || "90");
/** Fuso do restaurante — a faixa de hora só faz sentido na hora local dele. */
const OFFSET_H = Number(process.env.OFFSET_HORAS || "-3"); // America/Sao_Paulo

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");
function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

let segredos = [TOKEN].filter(Boolean);
const limpar = (t) => segredos.reduce((s, seg) => (seg ? s.split(seg).join("<oculto>") : s), String(t ?? ""));
const p = (t = "") => console.log(limpar(t));

async function railway(query, variables) {
  for (const headers of [{ Authorization: `Bearer ${TOKEN}` }, { "Project-Access-Token": TOKEN }]) {
    const r = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ query, variables }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (j?.data && !j.errors) return j.data;
  }
  return null;
}

async function lerUrls() {
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
  for (const v of Object.values(todas)) if (typeof v === "string" && v.length > 8) segredos.push(v);
  return [todas.DATABASE_PUBLIC_URL, todas.DATABASE_URL].filter(Boolean);
}

const DIA_NOME = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const local = (d) => new Date(d.getTime() + OFFSET_H * 3_600_000);
const n = (x, w = 5) => String(x ?? 0).padStart(w);

const main = async () => {
  const urls = await lerUrls();
  p("🔑 Credenciais lidas do Railway (nenhuma impressa).\n");

  let prisma = null;
  for (const url of urls) {
    const t = new PrismaClient({ datasources: { db: { url } } });
    try { await t.$queryRaw`SELECT 1`; prisma = t; break; }
    catch { await t.$disconnect().catch(() => {}); }
  }
  if (!prisma) fail("Nenhuma URL de banco aceitou conexão de fora do Railway. Não concluo nada sobre volume.");

  const agora = new Date();
  const corte = new Date(agora.getTime() - DIAS * 86_400_000);

  const restaurantes = await prisma.restaurant.findMany({ select: { id: true, slug: true, isDemo: true } });
  const meta = new Map(restaurantes.map((r) => [r.id, r]));

  const configs = await prisma.brainFreeFormConfig.findMany({
    select: { restaurantId: true, mode: true, paused: true, allowlistedPhones: true, updatedAt: true },
  });

  p("═".repeat(78));
  p("A. QUEM ESTÁ EM QUE DEGRAU (config do raciocínio livre do recepcionista)");
  p("═".repeat(78));
  for (const c of configs) {
    const r = meta.get(c.restaurantId);
    const lista = Array.isArray(c.allowlistedPhones) ? c.allowlistedPhones.length : 0;
    p(`   ${(r?.slug ?? c.restaurantId.slice(0, 8)).padEnd(24)} ${String(c.mode).padEnd(16)} ` +
      `pausado=${c.paused ? "sim" : "não"}  allowlist=${lista}  demo=${r?.isDemo ? "sim" : "não"}  ` +
      `últimaMudança=${String(c.updatedAt).slice(0, 10)}`);
  }
  if (!configs.length) p("   (nenhuma config gravada — todos em SHADOW_ONLY por default)");
  p();

  /* ── B. O VOLUME REAL, por restaurante ─────────────────────────────────── */
  p("═".repeat(78));
  p(`B. TURNOS DE CLIENTE AO VIVO — mensagens INBOUND de WhatsApp (CUSTOMER), ${DIAS} dias`);
  p("═".repeat(78));
  p("   Proxy e LIMITE SUPERIOR do que viraria amostra do topo. Ver cabeçalho.");
  p();

  const conversas = await prisma.conversation.findMany({
    where: { channel: "WHATSAPP", conversationType: "CUSTOMER", lastMessageAt: { gte: corte } },
    select: { id: true, restaurantId: true },
  });
  const restDaConversa = new Map(conversas.map((c) => [c.id, c.restaurantId]));
  p(`   conversas de WhatsApp (CUSTOMER) com atividade na janela: ${conversas.length}`);

  const msgs = conversas.length
    ? await prisma.message.findMany({
        where: { conversationId: { in: conversas.map((c) => c.id) }, direction: "INBOUND", sentAt: { gte: corte } },
        select: { conversationId: true, sentAt: true },
      })
    : [];
  p(`   mensagens INBOUND na janela: ${msgs.length}`);
  p();

  const porRest = new Map();
  for (const m of msgs) {
    const rid = restDaConversa.get(m.conversationId);
    if (!rid) continue;
    if (!porRest.has(rid)) porRest.set(rid, { total: 0, dias: new Map(), semana: Array(7).fill(0), hora: Array(24).fill(0), primeiro: m.sentAt, ultimo: m.sentAt });
    const b = porRest.get(rid);
    const L = local(m.sentAt);
    b.total += 1;
    b.semana[L.getUTCDay()] += 1;
    b.hora[L.getUTCHours()] += 1;
    const chave = L.toISOString().slice(0, 10);
    b.dias.set(chave, (b.dias.get(chave) ?? 0) + 1);
    if (m.sentAt < b.primeiro) b.primeiro = m.sentAt;
    if (m.sentAt > b.ultimo) b.ultimo = m.sentAt;
  }

  const ordenados = [...porRest.entries()].sort((a, b) => b[1].total - a[1].total);
  const MINIMO = 30;
  const CANDIDATAS = [7, 14, 21, 30, 45, 60];
  const resumo = [];

  for (const [rid, b] of ordenados) {
    const r = meta.get(rid);
    const slug = r?.slug ?? rid.slice(0, 8);
    const diasAtivos = b.dias.size;
    // Cobertura real: do primeiro turno visto na janela até agora, limitada a DIAS.
    const coberturaDias = Math.max(1, Math.min(DIAS, (agora - b.primeiro) / 86_400_000));
    const porDia = b.total / coberturaDias;
    p("─".repeat(78));
    p(`   ${slug}${r?.isDemo ? "  [DEMO]" : ""}   total=${b.total}   dias com movimento=${diasAtivos}` +
      `   cobertura=${coberturaDias.toFixed(1)}d   média=${porDia.toFixed(2)}/dia`);
    p(`   por dia da semana:  ` + DIA_NOME.map((d, i) => `${d}${n(b.semana[i], 4)}`).join("  "));
    // Faixas de hora — 4 blocos que dizem algo sobre restaurante.
    const faixa = (de, ate) => b.hora.slice(de, ate).reduce((s, x) => s + x, 0);
    p(`   por faixa de hora:  madrugada(0-6)${n(faixa(0, 6))}  manhã(6-11)${n(faixa(6, 11))}  ` +
      `almoço(11-15)${n(faixa(11, 15))}  tarde(15-18)${n(faixa(15, 18))}  jantar(18-24)${n(faixa(18, 24))}`);
    p(`   hora a hora:        ` + b.hora.map((h, i) => (h ? `${String(i).padStart(2, "0")}h:${h}` : null)).filter(Boolean).join("  "));
    p(`   alcança ${MINIMO} amostras em qual janela?  ` +
      CANDIDATAS.map((d) => `${d}d=${(porDia * d).toFixed(0)}${porDia * d >= MINIMO ? "✅" : "❌"}`).join("  "));
    resumo.push({ slug, total: b.total, porDia, coberturaDias });
  }
  p("─".repeat(78));
  p();

  /* ── C. O que a marca LIVE já colheu ───────────────────────────────────── */
  p("═".repeat(78));
  p("C. AMOSTRAS DO TOPO JÁ MARCADAS (stage='LIVE', agentId='whatsapp')");
  p("═".repeat(78));
  const vivos = await prisma.brainShadowLog.findMany({
    where: { stage: "LIVE", agentId: "whatsapp" },
    select: { restaurantId: true, coherence: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  p(`   total desde o deploy da marca: ${vivos.length}`);
  const porRestVivo = new Map();
  for (const v of vivos) {
    if (!porRestVivo.has(v.restaurantId)) porRestVivo.set(v.restaurantId, []);
    porRestVivo.get(v.restaurantId).push(v);
  }
  for (const [rid, arr] of porRestVivo) {
    const slug = meta.get(rid)?.slug ?? rid.slice(0, 8);
    const pass = arr.filter((a) => a.coherence === "PASS").length;
    const horas = (agora - arr[0].createdAt) / 3_600_000;
    p(`   ${slug.padEnd(24)} ${arr.length} amostras  PASS=${pass}  primeira há ${horas.toFixed(1)}h  ` +
      `ritmo≈${(arr.length / Math.max(horas / 24, 0.01)).toFixed(1)}/dia`);
  }
  if (!vivos.length) p("   (nenhuma — a marca é recente)");
  p();

  /* ── D. Quem muda de comportamento com uma janela nova ─────────────────── */
  p("═".repeat(78));
  p("D. SIMULAÇÃO — com janela de X dias, quem passaria a SER MEDIDO no topo");
  p("═".repeat(78));
  p("   (usa o proxy de volume; só conta quem está em degrau elevado e não pausado)");
  const elevados = configs.filter((c) => c.mode !== "SHADOW_ONLY" && !c.paused);
  for (const d of CANDIDATAS) {
    const medidos = elevados.filter((c) => {
      const b = porRest.get(c.restaurantId);
      if (!b) return false;
      const cob = Math.max(1, Math.min(DIAS, (agora - b.primeiro) / 86_400_000));
      return (b.total / cob) * d >= MINIMO;
    });
    p(`   janela ${String(d).padStart(2)}d → ${medidos.length}/${elevados.length} restaurantes elevados alcançam ${MINIMO} amostras` +
      (medidos.length ? `  [${medidos.map((c) => meta.get(c.restaurantId)?.slug ?? "?").join(", ")}]` : ""));
  }
  p();

  /* ── E. O NÚMERO QUE DECIDE: quantos turnos CHEGAM ao Brain ────────────── */
  //
  // A seção B mede turnos de cliente. Mas nem todo turno vira amostra do topo:
  // a maior parte é resolvida pelo recepcionista determinístico (menu numerado,
  // intents conhecidos) e volta ANTES do Brain raciocinar. Amostra do topo só
  // nasce quando o turno chega ao raciocínio livre.
  //
  // Duas fontes, medidas de propósito:
  //   • sombra histórica (stage nulo/SHADOW) — cada linha é UM turno que chegou
  //     ao Brain enquanto o restaurante estava embaixo. É a mesma porta.
  //   • respostas realmente enviadas pelo Brain (metadata.source='WHATSAPP_BRAIN').
  p("═".repeat(78));
  p("E. QUANTOS TURNOS CHEGAM AO BRAIN — a porta que produz amostra do topo");
  p("═".repeat(78));

  const sombra = await prisma.brainShadowLog.findMany({
    where: {
      createdAt: { gte: corte },
      OR: [{ agentId: "whatsapp" }, { agentId: null }],
      AND: [{ OR: [{ stage: null }, { stage: "SHADOW" }] }],
    },
    select: { restaurantId: true, createdAt: true, sampleOrigin: true },
    orderBy: { createdAt: "asc" },
  });
  const sombraPorRest = new Map();
  for (const s of sombra) {
    if (!sombraPorRest.has(s.restaurantId)) sombraPorRest.set(s.restaurantId, []);
    sombraPorRest.get(s.restaurantId).push(s);
  }
  p("   sombra do recepcionista (cada linha = 1 turno que chegou ao Brain):");
  for (const [rid, arr] of sombraPorRest) {
    const slug = meta.get(rid)?.slug ?? rid.slice(0, 8);
    const prod = arr.filter((a) => a.sampleOrigin === "PRODUCTION").length;
    const dias = new Set(arr.map((a) => local(a.createdAt).toISOString().slice(0, 10)));
    const janela = Math.max(1, (arr.at(-1).createdAt - arr[0].createdAt) / 86_400_000);
    p(`   ${slug.padEnd(24)} ${String(arr.length).padStart(5)} linhas  PRODUCTION=${prod}  ` +
      `dias distintos=${dias.size}  de ${String(arr[0].createdAt).slice(4, 10)} a ${String(arr.at(-1).createdAt).slice(4, 10)}  ` +
      `≈${(arr.length / janela).toFixed(1)}/dia`);
  }
  if (!sombra.length) p("   (nenhuma linha de sombra do recepcionista na janela)");
  p();

  p("   respostas ENVIADAS pelo Brain ao vivo (messages.metadata->>'source'):");
  const enviadas = await prisma.$queryRawUnsafe(`
    SELECT r.slug,
           COALESCE(m.metadata->>'source', '(sem source)') AS fonte,
           count(*)::int AS total,
           min(m."sentAt") AS primeira,
           max(m."sentAt") AS ultima,
           count(DISTINCT date_trunc('day', m."sentAt")) ::int AS dias
    FROM messages m
    JOIN conversations c ON c.id = m."conversationId"
    JOIN restaurants  r ON r.id = c."restaurantId"
    WHERE m.direction = 'OUTBOUND' AND m."senderType" = 'AI'
      AND c.channel = 'WHATSAPP' AND m."sentAt" >= now() - interval '${DIAS} days'
    GROUP BY 1, 2 ORDER BY 1, 3 DESC
  `);
  for (const e of enviadas) {
    const janela = Math.max(1, (new Date(e.ultima) - new Date(e.primeira)) / 86_400_000);
    p(`   ${String(e.slug).padEnd(24)} ${String(e.fonte).padEnd(18)} ${String(e.total).padStart(5)}  ` +
      `dias=${e.dias}  ≈${(e.total / janela).toFixed(1)}/dia  (${String(e.primeira).slice(4, 10)} → ${String(e.ultima).slice(4, 10)})`);
  }
  if (!enviadas.length) p("   (nenhuma resposta de IA no período)");
  p();

  p("   ⇒ RITMO DE AMOSTRA DO TOPO por janela candidata (base: sombra/dia acima):");
  for (const [rid, arr] of sombraPorRest) {
    const slug = meta.get(rid)?.slug ?? rid.slice(0, 8);
    const janela = Math.max(1, (arr.at(-1).createdAt - arr[0].createdAt) / 86_400_000);
    const porDia = arr.length / janela;
    p(`   ${slug.padEnd(24)} ` + CANDIDATAS.map((d) => `${d}d=${(porDia * d).toFixed(0)}${porDia * d >= MINIMO ? "✅" : "❌"}`).join("  "));
  }
  p();
  p("Somente leitura. Nada foi escrito, enviado ou promovido.");
  await prisma.$disconnect().catch(() => {});
};

main().catch((e) => { p(`\n❌ ${e?.message ?? e}`); process.exit(1); });
