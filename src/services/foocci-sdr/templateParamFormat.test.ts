import { describe, expect, it } from "vitest";
import { contratoDeParametrosDoCorpo } from "./templateParamFormat";

describe("contratoDeParametrosDoCorpo", () => {
  it("mantém templates posicionais", () => {
    expect(
      contratoDeParametrosDoCorpo("Olá {{1}}, falando do {{2}} em {{3}}.", 0),
    ).toEqual({
      variaveis: 3,
      nomesParametros: [],
      corpoRenderizavel: "Olá {{1}}, falando do {{2}} em {{3}}.",
    });
  });

  it("converte placeholders nomeados para o contrato interno posicional", () => {
    expect(
      contratoDeParametrosDoCorpo(
        "Olá {{nome}}, falando com {{restaurante}} porque vimos vocês em {{origem}}.",
        0,
      ),
    ).toEqual({
      variaveis: 3,
      nomesParametros: ["nome", "restaurante", "origem"],
      corpoRenderizavel:
        "Olá {{1}}, falando com {{2}} porque vimos vocês em {{3}}.",
    });
  });

  it("não duplica um mesmo parâmetro nomeado repetido no texto", () => {
    expect(
      contratoDeParametrosDoCorpo("Oi {{nome}}. Posso falar com {{nome}}?", 0),
    ).toEqual({
      variaveis: 1,
      nomesParametros: ["nome"],
      corpoRenderizavel: "Oi {{1}}. Posso falar com {{1}}?",
    });
  });
});
