import { describe, expect, it } from "vitest";
import {
  buildMetaTemplatePayload,
  registrarParametrosNomeadosDoTemplate,
} from "./metaPayload";

describe("payload de template nomeado", () => {
  it("inclui parameter_name na ordem registrada pelo pré-voo", () => {
    registrarParametrosNomeadosDoTemplate(
      "abordagem_nomeada_teste",
      "pt_BR",
      ["nome", "restaurante", "origem"],
    );

    const payload = buildMetaTemplatePayload(
      "5511999990000",
      "abordagem_nomeada_teste",
      "pt_BR",
      ["Maria", "Sushi Cazza", "Instagram"],
    );

    expect(payload.template.components?.[0]?.parameters).toEqual([
      { type: "text", text: "Maria", parameter_name: "nome" },
      { type: "text", text: "Sushi Cazza", parameter_name: "restaurante" },
      { type: "text", text: "Instagram", parameter_name: "origem" },
    ]);
  });

  it("continua posicional quando não há contrato nomeado registrado", () => {
    const payload = buildMetaTemplatePayload(
      "5511999990000",
      "template_posicional_teste",
      "pt_BR",
      ["Maria", "#123"],
    );

    expect(payload.template.components?.[0]?.parameters).toEqual([
      { type: "text", text: "Maria" },
      { type: "text", text: "#123" },
    ]);
  });
});
