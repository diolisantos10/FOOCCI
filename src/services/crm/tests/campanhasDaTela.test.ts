/**
 * A TABELA ÚNICA — campanha ligada aparece, com os dados. Sem exceção.
 *
 * Medido em 24/09/2026 na captura do dono do restaurante: a tela tinha DOIS
 * blocos e eles se contradiziam. Em cima, "Campanhas ativas" com 11 linhas
 * (montada das linhas do banco). Embaixo, o catálogo com liga/desliga, onde
 * "Cliente morno" aparecia `Ligada` — e ela NÃO estava na tabela de cima.
 *
 * Estes testes reprovam as versões erradas deste código:
 *   - a que deixa uma campanha LIGADA fora da tabela;
 *   - a que faz a contagem do topo discordar das linhas desenhadas;
 *   - a que faz a campanha DESLIGADA sumir da tela (a reclamação anterior);
 *   - a que mostra ZERO onde não há dado — zero é afirmação sobre o mundo;
 *   - a que esquece a campanha personalizada, fora do catálogo;
 *   - a que pinta o frio como ativo ou apaga o motivo da pausa.
 */

import { describe, it, expect } from "vitest";
import { READY_MADE_CAMPAIGNS } from "@/services/crm/readyMadeCampaigns";
import {
  montarCampanhasDaTela,
  contarLigadas,
  contarDesligadas,
  catalogoComoEstadosDesligados,
  estaLigada,
  SEM_DADOS,
  ROTULO_NA_TELA,
  type EstadoDoCatalogo,
  type CampanhaDoBanco,
} from "@/services/crm/painelDeCampanhas";

const linhaDoBanco = (o: Partial<CampanhaDoBanco> & { id: string }): CampanhaDoBanco => ({
  name: "Campanha", templateId: null, status: "ACTIVE", ...o,
});

/** O catálogo com 11 ligadas e 5 desligadas — o mundo que o dono descreveu. */
function mundoDoDono(): { catalogo: EstadoDoCatalogo[]; campanhas: CampanhaDoBanco[] } {
  const ligadas = READY_MADE_CAMPAIGNS.slice(0, 11).map((rm) => rm.id);
  const catalogo: EstadoDoCatalogo[] = READY_MADE_CAMPAIGNS.map((rm) => ({
    id:         rm.id,
    active:     ligadas.includes(rm.id),
    campaignId: ligadas.includes(rm.id) ? `db-${rm.id}` : null,
    status:     ligadas.includes(rm.id) ? "ACTIVE" : null,
  }));
  const campanhas = ligadas.map((id) =>
    linhaDoBanco({ id: `db-${id}`, templateId: id, status: "ACTIVE", name: id }));
  return { catalogo, campanhas };
}

describe("o total confere — 16 campanhas, nunca 14, nunca 11", () => {
  it("o catálogo tem 16 campanhas", () => {
    expect(READY_MADE_CAMPAIGNS).toHaveLength(16);
  });

  it("a tela mostra as 16 mesmo num restaurante novo, sem nada ligado", () => {
    const linhas = montarCampanhasDaTela([], []);
    expect(linhas).toHaveLength(16);
    expect(contarLigadas(linhas)).toBe(0);
    expect(contarDesligadas(linhas)).toBe(16);
  });

  it("nenhum id do catálogo falta na tela", () => {
    const { catalogo, campanhas } = mundoDoDono();
    const ids = new Set(montarCampanhasDaTela(catalogo, campanhas).map((l) => l.catalogoId));
    for (const rm of READY_MADE_CAMPAIGNS) {
      expect(ids, `campanha ${rm.id} sumiu da tela`).toContain(rm.id);
    }
  });

  it("11 ligadas + 5 desligadas = as 16 desenhadas", () => {
    const { catalogo, campanhas } = mundoDoDono();
    const linhas = montarCampanhasDaTela(catalogo, campanhas);
    expect(linhas).toHaveLength(16);
    expect(contarLigadas(linhas)).toBe(11);
    expect(contarDesligadas(linhas)).toBe(5);
    expect(contarLigadas(linhas) + contarDesligadas(linhas)).toBe(linhas.length);
  });
});

describe("⭐ campanha LIGADA aparece na tabela — o defeito de 24/09/2026", () => {
  it("'Cliente morno' ligada no catálogo aparece na tela AINDA QUE não venha linha do banco", () => {
    // Exatamente a contradição da captura: o catálogo dizia Ligada e a tabela de
    // cima, montada só das linhas do banco, não a tinha.
    const catalogo: EstadoDoCatalogo[] = [
      { id: "reativar-mornos", active: true, campaignId: "db-morno", status: "ACTIVE" },
    ];
    const linhas = montarCampanhasDaTela(catalogo, []); // ⛔ banco não devolveu a linha
    const morno = linhas.find((l) => l.catalogoId === "reativar-mornos")!;
    expect(morno, "campanha ligada ficou fora da tabela").toBeDefined();
    expect(morno.ligada).toBe(true);
    expect(morno.estado).toBe("ATIVA");
    expect(contarLigadas(linhas)).toBe(1);
  });

  it("toda campanha marcada ligada no catálogo está entre as ligadas da tela", () => {
    const { catalogo } = mundoDoDono();
    // ⛔ De propósito SEM as linhas do banco: nenhuma pode sumir por isso.
    const linhas = montarCampanhasDaTela(catalogo, []);
    for (const e of catalogo.filter((x) => x.active)) {
      const l = linhas.find((x) => x.catalogoId === e.id);
      expect(l, `${e.id} ligada e fora da tabela`).toBeDefined();
      expect(l!.ligada, `${e.id} está ligada no catálogo e desligada na tela`).toBe(true);
    }
    expect(contarLigadas(linhas)).toBe(11);
  });

  it("nenhuma linha da tela está ligada no catálogo e desligada na tabela", () => {
    const { catalogo, campanhas } = mundoDoDono();
    const linhas = montarCampanhasDaTela(catalogo, campanhas);
    for (const l of linhas) {
      const doCatalogo = catalogo.find((e) => e.id === l.catalogoId);
      if (doCatalogo?.active && !campanhas.some((c) => c.templateId === l.catalogoId)) {
        expect(l.ligada).toBe(true);
      }
    }
  });

  it("linha SENDING (disparando agora) conta como ligada", () => {
    expect(estaLigada("SENDING")).toBe(true);
    expect(estaLigada("ACTIVE")).toBe(true);
    expect(estaLigada("SCHEDULED")).toBe(true);
    expect(estaLigada("PAUSED")).toBe(false);
    expect(estaLigada(null)).toBe(false);
  });

  it("as ligadas vêm primeiro — o dono lê o que está rodando sem rolar a tela", () => {
    const { catalogo, campanhas } = mundoDoDono();
    const linhas = montarCampanhasDaTela(catalogo, campanhas);
    const primeiraDesligada = linhas.findIndex((l) => !l.ligada);
    expect(linhas.slice(0, primeiraDesligada).every((l) => l.ligada)).toBe(true);
    expect(linhas.slice(primeiraDesligada).some((l) => l.ligada)).toBe(false);
  });
});

describe("⛔ a contagem do topo é a MESMA lista que está desenhada", () => {
  it("contarLigadas conta exatamente as linhas marcadas ligadas", () => {
    const { catalogo, campanhas } = mundoDoDono();
    const linhas = montarCampanhasDaTela(catalogo, campanhas);
    expect(contarLigadas(linhas)).toBe(linhas.filter((l) => l.ligada).length);
    expect(contarLigadas(linhas)).toBe(linhas.filter((l) => l.estado === "ATIVA").length);
  });

  it("o rótulo de cada linha bate com o seu estado — a tela não se contradiz", () => {
    const { catalogo, campanhas } = mundoDoDono();
    for (const l of montarCampanhasDaTela(catalogo, campanhas)) {
      expect(l.rotulo).toBe(ROTULO_NA_TELA[l.estado]);
      expect(l.ligada).toBe(l.estado === "ATIVA");
    }
  });

  it("quando banco e catálogo discordam, a linha do banco manda — e só há UM número", () => {
    // Catálogo desatualizado dizendo ligada; o banco diz PAUSED.
    const linhas = montarCampanhasDaTela(
      [{ id: "aniversariantes", active: true, campaignId: "db-1", status: "ACTIVE" }],
      [linhaDoBanco({ id: "db-1", templateId: "aniversariantes", status: "PAUSED" })],
    );
    const aniv = linhas.find((l) => l.catalogoId === "aniversariantes")!;
    expect(aniv.estado).toBe("PAUSADA");
    expect(aniv.ligada).toBe(false);
    expect(contarLigadas(linhas)).toBe(0);
  });
});

describe("⭐ a campanha DESLIGADA não some — a reclamação anterior não volta", () => {
  it("as 5 desligadas continuam na tela, marcadas como desligadas", () => {
    const { catalogo, campanhas } = mundoDoDono();
    const linhas = montarCampanhasDaTela(catalogo, campanhas);
    const desligadas = linhas.filter((l) => !l.ligada);
    expect(desligadas).toHaveLength(5);
    for (const l of desligadas) {
      expect(l.rotulo).toMatch(/desligada|pausada/i);
    }
  });

  it("a desligada carrega o caminho de ligar: id do catálogo para abrir a gestão", () => {
    const linhas = montarCampanhasDaTela([], []);
    for (const l of linhas) {
      expect(l.estado).toBe("DESLIGADA");
      expect(l.catalogoId, "sem id do catálogo não há como abrir e ligar").toBeTruthy();
    }
  });

  it("'Cliente frio' e 'Cliente morno' aparecem mesmo nunca tendo sido ligadas", () => {
    const linhas = montarCampanhasDaTela([], []);
    expect(linhas.find((l) => l.catalogoId === "recuperar-frios")!.nome).toBe("Cliente frio");
    expect(linhas.find((l) => l.catalogoId === "reativar-mornos")!.nome).toBe("Cliente morno");
  });
});

describe("⛔ sem dado NÃO se mostra zero — zero é afirmação sobre o mundo", () => {
  it("campanha que nunca rodou diz 'ainda não rodou', e não tem dados", () => {
    const linhas = montarCampanhasDaTela([], []);
    const frio = linhas.find((l) => l.catalogoId === "recuperar-frios")!;
    expect(frio.temDados).toBe(false);
    expect(frio.avisoSemDados).toBe(SEM_DADOS.NUNCA_RODOU);
  });

  it("ligada sem linha carregada diz que não há registro — nunca inventa número", () => {
    const linhas = montarCampanhasDaTela(
      [{ id: "reativar-mornos", active: true, campaignId: "db-morno", status: "ACTIVE" }], []);
    const morno = linhas.find((l) => l.catalogoId === "reativar-mornos")!;
    expect(morno.ligada).toBe(true);
    expect(morno.temDados).toBe(false);
    expect(morno.avisoSemDados).toBe(SEM_DADOS.SEM_REGISTRO);
  });

  it("com linha do banco, a tela usa os dados de verdade", () => {
    const linhas = montarCampanhasDaTela(
      [{ id: "aniversariantes", active: true, campaignId: "db-1", status: "ACTIVE" }],
      [linhaDoBanco({ id: "db-1", templateId: "aniversariantes", status: "ACTIVE" })],
    );
    const aniv = linhas.find((l) => l.catalogoId === "aniversariantes")!;
    expect(aniv.temDados).toBe(true);
    expect(aniv.avisoSemDados).toBeNull();
    expect(aniv.campaignId).toBe("db-1");
  });

  it("carrinho abandonado diz por que não tem números, em vez de mostrar zero", () => {
    const linhas = montarCampanhasDaTela([{ id: "carrinho-abandonado", active: true }], []);
    const cart = linhas.find((l) => l.catalogoId === "carrinho-abandonado")!;
    expect(cart.ligada).toBe(true);
    expect(cart.temDados).toBe(false);
    expect(cart.avisoSemDados).toBe(SEM_DADOS.POR_NATUREZA);
  });
});

describe("⭐ a campanha personalizada também aparece, e entra no total", () => {
  it("'Almoço', criada pelo dono, está na tela e é marcada como personalizada", () => {
    const { catalogo, campanhas } = mundoDoDono();
    const comAlmoco = [...campanhas, linhaDoBanco({ id: "db-almoco", name: "Almoço", templateId: null, status: "ACTIVE" })];
    const linhas = montarCampanhasDaTela(catalogo, comAlmoco);
    const almoco = linhas.find((l) => l.nome === "Almoço");
    expect(almoco, "a campanha personalizada sumiu da tela").toBeDefined();
    expect(almoco!.fixa).toBe(false);
    expect(almoco!.ligada).toBe(true);
    expect(linhas).toHaveLength(17);          // 16 do catálogo + 1 personalizada
    expect(contarLigadas(linhas)).toBe(12);
  });

  it("personalizada pausada aparece pausada; encerrada não polui a tela", () => {
    const linhas = montarCampanhasDaTela([], [
      linhaDoBanco({ id: "a", name: "Pausada",   status: "PAUSED" }),
      linhaDoBanco({ id: "b", name: "Concluída", status: "COMPLETED" }),
      linhaDoBanco({ id: "c", name: "Cancelada", status: "CANCELLED" }),
    ]);
    expect(linhas.find((l) => l.nome === "Pausada")!.estado).toBe("PAUSADA");
    expect(linhas.find((l) => l.nome === "Concluída")).toBeUndefined();
    expect(linhas.find((l) => l.nome === "Cancelada")).toBeUndefined();
    expect(linhas).toHaveLength(17);
  });

  it("a linha do catálogo não é duplicada como personalizada", () => {
    const linhas = montarCampanhasDaTela(
      [{ id: "aniversariantes", active: true, campaignId: "db-1", status: "ACTIVE" }],
      [linhaDoBanco({ id: "db-1", templateId: "aniversariantes", name: "Aniversariantes", status: "ACTIVE" })],
    );
    expect(linhas).toHaveLength(16);
    expect(linhas.filter((l) => l.campaignId === "db-1")).toHaveLength(1);
  });
});

describe("⛔ a trava do cliente frio continua de pé, e escrita na tela", () => {
  it("frio desligado carrega o motivo da pausa", () => {
    const frio = montarCampanhasDaTela([], []).find((l) => l.catalogoId === "recuperar-frios")!;
    expect(frio.ligada).toBe(false);
    expect(frio.motivoDaPausa, "a tela não explica por que o frio está parado").toBeTruthy();
    expect(frio.motivoDaPausa!).toMatch(/pausada de propósito/i);
  });

  it("frio instanciado e PAUSED segue pausado, com o motivo, e não conta como ligado", () => {
    const linhas = montarCampanhasDaTela(
      [{ id: "recuperar-frios", active: false, campaignId: "db-frio", status: "PAUSED" }],
      [linhaDoBanco({ id: "db-frio", templateId: "recuperar-frios", status: "PAUSED" })],
    );
    const frio = linhas.find((l) => l.catalogoId === "recuperar-frios")!;
    expect(frio.estado).toBe("PAUSADA");
    expect(frio.motivoDaPausa).toBeTruthy();
    expect(contarLigadas(linhas)).toBe(0);
  });

  it("montar a tela não liga nada: de um catálogo sem prova, nada sai ligado", () => {
    const linhas = montarCampanhasDaTela(catalogoComoEstadosDesligados(), []);
    expect(linhas).toHaveLength(16);
    expect(contarLigadas(linhas)).toBe(0);
  });
});
