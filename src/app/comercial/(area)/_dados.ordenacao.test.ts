import { describe, expect, it } from "vitest";
import type { LeadNaFila } from "@/services/salaDeVendas/filas";
import { ordenarConversasMaisRecentes } from "./_dados";

function lead(
  id: string,
  createdAt: string,
  lastContactedAt: string | null = null,
): LeadNaFila {
  return {
    id,
    nome: id,
    restaurante: null,
    cidade: null,
    stage: "NOVO",
    atendidoPor: "NINGUEM",
    atendenteUserId: null,
    atendenteNome: null,
    motivoDoPedido: null,
    atendenteDesde: null,
    origem: { utmSource: null, utmCampaign: null },
    lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null,
    createdAt: new Date(createdAt),
    temperatura: null,
    score: null,
  };
}

describe("ordem visual da coluna de conversas", () => {
  it("mostra primeiro o contato com atividade mais recente", () => {
    const antigo = lead("antigo", "2026-09-10T10:00:00Z");
    const novo = lead("novo", "2026-09-14T08:00:00Z");
    const retomado = lead(
      "retomado",
      "2026-09-01T10:00:00Z",
      "2026-09-14T08:30:00Z",
    );

    expect(ordenarConversasMaisRecentes([antigo, retomado, novo]).map((l) => l.id)).toEqual([
      "retomado",
      "novo",
      "antigo",
    ]);
  });

  it("não altera o array recebido", () => {
    const antigo = lead("antigo", "2026-09-10T10:00:00Z");
    const novo = lead("novo", "2026-09-14T08:00:00Z");
    const entrada = [antigo, novo];

    ordenarConversasMaisRecentes(entrada);

    expect(entrada.map((l) => l.id)).toEqual(["antigo", "novo"]);
  });
});
