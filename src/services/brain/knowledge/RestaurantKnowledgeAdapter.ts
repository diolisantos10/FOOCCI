/**
 * RestaurantKnowledgeAdapter — maps what Foocci ALREADY knows about a restaurant
 * into the generic BusinessKnowledgeSnapshot. Read-only — no customer PII ever
 * enters the snapshot (no names, phones, addresses).
 *
 * v2 is FACT-LEVEL: real menu items with prices (incl. channel prices), real
 * business hours, active promotions and the curated Q&A knowledge base
 * (RestaurantKnowledgeItem ACTIVE) — not just counts. This is the truth the
 * LLM reasons over; the count-only v1 snapshot is why the model once denied
 * that rodízio existed. Everything is capped by a token budget and whatever
 * is not loaded goes to missingContext so the agent never invents.
 *
 * ─── v3, 06/08/2026: a ficha passa a dizer O CANAL e o ESTADO DA LOJA ────────
 * Dois defeitos, o mesmo padrão — o agente não sabia um fato que o sistema sabia.
 *
 * 1. CANAL. A lista de produtos daqui nunca foi filtrada por canal, mas também
 *    nunca disse a qual canal cada item pertence. Isso é pior que o recorte: o
 *    RODIZIO PRESENCIAL aparecia ao lado do temaki, com preço e sem etiqueta —
 *    e o agente não tinha como saber que um vai para entrega e o outro não. Um
 *    lado do erro nega o que existe (o caso da cliente Júlia); o outro promete
 *    entregar o que só se serve no salão. Agora cada item carrega `canais`.
 *    A regra do CEO em `docs/decisoes.md` — "existe é diferente de vendível" —
 *    fica legível NA ficha, não só no código que a consome.
 *
 * 2. ESTADO DA LOJA. Com a loja fechada às 23:49, a tarja da tela dizia
 *    "pedidos ficam pausados até reabrirmos" e o agente pedia o WhatsApp da
 *    cliente para fechar pedido. O estado nunca chegava na ficha. Agora chega,
 *    calculado pela MESMA biblioteca da tarja (`EstadoDaLoja` → `business-hours`).
 *
 * Guardrail 5 vive aqui: ficha maior é prompt mais lento e mais caro em TODA
 * conversa. Por isso o `queryHint` passou a rankear TAMBÉM os produtos (antes
 * mexia só no Q&A), o rótulo de canal é de 1 letra e o teto de itens não subiu.
 */

import { prisma } from "@/lib/prisma";
import type {
  BusinessKnowledgeAdapter,
  BusinessKnowledgeSnapshot,
  KnowledgeSnapshotOptions,
} from "./BusinessKnowledgeContract";
import { rankByEmbedding } from "./KnowledgeEmbeddingService";
import { avisosDoEstadoDaLoja, calcularEstadoDaLoja } from "./EstadoDaLoja";

// Token budget caps — keep the snapshot prompt-sized.
const MAX_MENU_ITEMS = 120;
/**
 * Quantos itens são LIDOS para depois ranquear por relevância. Maior que o teto
 * de propósito: sem pool, "vocês tem rodízio?" continuaria caindo nos 120
 * primeiros por `sortOrder` e o rodízio de novo ficaria de fora. O custo é de
 * banco (uma query já existente), não de prompt.
 */
const MENU_FETCH_POOL = 400;
/**
 * Teto de itens SÓ-SALÃO garantidos na ficha, custe o que custar ao ranking.
 * São os mais raros do cadastro e os que mais custaram: espremidos para fora
 * pelo teto, a ficha volta a ser o recorte do delivery. Mesmo número da leitura
 * equivalente do Garçom (`AIOrderService.loadDineInOnlyItems`, take: 30).
 */
const MAX_DINE_IN_ONLY = 30;
const MAX_KNOWLEDGE_ITEMS = 30;
const KNOWLEDGE_FETCH_POOL = 200; // fetched for query-relevance ranking
const MAX_PROMOTIONS = 10;
const MAX_ANSWER_CHARS = 240;

const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

function money(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ── Query-relevant retrieval (embeddings v2 quando há OPENAI_API_KEY; keyword v1 como fallback) ──
interface KnowledgeRow {
  id?: string;
  category: string;
  title: string;
  answer: string;
  questionPatterns: unknown;
  embedding?: unknown; // number[] persistido (Json) ou null
  embeddingModel?: string | null;
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokensOf(s: string): Set<string> {
  return new Set(normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
}

/**
 * Sem queryHint: top-N por uso (comportamento estável). Com queryHint: os itens
 * que batem com a pergunta REAL do cliente sobem — mesmo os raramente usados.
 * É isto que garante que "vocês têm rodízio?" encontra o RODIZIO_INFO curado.
 */
function selectRelevantKnowledge(rows: KnowledgeRow[], queryHint?: string): KnowledgeRow[] {
  if (!queryHint) return rows.slice(0, MAX_KNOWLEDGE_ITEMS);
  const query = tokensOf(queryHint);
  if (!query.size) return rows.slice(0, MAX_KNOWLEDGE_ITEMS);

  const scored = rows.map((row, order) => {
    const patterns = Array.isArray(row.questionPatterns) ? (row.questionPatterns as string[]).join(" ") : "";
    const haystack = tokensOf(`${row.title} ${patterns}`);
    let score = 0;
    for (const t of query) if (haystack.has(t)) score += 1;
    return { row, order, score };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, MAX_KNOWLEDGE_ITEMS).map((s) => s.row);
}

/**
 * Retrieval v2: com queryHint E OPENAI_API_KEY, tenta similaridade de embedding
 * (backfill lazy dos vetores). null/vazio (erro de API, mock ausente em teste,
 * chave inválida) → cai no keyword acima EXATAMENTE como antes. Sem queryHint
 * ou sem chave: nem tenta — comportamento atual intacto.
 */
async function selectKnowledgeForQuery(rows: KnowledgeRow[], queryHint?: string): Promise<KnowledgeRow[]> {
  if (queryHint && process.env.OPENAI_API_KEY && rows.length) {
    const ranked = await rankByEmbedding(queryHint, rows).catch(() => null);
    if (ranked && ranked.length) return ranked.slice(0, MAX_KNOWLEDGE_ITEMS);
  }
  return selectRelevantKnowledge(rows, queryHint);
}

// ── Canal: o que pode ser VENDIDO ali × o que pode ser CONTADO ───────────────
//
// `E` = entrega (cardápio do Foocci) · `S` = salão (QR da mesa) · `ES` = os dois.
// Rótulo de uma/duas letras de propósito: `canais: ["entrega","salao"]` custaria
// ~28 caracteres por item × 120 itens de ficha — 10× mais caro pela MESMA
// informação, em toda conversa (guardrail 5).
//
// A visibilidade efetiva é a do item E a da categoria: uma categoria escondida
// do delivery esconde os itens dela, exatamente como a loja monta a tela
// (`src/app/pedido/[slug]/page.tsx:334-340`). Ler só a flag do item faria a
// ficha prometer entrega de um item cuja categoria inteira está fora do canal.

type Canal = "ES" | "E" | "S" | "";

interface FlagsDeCanal {
  showInDelivery?: boolean | null;
  showInDineIn?: boolean | null;
  category?: { showInDelivery?: boolean | null; showInDineIn?: boolean | null } | null;
}

/**
 * As colunas são NOT NULL com default `true` no schema — `undefined` só acontece
 * quando a linha veio de uma fixture que não as declarou. Tratar ausência como
 * `true` aqui é ler o default da coluna, não inferir do silêncio do cadastro.
 */
function canalDoItem(i: FlagsDeCanal): Canal {
  const entrega = (i.showInDelivery ?? true) && (i.category?.showInDelivery ?? true);
  const salao   = (i.showInDineIn   ?? true) && (i.category?.showInDineIn   ?? true);
  return `${entrega ? "E" : ""}${salao ? "S" : ""}` as Canal;
}

interface ItemDeFicha {
  nome: string;
  categoria: string;
  canais: Canal;
  preco?: number;
  precoDelivery?: number;
  precoSalao?: number;
  indisponivel?: true;
}

/**
 * Escolhe QUAIS itens cabem na ficha quando o cardápio é maior que o teto.
 *
 * Duas regras, e a primeira NÃO depende de haver pergunta:
 *
 *  1. **Todo item só-salão entra** (até `MAX_DINE_IN_ONLY`). Esta lista é curta,
 *     é a que o recorte de canal apagava, e ela sumia por um motivo bobo: itens
 *     de salão costumam ficar no fim do `sortOrder`, e o teto cortava pelo fim.
 *     Num cardápio de 180 itens, o RODIZIO PRESENCIAL era o 175º — nunca
 *     entrava. Amarrar a garantia ao `queryHint` deixaria de fora justamente as
 *     chamadas que não passam pergunta (portão de promoção, Oficina).
 *
 *  2. O resto entra **por relevância à pergunta real** quando há `queryHint`, e
 *     pela ordem do cardápio quando não há. Empate desfeito pela ordem — a
 *     mesma pergunta produz sempre a mesma ficha.
 *
 * O teto NÃO muda com a pergunta, de propósito: `queryHint` pode trocar QUAIS
 * itens aparecem, nunca reduzir quantos. Encolher a ficha porque houve pergunta
 * faria um cardápio hoje inteiro na ficha passar a chegar cortado — economia de
 * token comprada com verdade, que é o negócio errado.
 */
function selectRelevantMenu(items: ItemDeFicha[], queryHint?: string): ItemDeFicha[] {
  if (items.length <= MAX_MENU_ITEMS) return items;

  const garantidos = new Set<ItemDeFicha>();
  const demais: ItemDeFicha[] = [];
  for (const item of items) {
    if (item.canais === "S" && garantidos.size < MAX_DINE_IN_ONLY) garantidos.add(item);
    else demais.push(item);
  }

  const restantes = MAX_MENU_ITEMS - garantidos.size;
  if (restantes <= 0) return items.filter((i) => garantidos.has(i)).slice(0, MAX_MENU_ITEMS);

  const query = queryHint ? tokensOf(queryHint) : null;
  const escolhidos = new Set(garantidos);

  if (query?.size) {
    const scored = demais.map((item, order) => {
      const haystack = tokensOf(`${item.nome} ${item.categoria}`);
      let score = 0;
      for (const t of query) if (haystack.has(t)) score += 1;
      return { item, order, score };
    });
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    for (const s of scored.slice(0, restantes)) escolhidos.add(s.item);
  } else {
    for (const item of demais.slice(0, restantes)) escolhidos.add(item);
  }

  // A ordem final volta a ser a do cardápio: a ficha é lida, não é ranking.
  return items.filter((i) => escolhidos.has(i));
}

export const restaurantKnowledgeAdapter: BusinessKnowledgeAdapter = {
  businessType: "RESTAURANT",

  async getSnapshot(businessId: string, opts?: KnowledgeSnapshotOptions): Promise<BusinessKnowledgeSnapshot> {
    const agentId = opts?.agentId ?? "waiter";
    const missingContext: string[] = [];
    const safetyNotes: string[] = [
      "Nunca inventar produto, preço, forma de pagamento ou promoção que não esteja cadastrado.",
      "Snapshot é agregado — nunca contém nome/telefone/endereço de cliente.",
    ];

    const [restaurant, menuItemCount, menuItems, businessHours, promotions, knowledgeItems, materialCount, approvedEvidenceCount, deliveryZones] =
      await Promise.all([
        prisma.restaurant
          .findUnique({
            where: { id: businessId },
            select: {
              name: true,
              address: true,
              // Estado da loja — a mesma verdade que a tarja amarela mostra.
              timezone: true,
              isOrderingPaused: true,
              orderingPausedUntil: true,
              orderingPausedReason: true,
              paymentSettings: { select: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: true } },
              deliveryConfig: {
                select: {
                  enabled: true,
                  pickupEnabled: true,
                  mode: true,
                  fee: true,
                  estimatedMinutes: true,
                  areaDescription: true,
                  minOrderValue: true,
                  freeDeliveryAbove: true,
                  distanceBaseFee: true,
                  distancePricePerKm: true,
                  distanceMaxKm: true,
                  distanceMinFee: true,
                  distanceMaxFee: true,
                  geoRadiusKm: true,
                },
              },
              brandConfig: { select: { tone: true } },
            },
          })
          .catch(() => null),
        prisma.menuItem.count({ where: { category: { restaurantId: businessId } } }).catch(() => 0),
        prisma.menuItem
          .findMany({
            where: { category: { restaurantId: businessId }, isActive: true },
            select: {
              name: true,
              price: true,
              priceDelivery: true,
              priceDineIn: true,
              isAvailable: true,
              // O canal é do item E da categoria — as duas flags, sempre as duas.
              showInDelivery: true,
              showInDineIn: true,
              category: { select: { name: true, showInDelivery: true, showInDineIn: true } },
            },
            orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
            take: MENU_FETCH_POOL,
          })
          .catch(() => [] as Array<{
            name: string;
            price: unknown;
            priceDelivery: unknown;
            priceDineIn: unknown;
            isAvailable: boolean;
            showInDelivery?: boolean | null;
            showInDineIn?: boolean | null;
            category: { name: string; showInDelivery?: boolean | null; showInDineIn?: boolean | null } | null;
          }>),
        prisma.businessHours
          .findMany({
            where: { restaurantId: businessId },
            select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, periodsJson: true },
            orderBy: { dayOfWeek: "asc" },
          })
          .catch(() => [] as Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string; periodsJson: unknown }>),
        prisma.promotion
          .findMany({
            where: { restaurantId: businessId, status: "ACTIVE" },
            select: { name: true, description: true, type: true, discountValue: true, couponCode: true },
            take: MAX_PROMOTIONS,
          })
          .catch(() => [] as Array<{ name: string; description: string | null; type: string; discountValue: unknown; couponCode: string | null }>),
        prisma.restaurantKnowledgeItem
          .findMany({
            where: { restaurantId: businessId, status: "ACTIVE" },
            select: { id: true, category: true, title: true, answer: true, questionPatterns: true, embedding: true, embeddingModel: true },
            orderBy: { usageCount: "desc" },
            take: KNOWLEDGE_FETCH_POOL,
          })
          .catch(() => [] as KnowledgeRow[]),
        prisma.agentLibrarySource.count({ where: { agentSlug: agentId } }).catch(() => 0),
        prisma.waiterResultEvidence.count({ where: { restaurantId: businessId, status: "APPROVED" } }).catch(() => 0),
        prisma.deliveryZone
          .findMany({
            where: { restaurantId: businessId, isActive: true },
            select: { name: true, maxDistanceKm: true, fee: true, estimatedMinutes: true, minOrderValue: true },
            orderBy: { sortOrder: "asc" },
          })
          .catch(() => [] as Array<{ name: string; maxDistanceKm: number; fee: unknown; estimatedMinutes: number; minOrderValue: unknown }>),
      ]);

    if (!restaurant) {
      return {
        businessId,
        businessType: "RESTAURANT",
        truthSources: {},
        missingContext: ["perfil do restaurante", "formas de pagamento", "cardápio", "delivery/retirada"],
        safetyNotes,
        snapshotAsOf: new Date().toISOString(),
        completenessScore: 0,
      };
    }

    const payments = restaurant.paymentSettings
      ? {
          pix: restaurant.paymentSettings.acceptPix,
          cartao: restaurant.paymentSettings.acceptCard,
          dinheiro: restaurant.paymentSettings.acceptCash,
          link: restaurant.paymentSettings.acceptLink,
        }
      : undefined;
    if (!payments) missingContext.push("formas de pagamento");
    // The schema has no meal-voucher (Alelo/VR/Sodexo) configuration; only a curated
    // PAYMENT_INFO knowledge item can answer it — otherwise the agent must not claim it.
    const hasPaymentKnowledge = knowledgeItems.some((k) => k.category === "PAYMENT_INFO");
    if (!hasPaymentKnowledge) missingContext.push("benefício refeição (Alelo/VR/Sodexo) — não cadastrado");

    // ── Products: real names + prices + O CANAL de cada um ─────────────────────
    // O canal é o que separa "pode ir ao carrinho" de "pode ser contado". Sem ele
    // a ficha erra dos dois lados: nega o rodízio que existe, ou promete entregar
    // o que só se serve no salão.
    const todosOsItens: ItemDeFicha[] = menuItems.map((i) => ({
      nome: i.name,
      categoria: i.category?.name ?? "",
      canais: canalDoItem(i),
      preco: money(i.price),
      ...(i.priceDelivery != null ? { precoDelivery: money(i.priceDelivery) } : {}),
      ...(i.priceDineIn != null ? { precoSalao: money(i.priceDineIn) } : {}),
      ...(i.isAvailable ? {} : { indisponivel: true as const }),
    }));

    // Item ativo escondido dos DOIS canais: o lojista o tirou do ar. Ele não é
    // vendível nem contável — fica fora da ficha, mas o número entra em
    // missingContext, porque "não carreguei" e "não existe" são coisas
    // diferentes e a ficha nunca pode confundir as duas.
    const semCanal = todosOsItens.filter((i) => i.canais === "").length;
    const publicados = todosOsItens.filter((i) => i.canais !== "");

    const items = selectRelevantMenu(publicados, opts?.queryHint);
    const soSalao = items.filter((i) => i.canais === "S").length;
    const products: unknown[] = [
      {
        totalItens: menuItemCount,
        listados: items.length,
        legendaCanais: "canais: E=entrega (vai ao carrinho) · S=salão (presencial) · ES=os dois",
        regraDeCanal:
          "Item marcado só com S EXISTE e pode ser contado com preço, mas NUNCA entra em pedido de entrega.",
      },
      ...items,
    ];
    if (menuItemCount > items.length) {
      missingContext.push(`cardápio parcial no contexto (${items.length} de ${menuItemCount} itens) — confirmar antes de negar um item`);
    }
    if (semCanal > 0) {
      missingContext.push(`${semCanal} item(ns) ativo(s) fora dos dois canais — não carregados; não afirmar que não existem`);
    }
    if (items.length === 0) missingContext.push("cardápio");
    if (soSalao === 0 && publicados.length > 0) {
      // Não é falta de dado: é o fato de que esta casa não tem nada só-salão.
      // Registrado aqui para que a ausência da etiqueta "S" na ficha seja lida
      // como cadastro, e não como recorte de canal que comeu a lista de novo.
      safetyNotes.push("Nenhum item marcado como exclusivo de salão neste cadastro.");
    }

    // ── Hours: real weekly schedule + delivery/pickup flags ────────────────────
    const funcionamento: Record<string, string> = {};
    for (const h of businessHours) {
      const day = DAY_NAMES[h.dayOfWeek] ?? String(h.dayOfWeek);
      if (!h.isOpen) {
        funcionamento[day] = "fechado";
      } else if (Array.isArray(h.periodsJson) && h.periodsJson.length) {
        funcionamento[day] = (h.periodsJson as Array<{ open?: string; close?: string }>)
          .map((p) => `${p.open ?? "?"}-${p.close ?? "?"}`)
          .join(", ");
      } else {
        funcionamento[day] = `${h.openTime}-${h.closeTime}`;
      }
    }
    const hours = {
      ...(businessHours.length ? { funcionamento } : {}),
      delivery: restaurant.deliveryConfig?.enabled ?? false,
      retirada: restaurant.deliveryConfig?.pickupEnabled ?? false,
    };
    if (!restaurant.deliveryConfig) missingContext.push("delivery/retirada");
    if (!businessHours.length) missingContext.push("horários de funcionamento detalhados");

    // ── Estado da loja AGORA: aberta? aceita pedido? quando reabre? ────────────
    // O horário semanal acima diz o que está cadastrado; isto diz o que vale
    // NESTE minuto. Sem ele, a ficha respondia "funcionamos das 06 às 20" às
    // 23:49 e o agente seguia pedindo o WhatsApp para fechar pedido.
    //
    // A conta NÃO é feita aqui: `EstadoDaLoja` chama a mesma `business-hours`
    // que a tarja amarela da loja usa. Uma verdade, dois leitores.
    const loja = calcularEstadoDaLoja({
      horarios: businessHours,
      pausa: {
        isOrderingPaused:     restaurant.isOrderingPaused ?? false,
        orderingPausedUntil:  restaurant.orderingPausedUntil ?? null,
        orderingPausedReason: restaurant.orderingPausedReason ?? null,
      },
      timezone: restaurant.timezone ?? "America/Sao_Paulo",
      agora:    new Date(),
    });
    // O aviso só existe quando a loja NÃO aceita pedido. Nota de segurança que
    // aparece em toda conversa é ruído, e ruído treina o agente a ignorar.
    safetyNotes.push(...avisosDoEstadoDaLoja(loja));
    if (!loja.horarioCadastrado) {
      missingContext.push(
        "horário de hoje não cadastrado — o sistema trata a loja como aberta, mas isso não é fato do restaurante",
      );
    }

    // ── Entrega: taxa, área/raio de cobertura e pedido mínimo, nos TRÊS modos
    // (simple/distance/advanced-por-zonas). O lojista pode ter cadastrado em
    // qualquer um; ler só o "simple" fazia o agente dizer "não cadastrado" à toa. ──
    const dc = restaurant.deliveryConfig;
    const zonas = deliveryZones.map((z) => ({
      nome: z.name,
      ateKm: z.maxDistanceKm,
      taxa: money(z.fee),
      ...(z.minOrderValue != null ? { pedidoMinimo: money(z.minOrderValue) } : {}),
      ...(z.estimatedMinutes != null ? { minutos: z.estimatedMinutes } : {}),
    }));
    // Raio de cobertura: distância máxima em qualquer modo (o "vocês entregam em X?").
    const raioMaxKm =
      dc?.distanceMaxKm ??
      dc?.geoRadiusKm ??
      (zonas.length ? Math.max(...zonas.map((z) => z.ateKm)) : null);
    // Descrição da taxa conforme o modo cadastrado.
    let taxa: unknown;
    if (dc?.fee != null) {
      taxa = { valor: money(dc.fee) };
    } else if (dc?.mode === "distance" && (dc.distanceBaseFee != null || dc.distancePricePerKm != null)) {
      taxa = {
        formula: "por distância",
        base: money(dc.distanceBaseFee),
        porKm: money(dc.distancePricePerKm),
        ...(dc.distanceMinFee != null ? { minima: money(dc.distanceMinFee) } : {}),
        ...(dc.distanceMaxFee != null ? { maxima: money(dc.distanceMaxFee) } : {}),
        observacao: "depende da distância do endereço — confirmar pelo CEP",
      };
    } else if (zonas.length) {
      taxa = { porZona: zonas.map((z) => ({ ate: `${z.ateKm}km`, valor: z.taxa })) };
    }
    const pedidoMinimo = dc?.minOrderValue != null ? money(dc.minOrderValue) : undefined;
    const entrega = dc
      ? {
          disponivel: dc.enabled,
          retirada: dc.pickupEnabled,
          modo: dc.mode,
          ...(taxa ? { taxa } : {}),
          ...(raioMaxKm != null ? { raioKm: raioMaxKm } : {}),
          ...(dc.areaDescription ? { area: dc.areaDescription.slice(0, MAX_ANSWER_CHARS) } : {}),
          ...(zonas.length ? { zonas } : {}),
          ...(pedidoMinimo != null ? { pedidoMinimo } : {}),
          ...(dc.freeDeliveryAbove != null ? { freteGratisAcimaDe: money(dc.freeDeliveryAbove) } : {}),
          ...(dc.estimatedMinutes != null ? { minutos: dc.estimatedMinutes } : {}),
        }
      : undefined;
    // Só sinaliza "não cadastrado" se NÃO houver o dado em NENHUM modo — aí o prompt
    // faz o agente pedir o CEP em vez de afirmar. Havendo, ele responde com a verdade.
    if (dc?.enabled && raioMaxKm == null && !dc.areaDescription) {
      missingContext.push("área de cobertura de entrega não cadastrada — confirmar por CEP, nunca afirmar cidade/bairro");
    }
    if (dc?.enabled && !taxa) missingContext.push("taxa de entrega não cadastrada");

    // ── Local: o endereço PRÓPRIO do restaurante (não é PII de cliente) ─────────
    const local = restaurant.address ? { endereco: restaurant.address.slice(0, MAX_ANSWER_CHARS) } : undefined;
    if (!local) missingContext.push("endereço do restaurante não cadastrado");

    // ── Policies: identity + the curated, human-approved Q&A (highest-quality truth).
    // Com queryHint, os itens relevantes à pergunta REAL sobem (embeddings quando
    // configurados; keyword como fallback determinístico).
    const selectedKnowledge = await selectKnowledgeForQuery(knowledgeItems as KnowledgeRow[], opts?.queryHint);
    const policies: unknown[] = [
      { tone: restaurant.brandConfig?.tone ?? "friendly", nome: restaurant.name },
      ...selectedKnowledge.map((k) => ({
        categoria: k.category,
        pergunta: k.title,
        resposta: k.answer.slice(0, MAX_ANSWER_CHARS),
      })),
    ];

    const prices = promotions.length
      ? promotions.map((p) => ({
          promocao: p.name,
          ...(p.description ? { descricao: p.description.slice(0, MAX_ANSWER_CHARS) } : {}),
          tipo: p.type,
          valor: money(p.discountValue),
          ...(p.couponCode ? { cupom: p.couponCode } : {}),
        }))
      : undefined;

    // ── Completeness: quanto da verdade essencial existe (gate de promoção futura) ──
    const signals = [
      Boolean(payments),
      businessHours.length > 0,
      items.length > 0,
      knowledgeItems.length > 0,
      Boolean(restaurant.deliveryConfig),
    ];
    const completenessScore = signals.filter(Boolean).length / signals.length;

    return {
      businessId,
      businessType: "RESTAURANT",
      truthSources: {
        products,
        ...(prices ? { prices } : {}),
        payments,
        hours,
        loja,
        ...(entrega ? { entrega } : {}),
        ...(local ? { local } : {}),
        policies,
        materials: [{ librarySources: materialCount }],
        evidence: [{ approved: approvedEvidenceCount }],
      },
      missingContext,
      safetyNotes,
      snapshotAsOf: new Date().toISOString(),
      completenessScore,
    };
  },
};
