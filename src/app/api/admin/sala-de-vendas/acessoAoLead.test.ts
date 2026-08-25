import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A TERCEIRA CAMADA: o lead que não é seu, pedido pela URL.
 *
 * ── O BURACO QUE ESTE ARQUIVO FECHA ─────────────────────────────────────────
 *
 * `isolamento.test.ts` prova que o SDR não alcança o RESTO do Admin. Este prova
 * outra coisa, e é a que passa despercebida: o SDR alcança a Sala — é a área
 * dele — e dentro dela pode pedir QUALQUER lead pelo id.
 *
 * A guarda de rota responderia "sim, você é da Sala" e entregaria a conversa de
 * um prospecto que outra pessoa está conduzindo. A tela nunca pediria isso, e é
 * exatamente por isso que ninguém percebe: o defeito só existe fora da tela.
 *
 * Item 19 do comando: *"Impedir acesso direto por URL ou API."*
 *
 * ── E POR QUE 404, E NÃO 403 ────────────────────────────────────────────────
 *
 * Um 403 confirma que o lead existe. Num sistema comercial isso já é
 * informação: dá para varrer ids e medir o tamanho da base sem ler um dado
 * sequer. Há um teste abaixo só para isso.
 */

const findUnique = vi.fn();
const criarEvento = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteLead: { findUnique: (...a: unknown[]) => findUnique(...a) },
    internalAuditEvent: { create: (...a: unknown[]) => criarEvento(...a) },
  },
}));

const sessao = (over: Record<string, unknown> = {}) => ({
  userId: "sdr1",
  nome: "SDR Humano",
  role: "AGENTE_HUMANO" as const,
  departamentos: ["vendas"],
  gerencia: [],
  ...over,
});

beforeEach(() => {
  findUnique.mockReset();
  criarEvento.mockReset().mockResolvedValue({});
});

async function podeVer(s: ReturnType<typeof sessao>, leadId = "l1") {
  const { podeVerOLead } = await import("./_guarda");
  return podeVerOLead(s as never, leadId, "teste");
}

describe("o que o SDR alcança", () => {
  it("o lead que é DELE", async () => {
    // A metade que PASSA. Sem ela, uma função que negasse tudo passaria em todos
    // os testes abaixo — e a Sala não abriria para ninguém.
    findUnique.mockResolvedValue({ atendenteUserId: "sdr1", atendidoPor: "HUMANO" });
    expect((await podeVer(sessao())).ok).toBe(true);
  });

  it("o lead que não é de ninguém — é a fila que ele existe para puxar", async () => {
    findUnique.mockResolvedValue({ atendenteUserId: null, atendidoPor: "NINGUEM" });
    expect((await podeVer(sessao())).ok).toBe(true);
  });

  it("o lead que a IA devolveu e ninguém pegou", async () => {
    findUnique.mockResolvedValue({ atendenteUserId: null, atendidoPor: "AGUARDANDO_HUMANO" });
    expect((await podeVer(sessao())).ok).toBe(true);
  });
});

describe("o que o SDR NÃO alcança", () => {
  it("o lead de outro SDR — nem para ler", async () => {
    findUnique.mockResolvedValue({ atendenteUserId: "sdr2", atendidoPor: "HUMANO" });

    const r = await podeVer(sessao());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.resposta.status).toBe(404);
  });

  it("um lead que a IA está conduzindo", async () => {
    // Entrar no meio de uma conversa da IA sem assumi-la produz dois
    // interlocutores na mesma conversa, cada um sem saber do outro.
    findUnique.mockResolvedValue({ atendenteUserId: null, atendidoPor: "IA" });

    const r = await podeVer(sessao());
    expect(r.ok).toBe(false);
  });

  it("um id que não existe", async () => {
    findUnique.mockResolvedValue(null);
    expect((await podeVer(sessao())).ok).toBe(false);
  });

  it("responde 404 — e NÃO 403 — para não confirmar que o lead existe", async () => {
    // 403 seria mais preciso e vazaria: varrendo ids dá para medir a base.
    findUnique.mockResolvedValue({ atendenteUserId: "outro", atendidoPor: "HUMANO" });
    const existente = await podeVer(sessao());

    findUnique.mockResolvedValue(null);
    const inexistente = await podeVer(sessao());

    expect(existente.ok).toBe(false);
    expect(inexistente.ok).toBe(false);
    if (!existente.ok && !inexistente.ok) {
      // As duas respostas precisam ser INDISTINGUÍVEIS.
      expect(existente.resposta.status).toBe(inexistente.resposta.status);
    }
  });

  it("a negativa entra na trilha, com o motivo", async () => {
    findUnique.mockResolvedValue({ atendenteUserId: "sdr2", atendidoPor: "HUMANO" });
    await podeVer(sessao());

    expect(criarEvento).toHaveBeenCalledTimes(1);
    const evento = criarEvento.mock.calls[0]![0].data;
    expect(evento.resultado).toBe("NEGADO");
    expect(evento.motivo).toBe("lead de outro atendente");
    expect(evento.recurso).toBe("lead:l1");
  });

  it("trilha fora do ar NÃO abre a porta", async () => {
    // O caso que faz uma checagem de segurança virar decorativa: o `catch` que
    // engole o erro do log e segue para o `return { ok: true }` logo abaixo.
    findUnique.mockResolvedValue({ atendenteUserId: "sdr2", atendidoPor: "HUMANO" });
    criarEvento.mockRejectedValue(new Error("banco fora"));

    const r = await podeVer(sessao());
    expect(r.ok).toBe(false);
  });
});

describe("quem enxerga a operação inteira", () => {
  it("o CEO alcança qualquer lead, sem nem consultar o banco", async () => {
    const r = await podeVer(sessao({ role: "MASTER_CEO" }));

    expect(r.ok).toBe(true);
    // A consulta é pulada de propósito: um `findUnique` por lead em quem já tem
    // acesso total é trabalho puro para chegar à mesma resposta.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("o Diretor também", async () => {
    expect((await podeVer(sessao({ role: "DIRETOR_FOOCCI" }))).ok).toBe(true);
  });

  it("o Agente Gerente também", async () => {
    expect((await podeVer(sessao({ role: "GERENTE_DEPARTAMENTO" }))).ok).toBe(true);
  });

  it("o auditor LÊ qualquer conversa — é o trabalho dele", async () => {
    expect((await podeVer(sessao({ role: "AUDITOR_QA" }))).ok).toBe(true);
  });
});

describe("quem escreve e quem só lê", () => {
  it("o auditor é somente leitura", async () => {
    const { somenteLeitura } = await import("./_guarda");
    expect(somenteLeitura(sessao({ role: "AUDITOR_QA" }) as never)).toBe(true);
  });

  it("o SDR escreve", async () => {
    const { somenteLeitura } = await import("./_guarda");
    expect(somenteLeitura(sessao() as never)).toBe(false);
  });

  it("o SDR NÃO enxerga a operação toda", async () => {
    const { vePelaOperacaoToda } = await import("./_guarda");
    expect(vePelaOperacaoToda(sessao() as never)).toBe(false);
  });
});
