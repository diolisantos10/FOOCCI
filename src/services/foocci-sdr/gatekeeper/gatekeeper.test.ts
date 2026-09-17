/**
 * O PORTEIRO, DE PONTA A PONTA.
 *
 * O que estes casos protegem, em uma frase: quando o atendimento responde *"quem
 * cuida disso é a Juliana, o número dela é (11) 9xxxx"*, o nome dela **tem que
 * sobrar** — em `Contato`, na trilha, e no objetivo da próxima mensagem.
 *
 * O banco falso guarda estado pelo mesmo motivo do `jornadaComercial.test.ts`:
 * idempotência só é demonstrável contra algo que LEMBRE da primeira vez.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classificarInterlocutor } from "./classificacao";
import { extrairDecisorIndicado } from "./decisorIndicado";
import {
  blocoDoObjetivoDaProspeccao,
  objetivoDaProspeccao,
} from "./objetivo";
import { registrarInterlocutorDaProspeccao } from "./registro";

const AGORA = new Date("2026-09-17T12:00:00Z");

// ─────────────────────────────────────────────────────────────────────────────
// O banco falso — as restrições que importam, e só elas
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>;

function bancoFalso() {
  let sequencia = 0;
  const novoId = (prefixo: string) => `${prefixo}-${++sequencia}`;

  const tabelas = {
    empresa: [] as Linha[],
    contato: [] as Linha[],
    eventoDaJornada: [] as Linha[],
    siteLead: [] as Linha[],
  };
  type Tabela = keyof typeof tabelas;

  const UNICAS: Record<Tabela, string[][]> = {
    empresa: [["chaveDeDedupe"]],
    contato: [["empresaId", "telefoneDigits"]],
    eventoDaJornada: [["chaveDeIdempotencia"]],
    siteLead: [],
  };

  const colide = (tabela: Tabela, linha: Linha) =>
    UNICAS[tabela].some((chave) => {
      if (chave.some((c) => linha[c] === null || linha[c] === undefined)) return false;
      return tabelas[tabela].some((existente) => chave.every((c) => existente[c] === linha[c]));
    });

  const casa = (linha: Linha, where: Linha): boolean =>
    Object.entries(where).every(([campo, valor]) => {
      if (valor !== null && typeof valor === "object") {
        const composta = valor as Linha;
        if ("not" in composta) return linha[campo] !== composta.not;
        return Object.entries(composta).every(([c, v]) => linha[c] === v);
      }
      return linha[campo] === valor;
    });

  const achar = (tabela: Tabela, where: Linha) => {
    const composta = Object.values(where).find((v) => v !== null && typeof v === "object") as Linha | undefined;
    return tabelas[tabela].find((linha) => casa(linha, composta && !("not" in composta) ? composta : where));
  };

  const api = (tabela: Tabela, prefixo: string) => ({
    createMany: async ({ data, skipDuplicates }: { data: Linha[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const bruta of data) {
        const linha = { id: novoId(prefixo), ...bruta };
        if (skipDuplicates && colide(tabela, linha)) continue;
        tabelas[tabela].push(linha);
        count++;
      }
      return { count };
    },
    create: async ({ data }: { data: Linha }) => {
      const linha = { id: novoId(prefixo), ...data };
      tabelas[tabela].push(linha);
      return linha;
    },
    findUnique: async ({ where }: { where: Linha }) => achar(tabela, where) ?? null,
    findMany: async ({ where }: { where?: Linha } = {}) =>
      where ? tabelas[tabela].filter((l) => casa(l, where)) : [...tabelas[tabela]],
    updateMany: async ({ where, data }: { where: Linha; data: Linha }) => {
      const alvos = tabelas[tabela].filter((l) => casa(l, where));
      alvos.forEach((l) => Object.assign(l, data));
      return { count: alvos.length };
    },
    update: async ({ where, data }: { where: Linha; data: Linha }) => {
      const alvo = achar(tabela, where);
      if (!alvo) throw new Error(`não achei ${tabela} para atualizar`);
      Object.assign(alvo, data);
      return alvo;
    },
  });

  return {
    tabelas,
    empresa: api("empresa", "emp"),
    contato: api("contato", "ct"),
    eventoDaJornada: api("eventoDaJornada", "ev"),
    siteLead: api("siteLead", "lead"),
  };
}

type BancoFalso = ReturnType<typeof bancoFalso>;
const comoPrisma = (db: BancoFalso) => db as unknown as Parameters<typeof registrarInterlocutorDaProspeccao>[0];

async function cenario(estagio = "PRONTA_PARA_SDR") {
  const db = bancoFalso();
  db.tabelas.empresa.push({
    id: "emp-1",
    nome: "Sushi House",
    chaveDeDedupe: "sushi house|sao paulo|sp",
    estagio,
  });
  db.tabelas.siteLead.push({
    id: "lead-1",
    nome: "Sushi House",
    whatsapp: "5511999990000",
    empresaId: "emp-1",
    contatoId: null,
  });
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. OS NOVE INTERLOCUTORES
// ─────────────────────────────────────────────────────────────────────────────

describe("Gatekeeper Intelligence reconhece quem está do outro lado", () => {
  it.each([
    ["Olá! Bem-vindo ao Restaurante X. 1 - Fazer pedido 2 - Acompanhar pedido", "BOT_DE_PEDIDOS"],
    ["Oi, aqui é a recepção do restaurante", "RECEPCIONISTA"],
    ["Bom dia, sou a atendente do salão", "ATENDENTE"],
    ["Este é o SAC da rede, como posso ajudar?", "SAC"],
    ["Oi, estou no caixa agora, pode falar", "CAIXA"],
    ["Para contato comercial preencha o formulário no site", "FORMULARIO"],
    ["Esse número é geral da loja, viu", "WHATSAPP_GERAL"],
    ["Ligue para a nossa central de atendimento e digite o ramal 3", "CENTRAL_TELEFONICA"],
    ["Esta é uma mensagem automática, responderemos em breve", "OUTRO"],
  ])("%s → %s", (texto, tipo) => {
    const r = classificarInterlocutor(texto);
    expect(r.papel).toBe("GATEKEEPER");
    expect(r.tipoDeGatekeeper).toBe(tipo);
  });

  it("quem se declara dono NÃO é porteiro", () => {
    const r = classificarInterlocutor("pode falar comigo, sou o dono do restaurante");
    expect(r.papel).toBe("DECISOR");
    expect(r.tipoDeGatekeeper).toBeNull();
  });

  it("sem sinal, ninguém é carimbado — ausência de informação não é informação", () => {
    const r = classificarInterlocutor("oi, tudo bem?");
    expect(r.papel).toBe("INDEFINIDO");
    expect(r.tipoDeGatekeeper).toBeNull();
    expect(r.confianca).toBe("BAIXA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A EXTRAÇÃO DO DECISOR — com e sem dado
// ─────────────────────────────────────────────────────────────────────────────

describe("o decisor indicado sai da frase, e só o que a frase trouxe", () => {
  it("nome + telefone: confiança alta e canal indicado", () => {
    const r = extrairDecisorIndicado("quem cuida disso é a Juliana, o número dela é (11) 98888-7777");
    expect(r?.nome).toBe("Juliana");
    expect(r?.telefone).toContain("98888");
    expect(r?.canal).toBe("whatsapp");
    expect(r?.confianca).toBe("ALTA");
    expect(r?.comoFoiDescoberto).toBe("informado pelo atendimento");
  });

  it("só o cargo: guarda o cargo e NÃO inventa nome", () => {
    const r = extrairDecisorIndicado("isso aí você tem que falar com o proprietário");
    expect(r?.cargo).toBe("proprietário");
    expect(r).not.toHaveProperty("nome");
    expect(r?.confianca).toBe("MEDIA");
  });

  it("campo ausente fica AUSENTE — nunca \"não encontrado\" como valor", () => {
    const r = extrairDecisorIndicado("fala com a Juliana");
    expect(r?.nome).toBe("Juliana");
    expect(r).not.toHaveProperty("telefone");
    expect(r).not.toHaveProperty("email");
    expect(Object.values(r ?? {}).join(" ")).not.toMatch(/n[aã]o (encontrado|informado)/i);
  });

  it("conversa sem indicação nenhuma devolve null", () => {
    expect(extrairDecisorIndicado("hoje tá corrido aqui, depois a gente vê")).toBeNull();
    expect(extrairDecisorIndicado("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. O CAMINHO REAL — a resposta vira registro
// ─────────────────────────────────────────────────────────────────────────────

describe("a resposta do porteiro vira Contato, trilha e estágio", () => {
  it("o bot de pedidos é gravado como porteiro e leva a empresa a GATEKEEPER", async () => {
    const db = await cenario();
    const r = await registrarInterlocutorDaProspeccao(comoPrisma(db), {
      leadId: "lead-1",
      fromPhone: "5511999990000",
      texto: "1 - Fazer pedido 2 - Acompanhar pedido 3 - Falar com atendente",
      agora: AGORA,
    });

    expect(r.aplicado).toBe(true);
    const porteiro = db.tabelas.contato.find((c) => c.ehGatekeeper === true);
    expect(porteiro?.tipoDeGatekeeper).toBe("BOT_DE_PEDIDOS");
    expect(db.tabelas.empresa[0]?.estagio).toBe("GATEKEEPER");
    expect(db.tabelas.eventoDaJornada.some((e) => e.tipo === "GATEKEEPER_IDENTIFICADO")).toBe(true);
    expect(r.objetivo).toBe("DESCOBRIR_DECISOR");
  });

  it("\"é com a Juliana, o número é ...\" grava a decisora e muda o objetivo", async () => {
    const db = await cenario("GATEKEEPER");
    const r = await registrarInterlocutorDaProspeccao(comoPrisma(db), {
      leadId: "lead-1",
      fromPhone: "5511999990000",
      texto: "aqui é o atendimento; quem cuida disso é a Juliana, o número dela é (11) 98888-7777",
      agora: AGORA,
    });

    const decisora = db.tabelas.contato.find((c) => c.ehDecisor === true);
    expect(decisora?.nome).toBe("Juliana");
    expect(decisora?.canal).toBe("whatsapp");
    expect(decisora?.confianca).toBe("ALTA");
    expect(decisora?.comoFoiDescoberto).toBe("informado pelo atendimento");
    expect(decisora?.empresaId).toBe("emp-1");
    expect(db.tabelas.empresa[0]?.estagio).toBe("DECISOR_ENCONTRADO");
    expect(db.tabelas.eventoDaJornada.some((e) => e.tipo === "DECISOR_ENCONTRADO")).toBe(true);
    expect(r.objetivo).toBe("GERAR_OPORTUNIDADE");
  });

  it("indicação só com cargo cria o decisor sem inventar nome nem telefone", async () => {
    const db = await cenario("GATEKEEPER");
    await registrarInterlocutorDaProspeccao(comoPrisma(db), {
      leadId: "lead-1",
      fromPhone: "5511999990000",
      texto: "isso é com o proprietário, fala com ele",
      agora: AGORA,
    });

    const decisor = db.tabelas.contato.find((c) => c.ehDecisor === true);
    expect(decisor?.cargo).toBe("proprietário");
    expect(decisor?.telefone).toBeNull();
    expect(decisor?.confianca).toBe("MEDIA");
  });

  it("a MESMA mensagem duas vezes não duplica contato nem evento", async () => {
    const db = await cenario();
    const mensagem = {
      leadId: "lead-1",
      fromPhone: "5511999990000",
      texto: "aqui é a recepção; fala com a Juliana no (11) 98888-7777",
      agora: AGORA,
    };

    const primeira = await registrarInterlocutorDaProspeccao(comoPrisma(db), mensagem);
    const segunda = await registrarInterlocutorDaProspeccao(comoPrisma(db), mensagem);

    expect(segunda.contatoDoPorteiroId).toBe(primeira.contatoDoPorteiroId);
    expect(segunda.contatoDoDecisorId).toBe(primeira.contatoDoDecisorId);
    expect(db.tabelas.contato).toHaveLength(2);
    expect(db.tabelas.eventoDaJornada.filter((e) => e.tipo === "DECISOR_ENCONTRADO")).toHaveLength(1);
  });

  it("indicação sem telefone, repetida, também não duplica o decisor", async () => {
    const db = await cenario("GATEKEEPER");
    const mensagem = { leadId: "lead-1", fromPhone: "5511999990000", texto: "fala com o proprietário", agora: AGORA };
    await registrarInterlocutorDaProspeccao(comoPrisma(db), mensagem);
    await registrarInterlocutorDaProspeccao(comoPrisma(db), mensagem);
    expect(db.tabelas.contato.filter((c) => c.ehDecisor === true)).toHaveLength(1);
  });

  it("lead sem empresa não grava contato — e diz isso em voz alta", async () => {
    const db = await cenario();
    db.tabelas.siteLead[0]!.empresaId = null;
    const r = await registrarInterlocutorDaProspeccao(comoPrisma(db), {
      leadId: "lead-1",
      texto: "aqui é a recepção",
      agora: AGORA,
    });
    expect(r.aplicado).toBe(false);
    expect(r.causa).toBe("leadSemEmpresa");
    expect(r.classificacao.tipoDeGatekeeper).toBe("RECEPCIONISTA");
    expect(db.tabelas.contato).toHaveLength(0);
  });

  it("mensagem sem sinal nenhum não escreve nada", async () => {
    const db = await cenario();
    const r = await registrarInterlocutorDaProspeccao(comoPrisma(db), {
      leadId: "lead-1",
      texto: "tudo certo por aqui",
      agora: AGORA,
    });
    expect(r.causa).toBe("semSinal");
    expect(db.tabelas.contato).toHaveLength(0);
    expect(db.tabelas.eventoDaJornada).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. A MUDANÇA DE OBJETIVO
// ─────────────────────────────────────────────────────────────────────────────

describe("quando o decisor aparece, o objetivo muda", () => {
  it("antes do decisor: descobrir quem decide", () => {
    expect(objetivoDaProspeccao({ estagioDaEmpresa: "PRONTA_PARA_SDR" })).toBe("DESCOBRIR_DECISOR");
    expect(objetivoDaProspeccao({ estagioDaEmpresa: "GATEKEEPER" })).toBe("DESCOBRIR_DECISOR");
  });

  it("depois do decisor: gerar oportunidade", () => {
    expect(objetivoDaProspeccao({ estagioDaEmpresa: "DECISOR_ENCONTRADO" })).toBe("GERAR_OPORTUNIDADE");
    expect(objetivoDaProspeccao({ estagioDaEmpresa: "GATEKEEPER", contatoEhDecisor: true })).toBe(
      "GERAR_OPORTUNIDADE",
    );
  });

  it("sem empresa conhecida, nada muda", () => {
    expect(objetivoDaProspeccao({})).toBeNull();
    expect(objetivoDaProspeccao({ estagioDaEmpresa: "DESCOBERTA" })).toBeNull();
  });

  it("a conduta antes do decisor não vende e não deixa fingir de cliente", () => {
    const bloco = blocoDoObjetivoDaProspeccao("DESCOBRIR_DECISOR");
    expect(bloco).toContain("descobrir quem decide");
    expect(bloco).toContain("NUNCA se passe por cliente");
    expect(bloco).not.toContain("hipótese de dor");
  });

  it("a conduta depois do decisor traz a escada de venda do documento", () => {
    const bloco = blocoDoObjetivoDaProspeccao("GERAR_OPORTUNIDADE");
    for (const passo of ["contexto", "hipótese de dor", "abordagem", "descoberta", "qualificação"]) {
      expect(bloco).toContain(passo);
    }
  });

  it("sem objetivo, nenhum texto entra no prompt", () => {
    expect(blocoDoObjetivoDaProspeccao(null)).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ÉTICA E FIAÇÃO — as duas coisas que não se provam lendo o resultado
// ─────────────────────────────────────────────────────────────────────────────

describe("a ética do porteiro está no código, não na boa intenção", () => {
  const conduta = blocoDoObjetivoDaProspeccao("DESCOBRIR_DECISOR");

  it("a abordagem é transparente: pede o responsável comercial", () => {
    expect(conduta).toMatch(/respons[aá]vel pela opera[cç][aã]o comercial/i);
  });

  it("nenhum arquivo do módulo ensina a se passar por cliente", () => {
    const fontes = ["./classificacao.ts", "./decisorIndicado.ts", "./registro.ts", "./objetivo.ts"].map((f) =>
      readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"),
    );
    for (const fonte of fontes) {
      expect(fonte).not.toMatch(/quero pedir um sushi/i);
      expect(fonte).not.toMatch(/finja (ser|que [ée]) cliente/i);
    }
  });

  it("o registro do porteiro NÃO manda mensagem nenhuma", () => {
    const fonte = readFileSync(fileURLToPath(new URL("./registro.ts", import.meta.url)), "utf8");
    expect(fonte).not.toContain("enviarTextoDeVendas");
    expect(fonte).not.toContain("registrarSaida");
  });

  it("⭐ o caminho real chama a política inteira, e não só o BotGate", () => {
    const fonte = readFileSync(fileURLToPath(new URL("../FoocciSalesInbound.ts", import.meta.url)), "utf8");
    expect(fonte).toContain("aplicarPoliticaAntesDoTA");
    const politica = readFileSync(fileURLToPath(new URL("../ColdLeadInboundPolicy.ts", import.meta.url)), "utf8");
    expect(politica).toContain("registrarInterlocutorDaProspeccao");
    // O registro vem ANTES do gate: o bot de pedidos é justamente o caso que o
    // gate intercepta, e interceptar antes de gravar perderia a classificação.
    expect(politica.indexOf("registrarInterlocutorDaProspeccao(db")).toBeLessThan(
      politica.indexOf("interceptarAutomacaoAntesDoTA(db"),
    );
  });

  it("o TA lê o objetivo da prospecção antes de compor", () => {
    const fonte = readFileSync(
      fileURLToPath(new URL("../../salaDeVendas/ta/atender.ts", import.meta.url)),
      "utf8",
    );
    expect(fonte).toContain("objetivoDaProspeccao");
    expect(fonte).toContain("blocoDoObjetivoDaProspeccao");
  });
});
