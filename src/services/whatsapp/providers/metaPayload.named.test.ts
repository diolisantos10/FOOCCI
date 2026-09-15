import { afterEach, describe, expect, it } from "vitest";
import {
  buildMetaTemplatePayload,
  registrarParametrosNomeadosDoTemplate,
} from "./metaPayload";

const ENV_KEYS = [
  "FOOCCI_SALES_POSITIONAL_TEMPLATES",
  "FOOCCI_SALES_IMAGE_HEADER_TEMPLATES",
  "FOOCCI_SALES_TEMPLATE_HEADER_IMAGE_URL",
] as const;

const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

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

  it("força o contrato posicional mesmo se existir um retrato nomeado antigo", () => {
    registrarParametrosNomeadosDoTemplate(
      "template_real_da_sala",
      "pt_BR",
      ["restaurante", "origem"],
    );
    process.env.FOOCCI_SALES_POSITIONAL_TEMPLATES = "template_real_da_sala";

    const payload = buildMetaTemplatePayload(
      "5511999990000",
      "template_real_da_sala",
      "pt_BR",
      ["Burger World Lovers", "Google Maps"],
    );

    expect(payload.template.components?.[0]?.parameters).toEqual([
      { type: "text", text: "Burger World Lovers" },
      { type: "text", text: "Google Maps" },
    ]);
  });

  it("envia HEADER de imagem antes do BODY quando o template aprovado exige mídia", () => {
    process.env.FOOCCI_SALES_POSITIONAL_TEMPLATES = "template_real_da_sala";
    process.env.FOOCCI_SALES_IMAGE_HEADER_TEMPLATES = "template_real_da_sala";
    process.env.FOOCCI_SALES_TEMPLATE_HEADER_IMAGE_URL =
      "https://example.com/foocci-header.png";

    const payload = buildMetaTemplatePayload(
      "5511999990000",
      "template_real_da_sala",
      "pt_BR",
      ["Burger World Lovers", "Google Maps"],
    );

    expect(payload.template.components).toEqual([
      {
        type: "header",
        parameters: [
          { type: "image", image: { link: "https://example.com/foocci-header.png" } },
        ],
      },
      {
        type: "body",
        parameters: [
          { type: "text", text: "Burger World Lovers" },
          { type: "text", text: "Google Maps" },
        ],
      },
    ]);
  });

  it("não altera templates fora da allowlist de vendas", () => {
    process.env.FOOCCI_SALES_IMAGE_HEADER_TEMPLATES = "outro_template";
    process.env.FOOCCI_SALES_TEMPLATE_HEADER_IMAGE_URL =
      "https://example.com/foocci-header.png";

    const payload = buildMetaTemplatePayload(
      "5511999990000",
      "template_do_restaurante",
      "pt_BR",
      ["Maria"],
    );

    expect(payload.template.components).toEqual([
      {
        type: "body",
        parameters: [{ type: "text", text: "Maria" }],
      },
    ]);
  });
});
