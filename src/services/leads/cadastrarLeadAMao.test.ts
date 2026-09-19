/**
 * ⭐ A PROVA DO LEAD QUE FICOU 20 HORAS FORA DO SISTEMA.
 *
 * ── A PERGUNTA OBRIGATÓRIA: o teste alcança o código que responde ao cliente?
 *
 * Alcança. Estes casos chamam `cadastrarLeadAMao` de verdade, e ela chama
 * `importarMetaLead` de verdade — a MESMA porta por onde o lead da Meta nasce.
 * Os duplos param no banco e no `SiteLeadService`, que é onde o teste deixaria
 * de ser teste e viraria escrita em base real. Se alguém trocar a porta única
 * por uma escrita direta em `SiteLead`, estes casos quebram.
 *
 * ── O QUE ELE SEGURA, E O DEFEITO ATRÁS DE CADA UM ──────────────────────────
 *
 *  1. **Cria.** O caso da Elisa: o lead que a integração perdeu entra à mão.
 *  2. **Número repetido PROMOVE, não duplica.** Duas fichas para a mesma
 *     pessoa reiniciam o contador do portão e ela leva a mesma mensagem duas
 *     vezes.
 *  3. **Origem de campanha NÃO vira base fria.** É a diferença que decide qual
 *     mensagem a pessoa recebe depois, e já custou dinheiro nesta casa.
 *  4. **Cadastrar não dispara mensagem** — medido no fonte, porque comentário
 *     não é trava.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  siteLead: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  siteLeadInteraction: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/services/site/SiteLeadService", () => ({ SiteLeadService: { capture } }));

const promover = vi.hoisted(() => vi.fn());
vi.mock("@/services/salaDeVendas/jornadaComercial", () => ({
  AUTORIA_SISTEMA: { autor: "SISTEMA", label: "sistema" },
  promoverFrioParaLead: promover,
}));

import {
  cadastrarLeadAMao,
  cadastroAMaoSchema,
  ORIGENS_DO_CADASTRO_A_MAO,
  ATOR_DO_CADASTRO_A_MAO,
  type CadastroAMaoInput,
} from "./cadastrarLeadAMao";
import { ehLead, veioDeListaFria } from "@/services/salaDeVendas/frioOuLead";
import { FONTES_QUE_NOS_PROCURARAM } from "@/services/salaDeVendas/recepcao/portasDeEntrada";

const QUEM = { userId: "u-1", nome: "Vendedor Teste" };
const AGORA = new Date("2026-09-19T14:00:00.000Z");

/** Elisa Oliveira, a quinta linha da planilha — a que nunca entrou. */
const ELISA: CadastroAMaoInput = {
  nome: "Elisa Oliveira",
  whatsapp: "(11) 96954-5259",
  email: "elisa@exemplo.com.br",
  restaurante: "Sushi da Elisa",
  cidade: "São Paulo",
  origem: "CAMPANHA_PAGA",
  comoNosConheceu: "Viu o anúncio no Facebook",
  campanha: "Foocci | Leads | 09-2026",
};

function semCadastroAnterior() {
  db.siteLead.findFirst.mockResolvedValue(null);
  db.siteLeadInteraction.findFirst.mockResolvedValue(null);
}

function dadosGravados() {
  expect(db.siteLead.update).toHaveBeenCalled();
  return db.siteLead.update.mock.calls[0]![0].data as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  db.siteLead.update.mockReturnValue({ __op: "update" });
  db.siteLeadInteraction.create.mockReturnValue({ __op: "create" });
});

describe("⭐ 1. o lead que a integração perdeu entra à mão", () => {
  it("cria a ficha e devolve o id para a tela abrir a conversa", async () => {
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-elisa", codigo: "A7K2M", duplicado: false });
    db.siteLead.findUnique
      .mockResolvedValueOnce({ email: null, fonte: "CAMPANHA_PAGA" })
      .mockResolvedValueOnce({
        id: "lead-elisa",
        codigo: "A7K2M",
        stage: "NOVO",
        fonte: "CAMPANHA_PAGA",
      });

    const r = await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    expect(r.status).toBe("criado");
    expect(r).toMatchObject({ leadId: "lead-elisa", codigo: "A7K2M" });
  });

  it("⛔ entrega o que o vendedor digitou à PORTA ÚNICA, e não ao banco", async () => {
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-elisa", codigo: null, duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "CAMPANHA_PAGA" });

    await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    // `capture` é o único caminho de escrita da recepção. Se esta tela algum dia
    // passar a escrever em `SiteLead` por conta própria, este caso morre aqui.
    expect(capture).toHaveBeenCalledTimes(1);
    const entregue = capture.mock.calls[0]![0] as Record<string, unknown>;
    expect(entregue.nome).toBe("Elisa Oliveira");
    expect(entregue.restaurante).toBe("Sushi da Elisa");
    expect(entregue.cidade).toBe("São Paulo");
    // "Como nos conheceu?" não tem coluna própria: tem que estar escrito onde dá
    // para ler, senão a pergunta da tela é decorativa.
    expect(String(entregue.origem)).toContain("Viu o anúncio no Facebook");
    expect(String(entregue.origem)).toContain(QUEM.nome);
  });

  it("a nota de auditoria é assinada pelo cadastro à mão, não pela integração", async () => {
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-elisa", codigo: null, duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "CAMPANHA_PAGA" });

    await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    const nota = db.siteLeadInteraction.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(nota.actor).toBe(ATOR_DO_CADASTRO_A_MAO);
    expect(String(nota.nota)).toContain("como_nos_conheceu=Viu o anúncio no Facebook");
    // Dizer "Meta Lead Ads" num lead digitado por gente seria inventar uma
    // atribuição — e atribuição errada não se conserta depois.
    expect(String(nota.nota).startsWith("Meta Lead Ads")).toBe(false);
  });

  it("o consentimento gravado é o DESTE cadastro, e não o do formulário da Meta", async () => {
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-elisa", codigo: null, duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "CAMPANHA_PAGA" });

    await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    expect(dadosGravados().consentPolicyVersion).toBe("CADASTRO_MANUAL_SALA_COMERCIAL");
  });
});

describe("⭐ 2. número repetido PROMOVE — nunca uma segunda ficha", () => {
  it("o contato que já estava na base fria vira lead, com o histórico inteiro", async () => {
    semCadastroAnterior();
    // `duplicado: true` = `capture` achou o telefone e devolveu a MESMA ficha.
    capture.mockResolvedValue({ id: "lead-antigo", codigo: "B3X9Q", duplicado: true });
    db.siteLead.findUnique
      .mockResolvedValueOnce({ email: "antigo@exemplo.com", fonte: "LISTA_PROSPECCAO" })
      .mockResolvedValueOnce({
        id: "lead-antigo",
        codigo: "B3X9Q",
        stage: "NOVO",
        fonte: "CAMPANHA_PAGA",
      });
    promover.mockResolvedValue({ promoveu: true });

    const r = await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    expect(r.status).toBe("promovido");
    expect(r).toMatchObject({
      leadId: "lead-antigo",
      fonteAnterior: "LISTA_PROSPECCAO",
      virouLead: true,
    });
    expect(promover).toHaveBeenCalledTimes(1);
    // ⛔ A prova de que não houve ficha nova: `capture` foi chamado uma vez e
    // devolveu o id antigo; nada criou um segundo `SiteLead`.
    expect(capture).toHaveBeenCalledTimes(1);
    expect(String(promover.mock.calls[0]![1].motivo)).toContain(QUEM.nome);
  });

  it("⛔ a ficha que já existia NÃO tem o `createdAt` reescrito", async () => {
    // Reescrever faria a pessoa parecer mais nova do que é e zeraria a espera
    // que já estava correndo — o oposto do defeito que esta tela conserta.
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-antigo", codigo: "B3X9Q", duplicado: true });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "LISTA_PROSPECCAO" });
    promover.mockResolvedValue({ promoveu: true });

    await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    expect(dadosGravados()).not.toHaveProperty("createdAt");
  });

  it("quem já tinha entrado por uma porta da frente mantém o primeiro toque", async () => {
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-antigo", codigo: null, duplicado: true });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "WHATSAPP_DIRETO" });
    promover.mockResolvedValue({ promoveu: false, motivo: "naoEhFrio" });

    await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    // Reescrever a fonte apagaria a atribuição verdadeira de quem trouxe a
    // pessoa primeiro.
    expect(dadosGravados().fonte).toBe("WHATSAPP_DIRETO");
    expect(promover).not.toHaveBeenCalled();
  });
});

describe("⭐ 3. origem de campanha NÃO vira base fria", () => {
  it("o lead cadastrado como campanha nasce CAMPANHA_PAGA e é lead", async () => {
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-elisa", codigo: null, duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "CAMPANHA_PAGA" });

    await cadastrarLeadAMao(ELISA, QUEM, { agora: AGORA });

    const fonte = dadosGravados().fonte as "CAMPANHA_PAGA";
    expect(fonte).toBe("CAMPANHA_PAGA");
    expect(veioDeListaFria({ fonte })).toBe(false);
    expect(ehLead({ fonte })).toBe(true);
    // E a recepção precisa enxergá-la, senão o lead entra e fica parado do
    // mesmo jeito — o defeito teria só mudado de lugar.
    expect(FONTES_QUE_NOS_PROCURARAM).toContain(fonte);
  });

  it("⛔ e o contrário também vale: prospecção nossa NÃO vira lead de campanha", async () => {
    semCadastroAnterior();
    capture.mockResolvedValue({ id: "lead-frio", codigo: null, duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "LISTA_PROSPECCAO" });

    await cadastrarLeadAMao(
      { ...ELISA, origem: "LISTA_PROSPECCAO" },
      QUEM,
      { agora: AGORA },
    );

    const fonte = dadosGravados().fonte as "LISTA_PROSPECCAO";
    expect(fonte).toBe("LISTA_PROSPECCAO");
    expect(ehLead({ fonte })).toBe(false);
  });

  it("a origem é obrigatória — sem padrão silencioso", () => {
    const sem = cadastroAMaoSchema.safeParse({ ...ELISA, origem: "" });
    expect(sem.success).toBe(false);
  });

  it("as duas listas de origem não podem divergir", () => {
    // A da tela e a do validador são escritas separadamente (`z.enum` precisa de
    // tupla literal). Uma opção que entrasse só na tela seria recusada pelo
    // servidor com um erro que ninguém entenderia.
    for (const o of ORIGENS_DO_CADASTRO_A_MAO) {
      expect(cadastroAMaoSchema.safeParse({ ...ELISA, origem: o.valor }).success, o.valor).toBe(
        true,
      );
    }
  });

  it("um WhatsApp que não é número é recusado na porta", () => {
    expect(cadastroAMaoSchema.safeParse({ ...ELISA, whatsapp: "não tenho" }).success).toBe(false);
  });
});

describe("⛔ 4. cadastrar NÃO dispara mensagem", () => {
  const raiz = process.cwd();
  const fontes = [
    "src/services/leads/cadastrarLeadAMao.ts",
    "src/app/api/admin/sala-de-vendas/cadastrar-lead/route.ts",
    "src/app/comercial/(area)/cadastrar-lead/CadastrarLeadClient.tsx",
  ];

  /** Sem comentários: o aviso "esta tela não envia nada" reprovaria o arquivo. */
  function semComentarios(f: string): string {
    return readFileSync(join(raiz, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  for (const f of fontes) {
    it(`${f} não alcança nenhum caminho de envio`, () => {
      const fonte = semComentarios(f);
      for (const proibido of ["abordarLead", "enviarMensagem", "whatsapp-api", "/disparo", "abordagem"]) {
        expect(fonte, `${f} alcança ${proibido}`).not.toContain(proibido);
      }
    });
  }

  it("a tela não escreve em SiteLead por conta própria", () => {
    for (const f of fontes) {
      expect(semComentarios(f), `${f} escreve direto no banco`).not.toContain("prisma.siteLead");
    }
  });

  it("a rota do cadastro passa pela guarda da Sala antes de escrever", () => {
    const rota = semComentarios("src/app/api/admin/sala-de-vendas/cadastrar-lead/route.ts");
    expect(rota).toContain("guardarSalaDeVendas");
    expect(rota).toContain("if (!portao.ok) return portao.resposta");
    // E quem audita não cria lead.
    expect(rota).toContain("somenteLeitura");
  });
});
