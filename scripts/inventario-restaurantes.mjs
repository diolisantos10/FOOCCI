#!/usr/bin/env node
/**
 * O INVENTÁRIO DOS RESTAURANTES — em produção, antes de qualquer exclusão.
 *
 * Nasceu do pedido do CEO (06/08/2026) de deixar no admin apenas `foocci-bakery` e
 * `sushi-cazza`. O pedido está tomado; o que este script impede é apagar no escuro.
 * Ele responde, restaurante por restaurante, **"isto já viveu?"** — porque base
 * grande com zero pedido é importação de teste, e base com pedido recente é gente.
 *
 * COMO ALCANÇA PRODUÇÃO SEM PEDIR CLIQUE: mesmo caminho de
 * `scripts/acompanhar-assistente.mjs` — o `ADMIN_SECRET` vive nas variáveis do
 * serviço no Railway, o `RAILWAY_TOKEN` vive nos segredos deste repositório, e o
 * segredo NUNCA é impresso.
 *
 * ⚠️ O LOG DO ACTIONS DESTE REPOSITÓRIO É PÚBLICO.
 * Daqui só saem CONTAGENS, DATAS e SLUGS. Nome de cliente, telefone, endereço e
 * conteúdo de conversa não passam nem pela rota nem por aqui. Ao acrescentar
 * coluna, pergunte antes: "isso pode ficar visível para qualquer pessoa na
 * internet?".
 *
 * SOMENTE LEITURA. Não apaga, não altera, não exporta dado pessoal.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE = (process.env.BASE_URL || "https://foocci.com.br").replace(/\/$/, "");
/** Segredo direto, para quem roda de fora do Actions e já tem a chave em mãos. */
const SECRET_DIRETO = process.env.ADMIN_SECRET;

function fail(m) {
  console.error(`\n❌ ${m}`);
  process.exit(1);
}

let segredos = [TOKEN, SECRET_DIRETO].filter(Boolean);
const limpar = (t) => segredos.reduce((s, seg) => s.split(seg).join("<oculto>"), String(t ?? ""));
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

/** Pega o ADMIN_SECRET das variáveis do serviço, sem imprimir. */
async function lerAdminSecret() {
  if (SECRET_DIRETO) return SECRET_DIRETO;
  if (!TOKEN) fail("Nem ADMIN_SECRET nem RAILWAY_TOKEN no ambiente — não há como alcançar produção.");

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
  const secret = vars?.variables?.ADMIN_SECRET;
  if (!secret) fail("ADMIN_SECRET não está nas variáveis do serviço.");
  segredos.push(secret);
  return secret;
}

async function get(caminho, secret) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "x-admin-secret": secret } });
  const texto = await r.text();
  try {
    return { status: r.status, json: JSON.parse(texto) };
  } catch {
    return { status: r.status, json: null, texto: texto.slice(0, 300) };
  }
}

const pad = (v, n) => String(v ?? "").padEnd(n);
const num = (v, n) => String(v ?? 0).padStart(n);

const main = async () => {
  const secret = await lerAdminSecret();
  p("🔑 ADMIN_SECRET obtido (não impresso).");

  const saude = await get("/api/health", secret);
  p(`🏷️  produção no commit ${saude.json?.commitSha?.slice(0, 8) ?? "?"} (branch ${saude.json?.branch ?? "?"})`);

  const r = await get("/api/admin/restaurants/inventario", secret);

  /*
    Guardrail 1: 404 aqui NÃO é "não há restaurantes". É "a rota ainda não subiu".
    Confundir os dois transformaria um deploy pendente em conclusão sobre a base —
    exatamente o tipo de erro que autoriza uma exclusão errada.
  */
  if (r.status === 404) {
    fail(
      "A rota /api/admin/restaurants/inventario respondeu 404: ela ainda NÃO está no ar\n" +
        "   neste commit de produção. Isto não diz nada sobre a base — diz que falta deploy.",
    );
  }
  if (r.status !== 200 || !r.json) {
    fail(`HTTP ${r.status} — ${JSON.stringify(r.json ?? r.texto)}`);
  }

  const d = r.json;
  p(`\n🛡️  protegidos (nunca serão apagados): ${d.protegidos.join(", ")}`);
  p(`📊 ${d.total} restaurante(s) · vivos: ${d.resumo.vivos} · já viveram: ${d.resumo.jaViveram} · nunca viveram: ${d.resumo.nuncaViveram}\n`);

  p("═══ INVENTÁRIO (contagens e datas — nenhum dado pessoal) ═══\n");
  p(
    `${pad("SLUG", 24)} ${pad("ATV", 4)}${pad("DEMO", 5)}${pad("PLANO", 8)}${pad("CRIADO", 11)}${pad("ULT.PEDIDO", 12)}` +
      `${num("CLI", 7)}${num("C/TEL", 7)}${num("ALCANC", 7)}${num("PED", 6)}${num("PED90", 6)}${num("CONV", 6)}${num("CAMP", 5)}${num("CARD", 5)}${num("NF", 4)}  ${pad("WHATSAPP", 12)} VEREDITO`,
  );
  p("─".repeat(160));

  for (const l of d.restaurantes) {
    const marca = d.protegidos.includes(l.slug) ? "🛡️ " : "   ";
    p(
      `${pad(marca + l.slug, 24)} ${pad(l.ativo ? "sim" : "NÃO", 4)}${pad(l.demo ? "sim" : "-", 5)}${pad(l.plano, 8)}` +
        `${pad(l.criadoEm, 11)}${pad(l.ultimoPedidoEm ?? "NUNCA", 12)}` +
        `${num(l.clientes, 7)}${num(l.clientesComTelefone, 7)}${num(l.clientesAlcancaveis, 7)}` +
        `${num(l.pedidos, 6)}${num(l.pedidos90d, 6)}${num(l.conversas, 6)}${num(l.campanhas, 5)}${num(l.categoriasCardapio, 5)}${num(l.notasFiscais, 4)}` +
        `  ${pad(l.whatsapp, 12)} ${l.veredito}`,
    );
  }

  p("\n═══ O QUE MERECE PARAR ANTES DE APAGAR ═══");
  const perigosos = d.restaurantes.filter(
    (l) => !d.protegidos.includes(l.slug) && (l.veredito !== "NUNCA_VIVEU" || l.notasFiscais > 0 || l.assinaturasVivas > 0),
  );
  if (!perigosos.length) {
    p("   · nenhum candidato com pedido, nota fiscal ou assinatura viva.");
  } else {
    for (const l of perigosos) {
      const razoes = [];
      if (l.pedidos90d > 0) razoes.push(`${l.pedidos90d} pedido(s) nos últimos 90 dias`);
      else if (l.pedidos > 0) razoes.push(`${l.pedidos} pedido(s) no histórico (último em ${l.ultimoPedidoEm})`);
      if (l.notasFiscais > 0) razoes.push(`${l.notasFiscais} nota(s) fiscal(is)`);
      if (l.assinaturasVivas > 0) razoes.push(`${l.assinaturasVivas} assinatura(s) em cobrança`);
      p(`   ⚠️  ${l.slug}: ${razoes.join(" · ")}`);
    }
  }

  p("\n═══ BASE GRANDE SEM NENHUM PEDIDO (marca de importação de teste) ═══");
  const importados = d.restaurantes.filter((l) => l.veredito === "NUNCA_VIVEU" && l.clientes > 100);
  if (!importados.length) p("   · nenhum.");
  for (const l of importados) {
    p(`   · ${l.slug}: ${l.clientes} cliente(s), ${l.clientesComTelefone} com telefone, ZERO pedido desde ${l.criadoEm}.`);
  }
  p(
    "\n   Leia com cuidado: 'zero pedido' significa zero pedido NESTE sistema. Se a base\n" +
      "   veio de um PDV antigo, a vida daquele cliente aconteceu lá e não aparece aqui.\n" +
      "   O inventário mostra o que sabe; ele não conclui que a base é descartável.",
  );

  p("\n✅ Somente leitura. Nada foi apagado nem alterado.");
};

main().catch((e) => fail(limpar(e?.stack ?? e?.message ?? e)));
