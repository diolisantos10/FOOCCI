/**
 * A conversa do lead: idempotência, ordem dos status e o que a lista mostra.
 *
 * Todo teste aqui tem as DUAS metades. Sem a metade que passa, uma função que
 * recusasse tudo ficaria verde na metade que recusa — e é assim que uma trava
 * quebrada sobrevive a uma suíte inteira.
 */

import { describe, it, expect, vi } from "vitest";
import {
  registrarEntrada,
  registrarSaida,
  aplicarStatus,
  avancaStatus,
  resumoDoTexto,
  janelaDe24h,
  marcarComoLidas,
} from "./conversa";

const AGORA = new Date("2026-08-25T12:00:00Z");

function bancoQueAceita() {
  return {
    leadMensagem: {
      create: vi.fn().mockResolvedValue({ id: "m1" }),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    siteLead: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const chegou = (over = {}) => ({
  leadId: "l1",
  waMessageId: "wamid.ABC",
  tipo: "TEXTO" as const,
  texto: "Oi, quanto custa?",
  ocorreuEm: AGORA,
  ...over,
});

describe("uma mensagem que chega", () => {
  it("é gravada, e o espelho do lead acompanha", async () => {
    // A metade que PASSA.
    const db = bancoQueAceita();
    const r = await registrarEntrada(db as never, chegou());

    expect(r).toEqual({ ok: true, mensagemId: "m1", repetida: false });

    const espelho = db.siteLead.update.mock.calls[0]![0].data;
    expect(espelho.ultimaMensagemDeQuem).toBe("ENTRADA");
    expect(espelho.naoLidas).toEqual({ increment: 1 });
  });

  it("a primeira resposta só é gravada se ainda estiver vazia", async () => {
    // Sobrescrever a cada mensagem transformaria "tempo de primeira resposta" em
    // "tempo desde a última resposta" — outra coisa, e sempre melhor.
    const db = bancoQueAceita();
    await registrarEntrada(db as never, chegou());

    const where = db.siteLead.updateMany.mock.calls[0]![0].where;
    expect(where.primeiraRespostaEm).toBeNull();
  });
});

describe("a reentrega da Meta não duplica a conversa", () => {
  it("a segunda vez devolve a mesma mensagem, marcada como repetida", async () => {
    const db = bancoQueAceita();
    db.leadMensagem.create.mockRejectedValueOnce({ code: "P2002" });
    db.leadMensagem.findUnique.mockResolvedValueOnce({ id: "m1" });

    const r = await registrarEntrada(db as never, chegou());

    expect(r).toEqual({ ok: true, mensagemId: "m1", repetida: true });
  });

  it("e NÃO soma outra não lida", async () => {
    // O defeito que este teste protege: o contador subindo a cada reentrega faz
    // a lista mostrar "3 não lidas" onde chegou uma mensagem só.
    const db = bancoQueAceita();
    db.leadMensagem.create.mockRejectedValueOnce({ code: "P2002" });
    db.leadMensagem.findUnique.mockResolvedValueOnce({ id: "m1" });

    await registrarEntrada(db as never, chegou());

    expect(db.siteLead.update).not.toHaveBeenCalled();
  });

  it("a trava é a unicidade do banco, não uma leitura antes da escrita", async () => {
    // Se algum dia alguém trocar por findFirst+create, este teste continua
    // passando — mas o de cima passa a depender de sorte. Por isso a asserção é
    // sobre o que NÃO é chamado antes do create.
    const db = bancoQueAceita();
    await registrarEntrada(db as never, chegou());

    expect(db.leadMensagem.findUnique).not.toHaveBeenCalled();
    expect(db.leadMensagem.create).toHaveBeenCalledTimes(1);
  });
});

describe("uma mensagem que sai", () => {
  it("mensagem humana com autor passa", async () => {
    const db = bancoQueAceita();
    const r = await registrarSaida(db as never, {
      leadId: "l1", texto: "Bom dia!", autor: "HUMANO", autorUserId: "u1", agora: AGORA,
    });
    expect(r).toEqual({ ok: true, mensagemId: "m1" });
  });

  it("mensagem humana SEM autor é recusada, e nada é gravado", async () => {
    // Item 19: toda mensagem tem responsável. Sem isto a auditoria não consegue
    // dizer quem falou em nome da empresa.
    const db = bancoQueAceita();
    const r = await registrarSaida(db as never, {
      leadId: "l1", texto: "Bom dia!", autor: "HUMANO",
    });

    expect(r).toEqual({ ok: false, causa: "humanoSemAutor" });
    expect(db.leadMensagem.create).not.toHaveBeenCalled();
  });

  it("a IA não precisa de autorUserId — ela não é uma pessoa", async () => {
    const db = bancoQueAceita();
    const r = await registrarSaida(db as never, {
      leadId: "l1", texto: "Oi!", autor: "IA", agora: AGORA,
    });
    expect(r.ok).toBe(true);
  });

  it("nasce PENDENTE: gravar antes de enviar", async () => {
    // Gravar só depois do sucesso produz o pior estado possível numa queda: o
    // cliente recebeu e o sistema não sabe. O vendedor manda de novo.
    const db = bancoQueAceita();
    await registrarSaida(db as never, {
      leadId: "l1", texto: "Oi", autor: "IA", agora: AGORA,
    });
    expect(db.leadMensagem.create.mock.calls[0]![0].data.status).toBe("PENDENTE");
  });

  it("mensagem vazia não sai", async () => {
    const db = bancoQueAceita();
    const r = await registrarSaida(db as never, { leadId: "l1", texto: "   ", autor: "IA" });
    expect(r).toEqual({ ok: false, causa: "semTexto" });
  });
});

describe("o status de entrega é uma escada, não uma atribuição", () => {
  it("avança quando é para frente", () => {
    expect(avancaStatus("ENVIADA", "ENTREGUE")).toBe(true);
    expect(avancaStatus("ENTREGUE", "LIDA")).toBe(true);
    expect(avancaStatus("PENDENTE", "ENVIADA")).toBe(true);
  });

  it("NÃO volta — a Meta manda `read` antes de `delivered` o tempo todo", () => {
    // O sintoma do defeito: o ✓✓ azul vira cinza na tela do vendedor, e ele
    // conclui que o sistema está errado. Estaria.
    expect(avancaStatus("LIDA", "ENTREGUE")).toBe(false);
    expect(avancaStatus("ENTREGUE", "ENVIADA")).toBe(false);
  });

  it("falha vence qualquer avanço — é a única que exige ação de alguém", () => {
    expect(avancaStatus("ENVIADA", "FALHOU")).toBe(true);
    expect(avancaStatus("LIDA", "FALHOU")).toBe(true);
  });

  it("mas nada ressuscita uma mensagem que falhou", () => {
    expect(avancaStatus("FALHOU", "ENTREGUE")).toBe(false);
    expect(avancaStatus("FALHOU", "FALHOU")).toBe(false);
  });

  it("aplicarStatus escreve condicionalmente no status atual", async () => {
    const db = bancoQueAceita();
    db.leadMensagem.findUnique.mockResolvedValueOnce({ id: "m1", status: "ENVIADA" });

    await aplicarStatus(db as never, { waMessageId: "w1", status: "ENTREGUE" });

    const where = db.leadMensagem.updateMany.mock.calls[0]![0].where;
    expect(where).toEqual({ id: "m1", status: "ENVIADA" });
  });

  it("um retrocesso não chega a tocar no banco", async () => {
    const db = bancoQueAceita();
    db.leadMensagem.findUnique.mockResolvedValueOnce({ id: "m1", status: "LIDA" });

    const r = await aplicarStatus(db as never, { waMessageId: "w1", status: "ENTREGUE" });

    expect(r.aplicado).toBe(false);
    expect(db.leadMensagem.updateMany).not.toHaveBeenCalled();
  });
});

describe("o que a lista de conversas mostra", () => {
  it("o texto, quando existe", () => {
    expect(resumoDoTexto({ tipo: "TEXTO", texto: "Quanto custa?" })).toBe("Quanto custa?");
  });

  it("áudio sem legenda NÃO vira linha em branco", () => {
    // Linha vazia na lista parece defeito, e faz o vendedor abrir a conversa só
    // para descobrir o que chegou.
    expect(resumoDoTexto({ tipo: "AUDIO" })).toBe("🎤 Áudio");
    expect(resumoDoTexto({ tipo: "IMAGEM" })).toBe("🖼️ Imagem");
  });

  it("documento mostra o nome do arquivo quando tem", () => {
    expect(resumoDoTexto({ tipo: "DOCUMENTO", midiaNome: "cardapio.pdf" }))
      .toBe("📎 cardapio.pdf");
  });

  it("conteúdo que o sistema não sabe representar aparece assim mesmo", () => {
    // Nunca some. Mensagem que desaparece é conversa que mente.
    expect(resumoDoTexto({ tipo: "NAO_SUPORTADO" })).toBe("📦 Conteúdo não suportado");
  });

  it("a legenda serve de texto quando não há texto", () => {
    expect(resumoDoTexto({ tipo: "IMAGEM", legenda: "esse é meu cardápio" }))
      .toBe("esse é meu cardápio");
  });
});

describe("a janela de 24 horas da Meta", () => {
  it("aberta logo depois de o lead falar", () => {
    const r = janelaDe24h(new Date("2026-08-25T10:00:00Z"), AGORA);
    expect(r.aberta).toBe(true);
  });

  it("fechada 25 horas depois", () => {
    const r = janelaDe24h(new Date("2026-08-24T10:00:00Z"), AGORA);
    expect(r).toEqual({
      aberta: false,
      motivo: "expirou",
      ultimaEm: new Date("2026-08-24T10:00:00Z"),
    });
  });

  it("quem nunca falou tem motivo PRÓPRIO — não é o mesmo que expirou", () => {
    // A tela precisa dizer coisas diferentes: "a janela fechou, use um modelo" e
    // "essa pessoa nunca escreveu, você só pode iniciar com modelo aprovado".
    expect(janelaDe24h(null, AGORA)).toEqual({ aberta: false, motivo: "nuncaFalou" });
  });

  it("exatamente no limite, já está fechada", () => {
    const r = janelaDe24h(new Date("2026-08-24T12:00:00Z"), AGORA);
    expect(r.aberta).toBe(false);
  });
});

describe("marcar como lidas", () => {
  it("zera o contador em vez de decrementar", async () => {
    // Decrementar por mensagem deixa o contador negativo no dia em que dois
    // atendentes abrirem a mesma conversa.
    const db = bancoQueAceita();
    await marcarComoLidas(db as never, { leadId: "l1", agora: AGORA });

    expect(db.siteLead.update.mock.calls[0]![0].data).toEqual({ naoLidas: 0 });
  });

  it("só marca as que o lead mandou e que ainda não foram lidas", async () => {
    const db = bancoQueAceita();
    await marcarComoLidas(db as never, { leadId: "l1", agora: AGORA });

    expect(db.leadMensagem.updateMany.mock.calls[0]![0].where).toEqual({
      leadId: "l1", direcao: "ENTRADA", lidaEm: null,
    });
  });
});
