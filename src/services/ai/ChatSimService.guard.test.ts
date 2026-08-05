/**
 * O PORTÃO DA SIMULAÇÃO — testes de regressão do P0 de 05/08/2026.
 *
 * A varredura de multi-inquilino encontrou uma rota de FERRAMENTA DE TESTE que
 * apagava cliente e histórico de pedidos REAIS por `customerId` cru: sem escopo de
 * restaurante, sem conferir cargo, sem conferir se o cliente era de simulação.
 *
 * Os testes abaixo são escritos do lado do ATACANTE, e é de propósito: cada um
 * descreve uma chamada que ANTES funcionava. Se algum deles ficar verde de graça
 * (porque alguém trocou a assinatura da função, por exemplo), o teste some junto
 * com a prova — por isso o último caso confere que o caminho legítimo AINDA apaga.
 * Portão que só sabe reprovar não é portão, é parede.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const conversationFindFirst = vi.fn();
const customerFindFirst = vi.fn();
const orderDeleteMany = vi.fn();
const orderDraftFindMany = vi.fn();
const orderDraftItemDeleteMany = vi.fn();
const orderDraftDeleteMany = vi.fn();
const conversationDeleteMany = vi.fn();
const customerDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: (...a: unknown[]) => conversationFindFirst(...a),
      deleteMany: (...a: unknown[]) => conversationDeleteMany(...a),
    },
    customer: {
      findFirst: (...a: unknown[]) => customerFindFirst(...a),
      deleteMany: (...a: unknown[]) => customerDeleteMany(...a),
    },
    order: { deleteMany: (...a: unknown[]) => orderDeleteMany(...a) },
    orderDraft: {
      findMany: (...a: unknown[]) => orderDraftFindMany(...a),
      deleteMany: (...a: unknown[]) => orderDraftDeleteMany(...a),
    },
    orderDraftItem: { deleteMany: (...a: unknown[]) => orderDraftItemDeleteMany(...a) },
  },
}));

import { ChatSimService, CHATSIM_NAME_PREFIX } from "./ChatSimService";

const DONO = "rest_A";
const VIZINHO = "rest_B";

/** Cliente de simulação legítimo do restaurante que está pedindo. */
function sessaoLegitima() {
  conversationFindFirst.mockResolvedValue({ id: "conv_1", customerId: "cust_1" });
  customerFindFirst.mockResolvedValue({ id: "cust_1", name: `${CHATSIM_NAME_PREFIX} 14:02:31` });
  orderDraftFindMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  orderDraftFindMany.mockResolvedValue([]);
});

describe("ChatSimService.checkSession — o portão", () => {
  it("RECUSA cliente de verdade: era exatamente assim que o P0 apagava gente real", async () => {
    // O `where` da consulta leva o restaurantId, então o vizinho nem aparece; mas o
    // caso decisivo é ESTE: cliente do PRÓPRIO restaurante, sem a marca de simulação.
    conversationFindFirst.mockResolvedValue({ id: "conv_1", customerId: "cust_real" });
    customerFindFirst.mockResolvedValue({ id: "cust_real", name: "Maria Fernanda" });

    const r = await ChatSimService.checkSession({
      restaurantId: DONO, sessionId: "conv_1", customerId: "cust_real",
    });
    expect(r).toBe("NAO_E_SIMULACAO");
  });

  it("RECUSA cliente de outro restaurante (a consulta não o encontra)", async () => {
    // Prisma devolve null porque o `where` casa `{id, restaurantId}` — a prova de
    // que o escopo está no where é o próprio null aqui e a asserção abaixo.
    conversationFindFirst.mockResolvedValue(null);
    customerFindFirst.mockResolvedValue(null);

    const r = await ChatSimService.checkSession({
      restaurantId: VIZINHO, sessionId: "conv_do_A", customerId: "cust_do_A",
    });
    expect(r).toBe("SESSAO_INEXISTENTE");

    // Sem restaurantId no where, um id puro voltaria a alcançar o vizinho.
    expect(conversationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ restaurantId: VIZINHO }) }),
    );
    expect(customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ restaurantId: VIZINHO }) }),
    );
  });

  it("RECUSA sessão de um cliente com o id de outro (o furo de injeção de mensagem)", async () => {
    // Conversa real do restaurante + customerId de um [CHATSIM] do mesmo restaurante:
    // ambos existem e ambos são dele. O que barra é o par não bater.
    conversationFindFirst.mockResolvedValue({ id: "conv_real", customerId: "cust_real" });
    customerFindFirst.mockResolvedValue({ id: "cust_sim", name: `${CHATSIM_NAME_PREFIX} 09:10:11` });

    const r = await ChatSimService.checkSession({
      restaurantId: DONO, sessionId: "conv_real", customerId: "cust_sim",
    });
    expect(r).toBe("SESSAO_INEXISTENTE");
  });

  it("APROVA a sessão de simulação legítima", async () => {
    sessaoLegitima();
    const r = await ChatSimService.checkSession({
      restaurantId: DONO, sessionId: "conv_1", customerId: "cust_1",
    });
    expect(r).toBeNull();
  });
});

describe("ChatSimService.deleteSession — a trava onde o dano acontece", () => {
  it("NÃO apaga nada quando o portão recusa", async () => {
    conversationFindFirst.mockResolvedValue({ id: "conv_1", customerId: "cust_real" });
    customerFindFirst.mockResolvedValue({ id: "cust_real", name: "João da Silva" });

    const r = await ChatSimService.deleteSession({
      restaurantId: DONO, sessionId: "conv_1", customerId: "cust_real",
    });

    expect(r).toEqual({ deleted: false, reason: "NAO_E_SIMULACAO" });
    // A asserção que importa: o histórico de pedidos do cliente continua de pé.
    expect(orderDeleteMany).not.toHaveBeenCalled();
    expect(customerDeleteMany).not.toHaveBeenCalled();
    expect(conversationDeleteMany).not.toHaveBeenCalled();
  });

  it("apaga a sessão legítima — e TODO where carrega o restaurantId", async () => {
    sessaoLegitima();

    const r = await ChatSimService.deleteSession({
      restaurantId: DONO, sessionId: "conv_1", customerId: "cust_1",
    });
    expect(r).toEqual({ deleted: true, reason: null });

    for (const fn of [orderDeleteMany, conversationDeleteMany, customerDeleteMany]) {
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ restaurantId: DONO }) }),
      );
    }
  });
});
