#!/usr/bin/env node
/**
 * O RAIO-X DO CRM INTEIRO EM PRODUÇÃO — quanto disparou, por campanha, e por quê
 * cada campanha calada está calada.
 *
 * A pergunta que este script responde é a do site: *"dispara as campanhas certas
 * no automático"* — isso é verdade hoje, e em que tamanho?
 *
 * POR QUE ELE FALA COM O BANCO, E NÃO SÓ COM OS LOGS
 * O diagnóstico do carrinho (05/08) reconstruiu a série histórica pelos logs
 * públicos do Actions. Para o CRM inteiro isso NÃO basta, e a razão é concreta:
 * além do cron do GitHub, existe o `ScheduledCampaignScheduler`, um temporizador
 * DENTRO do processo do Railway que roda a cada 10 min e envia sem passar pelo
 * Actions (`ScheduledCampaignScheduler.ts:27`). Contar só o log do Actions daria
 * um limite inferior e chamaria de "prova" — e ausência de informação não é
 * informação. O log continua sendo a melhor fonte dos MOTIVOS
 * (`scripts/raio-x-envios-crm.mjs`); o banco é a única fonte do TOTAL.
 *
 * Como alcança produção sem humano: mesmo molde de
 * `scripts/diagnostico-escada-crm.mjs` — o RAILWAY_TOKEN vive nos segredos do
 * repositório e o script lê as variáveis do serviço por ele, sem jamais imprimir
 * nenhuma delas.
 *
 * ⚠️ O log do Actions é PÚBLICO. Por isso a saída é escolhida a dedo:
 *   • nenhum nome, telefone, e-mail ou texto de mensagem de cliente;
 *   • restaurante aparece por SLUG (já público na URL da loja);
 *   • de `campaign_executions` saem apenas CONTAGENS e códigos de máquina
 *     (`errorMessage`), nunca linhas.
 *
 * SOMENTE LEITURA. Todas as consultas são SELECT/aggregate. Nenhuma mensagem é
 * enviada, nenhuma campanha é criada, pausada ou promovida.
 *
 * Uso (dentro do workflow, com o segredo do repositório):
 *   RAILWAY_TOKEN=... node scripts/raio-x-crm-producao.mjs
 */

import { PrismaClient } from "@prisma/client";

const TOKEN      = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE       = process.env.BASE_URL || "https://foocci.com.br";
const DIAS_LONGO = Number(process.env.DIAS_LONGO || "90");
const DIAS_CURTO = Number(process.env.DIAS_CURTO || "30");

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
    });
    const j = await r.json().catch(() => null);
    if (j?.data && !j.errors) return j.data;
  }
  return null;
}

/** Lê ADMIN_SECRET e DATABASE_URL do serviço. Ambos entram na lista de mascarados. */
async function lerAmbiente() {
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
  return {
    secret: todas.ADMIN_SECRET ?? null,
    // O DATABASE_URL do serviço aponta para a rede interna do Railway em muitas
    // instalações; de fora ele não resolve. Quando houver uma variante pública,
    // ela é a que serve aqui. Ordem: pública primeiro, interna como tentativa.
    urls: [todas.DATABASE_PUBLIC_URL, todas.DATABASE_URL].filter(Boolean),
  };
}

async function get(caminho, secret) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "x-admin-secret": secret } });
  const texto = await r.text();
  try { return { status: r.status, json: JSON.parse(texto) }; }
  catch { return { status: r.status, json: null, texto: texto.slice(0, 200) }; }
}

const dia = (d) => (d ? String(d).slice(0, 10) : "nunca");
const n = (x, w = 6) => String(x ?? 0).padStart(w);

/** Campanhas prontas que rodam sozinhas (o "no automático" que o site promete). */
const AUTOMATICAS = new Set([
  "pedido-avaliacao", "aniversariantes", "segunda-compra", "cadastro-sem-compra",
  "quente-esfriando", "reativar-mornos", "recuperar-frios", "recuperar-perdidos",
  "clientes-vip", "subiu-de-nivel", "quase-no-proximo-nivel", "mimo-mensal-nivel",
  "cupom-vencendo", "carrinho-abandonado", "indique-amigo", "siga-redes",
]);

const main = async () => {
  const { secret, urls } = await lerAmbiente();
  p("🔑 Credenciais lidas do Railway (nenhuma impressa).\n");

  /* ── A. O BANCO: o total de verdade ────────────────────────────────────── */
  let prisma = null;
  for (const url of urls) {
    const tentativa = new PrismaClient({ datasources: { db: { url } } });
    try { await tentativa.$queryRaw`SELECT 1`; prisma = tentativa; break; }
    catch { await tentativa.$disconnect().catch(() => {}); }
  }

  if (!prisma) {
    p("═".repeat(78));
    p("A. BANCO — NÃO ALCANÇADO");
    p("═".repeat(78));
    p("   Nenhuma das URLs de banco do serviço aceitou conexão de fora do Railway.");
    p("   NÃO concluo nada sobre volume a partir disso: o número absoluto de envios");
    p("   fica em aberto e as seções abaixo valem só como retrato de configuração.");
  } else {
    const agora = new Date();
    const corteCurto = new Date(agora.getTime() - DIAS_CURTO * 86_400_000);
    const corteLongo = new Date(agora.getTime() - DIAS_LONGO * 86_400_000);
    const ENVIADOS = ["SENT", "DELIVERED", "READ"];

    const restaurantes = await prisma.restaurant.findMany({ select: { id: true, slug: true, isDemo: true } });
    const slugDe = new Map(restaurantes.map((r) => [r.id, r.slug ?? r.id.slice(0, 8)]));

    p("═".repeat(78));
    p(`A. QUANTO O CRM DISPAROU DE VERDADE (campaign_executions)`);
    p("═".repeat(78));

    for (const [rotulo, corte] of [[`${DIAS_CURTO}d`, corteCurto], [`${DIAS_LONGO}d`, corteLongo]]) {
      const porStatus = await prisma.campaignExecution.groupBy({
        by: ["status"], where: { createdAt: { gte: corte } }, _count: { _all: true },
      });
      const linha = porStatus.map((s) => `${s.status}=${s._count._all}`).join(" · ");
      p(`   ${rotulo}: ${linha || "(nenhuma linha)"} `);
    }

    /* Campanha a campanha, com o template que a identifica. */
    p("\n" + "═".repeat(78));
    p(`B. CAMPANHA A CAMPANHA — enviados em ${DIAS_CURTO}d / ${DIAS_LONGO}d / desde sempre`);
    p("═".repeat(78));

    const campanhas = await prisma.campaign.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        id: true, name: true, restaurantId: true, status: true, templateId: true,
        targetSegment: true, totalSent: true, createdAt: true, scheduleConfig: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const ids = campanhas.map((c) => c.id);
    const contar = async (where) => {
      const g = await prisma.campaignExecution.groupBy({
        by: ["campaignId"], where: { campaignId: { in: ids }, ...where }, _count: { _all: true },
      });
      return new Map(g.map((x) => [x.campaignId, x._count._all]));
    };
    const [env30, env90, envTudo, bloq90, falh90] = await Promise.all([
      contar({ status: { in: ENVIADOS }, sentAt: { gte: corteCurto } }),
      contar({ status: { in: ENVIADOS }, sentAt: { gte: corteLongo } }),
      contar({ status: { in: ENVIADOS } }),
      contar({ status: "BLOCKED", createdAt: { gte: corteLongo } }),
      contar({ status: "FAILED", createdAt: { gte: corteLongo } }),
    ]);
    const ultima = new Map(
      (await prisma.campaignExecution.groupBy({
        by: ["campaignId"], where: { campaignId: { in: ids }, sentAt: { not: null } }, _max: { sentAt: true },
      })).map((x) => [x.campaignId, x._max.sentAt]),
    );

    const cab = "   restaurante        | tipo | campanha (template)              | estado    |   30d |   90d |  tudo | bloq90 | falh90 | último envio";
    p(cab);
    p("   " + "-".repeat(cab.length - 3));
    const ordenadas = campanhas.sort((a, b) => (env90.get(b.id) ?? 0) - (env90.get(a.id) ?? 0));
    for (const c of ordenadas) {
      const tipo = c.templateId && AUTOMATICAS.has(c.templateId) ? "AUTO" : "MANU";
      const nome = (c.templateId || c.targetSegment || c.name || "?").slice(0, 32);
      p(`   ${String(slugDe.get(c.restaurantId) ?? "?").slice(0, 18).padEnd(18)} | ${tipo} | ` +
        `${nome.padEnd(32)} | ${String(c.status).padEnd(9)} | ${n(env30.get(c.id), 5)} | ${n(env90.get(c.id), 5)} | ` +
        `${n(envTudo.get(c.id), 5)} | ${n(bloq90.get(c.id), 6)} | ${n(falh90.get(c.id), 6)} | ${dia(ultima.get(c.id))}`);
    }

    /* Automáticas × manuais, somando. */
    const soma = (mapa, filtro) => campanhas.filter(filtro).reduce((s, c) => s + (mapa.get(c.id) ?? 0), 0);
    const ehAuto = (c) => !!c.templateId && AUTOMATICAS.has(c.templateId);
    p("\n   AUTOMÁTICAS (campanhas prontas) — 30d: " + soma(env30, ehAuto) + " · 90d: " + soma(env90, ehAuto));
    p("   MANUAIS/AGENDADAS pelo lojista  — 30d: " + soma(env30, (c) => !ehAuto(c)) + " · 90d: " + soma(env90, (c) => !ehAuto(c)));

    /* Por que os bloqueados foram bloqueados — código de máquina, sem PII. */
    p("\n" + "═".repeat(78));
    p(`C. POR QUE FOI BLOQUEADO / FALHOU — códigos de máquina, ${DIAS_LONGO}d`);
    p("═".repeat(78));
    for (const st of ["BLOCKED", "FAILED"]) {
      // Duas colunas, porque elas contam coisas diferentes: `errorMessage` é o
      // CÓDIGO DE MÁQUINA (o que a classificação lê para decidir retentativa e
      // exclusão de cliente) e `failedReason` é a frase para o lojista. Ler só a
      // primeira produziu "700 × (sem código)" na rodada inicial — um zero que
      // não explica nada.
      for (const campo of ["errorMessage", "failedReason"]) {
        const g = await prisma.campaignExecution.groupBy({
          by: [campo], where: { status: st, createdAt: { gte: corteLongo } }, _count: { _all: true },
        });
        p(`   ${st} · por ${campo}:`);
        const linhas = g.sort((a, b) => b._count._all - a._count._all).slice(0, 12);
        if (!linhas.length) p("      (nenhuma)");
        for (const x of linhas) p(`      ${n(x._count._all)} × ${String(x[campo] ?? "(vazio)").slice(0, 60)}`);
      }
    }

    /* PENDING é a linha que nasceu e nunca saiu — precisa de idade, não de contagem. */
    const pend = await prisma.campaignExecution.aggregate({
      where: { status: "PENDING" }, _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true },
    });
    p(`\n   PENDING (criado e nunca enviado) — total ${pend._count._all}, ` +
      `do mais antigo ${dia(pend._min.createdAt)} ao mais recente ${dia(pend._max.createdAt)}.`);
    p("   PENDING recente é fila viva; PENDING só antigo é resíduo de um motor que parou.");

    /* A série por dia. "Enviou 4 mil em 30 dias" e "está enviando hoje" são
     * afirmações diferentes, e só a segunda responde se a promessa vale AGORA. */
    p("\n" + "═".repeat(78));
    p(`C2. ESTÁ ENVIANDO HOJE? — enviados por dia, últimos ${DIAS_CURTO} dias`);
    p("═".repeat(78));
    const porDia = await prisma.$queryRawUnsafe(
      `SELECT to_char("sentAt" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
         FROM campaign_executions
        WHERE status IN ('SENT','DELIVERED','READ') AND "sentAt" >= $1
        GROUP BY 1 ORDER BY 1`,
      corteCurto,
    );
    if (!porDia.length) p("   (nenhum envio na janela)");
    for (const r of porDia) p(`   ${r.d}  ${"█".repeat(Math.min(60, Math.ceil(r.n / 10)))} ${r.n}`);

    /* O catálogo: das 16 campanhas prontas, quantas cada casa realmente ligou. */
    p("\n" + "═".repeat(78));
    p("C3. O CATÁLOGO LIGADO — quantas das 16 campanhas prontas cada casa ativou");
    p("═".repeat(78));
    for (const r of restaurantes) {
      const minhas = campanhas.filter((c) => c.restaurantId === r.id);
      const ativasAuto = new Set(minhas.filter((c) => ["ACTIVE", "SCHEDULED"].includes(c.status) && c.templateId && AUTOMATICAS.has(c.templateId)).map((c) => c.templateId));
      if (!minhas.length && ativasAuto.size === 0) {
        p(`   ${String(r.slug ?? r.id.slice(0, 8)).padEnd(20)} NENHUMA campanha existe nesta casa (nem rascunho).`);
        continue;
      }
      const faltando = [...AUTOMATICAS].filter((id) => !ativasAuto.has(id));
      p(`   ${String(r.slug ?? r.id.slice(0, 8)).padEnd(20)} ligadas ${ativasAuto.size}/16`);
      if (faltando.length) p(`      desligadas: ${faltando.join(", ")}`);
    }

    /* O teto de verdade: quanto sairia hoje se nada estivesse quebrado. */
    p("\n" + "═".repeat(78));
    p("D. O TETO DE VERDADE — quanto a base atual comporta por dia");
    p("═".repeat(78));
    p("   Por restaurante: clientes contactáveis (a matéria-prima), campanhas ativas,");
    p("   e a soma dos limites diários dessas campanhas. O teto real é o MENOR entre");
    p("   a soma dos limites e o que a audiência viva comporta.");
    for (const r of restaurantes) {
      const [contactaveis, totalClientes, ativas] = await Promise.all([
        prisma.customer.count({ where: { restaurantId: r.id, isGuest: false, isActive: true, crmContactable: true, hasOptedOut: false, phone: { not: null } } }),
        prisma.customer.count({ where: { restaurantId: r.id, isGuest: false } }),
        prisma.campaign.findMany({
          where: { restaurantId: r.id, status: { in: ["ACTIVE", "SCHEDULED"] } },
          select: { id: true, templateId: true, scheduleConfig: true },
        }),
      ]);
      if (totalClientes === 0 && ativas.length === 0) continue;
      const somaLimites = ativas.reduce((s, c) => {
        const cfg = c.scheduleConfig;
        const lim = cfg && typeof cfg === "object" && typeof cfg.dailyLimit === "number" ? cfg.dailyLimit : 20;
        return s + Math.max(1, Math.min(lim, 200));
      }, 0);
      p(`   ${String(r.slug ?? r.id.slice(0, 8)).slice(0, 20).padEnd(20)}${r.isDemo ? " (demo)" : "      "} ` +
        `clientes ${n(totalClientes, 6)} · contactáveis ${n(contactaveis, 6)} · ` +
        `campanhas ativas ${n(ativas.length, 3)} · soma dos limites/dia ${n(somaLimites, 5)}`);
    }

    /* Pedidos: separar "não teve o que enviar" de "tinha e não enviou". */
    p("\n" + "═".repeat(78));
    p(`E. VOLUME REAL DA CASA — pedidos em ${DIAS_CURTO}d (um restaurante sem movimento`);
    p("   não tem carrinho para recuperar; isso NÃO é defeito)");
    p("═".repeat(78));
    for (const r of restaurantes) {
      const [pedidos, rascunhos] = await Promise.all([
        prisma.order.count({ where: { restaurantId: r.id, createdAt: { gte: corteCurto } } }),
        prisma.orderDraft.count({ where: { restaurantId: r.id, createdAt: { gte: corteCurto } } }).catch(() => -1),
      ]);
      if (pedidos === 0 && rascunhos <= 0) continue;
      p(`   ${String(r.slug ?? r.id.slice(0, 8)).slice(0, 20).padEnd(20)} pedidos ${n(pedidos, 6)} · rascunhos de carrinho ${n(rascunhos, 6)}`);
    }

    await prisma.$disconnect();
  }

  /* ── F. AS ROTAS: por que cada campanha ativa está (ou não) de vez ─────── */
  if (!secret) {
    p("\n(ADMIN_SECRET não encontrado nas variáveis do serviço — seção F pulada.)");
    return;
  }
  p("\n" + "═".repeat(78));
  p("F. POR QUE CADA CAMPANHA ATIVA NÃO DISPARA AGORA (rota de diagnóstico)");
  p("═".repeat(78));
  const rs = await get("/api/admin/restaurants", secret);
  // A rota devolve `{ data: [...] }` (route.ts:92). As outras formas ficam como
  // tolerância: um HTTP 200 com formato inesperado NÃO pode virar "não há
  // restaurante" — na primeira rodada isso apareceu como "HTTP 200 e lista vazia".
  const lista = Array.isArray(rs.json?.data) ? rs.json.data
    : Array.isArray(rs.json) ? rs.json
    : Array.isArray(rs.json?.restaurants) ? rs.json.restaurants
    : [];
  if (!lista.length) {
    p(`   (não consegui listar restaurantes — HTTP ${rs.status}. Sem lista, NÃO concluo nada.)`);
    return;
  }
  for (const r of lista) {
    const d = await get(`/api/admin/diagnostics/crm-campaigns?restaurantId=${r.id}&limit=200`, secret);
    if (d.status !== 200 || !d.json) { p(`   · ${r.slug}: HTTP ${d.status}`); continue; }
    const ativas = (d.json.campaigns ?? []).filter((c) => ["ACTIVE", "SCHEDULED"].includes(c.status));
    if (!ativas.length) continue;
    p(`   ┌─ ${r.slug} — ${ativas.length} campanha(s) ativa(s), ${d.json.dueCampaigns} de vez agora`);
    p(`   │  agendador interno: ${d.json.scheduler?.active ? "ATIVO" : "inativo neste processo"}` +
      (d.json.scheduler?.lastRun ? ` · última rodada ${d.json.scheduler.lastRun.at} (env ${d.json.scheduler.lastRun.sent})` : " · sem rodada registrada"));
    for (const c of ativas) {
      p(`   │  ${String(c.templateId ?? c.targetSegment ?? c.name).slice(0, 28).padEnd(28)} ` +
        `de vez=${c.isDueNow ? "sim" : "não"} · audiência ${c.audience?.total ?? "?"} (nova ${c.audience?.newEligible ?? "?"}) · ` +
        `limite/dia ${c.scheduleConfig?.dailyLimit ?? "?"} · último envio ${dia(c.lastExecutionAt)}`);
      if (!c.isDueNow) p(`   │      motivo: ${c.notDueReason}`);
      if (c.safetyBlocks?.length) p(`   │      proteção: ${c.safetyBlocks.join(" | ")}`);
      if (c.audience?.error) p(`   │      audiência não resolvida: ${String(c.audience.error).slice(0, 80)}`);
    }
    p("   └─");
  }

  p("\n(Somente leitura. Nenhuma mensagem foi enviada, nenhuma campanha alterada.)");
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
