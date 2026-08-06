/**
 * INVENTÁRIO, REDE E PURGA DE RESTAURANTE — o caminho sem volta, com portões.
 *
 * Nasceu do pedido do CEO (06/08/2026) de deixar no admin apenas `foocci-bakery` e
 * `sushi-cazza`. O pedido é legítimo; o perigo é o método. Um dos candidatos à
 * exclusão carrega milhares de clientes, e a diferença entre "importação de teste"
 * e "gente de verdade" não está no tamanho da base — está em ter havido PEDIDO.
 *
 * Este serviço faz três coisas, nesta ordem, e a ordem é o produto:
 *
 *   1. `levantarInventario()`  — SOMENTE LEITURA. Responde, por restaurante,
 *      "isto já viveu?". Projeta contagem e data; nunca nome, telefone, endereço
 *      ou conteúdo de conversa (o log da ferramenta que o consome é público).
 *
 *   2. `simularPurga(slug)`    — SOMENTE LEITURA. Diz exatamente o que sairia e
 *      quantas linhas de cada tabela, incluindo as que não têm chave estrangeira
 *      e sobreviveriam como órfãs a um `DELETE` ingênuo.
 *
 *   3. `exportarRestaurante()` + `executarPurga()` — a rede e o corte. O corte só
 *      acontece com a rede na mão: `executarPurga` exige o sha256 da exportação
 *      recém-baixada e o recalcula do banco. Divergiu, recusa. Exclusão
 *      irreversível vira reversível com uma exportação, e isso custa minutos —
 *      então é obrigatório, não recomendado (guardrail 4: código é a trava).
 *
 * NÃO EXISTIA, ATÉ AQUI, NENHUM CAMINHO DE EXCLUSÃO DE RESTAURANTE.
 * O `/api/admin/restaurants/[id]` só faz PATCH (ativo, plano, nome). Não há DELETE
 * em rota, serviço ou script nenhum do repositório. Então não havia o que
 * reaproveitar — e é por isso que a alternativa real, se este arquivo não
 * existisse, seria SQL cru direto na produção.
 */

import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import {
  SLUGS_PROTEGIDOS,
  ORDEM_DE_PURGA,
  TABELAS_PRESERVADAS,
  TABELAS_PROFUNDAS,
  ondeDaTabela,
  sqlContagemProfunda,
  sqlExportProfundo,
} from "./restaurantPurgeMap";

// ═════════════════════════════════════════════════════════════════════════════
//  ERROS — cada recusa carrega o próprio motivo (guardrail 6)
// ═════════════════════════════════════════════════════════════════════════════

export type MotivoDeBloqueio =
  | "SLUG_PROTEGIDO"
  | "PURGA_DESLIGADA"
  | "NAO_ENCONTRADO"
  | "CONFIRMACAO_NAO_CONFERE"
  | "SEM_REDE"
  | "REDE_DIVERGENTE"
  | "ASSINATURA_VIVA"
  | "NOTA_FISCAL_NAO_RECONHECIDA";

export class PurgaBloqueadaError extends Error {
  readonly motivo: MotivoDeBloqueio;
  readonly slug: string;
  readonly evidencia: Record<string, unknown>;

  constructor(motivo: MotivoDeBloqueio, slug: string, mensagem: string, evidencia: Record<string, unknown> = {}) {
    super(mensagem);
    this.name = "PurgaBloqueadaError";
    this.motivo = motivo;
    this.slug = slug;
    this.evidencia = evidencia;
  }
}

/**
 * A TRAVA DOS DOIS. Está aqui, em função pura e testada, e não no cuidado de quem
 * roda o comando: é o único ponto por onde a purga passa.
 *
 * Comparação exata e sem normalização de propósito — "FOOCCI-BAKERY" e
 * " foocci-bakery" não são slugs válidos do banco, então não podem ser um jeito
 * de driblar a lista. Mas comparo também a forma normalizada, porque a proteção
 * falha para o lado de PROTEGER: na dúvida, recusa.
 */
export function ehProtegido(slug: string): boolean {
  const normalizado = String(slug ?? "").trim().toLowerCase();
  return SLUGS_PROTEGIDOS.some((p) => p === slug || p === normalizado);
}

export function assertNaoProtegido(slug: string): void {
  if (ehProtegido(slug)) {
    throw new PurgaBloqueadaError(
      "SLUG_PROTEGIDO",
      slug,
      `"${slug}" está na lista de restaurantes protegidos e NÃO pode ser apagado por ` +
        `este caminho. A lista vive em src/services/restaurant/restaurantPurgeMap.ts ` +
        `(SLUGS_PROTEGIDOS) e mudá-la é decisão humana, não parâmetro de execução.`,
      { protegidos: [...SLUGS_PROTEGIDOS] },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  1. INVENTÁRIO — somente leitura, seguro para log público
// ═════════════════════════════════════════════════════════════════════════════

export interface LinhaDoInventario {
  slug: string;
  nome: string;
  ativo: boolean;
  demo: boolean;
  plano: string;
  criadoEm: string;
  /** `null` = NUNCA teve pedido. É a coluna que separa base importada de gente. */
  ultimoPedidoEm: string | null;
  clientes: number;
  clientesComTelefone: number;
  clientesAlcancaveis: number;
  pedidos: number;
  pedidos90d: number;
  conversas: number;
  campanhas: number;
  categoriasCardapio: number;
  whatsapp: string;
  notasFiscais: number;
  assinaturas: number;
  assinaturasVivas: number;
  /**
   * O veredito em uma palavra, derivado só dos números acima — nunca de opinião:
   *   VIVO      = pedido nos últimos 90 dias
   *   JA_VIVEU  = já teve pedido algum dia, mas não nos últimos 90
   *   NUNCA_VIVEU = zero pedido desde sempre
   */
  veredito: "VIVO" | "JA_VIVEU" | "NUNCA_VIVEU";
}

interface LinhaCrua {
  slug: string;
  name: string;
  isActive: boolean;
  isDemo: boolean;
  plan: string;
  createdAt: Date;
  ultimoPedidoEm: Date | null;
  clientes: bigint;
  clientesComTelefone: bigint;
  clientesAlcancaveis: bigint;
  pedidos: bigint;
  pedidos90d: bigint;
  conversas: bigint;
  campanhas: bigint;
  categoriasCardapio: bigint;
  whatsappStatus: string | null;
  notasFiscais: bigint;
  assinaturas: bigint;
  assinaturasVivas: bigint;
}

const n = (v: bigint | number | null | undefined): number => Number(v ?? 0);

/**
 * O INVENTÁRIO INTEIRO EM UMA CONSULTA.
 *
 * Uma consulta por restaurante (N+1) seria mais legível e, com dezenas de tenants
 * e milhares de clientes, transformaria um relatório em carga. Subconsulta em
 * coluna resolve num round-trip só e mantém cada número ao lado do dono.
 *
 * ⚠️ CADA COLUNA AQUI É PÚBLICA POR CONSTRUÇÃO. Antes de acrescentar campo,
 * a pergunta é sempre: "isso pode ficar visível para qualquer pessoa na internet?".
 * Nome do restaurante e slug: sim, é a identificação da loja. Nome de cliente,
 * telefone, endereço, conteúdo de mensagem: NUNCA.
 */
export async function levantarInventario(): Promise<LinhaDoInventario[]> {
  const linhas = await prisma.$queryRaw<LinhaCrua[]>`
    SELECT
      r."slug",
      r."name",
      r."isActive",
      r."isDemo",
      r."plan"::text                       AS "plan",
      r."createdAt",
      (SELECT MAX(o."createdAt") FROM "orders" o WHERE o."restaurantId" = r."id")            AS "ultimoPedidoEm",
      (SELECT COUNT(*)::bigint FROM "customers" c
         WHERE c."restaurantId" = r."id" AND c."isGuest" = false)                            AS "clientes",
      (SELECT COUNT(*)::bigint FROM "customers" c
         WHERE c."restaurantId" = r."id" AND c."isGuest" = false
           AND c."phone" IS NOT NULL AND c."phone" NOT LIKE 'GUEST-%')                       AS "clientesComTelefone",
      (SELECT COUNT(*)::bigint FROM "customers" c
         WHERE c."restaurantId" = r."id" AND c."isGuest" = false
           AND c."phone" IS NOT NULL AND c."phone" NOT LIKE 'GUEST-%'
           AND c."crmContactable" = true AND c."hasOptedOut" = false AND c."isActive" = true) AS "clientesAlcancaveis",
      (SELECT COUNT(*)::bigint FROM "orders" o WHERE o."restaurantId" = r."id")              AS "pedidos",
      (SELECT COUNT(*)::bigint FROM "orders" o
         WHERE o."restaurantId" = r."id" AND o."createdAt" >= NOW() - INTERVAL '90 days')     AS "pedidos90d",
      (SELECT COUNT(*)::bigint FROM "conversations" v WHERE v."restaurantId" = r."id")       AS "conversas",
      (SELECT COUNT(*)::bigint FROM "campaigns" k WHERE k."restaurantId" = r."id")           AS "campanhas",
      (SELECT COUNT(*)::bigint FROM "menu_categories" mc WHERE mc."restaurantId" = r."id")   AS "categoriasCardapio",
      (SELECT w."connectionStatus" FROM "meta_whatsapp_configs" w
         WHERE w."restaurantId" = r."id" LIMIT 1)                                            AS "whatsappStatus",
      (SELECT COUNT(*)::bigint FROM "fiscal_documents" f WHERE f."restaurantId" = r."id")    AS "notasFiscais",
      (SELECT COUNT(*)::bigint FROM "plan_subscriptions" s WHERE s."restaurantId" = r."id")  AS "assinaturas",
      (SELECT COUNT(*)::bigint FROM "plan_subscriptions" s
         WHERE s."restaurantId" = r."id"
           AND s."status"::text IN ('ATIVA', 'INADIMPLENTE', 'AGUARDANDO_PAGAMENTO'))        AS "assinaturasVivas"
    FROM "restaurants" r
    ORDER BY r."createdAt" ASC
  `;

  return linhas.map((l) => ({
    slug: l.slug,
    nome: l.name,
    ativo: l.isActive,
    demo: l.isDemo,
    plano: l.plan,
    criadoEm: l.createdAt.toISOString().slice(0, 10),
    ultimoPedidoEm: l.ultimoPedidoEm ? l.ultimoPedidoEm.toISOString().slice(0, 10) : null,
    clientes: n(l.clientes),
    clientesComTelefone: n(l.clientesComTelefone),
    clientesAlcancaveis: n(l.clientesAlcancaveis),
    pedidos: n(l.pedidos),
    pedidos90d: n(l.pedidos90d),
    conversas: n(l.conversas),
    campanhas: n(l.campanhas),
    categoriasCardapio: n(l.categoriasCardapio),
    // Guardrail 1: ausência de configuração não é "desconectado", é "sem configuração".
    whatsapp: l.whatsappStatus ?? "SEM_CONFIG",
    notasFiscais: n(l.notasFiscais),
    assinaturas: n(l.assinaturas),
    assinaturasVivas: n(l.assinaturasVivas),
    veredito: n(l.pedidos90d) > 0 ? "VIVO" : n(l.pedidos) > 0 ? "JA_VIVEU" : "NUNCA_VIVEU",
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
//  2. SIMULAÇÃO — somente leitura
// ═════════════════════════════════════════════════════════════════════════════

export interface PlanoDePurga {
  slug: string;
  restaurantId: string;
  nome: string;
  protegido: boolean;
  /** Linha a linha, na ORDEM em que a exclusão aconteceria. */
  passos: { ordem: number; tabela: string; linhas: number; semChaveEstrangeira: boolean }[];
  /** Tabelas que somem pela cascata do banco, sem `restaurantId` próprio. */
  profundas: { tabela: string; linhas: number; via: string }[];
  totalLinhas: number;
  /** O que NÃO sai, e por quê. */
  sobra: { tabela: string; linhas: number; motivo: string }[];
  /** Motivos que, hoje, fariam `executarPurga` recusar. Vazio = passaria. */
  bloqueios: { motivo: MotivoDeBloqueio; detalhe: string }[];
}

/**
 * TABELAS SEM CHAVE ESTRANGEIRA — as que sobreviveriam a um `DELETE` ingênuo.
 * Marcadas no plano para que quem lê veja o tamanho do buraco que a purga tapa.
 */
const SEM_FK = new Set([
  "crm_contact_ledger",
  "referrals",
  "crm_base_exclusions",
  "google_oauth_states",
  "media_uploads",
  "menu_events",
  "support_tickets",
  "waiter_runtime_versions",
  "agent_simulation_runs",
  "agent_simulation_examples",
  "agent_training_runs",
  "agent_training_scenarios",
  "agent_improvement_proposals",
  "agent_brain_versions",
  "waiter_result_evidence",
  "waiter_training_suggestions",
  "customer_channel_identities",
  "instagram_channel_configs",
  "meta_oauth_states",
  "brain_freeform_configs",
  "brain_shadow_logs",
  "crm_agent_pilot_configs",
  "restaurant_experiences",
]);

async function contar(sql: string, id: string): Promise<number> {
  const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql, id);
  return Number(r[0]?.n ?? 0);
}

export async function simularPurga(slug: string): Promise<PlanoDePurga> {
  const restaurante = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!restaurante) {
    throw new PurgaBloqueadaError("NAO_ENCONTRADO", slug, `Nenhum restaurante com slug "${slug}".`);
  }

  const passos: PlanoDePurga["passos"] = [];
  let ordem = 0;
  for (const tabela of ORDEM_DE_PURGA) {
    const linhas = await contar(
      `SELECT COUNT(*)::bigint AS n FROM "${tabela}" WHERE ${ondeDaTabela(tabela)}`,
      restaurante.id,
    );
    passos.push({ ordem: ++ordem, tabela, linhas, semChaveEstrangeira: SEM_FK.has(tabela) });
  }

  const profundas: PlanoDePurga["profundas"] = [];
  for (const t of TABELAS_PROFUNDAS) {
    profundas.push({
      tabela: t.tabela,
      via: t.via,
      linhas: await contar(sqlContagemProfunda(t), restaurante.id),
    });
  }

  const sobra: PlanoDePurga["sobra"] = [];
  for (const [tabela, motivo] of Object.entries(TABELAS_PRESERVADAS)) {
    sobra.push({
      tabela,
      motivo,
      linhas: await contar(
        `SELECT COUNT(*)::bigint AS n FROM "${tabela}" WHERE "restaurantId" = $1`,
        restaurante.id,
      ),
    });
  }

  const bloqueios: PlanoDePurga["bloqueios"] = [];
  if (ehProtegido(slug)) {
    bloqueios.push({
      motivo: "SLUG_PROTEGIDO",
      detalhe: `"${slug}" está em SLUGS_PROTEGIDOS. A purga recusa por construção.`,
    });
  }
  if (!purgaHabilitada()) {
    bloqueios.push({
      motivo: "PURGA_DESLIGADA",
      detalhe:
        "PURGA_RESTAURANTE_HABILITADA não está com o valor 'sim' no ambiente. " +
        "Enquanto isso, só simulação e exportação funcionam.",
    });
  }
  const assinaturasVivas = await contar(
    `SELECT COUNT(*)::bigint AS n FROM "plan_subscriptions"
       WHERE "restaurantId" = $1 AND "status"::text IN ('ATIVA','INADIMPLENTE','AGUARDANDO_PAGAMENTO')`,
    restaurante.id,
  );
  if (assinaturasVivas > 0) {
    bloqueios.push({
      motivo: "ASSINATURA_VIVA",
      detalhe:
        `${assinaturasVivas} assinatura(s) em estado de cobrança apontam para este restaurante. ` +
        `A chave é SetNull: apagar o restaurante NÃO cancela a recorrência no Mercado Pago — ` +
        `o cartão continua sendo debitado sem restaurante do outro lado. Cancele lá primeiro.`,
    });
  }
  const notas = passos.find((p) => p.tabela === "fiscal_documents")?.linhas ?? 0;
  if (notas > 0) {
    bloqueios.push({
      motivo: "NOTA_FISCAL_NAO_RECONHECIDA",
      detalhe:
        `${notas} documento(s) fiscal(is) seriam apagados. Nota fiscal emitida tem guarda ` +
        `legal e não é dado descartável — a purga só segue com o reconhecimento explícito ` +
        `\`aceitoPerderNotaFiscal: true\`, e depois de a exportação estar guardada.`,
    });
  }

  return {
    slug,
    restaurantId: restaurante.id,
    nome: restaurante.name,
    protegido: ehProtegido(slug),
    passos,
    profundas,
    sobra,
    bloqueios,
    totalLinhas:
      passos.reduce((s, p) => s + p.linhas, 0) + profundas.reduce((s, p) => s + p.linhas, 0),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  3. A REDE — exportação e sua impressão digital
// ═════════════════════════════════════════════════════════════════════════════

export interface Exportacao {
  slug: string;
  restaurantId: string;
  geradoEm: string;
  /** tabela -> linhas cruas, exatamente como saem do banco. */
  dados: Record<string, unknown[]>;
  /** sha256 do conteúdo canônico. É esta string que `executarPurga` cobra. */
  sha256: string;
  bytes: number;
  totalLinhas: number;
}

/**
 * SERIALIZAÇÃO CANÔNICA — o mesmo dado tem que dar o mesmo hash em duas leituras.
 *
 * Sem isto o hash da rede seria inútil: ordem de chave de objeto, ordem de linha
 * devolvida pelo Postgres e o tipo `Decimal`/`Buffer`/`BigInt` do driver mudam a
 * string sem mudar o dado. Aqui a chave é ordenada, a linha é ordenada por `id`
 * e todo tipo exótico vira texto.
 */
function canonicalizar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "bigint") return valor.toString();
  if (valor instanceof Date) return valor.toISOString();
  if (Buffer.isBuffer(valor)) return `base64:${valor.toString("base64")}`;
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    // Decimal do Prisma e afins expõem toString mas não são objeto simples.
    if (typeof o.toFixed === "function" || o.constructor?.name === "Decimal") return String(valor);
    const saida: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) saida[k] = canonicalizar(o[k]);
    return saida;
  }
  return valor;
}

function ordenarLinhas(linhas: unknown[]): unknown[] {
  return [...linhas].sort((a, b) => {
    const ia = (a as { id?: string })?.id ?? JSON.stringify(a);
    const ib = (b as { id?: string })?.id ?? JSON.stringify(b);
    return String(ia).localeCompare(String(ib));
  });
}

/** SOMENTE LEITURA. Monta a rede antes do corte. */
export async function exportarRestaurante(slug: string): Promise<Exportacao> {
  const restaurante = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurante) {
    throw new PurgaBloqueadaError("NAO_ENCONTRADO", slug, `Nenhum restaurante com slug "${slug}".`);
  }

  const dados: Record<string, unknown[]> = {
    restaurants: [canonicalizar(restaurante)],
  };

  for (const tabela of ORDEM_DE_PURGA) {
    const linhas = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM "${tabela}" WHERE ${ondeDaTabela(tabela)}`,
      restaurante.id,
    );
    dados[tabela] = ordenarLinhas(linhas).map(canonicalizar);
  }
  for (const t of TABELAS_PROFUNDAS) {
    const linhas = await prisma.$queryRawUnsafe<unknown[]>(sqlExportProfundo(t), restaurante.id);
    dados[t.tabela] = ordenarLinhas(linhas).map(canonicalizar);
  }
  // A sobra também vai na rede: ela não é apagada, mas o vínculo é. Sem esta
  // fotografia ninguém consegue recolar a assinatura no restaurante recriado.
  for (const tabela of Object.keys(TABELAS_PRESERVADAS)) {
    const linhas = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM "${tabela}" WHERE "restaurantId" = $1`,
      restaurante.id,
    );
    dados[`${tabela}__preservada`] = ordenarLinhas(linhas).map(canonicalizar);
  }

  const texto = JSON.stringify(canonicalizar(dados));
  const sha256 = createHash("sha256").update(texto).digest("hex");

  return {
    slug,
    restaurantId: restaurante.id,
    geradoEm: new Date().toISOString(),
    dados,
    sha256,
    bytes: Buffer.byteLength(texto, "utf8"),
    totalLinhas: Object.values(dados).reduce((s, v) => s + v.length, 0),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  4. O CORTE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * INTERRUPTOR DE AMBIENTE. Rota protegida por segredo já barra estranho; isto barra
 * o próprio operador autorizado apertando o botão errado num dia ruim. Sem a
 * variável valendo exatamente "sim", só simulação e exportação respondem.
 */
export function purgaHabilitada(): boolean {
  return process.env.PURGA_RESTAURANTE_HABILITADA === "sim";
}

export interface PedidoDePurga {
  slug: string;
  /** Tem que ser IGUAL a `slug`, digitado de novo. Um por vez, sempre. */
  confirmarSlug: string;
  /** sha256 devolvido por `exportarRestaurante` e já guardado fora daqui. */
  sha256DoBackup: string;
  /** Reconhecimento explícito de que nota fiscal emitida vai junto. */
  aceitoPerderNotaFiscal?: boolean;
}

export interface ResultadoDaPurga {
  slug: string;
  restaurantId: string;
  apagadoEm: string;
  linhasPorTabela: Record<string, number>;
  totalLinhas: number;
  sobraDetachada: Record<string, number>;
}

/**
 * APAGA UM RESTAURANTE. Um por chamada, por slug, com a rede conferida.
 *
 * Os portões, na ordem em que recusam — todos falham FECHADO:
 *   1. slug protegido           → nunca, em hipótese alguma
 *   2. purga desligada          → variável de ambiente ausente
 *   3. restaurante inexistente  → não existe "apagar todos que não são os dois"
 *   4. confirmação não confere  → o slug tem que ser digitado duas vezes
 *   5. assinatura viva          → dinheiro não some por cascata
 *   6. nota fiscal sem aceite   → guarda legal não se perde em silêncio
 *   7. rede ausente ou divergente → sem exportação conferida, não corta
 *
 * Tudo dentro de UMA transação: ou o restaurante inteiro sai, ou nada sai. Purga
 * pela metade seria o pior desfecho possível — um tenant meio apagado é
 * exatamente o órfão que este arquivo existe para evitar.
 */
export async function executarPurga(pedido: PedidoDePurga): Promise<ResultadoDaPurga> {
  const { slug, confirmarSlug, sha256DoBackup, aceitoPerderNotaFiscal } = pedido;

  assertNaoProtegido(slug);
  assertNaoProtegido(confirmarSlug);

  if (!purgaHabilitada()) {
    throw new PurgaBloqueadaError(
      "PURGA_DESLIGADA",
      slug,
      "PURGA_RESTAURANTE_HABILITADA não vale 'sim' neste ambiente. A purga está desligada.",
    );
  }

  if (!confirmarSlug || confirmarSlug !== slug) {
    throw new PurgaBloqueadaError(
      "CONFIRMACAO_NAO_CONFERE",
      slug,
      "A confirmação tem que repetir o slug exato, caractere por caractere. " +
        "Este portão existe para que a purga seja sempre um restaurante por vez, escolhido a dedo.",
    );
  }

  if (!sha256DoBackup) {
    throw new PurgaBloqueadaError(
      "SEM_REDE",
      slug,
      "Sem `sha256DoBackup` não há prova de que a exportação foi feita e recebida. " +
        "Chame a exportação, guarde o arquivo, e devolva o sha256 dela aqui.",
    );
  }

  const plano = await simularPurga(slug);

  const assinatura = plano.bloqueios.find((b) => b.motivo === "ASSINATURA_VIVA");
  if (assinatura) {
    throw new PurgaBloqueadaError("ASSINATURA_VIVA", slug, assinatura.detalhe);
  }

  const notas = plano.passos.find((p) => p.tabela === "fiscal_documents")?.linhas ?? 0;
  if (notas > 0 && aceitoPerderNotaFiscal !== true) {
    throw new PurgaBloqueadaError(
      "NOTA_FISCAL_NAO_RECONHECIDA",
      slug,
      `${notas} documento(s) fiscal(is) sairiam junto. Confirme com \`aceitoPerderNotaFiscal: true\`.`,
      { notasFiscais: notas },
    );
  }

  /*
    A REDE É CONFERIDA CONTRA O BANCO, NÃO CONTRA A PALAVRA DE QUEM CHAMA.
    Recalcular a exportação agora custa uma leitura a mais e compra duas coisas:
    prova de que o arquivo guardado corresponde ao que está prestes a sumir, e
    detecção de movimento — se entrou pedido entre a exportação e o corte, o hash
    muda e a purga recusa. Recusar aqui é barato; descobrir depois, não.
  */
  const conferencia = await exportarRestaurante(slug);
  if (conferencia.sha256 !== sha256DoBackup) {
    throw new PurgaBloqueadaError(
      "REDE_DIVERGENTE",
      slug,
      "O sha256 informado não bate com o estado atual do banco. Ou a exportação guardada " +
        "está velha, ou o restaurante recebeu dado novo depois dela. Exporte de novo e confira " +
        "antes de apagar — a rede tem que representar exatamente o que vai sumir.",
      { esperado: conferencia.sha256, recebido: sha256DoBackup },
    );
  }

  const id = plano.restaurantId;
  const linhasPorTabela: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      for (const tabela of ORDEM_DE_PURGA) {
        const apagadas = await tx.$executeRawUnsafe(
          `DELETE FROM "${tabela}" WHERE ${ondeDaTabela(tabela)}`,
          id,
        );
        if (apagadas > 0) linhasPorTabela[tabela] = apagadas;
      }
      const restaurante = await tx.$executeRawUnsafe(`DELETE FROM "restaurants" WHERE "id" = $1`, id);
      linhasPorTabela["restaurants"] = restaurante;
    },
    { timeout: 120_000 },
  );

  const sobraDetachada: Record<string, number> = {};
  for (const s of plano.sobra) if (s.linhas > 0) sobraDetachada[s.tabela] = s.linhas;

  return {
    slug,
    restaurantId: id,
    apagadoEm: new Date().toISOString(),
    linhasPorTabela,
    totalLinhas: Object.values(linhasPorTabela).reduce((a, b) => a + b, 0),
    sobraDetachada,
  };
}
