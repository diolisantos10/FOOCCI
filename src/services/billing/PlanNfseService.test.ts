/**
 * Trava o formato do corpo da NFS-e e o gate de configuração.
 *
 * O payload vai para a prefeitura via Focus — campo errado ali é nota rejeitada
 * em produção. E o gate desligado é o que impede emissão irregular enquanto o
 * CNPJ da Foocci não puder emitir software (docs/juridico/).
 */

import { describe, expect, it, afterEach } from "vitest";
import { buildNfsePayload, getNfseConfig } from "./PlanNfseService";

const CONFIG = {
  cnpj: "59120811000179",
  inscricaoMunicipal: "12345678",
  codigoMunicipio: "3550308",
  itemLista: "1.05",
  aliquota: 2,
};

describe("buildNfsePayload", () => {
  it("monta prestador, tomador e serviço com valores em reais", () => {
    const p = buildNfsePayload({
      config: CONFIG,
      amountCents: 42900,
      referenceMonth: "2026-08",
      plan: "GROWTH",
      cycle: "MENSAL",
      tomadorCnpj: "12.345.678/0001-90",
      tomadorNome: "Restaurante Teste LTDA",
      emissionIso: "2026-08-03T12:00:00.000Z",
    });
    expect(p.prestador.cnpj).toBe("59120811000179");
    expect(p.tomador.cnpj).toBe("12345678000190"); // só dígitos — prefeitura rejeita máscara
    expect(p.servico.valor_servicos).toBe(429);
    expect(p.servico.item_lista_servico).toBe("1.05");
    expect(p.servico.iss_retido).toBe(false);
    expect(p.servico.discriminacao).toContain("GROWTH");
    expect(p.servico.discriminacao).toContain("2026-08");
  });

  it("tomador sem CNPJ (pessoa física/ainda sem registro) omite o campo em vez de mandar vazio", () => {
    const p = buildNfsePayload({
      config: CONFIG,
      amountCents: 17900,
      referenceMonth: "2026-08",
      plan: "STARTER",
      cycle: "MENSAL",
      tomadorCnpj: null,
      tomadorNome: "Fulano",
      emissionIso: "2026-08-03T12:00:00.000Z",
    });
    expect("cnpj" in p.tomador).toBe(false);
    expect(p.tomador.razao_social).toBe("Fulano");
  });
});

describe("getNfseConfig — o gate fiscal", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("desligado por padrão, com o motivo apontando para o jurídico", () => {
    delete process.env.FOOCCI_NFSE_ENABLED;
    const { config, reason } = getNfseConfig();
    expect(config).toBeNull();
    expect(reason).toMatch(/desligada/i);
  });

  it("ligado mas incompleto continua bloqueado — meio configurado é pior que desligado", () => {
    process.env.FOOCCI_NFSE_ENABLED = "true";
    process.env.FOCUS_NFE_MASTER_TOKEN = "tok";
    process.env.FOOCCI_NFSE_CNPJ = "59120811000179";
    delete process.env.FOOCCI_NFSE_INSCRICAO_MUNICIPAL;
    const { config, reason } = getNfseConfig();
    expect(config).toBeNull();
    expect(reason).toMatch(/incompletos/i);
  });

  it("com tudo preenchido libera, respeitando o ambiente", () => {
    process.env.FOOCCI_NFSE_ENABLED = "true";
    process.env.FOCUS_NFE_MASTER_TOKEN = "tok";
    process.env.FOOCCI_NFSE_CNPJ = "59.120.811/0001-79";
    process.env.FOOCCI_NFSE_INSCRICAO_MUNICIPAL = "12345678";
    process.env.FOOCCI_NFSE_CODIGO_MUNICIPIO = "3550308";
    process.env.FOOCCI_NFSE_ALIQUOTA = "2.00";
    const { config, reason } = getNfseConfig();
    expect(reason).toBeNull();
    expect(config?.cnpj).toBe("59120811000179"); // máscara removida
    expect(config?.ambiente).toBe("HOMOLOGACAO"); // default seguro
  });
});
