/**
 * dados-demonstracao — enche a padaria de vitrine para a FOTO do site comercial.
 *
 * Por que existe: painel vazio não vende. Uma captura do estado vazio no site de
 * vendas é pior do que nenhuma imagem — o visitante vê "R$ 0,00" e "Nenhum pedido"
 * e conclui que o produto não faz nada. Este módulo cria o movimento de um dia
 * comum de padaria (pedidos, clientes, campanhas) para que a captura mostre o
 * produto trabalhando.
 *
 * ─── As três travas ───────────────────────────────────────────────────────────
 *  1. **Só escreve em `isDemo = true`.** Se o restaurante não for vitrine, lança.
 *     Guardrail 4: convenção de nome é aviso, a coluna é a trava. Nenhuma linha
 *     deste arquivo pode encostar num restaurante de cliente.
 *  2. **Tudo carimbado.** Cada cliente e cada campanha criados aqui levam o
 *     carimbo `CAPTURA_SITE`. Rodar de novo apaga o lote anterior pelo carimbo e
 *     recria — idempotente, sem duplicar e sem tocar no que não é da captura.
 *  3. **Ninguém real.** Nomes montados de listas comuns, telefones na faixa
 *     +55 11 90000-xxxx (que não existe) e endereços fictícios. Nunca copie gente
 *     de verdade para cá.
 *
 * ─── Duas decisões de números, e o porquê ─────────────────────────────────────
 *  • **A fila de hoje cabe dentro de 20 minutos.** O painel marca como "Atrasado"
 *    todo pedido não terminal com mais de 20 min (`DELAY_THRESHOLD`). Espalhar a
 *    fila por horas produzia um painel 63% vermelho — a foto diria que a padaria
 *    está afogada. A fila fotografada é a de uma cozinha em dia.
 *  • **Conversão de campanha entre 8% e 19%.** É o que uma campanha honesta de
 *    padaria entrega. Inflar aqui vira promessa que o produto não cumpre
 *    (guardrail 7) — e a foto é tão vendedora quanto o texto.
 */

import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";

/** Carimbo do lote. Tudo que este módulo cria carrega isto — e só isto ele apaga. */
export const MARCA = "CAPTURA_SITE";

const prisma = new PrismaClient();

/* ─────────────────────────── o elenco fictício ─────────────────────────── */

/** Domingo → sábado. Fim de semana cheio, segunda fraca: é o ano inteiro numa padaria. */
const RITMO_DA_SEMANA = [1.28, 0.86, 0.92, 0.96, 1.02, 1.16, 1.34];

const BAIRROS = ["Vila Mariana", "Saúde", "Ipiranga", "Cambuci", "Bosque da Saúde", "Klabin"];
const RUAS = [
  ["Rua das Acácias", "212"],
  ["Rua Domingos de Morais", "1145"],
  ["Av. Bosque da Saúde", "480"],
  ["Rua Luís Góis", "77"],
  ["Rua Vergueiro", "3390"],
  ["Rua Bom Pastor", "156"],
];

/**
 * Os protagonistas — quem aparece nominalmente na foto do painel de pedidos.
 * `diasAtras` é a última compra: é ela que define o segmento do CRM
 * (quente / morno / frio / perdido) sem precisar escrever o segmento na mão.
 */
const PROTAGONISTAS = [
  { nome: "Ana Beatriz Moreira",   diasAtras: 0, pedidos: 34, gasto: 2480.5, tier: "DIAMANTE" },
  { nome: "Carlos Eduardo Prado",  diasAtras: 0, pedidos: 19, gasto: 1120.0, tier: "OURO" },
  { nome: "Marina Toledo",         diasAtras: 0, pedidos: 12, gasto: 640.9,  tier: "PRATA" },
  { nome: "Roberto Nakamura",      diasAtras: 0, pedidos: 27, gasto: 2015.4, tier: "DIAMANTE" },
  { nome: "Juliana Campos",        diasAtras: 0, pedidos: 8,  gasto: 386.2,  tier: "PRATA" },
  { nome: "Fernando Aguiar",       diasAtras: 0, pedidos: 15, gasto: 902.7,  tier: "OURO" },
  { nome: "Patrícia Lemos",        diasAtras: 0, pedidos: 6,  gasto: 268.4,  tier: "BRONZE" },
  { nome: "Diego Ferraz",          diasAtras: 0, pedidos: 22, gasto: 1408.0, tier: "OURO" },
  { nome: "Sônia Bittencourt",     diasAtras: 1, pedidos: 41, gasto: 2860.3, tier: "DIAMANTE" },
  { nome: "Marcos Vinícius Alves", diasAtras: 1, pedidos: 9,  gasto: 412.8,  tier: "PRATA" },
  { nome: "Helena Duarte",         diasAtras: 2, pedidos: 5,  gasto: 197.5,  tier: "BRONZE" },
  { nome: "Rafael Siqueira",       diasAtras: 2, pedidos: 13, gasto: 735.6,  tier: "PRATA" },
  { nome: "Cláudia Rebello",       diasAtras: 3, pedidos: 17, gasto: 981.2,  tier: "OURO" },
  { nome: "Bruno Tavares",         diasAtras: 4, pedidos: 4,  gasto: 158.9,  tier: "BRONZE" },
  { nome: "Letícia Andrade",       diasAtras: 5, pedidos: 11, gasto: 604.1,  tier: "PRATA" },
  { nome: "Otávio Meireles",       diasAtras: 6, pedidos: 7,  gasto: 322.5,  tier: "PRATA" },
];

/** Matéria-prima do figurino. Combinada, dá uma base do tamanho de uma padaria de bairro. */
const PRENOMES = [
  "Adriana", "Alexandre", "Amanda", "André", "Beatriz", "Bruno", "Camila", "Carla",
  "Daniel", "Débora", "Eduardo", "Elaine", "Felipe", "Fernanda", "Gabriel", "Gisele",
  "Henrique", "Ingrid", "Jorge", "Karina", "Leandro", "Luciana", "Marcelo", "Natália",
  "Otávio", "Priscila", "Rodrigo", "Simone", "Tatiana", "Vinícius", "Yara", "Wagner",
];
const SOBRENOMES = [
  "Barbosa", "Carvalho", "Dantas", "Esteves", "Fontoura", "Guimarães", "Hollanda",
  "Innocenti", "Jardim", "Klein", "Lacerda", "Machado", "Novaes", "Ottoni", "Pontual",
  "Queiroz", "Raposo", "Salgueiro", "Teixeira", "Uchôa", "Valadares", "Zampieri",
];

/**
 * O movimento de hoje. `minutosAtras` posiciona o pedido na linha do tempo.
 *
 * A fila ATIVA (tudo que não é "Entregue") cabe nos primeiros 8 minutos, e não
 * nos 20 do limite de atraso do painel. A folga é de propósito: entre semear e
 * fotografar passam alguns minutos (login, três telas, compilação em dev), e uma
 * fila colada no limite chega vermelha na foto. Já aconteceu — a primeira leva
 * saiu com "Atrasados 50%".
 */
const PEDIDOS_DE_HOJE = [
  { cliente: 0,  minutosAtras: 0,   status: "PENDING",          tipo: "DELIVERY", origem: "pedido",   itens: 3 },
  { cliente: 3,  minutosAtras: 1,   status: "PENDING",          tipo: "DELIVERY", origem: "whatsapp", itens: 2 },
  { cliente: 2,  minutosAtras: 2,   status: "PREPARING",        tipo: "PICKUP",   origem: "pedido",   itens: 4 },
  { cliente: 1,  minutosAtras: 3,   status: "PREPARING",        tipo: "DELIVERY", origem: "pedido",   itens: 2 },
  { cliente: 5,  minutosAtras: 4,   status: "PREPARING",        tipo: "DINE_IN",  origem: "qr",       itens: 3 },
  { cliente: 4,  minutosAtras: 5,   status: "READY",            tipo: "PICKUP",   origem: "whatsapp", itens: 2 },
  { cliente: 7,  minutosAtras: 6,   status: "READY",            tipo: "DELIVERY", origem: "pedido",   itens: 5 },
  { cliente: 6,  minutosAtras: 8,   status: "OUT_FOR_DELIVERY", tipo: "DELIVERY", origem: "pedido",   itens: 3 },
  { cliente: 8,  minutosAtras: 21,  status: "DELIVERED",        tipo: "DINE_IN",  origem: "qr",       itens: 2 },
  { cliente: 9,  minutosAtras: 33,  status: "DELIVERED",        tipo: "DELIVERY", origem: "whatsapp", itens: 4 },
  { cliente: 11, minutosAtras: 45,  status: "DELIVERED",        tipo: "PICKUP",   origem: "pedido",   itens: 2 },
  { cliente: 12, minutosAtras: 58,  status: "DELIVERED",        tipo: "DELIVERY", origem: "pedido",   itens: 3 },
  { cliente: 10, minutosAtras: 70,  status: "DELIVERED",        tipo: "DINE_IN",  origem: "qr",       itens: 3 },
  { cliente: 13, minutosAtras: 83,  status: "DELIVERED",        tipo: "DELIVERY", origem: "whatsapp", itens: 2 },
  { cliente: 14, minutosAtras: 95,  status: "DELIVERED",        tipo: "PICKUP",   origem: "pedido",   itens: 4 },
  { cliente: 15, minutosAtras: 108, status: "DELIVERED",        tipo: "DELIVERY", origem: "pedido",   itens: 2 },
  { cliente: 9,  minutosAtras: 120, status: "DELIVERED",        tipo: "DELIVERY", origem: "pedido",   itens: 3 },
  { cliente: 2,  minutosAtras: 133, status: "DELIVERED",        tipo: "PICKUP",   origem: "qr",       itens: 2 },
  { cliente: 5,  minutosAtras: 145, status: "DELIVERED",        tipo: "DINE_IN",  origem: "qr",       itens: 4 },
  { cliente: 12, minutosAtras: 158, status: "DELIVERED",        tipo: "DELIVERY", origem: "whatsapp", itens: 2 },
  { cliente: 0,  minutosAtras: 170, status: "DELIVERED",        tipo: "PICKUP",   origem: "pedido",   itens: 3 },
  { cliente: 7,  minutosAtras: 183, status: "DELIVERED",        tipo: "DELIVERY", origem: "pedido",   itens: 2 },
];

/**
 * As campanhas. Todas dentro dos últimos 7 dias, porque é essa a janela que a
 * captura do CRM seleciona — campanha fora da janela some do painel e a foto
 * volta a ser de tela vazia.
 */
const CAMPANHAS = [
  { nome: "Volta pro café da manhã",    objetivo: "RECUPERAR", segmento: "FRIO",   diasAtras: 1, publico: 96,  conversoes: 14, ticket: 42.6, cupom: "VOLTA15" },
  { nome: "Sexta de pão na chapa",      objetivo: "RECOMPRA",  segmento: "QUENTE", diasAtras: 2, publico: 148, conversoes: 27, ticket: 31.4, cupom: null },
  { nome: "Bolo de aniversário do mês", objetivo: "VIP",       segmento: "VIP",    diasAtras: 3, publico: 38,  conversoes: 7,  ticket: 88.9, cupom: "ANIVER20" },
  { nome: "Sumiu? Tem broa saindo",     objetivo: "RECUPERAR", segmento: "MORNO",  diasAtras: 5, publico: 112, conversoes: 12, ticket: 36.2, cupom: null },
  { nome: "Cesta de café pro domingo",  objetivo: "TICKET",    segmento: "TODOS",  diasAtras: 6, publico: 203, conversoes: 21, ticket: 74.5, cupom: "CESTA10" },
];

/* ──────────────────────────────── utilidades ──────────────────────────────── */

/**
 * +55 11 90000-XXXX — celular de São Paulo no formato E.164 que o resto do
 * sistema espera (13 dígitos). O prefixo 90000 é uma faixa não atribuída: nenhum
 * telefone daqui alcança gente de verdade.
 */
const telefone = (i) => `+5511${"90000"}${String(1000 + i).slice(-4)}`;
const menos = (base, ms) => new Date(base.getTime() - ms);
const minutos = (n) => n * 60_000;
const dias = (n) => n * 86_400_000;

/* ─────────────────────── o relógio da vitrine ───────────────────────────────
 *
 * A padaria vive no horário de Brasília — e não por gosto: o painel de resultado
 * agrupa o dia com `timeZone: "America/Sao_Paulo"` FIXO no código
 * (`DashboardClient.tsx`), sem consultar `Restaurant.timezone`. Semear no relógio
 * da máquina (UTC no runner) jogava dois terços do "hoje" para o dia anterior, e
 * o gráfico mostrava a barra de hoje como um toco ao lado de um dia inflado.
 *
 * Por isso TODO instante daqui nasce de uma hora de parede em São Paulo.
 */
const FUSO = "America/Sao_Paulo";

/** Deslocamento do fuso, em ms, lido do próprio Intl — nada de "-3" chumbado. */
function deslocamentoDoFuso(quando = new Date()) {
  const marca = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, timeZoneName: "longOffset" })
    .formatToParts(quando)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(marca ?? "");
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

/** O instante UTC de uma hora de parede em São Paulo. */
function instante(ano, mes, dia, hora, minuto, quandoParaOffset = new Date()) {
  return new Date(Date.UTC(ano, mes, dia, hora, minuto) - deslocamentoDoFuso(quandoParaOffset));
}

/** A data do calendário de São Paulo agora: `[ano, mês(0-based), dia]`. */
function hojeNaVitrine(quando = new Date()) {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(quando).split("-").map(Number);
  return [a, m - 1, d];
}

/**
 * A hora que a foto conta. Ancorada às 10h20 da manhã porque é a hora em que uma
 * padaria está em movimento — e porque a captura roda em servidor, muitas vezes
 * de madrugada no Brasil. Sem âncora, o dia "de hoje" teria vinte minutos de
 * vida e o painel apareceria vazio.
 *
 * Nunca ancora no PASSADO em relação ao relógio real: pedido ativo velho demais
 * o painel marca como atrasado, e a foto sairia vermelha. Se a captura rodar
 * depois das 10h20, a âncora é o próprio agora.
 */
const HORA_DA_FOTO = { hora: 10, minuto: 20 };
export function horaDaFoto(agoraReal = new Date()) {
  const [a, m, d] = hojeNaVitrine(agoraReal);
  const ancora = instante(a, m, d, HORA_DA_FOTO.hora, HORA_DA_FOTO.minuto, agoraReal);
  return ancora.getTime() > agoraReal.getTime() ? ancora : agoraReal;
}

/** Sorteio determinístico: a mesma captura duas vezes dá a mesma foto. */
function baralho(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/**
 * Monta a base inteira: os protagonistas primeiro (índices estáveis, porque a
 * lista de pedidos aponta para eles por posição) e o resto gerado.
 */
function montarElenco(sorte, quantidade) {
  const elenco = [...PROTAGONISTAS];
  const vistos = new Set(elenco.map((c) => c.nome));
  let i = 0;
  while (elenco.length < quantidade) {
    const nome = `${PRENOMES[Math.floor(sorte() * PRENOMES.length)]} ${
      SOBRENOMES[Math.floor(sorte() * SOBRENOMES.length)]
    }`;
    i++;
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    // A curva da base de uma padaria: muita gente recente, uma cauda que esfriou
    // e um punhado que se cadastrou e nunca comprou.
    const r = sorte();
    const diasAtras = r < 0.06 ? null : Math.floor(sorte() ** 2 * 190);
    const pedidos = diasAtras === null ? 0 : 1 + Math.floor(sorte() * 26);
    const gasto = Number((pedidos * (22 + sorte() * 55)).toFixed(2));
    elenco.push({
      nome,
      diasAtras,
      pedidos,
      gasto,
      tier: gasto >= 2000 ? "DIAMANTE" : gasto >= 800 ? "OURO" : gasto >= 300 ? "PRATA" : "BRONZE",
    });
  }
  return elenco;
}

/* ───────────────────────────────── o trabalho ─────────────────────────────── */

/** Confere que é vitrine. Lança se não for — falha fechada. */
async function exigirVitrine(slug) {
  const r = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, isDemo: true },
  });
  if (!r) throw new Error(`Restaurante "${slug}" não existe. Rode \`npm run bakery:seed\` antes.`);
  if (!r.isDemo) {
    throw new Error(
      `RECUSADO: "${slug}" tem isDemo=false. Este script só escreve em restaurante ` +
        `de demonstração — encher um cliente real com pedido fictício é dado sujo em produção.`,
    );
  }
  return r;
}

/** Apaga só o lote anterior desta captura, pelo carimbo. */
export async function limpar(slug = "foocci-bakery") {
  const r = await exigirVitrine(slug);
  const antigos = await prisma.customer.findMany({
    where: { restaurantId: r.id, sourceSystem: MARCA },
    select: { id: true },
  });
  const ids = antigos.map((c) => c.id);
  if (ids.length) {
    // Order → OrderItem/Payment caem por cascade; Customer → Address idem.
    await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  }
  const campanhas = await prisma.campaign.findMany({
    where: { restaurantId: r.id, campaignFamilyKey: MARCA },
    select: { id: true },
  });
  if (campanhas.length) {
    await prisma.campaign.deleteMany({ where: { id: { in: campanhas.map((c) => c.id) } } });
  }
  return { clientes: ids.length, campanhas: campanhas.length };
}

/**
 * Enche a padaria. Retorna o resumo para o roteiro imprimir.
 * @param {{ slug?: string, agora?: Date, base?: number, diasDeHistorico?: number,
 *           pedidosPorDia?: number }} opts
 */
export async function encher({
  slug = "foocci-bakery",
  agora = horaDaFoto(),
  base = 184,
  diasDeHistorico = 16,
  pedidosPorDia = 104,
} = {}) {
  const r = await exigirVitrine(slug);
  await limpar(slug);

  const cardapio = await prisma.menuItem.findMany({
    where: { category: { restaurantId: r.id }, isActive: true, isAvailable: true },
    select: { id: true, name: true, price: true, categoryId: true, category: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  if (cardapio.length === 0) {
    throw new Error("O cardápio da padaria está vazio. Rode `npm run bakery:seed` antes.");
  }

  const sorte = baralho(20260805);
  const elenco = montarElenco(sorte, base);

  /* ── clientes ── */
  const criados = [];
  for (const [i, c] of elenco.entries()) {
    const ultima = c.diasAtras === null ? null : menos(agora, dias(c.diasAtras));
    // Cliente entra na base junto com a primeira compra — sem isso todo mundo
    // vira "novo cliente hoje" e o painel mente sobre aquisição. Os seis últimos
    // da lista se cadastraram HOJE: é o que dá o número de "novos hoje".
    const nasceu =
      i >= elenco.length - 6
        ? menos(agora, minutos(40 + i * 7))
        : menos(agora, dias((c.diasAtras ?? 12) + 25 + (i % 90)));
    const cliente = await prisma.customer.create({
      data: {
        restaurantId: r.id,
        name: c.nome,
        phone: telefone(i),
        totalOrders: c.pedidos,
        totalSpend: c.gasto,
        lastOrderAt: ultima,
        tier: c.tier,
        segment:
          c.diasAtras === null ? "SEM_PEDIDOS" : c.diasAtras <= 30 ? "QUENTE" : c.diasAtras <= 60 ? "MORNO" : "FRIO",
        sourceSystem: MARCA,
        crmContactable: true,
        contactStatus: "CONTACTABLE",
        createdAt: nasceu,
      },
    });
    const [rua, numero] = RUAS[i % RUAS.length];
    const endereco = await prisma.address.create({
      data: {
        customerId: cliente.id,
        label: "Casa",
        street: rua,
        number: numero,
        neighborhood: BAIRROS[i % BAIRROS.length],
        city: "São Paulo",
        state: "SP",
        zipCode: `0410${i % 10}-000`,
        isDefault: true,
      },
    });
    criados.push({ ...cliente, enderecoId: endereco.id });
  }

  /* ── os pedidos ──────────────────────────────────────────────────────────────
   *
   * Volume de padaria movimentada de verdade, e isso NÃO é vaidade de número.
   *
   * O cartão "Total hoje" do painel conta os pedidos carregados (`limit=100`),
   * não os do dia. Numa padaria com 20 pedidos/dia ele estampa "Total hoje 100"
   * — número falso indo parar no site de vendas, e que ainda briga com o
   * "Pedidos · 7 dias" da foto do resultado. Com uma padaria que realmente faz
   * ~100 pedidos por dia, o que a tela mostra passa a ser verdade.
   *
   * Duas semanas de histórico, também de propósito: com uma só, o painel compara
   * a semana cheia contra o vazio e estampa "+375% acima" — número de propaganda
   * que o produto não promete (guardrail 7).
   */
  const CUPONS = CAMPANHAS.map((c) => c.cupom).filter(Boolean);
  const semente = randomUUID().replace(/-/g, "");
  let seq = 0;
  const novoId = () => `${semente}${(seq++).toString(36).padStart(5, "0")}`;

  const pedidos = [];
  const itensDePedido = [];
  const pagamentos = [];
  let numero =
    ((await prisma.order.aggregate({ where: { restaurantId: r.id }, _max: { orderNumber: true } }))._max.orderNumber ??
      0) + 1;

  /**
   * Sorteio de item enviesado por PREÇO e por CATEGORIA — é o retrato do negócio,
   * e as duas correções vieram de olhar a foto e não acreditar nela:
   *
   *  • Preço: com sorteio uniforme o ticket médio dava R$ 70. Número de
   *    restaurante, não de padaria; qualquer dono veria na hora que era invenção.
   *  • Categoria: sem peso, "Água Mineral" virava o segundo item mais vendido só
   *    por ser barato — e a faixa "Mais vendidos" do cardápio, que é montada a
   *    partir das vendas REAIS, abria a loja com foto de garrafa d'água. Padaria
   *    vende pão, salgado e doce; bebida acompanha.
   */
  const PESO_DA_CATEGORIA = {
    Padaria: 1.0,
    Salgados: 0.85,
    Confeitaria: 0.7,
    Lanches: 0.5,
    "Café & Bebidas": 0.3,
    "Cestas & Combos": 0.15,
    "Da Nossa Despensa": 0.15,
  };
  const porPreco = [...cardapio].sort((a, b) => Number(a.price) - Number(b.price));
  const itemPlausivel = () => {
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      const candidato = porPreco[Math.floor(sorte() ** 3.4 * porPreco.length)];
      if (sorte() < (PESO_DA_CATEGORIA[candidato.category?.name] ?? 0.4)) return candidato;
    }
    return porPreco[Math.floor(sorte() ** 3.4 * porPreco.length)];
  };

  const montar = ({ cliente, quando, status, tipo, origem, qtdItens, cupom = null }) => {
    const id = novoId();
    const escolhidos = [];
    for (let k = 0; k < qtdItens; k++) {
      const item = itemPlausivel();
      // Pão e salgado saem aos punhados; o que é caro sai na unidade.
      const barato = Number(item.price) <= 8;
      escolhidos.push({ item, qtd: barato ? 2 + Math.floor(sorte() * 4) : sorte() > 0.85 ? 2 : 1 });
    }
    const subtotal = Number(escolhidos.reduce((s, e) => s + Number(e.item.price) * e.qtd, 0).toFixed(2));
    const taxa = tipo === "DELIVERY" ? 6.9 : 0;
    const total = Number((subtotal + taxa).toFixed(2));
    const pago = ["DELIVERED", "OUT_FOR_DELIVERY", "READY"].includes(status);

    pedidos.push({
      id,
      restaurantId: r.id,
      customerId: cliente.id,
      orderNumber: numero++,
      status,
      type: tipo,
      subtotal,
      deliveryFee: taxa,
      total,
      source: origem,
      couponCode: cupom,
      deliveryAddressId: tipo === "DELIVERY" ? cliente.enderecoId : null,
      estimatedAt: new Date(quando.getTime() + minutos(28)),
      completedAt: status === "DELIVERED" ? new Date(quando.getTime() + minutos(21)) : null,
      createdAt: quando,
      updatedAt: quando,
      crmSyncedAt: quando,
      trafficSource: origem === "qr" ? "qr" : origem === "whatsapp" ? "whatsapp" : "direct",
      trafficMedium: origem === "qr" ? "mesa" : origem === "whatsapp" ? "bio" : "direct",
    });
    for (const e of escolhidos) {
      itensDePedido.push({
        id: novoId(),
        orderId: id,
        menuItemId: e.item.id,
        name: e.item.name,
        price: e.item.price,
        quantity: e.qtd,
        total: Number((Number(e.item.price) * e.qtd).toFixed(2)),
        categoryId: e.item.categoryId,
        categoryName: e.item.category?.name ?? null,
      });
    }
    pagamentos.push({
      id: novoId(),
      orderId: id,
      method: tipo === "DINE_IN" ? "CARD_MACHINE" : sorte() > 0.5 ? "PIX" : "CREDIT_CARD",
      status: pago ? "PAID" : "PENDING",
      amount: total,
      paidAt: pago ? new Date(quando.getTime() + minutos(2)) : null,
    });
    return total;
  };

  /* A fila viva de agora. */
  let faturamentoHoje = 0;
  for (const p of PEDIDOS_DE_HOJE) {
    faturamentoHoje += montar({
      cliente: criados[p.cliente],
      quando: menos(agora, minutos(p.minutosAtras)),
      status: p.status,
      tipo: p.tipo,
      origem: p.origem,
      qtdItens: p.itens,
    });
  }

  /* O resto do dia que já passou, entre a abertura (06h de São Paulo) e agora.
   * Quantos cabem depende da hora: a captura não pode inventar noventa pedidos
   * numa padaria que abriu há vinte minutos. */
  const [anoHoje, mesHoje, diaHoje] = hojeNaVitrine(agora);
  const abertura = instante(anoHoje, mesHoje, diaHoje, 6, 0, agora);
  const minutosAbertos = Math.max(0, Math.floor((agora.getTime() - abertura.getTime()) / 60_000) - 15);
  const jaEntregues = Math.max(0, Math.min(pedidosPorDia - PEDIDOS_DE_HOJE.length, Math.floor(minutosAbertos / 2.5)));
  for (let n = 0; n < jaEntregues; n++) {
    const quando = new Date(abertura.getTime() + minutos(Math.floor((n / jaEntregues) * minutosAbertos)));
    faturamentoHoje += montar({
      cliente: criados[Math.floor(sorte() * criados.length)],
      quando,
      status: "DELIVERED",
      tipo: sorte() > 0.5 ? "DELIVERY" : sorte() > 0.45 ? "PICKUP" : "DINE_IN",
      origem: sorte() > 0.6 ? "pedido" : sorte() > 0.3 ? "whatsapp" : "qr",
      qtdItens: 1 + Math.floor(sorte() * 3),
      cupom: sorte() < 0.07 ? CUPONS[Math.floor(sorte() * CUPONS.length)] : null,
    });
  }

  /* As duas semanas anteriores, no horário comercial da padaria (06h–20h de
   * São Paulo — hora de parede, não do relógio da máquina). */
  let historico = 0;
  let cuponsUsados = 0;
  for (let d = 1; d <= diasDeHistorico; d++) {
    // O movimento de uma padaria tem ritmo de SEMANA, não sorteio: sábado e
    // domingo cheios, segunda fraca. E o mesmo dia da semana de duas semanas
    // atrás carrega o mesmo multiplicador de propósito — é o que faz a
    // comparação "ontem vs. a mesma terça passada" do painel medir a tendência
    // (leve alta) em vez de medir o dado aleatório.
    const diaDaSemana = new Date(instante(anoHoje, mesHoje, diaHoje - d, 12, 0, agora)).getUTCDay();
    const quantos = Math.round(pedidosPorDia * RITMO_DA_SEMANA[diaDaSemana] * (1 - d * 0.012));
    for (let n = 0; n < quantos; n++) {
      const quando = instante(
        anoHoje,
        mesHoje,
        diaHoje - d,
        6 + Math.floor(sorte() * 14),
        Math.floor(sorte() * 60),
        agora,
      );
      const cupom = sorte() < 0.05 ? CUPONS[Math.floor(sorte() * CUPONS.length)] : null;
      if (cupom) cuponsUsados++;
      montar({
        cliente: criados[Math.floor(sorte() * criados.length)],
        quando,
        status: "DELIVERED",
        tipo: sorte() > 0.5 ? "DELIVERY" : sorte() > 0.45 ? "PICKUP" : "DINE_IN",
        origem: sorte() > 0.6 ? "pedido" : sorte() > 0.3 ? "whatsapp" : "qr",
        qtdItens: 1 + Math.floor(sorte() * 3),
        cupom,
      });
      historico++;
    }
  }

  // Em lote: são milhares de linhas, e uma escrita por pedido levaria minutos.
  const emLotes = async (modelo, linhas) => {
    for (let i = 0; i < linhas.length; i += 1000) {
      await modelo.createMany({ data: linhas.slice(i, i + 1000) });
    }
  };
  await emLotes(prisma.order, pedidos);
  await emLotes(prisma.orderItem, itensDePedido);
  await emLotes(prisma.payment, pagamentos);

  /* ── campanhas de CRM, com conversão comprovada ── */
  let receitaCrm = 0;
  for (const c of CAMPANHAS) {
    const enviada = menos(agora, dias(c.diasAtras));
    const receita = Number((c.conversoes * c.ticket).toFixed(2));
    receitaCrm += receita;
    const campanha = await prisma.campaign.create({
      data: {
        restaurantId: r.id,
        name: c.nome,
        message: `Oi {nome}! ${c.nome} — passa aqui na Foocci Bakery hoje. 🥐`,
        objective: c.objetivo,
        channel: "WHATSAPP",
        targetSegment: c.segmento,
        status: "SENT",
        sentAt: enviada,
        totalAudience: c.publico,
        totalSent: c.publico,
        totalRead: Math.round(c.publico * 0.62),
        totalResponded: Math.round(c.conversoes * 1.6),
        totalConverted: c.conversoes,
        totalRevenue: receita,
        couponCode: c.cupom,
        campaignFamilyKey: MARCA,
        createdAt: menos(enviada, dias(1)),
      },
    });

    // Uma execução por destinatário. A receita atribuída do painel é somada
    // daqui (CampaignExecution.revenue), não do contador da campanha — por isso
    // as linhas precisam existir de verdade.
    const execucoes = [];
    for (let i = 0; i < c.publico; i++) {
      const cliente = criados[i % criados.length];
      const converteu = i < c.conversoes;
      execucoes.push({
        campaignId: campanha.id,
        restaurantId: r.id,
        customerId: cliente.id,
        customerName: cliente.name,
        customerPhone: cliente.phone,
        status: "READ",
        sentAt: enviada,
        readAt: new Date(enviada.getTime() + minutos(20 + (i % 90))),
        converted: converteu,
        convertedAt: converteu ? new Date(enviada.getTime() + minutos(60 + i * 37)) : null,
        revenue: converteu ? c.ticket : null,
      });
    }
    await prisma.campaignExecution.createMany({ data: execucoes });
  }

  return {
    restaurante: r.name,
    clientes: criados.length,
    filaViva: PEDIDOS_DE_HOJE.filter((p) => p.status !== "DELIVERED").length,
    pedidosHoje: pedidos.length - historico,
    pedidosHistoricos: historico,
    faturamentoHoje: Number(faturamentoHoje.toFixed(2)),
    campanhas: CAMPANHAS.length,
    cuponsUsados,
    receitaCrm,
    itensNoCardapio: cardapio.length,
  };
}

export async function desconectar() {
  await prisma.$disconnect();
}

export { prisma };
