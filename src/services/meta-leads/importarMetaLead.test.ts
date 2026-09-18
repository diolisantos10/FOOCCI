/**
 * ⭐ A PROVA DOS TRÊS LEADS QUE MORRIAM NA PLANILHA.
 *
 * ── A PERGUNTA OBRIGATÓRIA: o teste alcança o código que responde ao cliente?
 *
 * Alcança. Estes casos chamam `importarMetaLead` de verdade — a MESMA função
 * que o webhook `/api/v1/meta-leads` e o comando de resgate chamam. Os duplos
 * estão só no banco e no `SiteLeadService`, que é onde o teste pararia de ser
 * teste e viraria escrita em base real.
 *
 * ── O QUE ELE SEGURA, E O DEFEITO ATRÁS DE CADA UM ──────────────────────────
 *
 *  1. **Idempotência pelo `id` da Meta.** Rodar duas vezes não cria seis leads.
 *     O defeito: duas fichas para a mesma pessoa reiniciam o contador de
 *     tentativas do portão e ela leva a mesma mensagem duas vezes.
 *  2. **A data de chegada é a REAL, e no fuso certo.** `created_time` vem em
 *     `-05:00`. Gravar "agora" — ou cortar o fuso e ler como Brasília — faria o
 *     lead de 36 horas parecer recém-chegado, e o atraso sumiria da conta no
 *     mesmo gesto que o conserta.
 *  3. **A fonte gravada é vista pela recepção.** Se não fosse, os três
 *     entrariam e ficariam parados de novo: o erro teria só mudado de lugar.
 *  4. **Contato frio é PROMOVIDO, não duplicado.**
 *  5. **Fail-closed:** linha sem data legível é recusada, nunca aproximada em
 *     silêncio.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
  importarMetaLead,
  fonteEhVistaPelaRecepcao,
  FONTE_DO_LEAD_DE_CAMPANHA,
  telefoneSemPrefixoDaMeta,
  chegadaDaMeta,
} from "./importarMetaLead";
import { FONTES_QUE_NOS_PROCURARAM } from "@/services/salaDeVendas/recepcao/portasDeEntrada";

/** José Felix, linha 2 da planilha, exatamente como ela está. */
const JOSE = {
  metaLeadId: "l:1780749103267171",
  createdTime: "2026-09-17T06:09:13-05:00",
  adId: "ag:120246577609590088",
  adName: "A02 | Estático |",
  adsetId: "as:120246576642080088",
  adsetName: "Foocci | Proprietários Restaurantes | Prospecting | Brasil",
  campaignId: "c:120246576642090088",
  campaignName: "Foocci | Leads | Donos de Restaurantes | Captação | 09-2026",
  formId: "f:2151106222951592",
  formName: "Formulário 15-09-2026",
  isOrganic: false,
  platform: "fb",
  fullName: "José Felix",
  email: "josefelixteixeira01@gmail.com",
  phone: "p:+5511913410821",
  leadStatus: "CREATED",
};

/** O instante verdadeiro de `2026-09-17T06:09:13-05:00`, em UTC. */
const CHEGADA_REAL = new Date("2026-09-17T11:09:13.000Z");
/** "Agora" da importação — 36 horas depois. É o valor que NÃO pode ser gravado. */
const AGORA = new Date("2026-09-18T18:00:00.000Z");

function semImportacaoAnterior() {
  db.siteLead.findFirst.mockResolvedValue(null);
  db.siteLeadInteraction.findFirst.mockResolvedValue(null);
}

/** O que o update gravou, para o teste olhar campo a campo. */
function dadosGravados() {
  expect(db.siteLead.update).toHaveBeenCalled();
  return db.siteLead.update.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  db.siteLead.update.mockReturnValue({ __op: "update" });
  db.siteLeadInteraction.create.mockReturnValue({ __op: "create" });
});

describe("a fonte gravada é enxergada pela recepção", () => {
  /*
   * O teste que impede o conserto de virar teatro. A recepção só olha para
   * `FONTES_QUE_NOS_PROCURARAM`; gravar uma fonte de fora dessa lista deixaria
   * os três leads entrando e parando exatamente como antes.
   */
  it("CAMPANHA_PAGA está na lista que a recepção varre", () => {
    expect(FONTES_QUE_NOS_PROCURARAM).toContain(FONTE_DO_LEAD_DE_CAMPANHA);
    expect(fonteEhVistaPelaRecepcao(FONTE_DO_LEAD_DE_CAMPANHA)).toBe(true);
  });

  it("uma fonte de lista fria NÃO é vista — a lista é positiva, não 'tudo menos'", () => {
    expect(fonteEhVistaPelaRecepcao("LISTA_PROSPECCAO")).toBe(false);
  });
});

describe("o telefone e o fuso, que são onde a planilha morde", () => {
  it("tira o prefixo `p:` sem tocar no número", () => {
    expect(telefoneSemPrefixoDaMeta("p:+5511913410821")).toBe("+5511913410821");
    expect(telefoneSemPrefixoDaMeta("+5511913410821")).toBe("+5511913410821");
  });

  it("lê `-05:00` como `-05:00`, e não como Brasília", () => {
    const lido = chegadaDaMeta("2026-09-17T06:09:13-05:00");
    expect(lido?.toISOString()).toBe("2026-09-17T11:09:13.000Z");
    // A leitura ingênua (cortar o fuso) daria 09:09Z — duas horas mais novo.
    expect(lido?.toISOString()).not.toBe("2026-09-17T09:09:13.000Z");
  });

  it("devolve null para data ilegível — nunca `agora` disfarçado", () => {
    expect(chegadaDaMeta("")).toBeNull();
    expect(chegadaDaMeta("ontem de manhã")).toBeNull();
  });
});

describe("a data de chegada gravada é a real, não a de agora", () => {
  it("grava createdAt com o instante da Meta, 36 horas atrás", async () => {
    semImportacaoAnterior();
    capture.mockResolvedValue({ id: "L1", codigo: "A7K2M", duplicado: false });
    db.siteLead.findUnique
      .mockResolvedValueOnce({ email: null, fonte: "FORMULARIO_DEMONSTRACAO" })
      .mockResolvedValueOnce({ id: "L1", codigo: "A7K2M", stage: "NOVO", fonte: "CAMPANHA_PAGA" });

    const r = await importarMetaLead(JOSE, { agora: AGORA, exigirDataDeChegada: true });

    expect(r.status).toBe("criado");
    const dados = dadosGravados();
    expect(dados.createdAt).toEqual(CHEGADA_REAL);
    expect(dados.createdAt).not.toEqual(AGORA);
    // O consentimento é o ato do lead, e aconteceu junto com a submissão.
    expect(dados.consentAt).toEqual(CHEGADA_REAL);
    // E a fonte é a que a recepção varre.
    expect(dados.fonte).toBe("CAMPANHA_PAGA");
  });

  it("marca prioritário quando pedido, e só quando pedido", async () => {
    semImportacaoAnterior();
    capture.mockResolvedValue({ id: "L1", codigo: "A7K2M", duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "FORMULARIO_DEMONSTRACAO", id: "L1", codigo: "A7K2M", stage: "NOVO" });

    await importarMetaLead(JOSE, { agora: AGORA, prioritario: true });
    expect(dadosGravados().prioritario).toBe(true);

    vi.clearAllMocks();
    db.siteLead.update.mockReturnValue({ __op: "update" });
    db.siteLeadInteraction.create.mockReturnValue({ __op: "create" });
    semImportacaoAnterior();
    capture.mockResolvedValue({ id: "L1", codigo: "A7K2M", duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "FORMULARIO_DEMONSTRACAO", id: "L1", codigo: "A7K2M", stage: "NOVO" });

    await importarMetaLead(JOSE, { agora: AGORA });
    expect(dadosGravados()).not.toHaveProperty("prioritario");
  });

  it("NÃO reescreve createdAt de ficha que já existia — aquele é o primeiro toque dela", async () => {
    semImportacaoAnterior();
    capture.mockResolvedValue({ id: "L9", codigo: "ZZZ", duplicado: true });
    db.siteLead.findUnique
      .mockResolvedValueOnce({ email: "antigo@x.com", fonte: "FORMULARIO_DEMONSTRACAO" })
      .mockResolvedValueOnce({ id: "L9", codigo: "ZZZ", stage: "EM_CONVERSA", fonte: "FORMULARIO_DEMONSTRACAO" });

    await importarMetaLead(JOSE, { agora: AGORA });

    const dados = dadosGravados();
    expect(dados).not.toHaveProperty("createdAt");
    // Primeiro toque preservado: quem já entrou por uma porta da frente não
    // tem a atribuição reescrita pela campanha.
    expect(dados.fonte).toBe("FORMULARIO_DEMONSTRACAO");
    // E o e-mail que já existia não é sobrescrito.
    expect(dados.email).toBe("antigo@x.com");
  });
});

describe("idempotência pelo lead_id da Meta", () => {
  it("segunda rodada com o mesmo id não cria nada e devolve o lead existente", async () => {
    db.siteLead.findFirst.mockResolvedValue({ id: "L1", codigo: "A7K2M", stage: "NOVO", fonte: "CAMPANHA_PAGA" });

    const r = await importarMetaLead(JOSE, { agora: AGORA });

    expect(r).toMatchObject({ status: "jaExistia", leadId: "L1", metaLeadId: "l:1780749103267171" });
    expect(capture).not.toHaveBeenCalled();
    expect(db.siteLead.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("reconhece a importação anterior pela nota, quando o clickId do primeiro toque era outro", async () => {
    db.siteLead.findFirst.mockResolvedValue(null);
    db.siteLeadInteraction.findFirst.mockResolvedValue({
      lead: { id: "L7", codigo: "QQQ", stage: "NOVO", fonte: "CAMPANHA_PAGA" },
    });

    const r = await importarMetaLead(JOSE, { agora: AGORA });

    expect(r.status).toBe("jaExistia");
    expect(capture).not.toHaveBeenCalled();
    // A busca tem de ser pelo id INTEIRO, com o prefixo `l:` — cortar o
    // prefixo faria a chave gravada deixar de bater com a da planilha.
    expect(db.siteLeadInteraction.findFirst.mock.calls[0][0].where.nota.contains)
      .toBe("meta_lead_id=l:1780749103267171");
  });

  it("rodar três leads duas vezes cria três, não seis", async () => {
    const linhas = [JOSE, { ...JOSE, metaLeadId: "l:1072045622391514", phone: "p:+5511958466722", fullName: "Fabio M O Unico" }, { ...JOSE, metaLeadId: "l:2310357966385160", phone: "p:+5511943888368", fullName: "Jones Sartori Sartori" }];
    const criados = new Map<string, string>();

    for (const volta of [1, 2]) {
      for (const linha of linhas) {
        const jaTem = criados.get(linha.metaLeadId);
        db.siteLead.findFirst.mockResolvedValue(
          jaTem ? { id: jaTem, codigo: "C", stage: "NOVO", fonte: "CAMPANHA_PAGA" } : null,
        );
        db.siteLeadInteraction.findFirst.mockResolvedValue(null);
        const novoId = `L-${linha.metaLeadId}`;
        capture.mockResolvedValue({ id: novoId, codigo: "C", duplicado: false });
        db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "CAMPANHA_PAGA", id: novoId, codigo: "C", stage: "NOVO" });

        const r = await importarMetaLead(linha, { agora: AGORA });
        if (volta === 1) {
          expect(r.status).toBe("criado");
          criados.set(linha.metaLeadId, novoId);
        } else {
          expect(r.status).toBe("jaExistia");
        }
      }
    }

    expect(criados.size).toBe(3);
    expect(capture).toHaveBeenCalledTimes(3);
  });
});

describe("contato frio vira lead de campanha — e não uma segunda ficha", () => {
  it("promove o existente, preserva o histórico e passa a fonte para CAMPANHA_PAGA", async () => {
    semImportacaoAnterior();
    capture.mockResolvedValue({ id: "L-FRIO", codigo: "FRI", duplicado: true });
    db.siteLead.findUnique
      .mockResolvedValueOnce({ email: null, fonte: "LISTA_PROSPECCAO" })
      .mockResolvedValueOnce({ id: "L-FRIO", codigo: "FRI", stage: "NOVO", fonte: "CAMPANHA_PAGA" });
    promover.mockResolvedValue({ promoveu: true, em: AGORA });

    const r = await importarMetaLead(JOSE, { agora: AGORA });

    expect(r).toMatchObject({ status: "promovido", leadId: "L-FRIO", fonteAnterior: "LISTA_PROSPECCAO", virouLead: true });

    /* ⚠️ A ORDEM É O PONTO: a promoção acontece ANTES da troca de fonte.
     * `promoverFrioParaLead` só aceita quem ainda é frio — trocar a fonte
     * primeiro faria a promoção ser recusada por "naoEhFrio" e o carimbo de
     * interesse nunca existiria. */
    expect(promover).toHaveBeenCalledTimes(1);
    const ordemPromocao = promover.mock.invocationCallOrder[0];
    const ordemUpdate = db.siteLead.update.mock.invocationCallOrder[0];
    expect(ordemPromocao).toBeLessThan(ordemUpdate);

    // A fonte fria não é vista pela recepção, então ela TEM de ser trocada —
    // sem isso o lead promovido continuaria parado.
    expect(dadosGravados().fonte).toBe("CAMPANHA_PAGA");
    // Uma ficha só: nada foi criado por fora.
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("quem já entrou por uma porta da frente não é promovido nem tem a fonte reescrita", async () => {
    semImportacaoAnterior();
    capture.mockResolvedValue({ id: "L-SITE", codigo: "SIT", duplicado: true });
    db.siteLead.findUnique
      .mockResolvedValueOnce({ email: null, fonte: "WHATSAPP_DIRETO" })
      .mockResolvedValueOnce({ id: "L-SITE", codigo: "SIT", stage: "NOVO", fonte: "WHATSAPP_DIRETO" });

    const r = await importarMetaLead(JOSE, { agora: AGORA });

    expect(r).toMatchObject({ status: "promovido", virouLead: false });
    expect(promover).not.toHaveBeenCalled();
    expect(dadosGravados().fonte).toBe("WHATSAPP_DIRETO");
  });
});

describe("fail-closed: sem data legível não se inventa lead", () => {
  it("recusa e diz por quê, sem escrever nada", async () => {
    semImportacaoAnterior();

    const r = await importarMetaLead({ ...JOSE, createdTime: "" }, { agora: AGORA, exigirDataDeChegada: true });

    expect(r.status).toBe("recusado");
    if (r.status === "recusado") expect(r.motivo).toMatch(/created_time/);
    expect(capture).not.toHaveBeenCalled();
    expect(db.siteLead.update).not.toHaveBeenCalled();
  });

  it("no webhook, onde perder o lead é pior, aproxima — mas DECLARA a aproximação", async () => {
    semImportacaoAnterior();
    capture.mockResolvedValue({ id: "L1", codigo: "A", duplicado: false });
    db.siteLead.findUnique.mockResolvedValue({ email: null, fonte: "CAMPANHA_PAGA", id: "L1", codigo: "A", stage: "NOVO" });

    const r = await importarMetaLead({ ...JOSE, createdTime: "" }, { agora: AGORA, exigirDataDeChegada: false });

    expect(r).toMatchObject({ status: "criado", dataAproximada: true });
    expect(dadosGravados().createdAt).toEqual(AGORA);
  });
});
