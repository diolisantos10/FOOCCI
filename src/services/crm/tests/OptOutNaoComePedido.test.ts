/**
 * "Cancelar o pedido" NÃO é pedir para sair da lista.
 *
 * ── O defeito que este arquivo tranca ────────────────────────────────────────
 * `detectOptOutIntent` tratava `cancelar` como comando de opt-out sempre que a
 * mensagem tivesse até 3 palavras. Num restaurante isso é o dia a dia do balcão:
 * "quero cancelar", "pode cancelar", "cancelar meu pedido" viravam LGPD opt-out.
 * O cliente saía da base do restaurante (`hasOptedOut`, `crmContactable=false`)
 * e ainda ficava sem resposta naquele turno — sem nunca ter pedido nada disso.
 *
 * ── Por que este teste não vive só na função pura ────────────────────────────
 * Provar que uma função devolve `false` não prova nada para o cliente. O que ele
 * lê é a resposta que chega (ou não chega), e o que o restaurante perde é o
 * cadastro. Por isso a segunda metade do arquivo roda o caminho de verdade —
 * `InboundGuardsService.apply` com o `ContactSafetyService` REAL — e afirma as
 * duas coisas que o cliente sente:
 *
 *   1. `aiMayRespond === true`      → ele continua recebendo resposta;
 *   2. `prisma.customer.update` NÃO chamado → ele continua na base.
 *
 * Nada de WhatsApp é enviado e nenhum banco de verdade é tocado.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConversationType, ConversationStatus } from "@prisma/client";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn() },
  customer:     { findUnique: vi.fn(), update: vi.fn() },
  campaignExecution: { findMany: vi.fn() },
}));
const externos = vi.hoisted(() => ({
  markCrmReplyIfApplicable:  vi.fn(),
  markConversationNeedsHuman: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/business-hours", () => ({ isRestaurantOpenNow: vi.fn(async () => true) }));
vi.mock("@/services/agents/AgentRoutingService", () => ({
  markCrmReplyIfApplicable: externos.markCrmReplyIfApplicable,
}));
vi.mock("@/lib/handoff", () => ({
  markConversationNeedsHuman: externos.markConversationNeedsHuman,
}));

// ⚠️ O ContactSafetyService NÃO é mockado aqui — é ele que está sob teste.
import { detectOptOutIntent, ContactSafetyService } from "@/services/crm/ContactSafetyService";
import { InboundGuardsService } from "@/services/whatsapp/inbound/InboundGuardsService";

// ── A tabela de frases reais de cliente de restaurante ───────────────────────
// Cada linha é uma frase que o CRM já viu (ou veria) chegar, com o veredito que
// ela DEVE ter. As quatro do meio eram falso positivo antes desta correção.
const FRASES: Array<{ frase: string; optOut: boolean; porque: string }> = [
  { frase: "cancelar",              optOut: true,  porque: "comando sozinho — é a mensagem inteira" },
  { frase: "quero cancelar",        optOut: false, porque: "tem outra palavra: é fala, não comando" },
  { frase: "cancelar meu pedido",   optOut: false, porque: "objeto do balcão explícito" },
  { frase: "pode cancelar",         optOut: false, porque: "tem outra palavra: é fala, não comando" },
  { frase: "preciso cancelar pedido", optOut: false, porque: "objeto do balcão explícito" },
  { frase: "quero cancelar o pedido", optOut: false, porque: "objeto do balcão explícito" },
];

describe("detectOptOutIntent — a tabela de frases do restaurante", () => {
  it.each(FRASES)("$frase → optOut=$optOut ($porque)", ({ frase, optOut }) => {
    expect(detectOptOutIntent(frase)).toBe(optOut);
  });
});

describe("detectOptOutIntent — o opt-out de verdade continua valendo", () => {
  // Estes são os comandos que o rodapé da campanha manda usar ("responda SAIR")
  // e os sinônimos inequívocos. Se algum destes parar de funcionar, o conserto
  // do falso positivo virou um furo de LGPD.
  it.each([
    "PARAR",
    "parar",
    "SAIR",
    "sair",
    "STOP",
    "stop",
    "descadastrar",
    "remover",
    "Sair!",
    "parar por favor",
    "nao quero receber",
    "não quero receber mais nada disso aqui",
    "quero sair da lista",
    "podem remover meu número",
    "favor remover meu numero por favor",
    "parar de enviar mensagens",
    "quero cancelar inscricao das mensagens",
  ])("%p continua sendo opt-out", (msg) => {
    expect(detectOptOutIntent(msg)).toBe(true);
  });
});

describe("detectOptOutIntent — na dúvida, NÃO descadastra", () => {
  it.each([
    "quero fazer um pedido",
    "vou sair de casa amanhã para buscar",
    "pode cancelar o item do meu pedido por favor",
    "remover item",           // verbo grudado no objeto do balcão
    "cancelar entrega",
    "parar pedido",
    "obrigado!",
    "",
    null,
    undefined,
  ])("%p NÃO é opt-out", (msg) => {
    expect(detectOptOutIntent(msg as string)).toBe(false);
  });

  /*
    ── BURACO CONHECIDO, dito em voz alta ───────────────────────────────────
    "remover a cebola" (3 tokens, nenhum objeto da lista) ainda vira opt-out.
    O verbo `remover` continua com a regra antiga de ≤3 palavras porque o
    pedido deste conserto era mexer em `cancelar` sem afrouxar nada; fechar
    este buraco exigiria ou pôr `remover` na classe ambígua (e aí "remover
    numero" deixaria de valer) ou listar nomes de ingrediente, que é infinito.
    Fica registrado como dívida, não como comportamento desejado.
  */
});

// ── O que o cliente de verdade LÊ ────────────────────────────────────────────

const CONVERSA_LIBERADA = {
  aiEnabled:        true,
  aiLocked:         false,
  conversationType: ConversationType.CUSTOMER,
  status:           ConversationStatus.OPEN,
  contextType:      "INBOUND",
};

const ENTRADA = {
  conversationId: "conv-1",
  restaurantId:   "rest-1",
  customerId:     "cli-1",
  messageText:    "",
  isTextMessage:  true,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findUnique.mockResolvedValue(CONVERSA_LIBERADA);
  db.customer.update.mockResolvedValue({ id: "cli-1" });
  externos.markCrmReplyIfApplicable.mockResolvedValue(undefined);
  externos.markConversationNeedsHuman.mockResolvedValue(true);
});

describe("caminho real — quem quer cancelar o PEDIDO continua atendido e na base", () => {
  const PEDIDO = FRASES.filter((f) => !f.optOut).map((f) => f.frase);

  it.each(PEDIDO)("%p → a IA responde E o cliente não é descadastrado", async (frase) => {
    const r = await InboundGuardsService.apply({ ...ENTRADA, messageText: frase });

    // 1 · Ele continua recebendo resposta.
    expect(r.aiMayRespond).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.optedOutThisTurn).toBe(false);

    // 2 · Ele continua na base do restaurante — nada foi escrito no cadastro.
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it("nenhuma das frases de pedido escreve opt-out no cadastro", async () => {
    for (const frase of PEDIDO) {
      await ContactSafetyService.applyInboundOptOut("rest-1", "cli-1", frase);
    }
    expect(db.customer.update).not.toHaveBeenCalled();
  });
});

describe("caminho real — quem pede silêncio de verdade sai da base e não é respondido", () => {
  it.each(["PARAR", "SAIR", "STOP", "cancelar", "não quero receber mais mensagens"])(
    "%p → opt-out gravado e a IA NÃO responde",
    async (frase) => {
      const r = await InboundGuardsService.apply({ ...ENTRADA, messageText: frase });

      expect(r.optedOutThisTurn).toBe(true);
      expect(r.aiMayRespond).toBe(false);
      expect(r.reason).toBe("OPT_OUT_NESTE_TURNO");

      expect(db.customer.update).toHaveBeenCalledWith({
        where: { id: "cli-1" },
        data: expect.objectContaining({
          hasOptedOut:    true,
          crmContactable: false,
          contactStatus:  "OPT_OUT",
        }),
      });
    },
  );
});
