/**
 * A escada do agente saiu do painel do lojista.
 *
 * Dois riscos reais nessa mudança, e os dois estão travados aqui:
 *
 * 1. VAZAMENTO — o admin passou a poder declarar de quem é o restaurante. Se
 *    essa porta valesse também para o lojista, um dono de restaurante veria (e
 *    mexeria) no CRM do vizinho. O tenant tem que ganhar SEMPRE.
 *
 * 2. RUÍDO — a lista de campanhas vinha crua e ficava impossível de operar.
 *    Se o filtro escorregar, ou volta o entulho, ou some campanha de verdade.
 */

import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/tenant", () => ({
  getTenantContext: (req: { __tenant?: string }) =>
    req.__tenant ? { restaurantId: req.__tenant, userId: "u1", role: "OWNER" } : null,
}));
vi.mock("@/lib/admin-auth", () => ({
  checkAdminRequest: (req: { __admin?: boolean }) => req.__admin === true,
}));

import { resolverEscopoDoAgente } from "@/lib/agent-admin-scope";
import { ehRuidoNaEscada, filtrarParaEscada } from "../crmAgentLadderNoise";

const req = (o: { __tenant?: string; __admin?: boolean }) => o as unknown as NextRequest;

describe("quem pode olhar o agente de qual restaurante", () => {
  it("lojista vê a própria casa", () => {
    expect(resolverEscopoDoAgente(req({ __tenant: "rest_1" }))).toEqual({
      restaurantId: "rest_1", viaAdmin: false,
    });
  });

  it("lojista NÃO escapa declarando outro restaurante — o tenant ganha", () => {
    const escopo = resolverEscopoDoAgente(req({ __tenant: "rest_1" }), "rest_do_vizinho");
    expect(escopo?.restaurantId).toBe("rest_1");
    expect(escopo?.viaAdmin).toBe(false);
  });

  it("admin escolhe o restaurante", () => {
    expect(resolverEscopoDoAgente(req({ __admin: true }), "rest_9")).toEqual({
      restaurantId: "rest_9", viaAdmin: true,
    });
  });

  it("admin sem declarar restaurante não passa", () => {
    expect(resolverEscopoDoAgente(req({ __admin: true }))).toBeNull();
    expect(resolverEscopoDoAgente(req({ __admin: true }), "   ")).toBeNull();
  });

  it("quem não é nem tenant nem admin não passa, mesmo declarando", () => {
    expect(resolverEscopoDoAgente(req({}), "rest_9")).toBeNull();
  });
});

describe("o ruído que sumiu da escada", () => {
  it("registro auto: do motor de automações fica de fora", () => {
    expect(ehRuidoNaEscada({ templateId: "auto:BIRTHDAY", status: "ACTIVE" })).toBe(true);
  });

  it("campanha já encerrada fica de fora — interruptor nela não liga nada", () => {
    for (const status of ["SENT", "COMPLETED", "CANCELLED"]) {
      expect(ehRuidoNaEscada({ templateId: "recuperar-frios", status })).toBe(true);
    }
  });

  it("campanha que ainda pode disparar FICA", () => {
    for (const status of ["DRAFT", "SCHEDULED", "ACTIVE", "SENDING", "PAUSED"]) {
      expect(ehRuidoNaEscada({ templateId: "recuperar-frios", status })).toBe(false);
    }
  });

  it("campanha sem template não é confundida com auto:", () => {
    expect(ehRuidoNaEscada({ templateId: null, status: "ACTIVE" })).toBe(false);
  });

  it("o filtro conta quantas escondeu — para o admin não achar que sumiram", () => {
    const { vivas, ocultas } = filtrarParaEscada([
      { id: "a", templateId: "auto:BIRTHDAY",  status: "ACTIVE" },
      { id: "b", templateId: "recuperar-frios", status: "SENT"   },
      { id: "c", templateId: "recuperar-frios", status: "ACTIVE" },
      { id: "d", templateId: null,              status: "DRAFT"  },
    ]);
    expect(vivas.map((v) => v.id)).toEqual(["c", "d"]);
    expect(ocultas).toBe(2);
  });
});
