import { describe, it, expect } from "vitest";
import { juntarVivasEHistorico, STATUS_VIVOS, HISTORICO_RECENTE } from "../listaDeCampanhas";
import { montarCampanhasDaTela } from "../painelDeCampanhas";

const dia = (n: number) => new Date(Date.UTC(2026, 6, 1) + n * 86_400_000);

describe("lista de campanhas do painel — campanha viva nunca cai do corte", () => {
  // O caso medido: 50 disparos recentes empurravam as recorrentes antigas para fora.
  const morno = { id: "c-morno", templateId: "reativar-mornos", status: "ACTIVE", createdAt: dia(0) };
  const frio  = { id: "c-frio",  templateId: "recuperar-frios", status: "ACTIVE", createdAt: dia(1) };
  const recentes = Array.from({ length: HISTORICO_RECENTE }, (_, i) => ({
    id: `hist-${i}`, templateId: null, status: "COMPLETED", createdAt: dia(10 + i),
  }));

  it("a campanha viva antiga entra mesmo fora das 50 mais recentes", () => {
    const lista = juntarVivasEHistorico([morno, frio], recentes);
    expect(lista.map((c) => c.id)).toContain("c-morno");
    expect(lista.map((c) => c.id)).toContain("c-frio");
    expect(lista).toHaveLength(HISTORICO_RECENTE + 2);
  });

  it("não repete a campanha que está nas duas listas e mantém mais nova primeiro", () => {
    const viva = { ...recentes[5]!, status: "ACTIVE" };
    const lista = juntarVivasEHistorico([viva], recentes);
    expect(lista.filter((c) => c.id === viva.id)).toHaveLength(1);
    for (let i = 1; i < lista.length; i++) {
      expect(new Date(lista[i - 1]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(lista[i]!.createdAt).getTime());
    }
  });

  it("com a linha no lugar, a tabela mostra morno e frio COM dados e com Pausar/Gerenciar", () => {
    const catalogo = [
      { id: "reativar-mornos", active: true, campaignId: "c-morno", status: "ACTIVE" },
      { id: "recuperar-frios", active: true, campaignId: "c-frio",  status: "ACTIVE" },
    ];
    const antes  = montarCampanhasDaTela(catalogo, recentes);
    const depois = montarCampanhasDaTela(catalogo, juntarVivasEHistorico([morno, frio], recentes));
    const achar = (l: typeof antes, id: string) => l.find((x) => x.catalogoId === id)!;

    // O defeito: Ativa sem dados ("sem registro no período").
    expect(achar(antes, "reativar-mornos").temDados).toBe(false);
    // O conserto: Ativa com dados.
    for (const id of ["reativar-mornos", "recuperar-frios"]) {
      expect(achar(depois, id).estado).toBe("ATIVA");
      expect(achar(depois, id).temDados).toBe(true);
      expect(achar(depois, id).avisoSemDados).toBeNull();
    }
  });

  it("status vivos cobrem tudo que a tela mostra fora do histórico", () => {
    for (const s of ["ACTIVE", "SCHEDULED", "SENDING", "PAUSED", "DRAFT"]) {
      expect(STATUS_VIVOS as readonly string[]).toContain(s);
    }
  });
});
