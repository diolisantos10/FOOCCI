/**
 * PROVA DE PONTA A PONTA — um pedido entrando por TEXTO pelo caminho OFICIAL.
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 * A saída da Evolution (decidida em 02/08/2026) tinha seis capacidades a portar.
 * A sexta e maior era o **pedido por texto**: ela muda QUAL agente responde, não
 * só se ele pode. O código foi portado em 04/08 (`InboundAgentDispatch`), e cada
 * peça tem teste de unidade — mas **nenhum teste ligava as peças**: o despacho
 * era provado com o motor mockado, e o webhook só tinha prova do handshake GET.
 *
 * Prova por peça não é prova de caminho. O defeito clássico desta migração — o
 * webhook da Meta dizendo no comentário que alimentava "o mesmo pipeline" e não
 * alimentando — passaria por todos os testes de unidade existentes. Este arquivo
 * é a prova que faltava: **entra um POST assinado da Meta, sai uma resposta de
 * pedido no WhatsApp do cliente.**
 *
 * ── O que roda DE VERDADE aqui ───────────────────────────────────────────────
 *   • a rota `POST /api/webhooks/meta/whatsapp` (assinatura HMAC inclusive);
 *   • `normalizeMetaWebhook` — o payload real da Meta;
 *   • a persistência da entrada e a dedupe por `wamid`;
 *   • `InboundGuardsService` — as quatro guardas de entrada;
 *   • `InboundAgentDispatch` — a escolha do agente;
 *   • `getMessageAwareRoutingDecision` — config do banco, allowlist, intenção;
 *   • `handleInboundForOrdering` — as três guardas do motor, sessão, modo.
 *
 * ── O que está dublado, e por quê (dito sem maquiagem) ───────────────────────
 *   • `processCustomerMessage` — o miolo do motor exige cardápio, preço e
 *     entrega de um restaurante real; ele já tem suíte própria;
 *   • `sendWhatsAppText` — é a chamada de rede à Meta;
 *   • o banco é um Prisma de mentira em memória (não há Postgres no CI).
 *
 * Ou seja: isto prova **o caminho**, ponta a ponta, não a qualidade da resposta
 * do motor. Um pedido de verdade em loja de verdade continua sendo outra prova,
 * e ela ainda não foi feita — está dito em `docs/pendencias.md`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const APP_SECRET = "app-secret-de-teste";
const PHONE_NUMBER_ID = "phone-number-id-1";
const RESTAURANT = "rest-1";
const CUSTOMER_PHONE = "5511988887777";

// ── Prisma de mentira, em memória ───────────────────────────────────────────
const state = vi.hoisted(() => ({
  messages: [] as Record<string, unknown>[],
  sessions: [] as Record<string, unknown>[],
  conversation: {
    id: "conv-1",
    customerId: "cust-1",
    aiEnabled: true,
    aiLocked: false,
    conversationType: "CUSTOMER",
    status: "OPEN",
    contextType: "INBOUND",
  } as Record<string, unknown>,
  textOrderingConfig: null as Record<string, unknown> | null,
}));

const db = vi.hoisted(() => {
  const self: Record<string, unknown> = {
    $queryRaw: vi.fn(),
    message: {
      findUnique: vi.fn(async ({ where }: { where: { externalMessageId: string } }) =>
        state.messages.find((m) => m.externalMessageId === where.externalMessageId) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.messages.push(data);
        return { id: `msg-${state.messages.length}`, ...data };
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    conversation: {
      findFirst: vi.fn(async () => state.conversation),
      findUnique: vi.fn(async () => state.conversation),
      update: vi.fn(async () => state.conversation),
      create: vi.fn(async () => state.conversation),
    },
    customer: {
      upsert: vi.fn(async () => ({ id: "cust-1", name: "Cliente", phone: CUSTOMER_PHONE })),
      findFirst: vi.fn(async () => ({ id: "cust-1", name: "Cliente", phone: CUSTOMER_PHONE })),
    },
    whatsAppTextOrderingConfig: {
      findUnique: vi.fn(async () => state.textOrderingConfig),
    },
    whatsAppAgentConfig: {
      findUnique: vi.fn(async () => ({ agentMode: "RECEPTIONIST_ONLY" })),
    },
    whatsAppOrderingSession: {
      findFirst: vi.fn(async () => state.sessions.find((s) => s.status === "ACTIVE") ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        state.sessions.find((s) => s.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `sess-${state.sessions.length + 1}`, selectedItems: [], unresolvedItems: [], missingQuestions: [], metadata: null, ...data };
        state.sessions.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.sessions.find((s) => s.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    restaurant: { findUnique: vi.fn(async () => ({ id: RESTAURANT, timezone: null })) },
    businessHours: { findUnique: vi.fn(async () => null) },
    // `$transaction` aceita as duas formas que o código usa: callback e array.
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(self) : Promise.all(arg as Promise<unknown>[])),
  };
  return self;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// Credenciais do app (assinatura do webhook).
vi.mock("@/services/meta/MetaAppCredentialsService", () => ({
  MetaAppCredentialsService: {
    getResolved: async () => ({ appSecret: APP_SECRET, webhookVerifyToken: "vt" }),
  },
}));

// phone_number_id → restaurante.
vi.mock("@/services/whatsapp/MetaConfigService", () => ({
  MetaConfigService: {
    getByPhoneNumberId: async (id: string) => (id === PHONE_NUMBER_ID ? { restaurantId: RESTAURANT } : null),
  },
}));

// Canais dedicados desligados — este é um número de restaurante.
vi.mock("@/services/support/SupportWhatsAppService", () => ({
  isSupportPhoneNumberId: () => false,
  handleInboundSupport: vi.fn(),
}));
vi.mock("@/services/buildos/BuildOsMetaChannel", () => ({ isBuildOsPhoneNumberId: () => false }));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({ isInternalCommandText: () => false }));
vi.mock("@/services/buildos/BuildOSConfigService", () => ({
  resolveBuildOsChannel: async () => ({ isBuildOsChannel: false, masterConfigured: false }),
}));

// Guardas de entrada: colaboradores externos dublados, a LÓGICA é a real.
vi.mock("@/services/crm/ContactSafetyService", () => ({
  ContactSafetyService: { applyInboundOptOut: vi.fn(async () => false) },
}));
vi.mock("@/services/agents/AgentRoutingService", () => ({ markCrmReplyIfApplicable: vi.fn(async () => {}) }));
vi.mock("@/lib/handoff", () => ({ markConversationNeedsHuman: vi.fn(async () => {}) }));

// O miolo do motor e a rede — os dois únicos dublados no caminho quente.
const engine = vi.hoisted(() => ({ processCustomerMessage: vi.fn() }));
vi.mock("@/services/whatsapp/ordering/WhatsAppTextOrderService", () => engine);

const provider = vi.hoisted(() => ({ sendWhatsAppText: vi.fn() }));
vi.mock("@/services/whatsapp/activeProvider", () => provider);

// Os agentes do host: se algum for chamado, o pedido por texto NÃO atendeu.
const host = vi.hoisted(() => ({ brain: vi.fn(), receptionist: vi.fn(), aiOrder: vi.fn() }));
vi.mock("@/services/whatsapp/brain/WhatsAppBrainRuntimeService", () => ({
  WhatsAppBrainRuntimeService: { respond: host.brain },
  isWhatsAppBrainEnabled: () => true,
}));
vi.mock("@/services/ai/WhatsAppReceptionistService", () => ({
  WhatsAppReceptionistService: { respond: host.receptionist },
}));
vi.mock("@/services/ai/AIOrderService", () => ({ AIOrderService: { processTurn: host.aiOrder } }));

import { POST } from "./route";

/**
 * Os agentes do host são acionados por `import()` dinâmico e fire-and-forget —
 * de propósito: o webhook não espera o agente responder, senão a Meta estoura o
 * tempo. Por isso o teste precisa ceder o event loop antes de conferir quem foi
 * chamado.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Payload real da Meta para uma mensagem de texto de cliente. */
function metaTextPayload(text: string, wamid = "wamid.TESTE1") {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5511999990000", phone_number_id: PHONE_NUMBER_ID },
          contacts: [{ profile: { name: "Cliente" }, wa_id: CUSTOMER_PHONE }],
          messages: [{
            from: CUSTOMER_PHONE,
            id: wamid,
            timestamp: "1755259200",
            type: "text",
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

/** Assina como a Meta assina — a rota rejeita o que não bater. */
function signedRequest(payload: unknown, secret = APP_SECRET): NextRequest {
  const raw = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return new NextRequest("https://foocci.com.br/api/webhooks/meta/whatsapp", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
  });
}

/** O motor devolve uma resposta de pedido plausível. */
function engineReplies(reply: string, stage = "COLLECTING_ITEMS") {
  engine.processCustomerMessage.mockResolvedValue({
    suggestedReply: reply,
    stage,
    intent: "ORDER_REQUEST",
    actions: [],
    handoff: false,
    session: {
      status: "ACTIVE", stage, selectedItems: [], unresolvedItems: [], missingQuestions: [],
      deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null,
      paymentStatus: null, orderId: null, pixPaymentId: null, metadata: null,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.messages = [];
  state.sessions = [];
  state.conversation = {
    id: "conv-1", customerId: "cust-1", aiEnabled: true, aiLocked: false,
    conversationType: "CUSTOMER", status: "OPEN", contextType: "INBOUND",
  };
  // Piloto controlado ligado para este telefone: é assim que ele roda hoje.
  state.textOrderingConfig = {
    restaurantId: RESTAURANT,
    enabled: true,
    mode: "ALLOWLIST_REPLY_ONLY",
    scope: "PHONE_ALLOWLIST",
    allowlistedPhones: [CUSTOMER_PHONE],
    paused: false,
    notes: null,
    updatedAt: new Date(),
  };
  provider.sendWhatsAppText.mockResolvedValue({ ok: true, provider: "META_CLOUD_API", providerMessageId: "wamid.OUT1" });
  // O despacho encadeia `.catch()` na chamada do agente — devolver undefined
  // faria o teste passar por um TypeError, e não pelo caminho real.
  host.brain.mockResolvedValue({ status: "REPLIED" });
  host.receptionist.mockResolvedValue({ status: "REPLIED" });
  host.aiOrder.mockResolvedValue(undefined);
  engineReplies("Anotei: 1 Yakisoba. É entrega ou retirada?");
  delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
  delete process.env.WHATSAPP_TEXT_ORDERING_PAUSED;
});

describe("PONTA A PONTA — o pedido por texto entra pelo webhook oficial da Meta", () => {
  it("cliente pede por texto → o motor de pedido atende e a resposta SAI pela Meta", async () => {
    const res = await POST(signedRequest(metaTextPayload("quero 1 yakisoba")));
    expect(res.status).toBe(200);

    // 1 · o motor foi acionado com o texto do cliente, no restaurante certo
    expect(engine.processCustomerMessage).toHaveBeenCalledTimes(1);
    expect(engine.processCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: RESTAURANT,
        phone: CUSTOMER_PHONE,
        messageText: "quero 1 yakisoba",
        conversationId: "conv-1",
      }),
    );

    // 2 · a resposta saiu de verdade pelo canal oficial
    expect(provider.sendWhatsAppText).toHaveBeenCalledWith(
      RESTAURANT, CUSTOMER_PHONE, "Anotei: 1 Yakisoba. É entrega ou retirada?",
    );

    // 3 · a conversa guarda as duas pontas: a entrada do cliente e a saída do agente
    const inbound  = state.messages.find((m) => m.direction === "INBOUND");
    const outbound = state.messages.find((m) => m.direction === "OUTBOUND");
    expect(inbound?.content).toBe("quero 1 yakisoba");
    expect(outbound?.content).toBe("Anotei: 1 Yakisoba. É entrega ou retirada?");
    expect((outbound?.metadata as { source?: string })?.source).toBe("PEDIDO_TEXTO");

    // 4 · e o host NÃO respondeu junto — duas respostas ao mesmo cliente é o
    //     defeito clássico deste roteamento. O `flush` é obrigatório: sem ceder
    //     o event loop, o teste "provaria" o silêncio só por terminar antes.
    await flush();
    expect(host.brain).not.toHaveBeenCalled();
    expect(host.receptionist).not.toHaveBeenCalled();
  });

  it("a sessão de pedido nasce e sobrevive ao turno (é ela que segura a comanda)", async () => {
    await POST(signedRequest(metaTextPayload("quero 2 cocas")));

    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({ restaurantId: RESTAURANT, phone: CUSTOMER_PHONE, source: "webhook" });
  });

  it("segunda mensagem do mesmo cliente continua a MESMA sessão, não abre outra", async () => {
    await POST(signedRequest(metaTextPayload("quero 1 yakisoba", "wamid.A")));
    engineReplies("Entrega. Qual o endereço?", "COLLECTING_ADDRESS");
    await POST(signedRequest(metaTextPayload("entrega", "wamid.B")));

    expect(state.sessions).toHaveLength(1);
    expect(engine.processCustomerMessage).toHaveBeenCalledTimes(2);
  });
});

describe("as metades que provam que a trava é trava", () => {
  it("telefone FORA da lista liberada: o motor não é chamado e o host responde", async () => {
    state.textOrderingConfig = { ...state.textOrderingConfig!, allowlistedPhones: ["5511000000000"] };

    await POST(signedRequest(metaTextPayload("quero 1 yakisoba")));
    await flush();

    expect(engine.processCustomerMessage).not.toHaveBeenCalled();
    expect(host.brain).toHaveBeenCalledTimes(1); // o cliente NÃO fica mudo
  });

  it("modo DRY_RUN_ONLY observa em silêncio: nada é enviado ao cliente pelo motor", async () => {
    state.textOrderingConfig = { ...state.textOrderingConfig!, mode: "DRY_RUN_ONLY" };

    await POST(signedRequest(metaTextPayload("quero 1 yakisoba")));
    await flush();

    expect(provider.sendWhatsAppText).not.toHaveBeenCalled();
    expect(host.brain).toHaveBeenCalledTimes(1); // e o host assume o turno
  });

  it("conversa entregue a humano: nem o motor nem o host respondem", async () => {
    state.conversation = { ...state.conversation, aiEnabled: false, status: "HUMANO_ASSUMIU" };

    await POST(signedRequest(metaTextPayload("quero 1 yakisoba")));
    await flush();

    expect(engine.processCustomerMessage).not.toHaveBeenCalled();
    expect(host.brain).not.toHaveBeenCalled();
  });

  it("mensagem repetida (mesmo wamid) não vira segundo pedido", async () => {
    await POST(signedRequest(metaTextPayload("quero 1 yakisoba", "wamid.MESMO")));
    await POST(signedRequest(metaTextPayload("quero 1 yakisoba", "wamid.MESMO")));

    expect(engine.processCustomerMessage).toHaveBeenCalledTimes(1);
  });

  it("webhook com assinatura errada é rejeitado antes de tocar em qualquer coisa", async () => {
    const res = await POST(signedRequest(metaTextPayload("quero 1 yakisoba"), "segredo-errado"));

    expect(res.status).toBe(401);
    expect(engine.processCustomerMessage).not.toHaveBeenCalled();
    expect(state.messages).toHaveLength(0);
  });

  it("kill switch global desliga o pedido por texto sem calar o cliente", async () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED = "false";

    await POST(signedRequest(metaTextPayload("quero 1 yakisoba")));
    await flush();

    expect(engine.processCustomerMessage).not.toHaveBeenCalled();
    expect(host.brain).toHaveBeenCalledTimes(1);
  });
});
