/**
 * O catálogo que vai à Meta: um caminho de montagem só, e o novo modelo dentro
 * dele. Sem isto, o modelo de formulário nasceria escrito e nunca submetido —
 * exatamente o que aconteceu com os quatro do estágio 2.
 */
import { describe, it, expect } from "vitest";
import { catalogoDaCasa, catalogoCruzadoComAMeta } from "./submeterCatalogo";
import { MODELOS_DO_LEAD_DE_FORMULARIO } from "@/services/sales/leadFormularioTemplates";

describe("catálogo da casa", () => {
  it("inclui os modelos do lead de formulário", () => {
    const nomes = catalogoDaCasa().map((m) => m.name);
    for (const n of MODELOS_DO_LEAD_DE_FORMULARIO) expect(nomes, n).toContain(n);
  });

  it("todo modelo com variável leva exemplo na mesma quantidade — senão a Meta recusa no disparo", () => {
    for (const m of catalogoDaCasa()) expect(m.examples.length, m.name).toBe(m.variaveis);
  });

  it("o que a Meta não tem aparece como NOT_SUBMITTED, que não é reprovado", () => {
    const linha = catalogoCruzadoComAMeta([]).find((l) => l.name === "foocci_lead_formulario_01");
    expect(linha?.status).toBe("NOT_SUBMITTED");
  });
});
