#!/usr/bin/env node
/**
 * ACOMPANHAR O LOJISTA TESTANDO O ASSISTENTE — ao vivo, em produção.
 *
 * Nasceu de um P0 do CEO em 05/08/2026: *"o lojista está testando o assistente,
 * preciso que acompanhe"*. Até então não existia um jeito de olhar o canal de
 * WhatsApp funcionando de fora — só baterias de teste sintético, que provam que
 * o sistema **pode** funcionar, não que ele **está** funcionando com gente real.
 *
 * COMO ELE ALCANÇA PRODUÇÃO SEM PEDIR CLIQUE AO CEO: o `ADMIN_SECRET` vive nas
 * variáveis do serviço no Railway, e o `RAILWAY_TOKEN` vive nos segredos deste
 * repositório — que só existem dentro do GitHub Actions. O script lê o segredo
 * pela API do Railway, usa no cabeçalho e NUNCA o imprime.
 *
 * ⚠️ O LOG DO ACTIONS DESTE REPOSITÓRIO É PÚBLICO.
 * Por isso o script **projeta campos escolhidos a dedo** em vez de despejar a
 * resposta crua. Ao acrescentar campo aqui, pergunte antes: *"isso pode ficar
 * visível para qualquer pessoa na internet?"*. Nada de conteúdo de mensagem,
 * nome ou telefone — este script mede o comportamento do canal, não lê conversa.
 *
 * SOMENTE LEITURA. Não envia mensagem, não cria pedido, não altera configuração.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE = (process.env.BASE_URL || "https://foocci.com.br").replace(/\/$/, "");
const SLUG = process.env.SLUG || "sushi-cazza";
const PERIODO = process.env.PERIODO || "6h";

if (!TOKEN) fail("RAILWAY_TOKEN ausente.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

/** Nunca deixa um segredo escapar para o log, venha de onde vier. */
let segredos = [TOKEN].filter(Boolean);
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
  try { return { status: r.status, json: JSON.parse(texto) }; }
  catch { return { status: r.status, json: null, texto: texto.slice(0, 200) }; }
}

/** `undefined` vira "—" e não some do relatório: ausência é informação aqui. */
const ou = (v) => (v === undefined || v === null ? "—" : v);

/**
 * Descobre em QUAL restaurante o movimento está acontecendo.
 *
 * Existia por trás disto um erro de método: na primeira execução eu apontei para
 * um slug chutado e reportei o número dele como se fosse "o canal". Número certo
 * do restaurante errado é pior que nenhum número — ele parece resposta.
 * Com `SLUG=auto`, o script varre os restaurantes ativos e reporta o que TEM
 * conversa na janela, dizendo qual escolheu.
 */
async function descobrirSlug(secret) {
  const r = await get(`/api/admin/restaurants`, secret);
  const lista = r.json?.restaurants ?? r.json?.data ?? r.json;
  if (!Array.isArray(lista)) {
    p("⚠️  Não consegui listar restaurantes — seguindo com o slug informado.");
    return null;
  }
  const slugs = lista.map((x) => x?.slug).filter(Boolean);
  p(`🔎 ${slugs.length} restaurante(s) para varrer.`);

  const comMovimento = [];
  for (const slug of slugs) {
    const m = await get(
      `/api/admin/whatsapp/live-monitor?restaurantSlug=${encodeURIComponent(slug)}&period=${encodeURIComponent(PERIODO)}`,
      secret,
    );
    const n = Number(m.json?.metrics?.conversations ?? m.json?.summary?.conversations ?? 0);
    if (n > 0) comMovimento.push({ slug, n });
  }

  if (!comMovimento.length) {
    p("⚠️  NENHUM restaurante com conversa na janela.");
    return null;
  }
  comMovimento.sort((a, b) => b.n - a.n);
  p(`📍 Movimento em: ${comMovimento.map((c) => `${c.slug} (${c.n})`).join(", ")}`);
  return comMovimento[0].slug;
}

const main = async () => {
  const secret = await lerAdminSecret();
  p(`🔑 ADMIN_SECRET lido do Railway (não impresso).`);

  let alvo = SLUG;
  if (SLUG === "auto") {
    const achado = await descobrirSlug(secret);
    if (!achado) { p("\nNada a relatar."); return; }
    alvo = achado;
  }
  p(`🎯 Restaurante: ${alvo} · janela: ${PERIODO}\n`);

  const r = await get(
    `/api/admin/whatsapp/live-monitor?restaurantSlug=${encodeURIComponent(alvo)}&period=${encodeURIComponent(PERIODO)}`,
    secret,
  );

  if (r.status === 404) {
    p(`❌ Restaurante "${alvo}" não encontrado. Confira o slug (entrada SLUG do workflow).`);
    process.exit(1);
  }
  if (r.status !== 200 || !r.json) {
    p(`❌ HTTP ${r.status} — ${JSON.stringify(r.json ?? r.texto)}`);
    process.exit(1);
  }

  const d = r.json;
  const m = d.metrics ?? d.summary ?? d;

  p("═══ O CANAL, NA JANELA PEDIDA ═══");
  for (const [rotulo, valor] of [
    ["conversas", ou(m.conversations ?? m.conversas)],
    ["pedidos gerados", ou(m.orders ?? m.pedidos)],
    ["receita", ou(m.revenue ?? m.receita)],
    ["conversa → pedido", ou(m.conversionRate ?? m.taxaConversao)],
    ["passou para humano (handoff)", ou(m.handoffs)],
    ["abandonos", ou(m.abandons ?? m.abandonos)],
    ["erros", ou(m.errors ?? m.erros)],
  ]) p(`   · ${rotulo}: ${valor}`);

  /*
    A LEITURA QUE IMPORTA, e ela é contraintuitiva: conversa acontecendo com
    ZERO erro pode ser ótimo — ou pode ser o agente calado. Por isso o relatório
    mostra os dois lados e não conclui sozinho; quem lê decide.
  */
  const erros = d.errorsByCategory ?? d.errosPorCategoria ?? null;
  if (Array.isArray(erros) && erros.length) {
    p("\n═══ ERROS POR CATEGORIA (top) ═══");
    for (const e of erros.slice(0, 5)) {
      p(`   · ${ou(e.category ?? e.categoria)}: ${ou(e.count ?? e.total)}`);
    }
  } else {
    p("\n═══ ERROS POR CATEGORIA ═══\n   · nenhum registrado na janela");
  }

  const aprendizados = d.pendingLearnings ?? d.aprendizadosPendentes ?? null;
  if (aprendizados !== null && aprendizados !== undefined) {
    p(`\n📚 aprendizados pendentes de revisão: ${ou(aprendizados.length ?? aprendizados)}`);
  }

  /*
    Guardrail 1 aplicado ao acompanhamento: silêncio total NÃO é "está tudo bem".
    Se o lojista está testando agora e a janela veio vazia, o canal pode estar
    mudo — e é isso que precisa saltar aos olhos de quem lê o log.
  */
  const conversas = Number(m.conversations ?? m.conversas ?? 0);
  if (!conversas) {
    p("\n⚠️  NENHUMA CONVERSA NA JANELA.");
    p("    Se o lojista está testando NESTE momento, isto não é calmaria — é sinal");
    p("    de que a mensagem não está chegando. Confira o canal antes de concluir");
    p("    que está tudo certo.");
  } else {
    p(`\n✅ Há movimento: ${conversas} conversa(s) na janela de ${PERIODO}.`);
  }
};

main().catch((e) => fail(limpar(e?.message ?? e)));
