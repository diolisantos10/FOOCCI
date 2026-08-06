/**
 * OS PORTÕES DA PURGA — o que tem que RECUSAR.
 *
 * Um teste de exclusão que só prova que ela funciona não prova nada de importante.
 * O que precisa estar provado aqui é o contrário: que ela se recusa a acontecer
 * quando falta alguma condição. Todos os portões falham FECHADO.
 *
 * As recusas testadas aqui acontecem ANTES de qualquer escrita no banco — é por
 * isso que o `prisma` mockado abaixo nem precisa de `$executeRawUnsafe` para a
 * maioria dos casos. Se algum dia um destes testes começar a precisar de mais
 * mock, é sinal de que um portão se moveu para depois de uma escrita.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const findUnique = vi.fn();
const queryRaw = vi.fn();
const queryRawUnsafe = vi.fn();
const executeRawUnsafe = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    restaurant: { findUnique: (...a: unknown[]) => findUnique(...a) },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    $queryRawUnsafe: (...a: unknown[]) => queryRawUnsafe(...a),
    $executeRawUnsafe: (...a: unknown[]) => executeRawUnsafe(...a),
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

import {
  ehProtegido,
  assertNaoProtegido,
  executarPurga,
  purgaHabilitada,
  levantarInventario,
  PurgaBloqueadaError,
} from "./RestaurantPurgeService";

const pedidoValido = {
  slug: "pizzaria-testando",
  confirmarSlug: "pizzaria-testando",
  sha256DoBackup: "abc123",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PURGA_RESTAURANTE_HABILITADA = "sim";
});

// ═════════════════════════════════════════════════════════════════════════════

describe("a trava dos dois protegidos", () => {
  it.each(["foocci-bakery", "sushi-cazza"])("(1) reconhece %s como protegido", (slug) => {
    expect(ehProtegido(slug)).toBe(true);
  });

  it("(2) a proteção falha para o lado de PROTEGER — variação de caixa e espaço também barra", () => {
    // Nenhuma destas formas é slug válido no banco. Elas barram mesmo assim porque
    // uma proteção que só reconhece a grafia exata é uma proteção que se contorna
    // por digitação.
    expect(ehProtegido("Foocci-Bakery")).toBe(true);
    expect(ehProtegido("  SUSHI-CAZZA  ")).toBe(true);
  });

  it("(3) não protege quem não está na lista", () => {
    expect(ehProtegido("pizzaria-testando")).toBe(false);
    expect(ehProtegido("")).toBe(false);
  });

  it("(4) assertNaoProtegido recusa com motivo e evidência", () => {
    try {
      assertNaoProtegido("sushi-cazza");
      throw new Error("deveria ter recusado");
    } catch (e) {
      expect(e).toBeInstanceOf(PurgaBloqueadaError);
      expect((e as PurgaBloqueadaError).motivo).toBe("SLUG_PROTEGIDO");
      expect((e as PurgaBloqueadaError).evidencia.protegidos).toEqual(["foocci-bakery", "sushi-cazza"]);
    }
  });

  it.each(["foocci-bakery", "sushi-cazza"])(
    "(5) executarPurga NUNCA apaga %s — e não chega a tocar no banco",
    async (slug) => {
      await expect(
        executarPurga({ slug, confirmarSlug: slug, sha256DoBackup: "qualquer" }),
      ).rejects.toMatchObject({ motivo: "SLUG_PROTEGIDO" });

      expect(executeRawUnsafe).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it("(6) protegido na CONFIRMAÇÃO também barra — nada de apagar A confirmando B", async () => {
    await expect(
      executarPurga({ slug: "pizzaria-testando", confirmarSlug: "sushi-cazza", sha256DoBackup: "x" }),
    ).rejects.toMatchObject({ motivo: "SLUG_PROTEGIDO" });
    expect(transaction).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("interruptor de ambiente", () => {
  it("(7) sem PURGA_RESTAURANTE_HABILITADA='sim', nada é apagado", async () => {
    delete process.env.PURGA_RESTAURANTE_HABILITADA;
    expect(purgaHabilitada()).toBe(false);

    await expect(executarPurga(pedidoValido)).rejects.toMatchObject({ motivo: "PURGA_DESLIGADA" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("(8) qualquer valor que não seja exatamente 'sim' mantém desligado", () => {
    for (const v of ["SIM", "true", "1", "yes", ""]) {
      process.env.PURGA_RESTAURANTE_HABILITADA = v;
      expect(purgaHabilitada()).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("confirmação por slug, um por vez", () => {
  it("(9) confirmação diferente recusa", async () => {
    await expect(
      executarPurga({ ...pedidoValido, confirmarSlug: "pizzaria-testand" }),
    ).rejects.toMatchObject({ motivo: "CONFIRMACAO_NAO_CONFERE" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("(10) confirmação vazia recusa — o silêncio nunca vale como 'sim'", async () => {
    await expect(executarPurga({ ...pedidoValido, confirmarSlug: "" })).rejects.toMatchObject({
      motivo: "CONFIRMACAO_NAO_CONFERE",
    });
  });
});

describe("a rede é obrigatória", () => {
  it("(11) sem sha256 do backup, recusa antes de olhar o banco", async () => {
    await expect(executarPurga({ ...pedidoValido, sha256DoBackup: "" })).rejects.toMatchObject({
      motivo: "SEM_REDE",
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("inventário — o que pode e o que não pode sair no relatório", () => {
  it("(12) a projeção não carrega nenhum dado pessoal", async () => {
    queryRaw.mockResolvedValue([
      {
        slug: "pizzaria-testando",
        name: "Pizzaria Testando",
        isActive: true,
        isDemo: false,
        plan: "STARTER",
        createdAt: new Date("2026-05-01T10:00:00Z"),
        ultimoPedidoEm: null,
        clientes: 8613n,
        clientesComTelefone: 4440n,
        clientesAlcancaveis: 4440n,
        pedidos: 0n,
        pedidos90d: 0n,
        conversas: 12n,
        campanhas: 0n,
        categoriasCardapio: 3n,
        whatsappStatus: null,
        notasFiscais: 0n,
        assinaturas: 0n,
        assinaturasVivas: 0n,
      },
    ]);

    const [linha] = await levantarInventario();

    // Lista fechada: o que não está aqui não sai. O log da ferramenta é público.
    expect(Object.keys(linha).sort()).toEqual(
      [
        "assinaturas",
        "assinaturasVivas",
        "ativo",
        "campanhas",
        "categoriasCardapio",
        "clientes",
        "clientesAlcancaveis",
        "clientesComTelefone",
        "conversas",
        "criadoEm",
        "demo",
        "nome",
        "notasFiscais",
        "pedidos",
        "pedidos90d",
        "plano",
        "slug",
        "ultimoPedidoEm",
        "veredito",
        "whatsapp",
      ].sort(),
    );
  });

  it("(13) base grande com ZERO pedido é NUNCA_VIVEU — o veredito olha pedido, não tamanho", async () => {
    queryRaw.mockResolvedValue([
      baseCrua({ clientes: 8613n, clientesComTelefone: 4440n, pedidos: 0n, pedidos90d: 0n, ultimoPedidoEm: null }),
    ]);
    const [l] = await levantarInventario();
    expect(l.veredito).toBe("NUNCA_VIVEU");
    expect(l.clientes).toBe(8613);
    expect(l.ultimoPedidoEm).toBeNull();
  });

  it("(14) pedido antigo é JA_VIVEU; pedido nos 90 dias é VIVO", async () => {
    queryRaw.mockResolvedValue([
      baseCrua({ pedidos: 40n, pedidos90d: 0n, ultimoPedidoEm: new Date("2026-01-10T00:00:00Z") }),
    ]);
    expect((await levantarInventario())[0].veredito).toBe("JA_VIVEU");

    queryRaw.mockResolvedValue([
      baseCrua({ pedidos: 40n, pedidos90d: 7n, ultimoPedidoEm: new Date("2026-08-05T00:00:00Z") }),
    ]);
    expect((await levantarInventario())[0].veredito).toBe("VIVO");
  });

  it("(15) WhatsApp sem configuração vira SEM_CONFIG, nunca 'desconectado'", async () => {
    // Guardrail 1: ausência de linha não prova que o canal está desligado — prova
    // que nunca foi configurado. São estados diferentes e a diferença importa.
    queryRaw.mockResolvedValue([baseCrua({ whatsappStatus: null })]);
    expect((await levantarInventario())[0].whatsapp).toBe("SEM_CONFIG");

    queryRaw.mockResolvedValue([baseCrua({ whatsappStatus: "CONNECTED" })]);
    expect((await levantarInventario())[0].whatsapp).toBe("CONNECTED");
  });
});

function baseCrua(over: Record<string, unknown> = {}) {
  return {
    slug: "x",
    name: "X",
    isActive: true,
    isDemo: false,
    plan: "STARTER",
    createdAt: new Date("2026-05-01T10:00:00Z"),
    ultimoPedidoEm: null,
    clientes: 0n,
    clientesComTelefone: 0n,
    clientesAlcancaveis: 0n,
    pedidos: 0n,
    pedidos90d: 0n,
    conversas: 0n,
    campanhas: 0n,
    categoriasCardapio: 0n,
    whatsappStatus: null,
    notasFiscais: 0n,
    assinaturas: 0n,
    assinaturasVivas: 0n,
    ...over,
  };
}
