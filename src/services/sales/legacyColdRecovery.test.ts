import { describe, expect, it } from "vitest";
import { classify } from "./legacyColdRecovery";

const AGORA = new Date("2026-09-17T12:00:00.000Z");
const ONTEM = new Date("2026-09-15T12:00:00.000Z");
const HA_UMA_HORA = new Date("2026-09-17T11:00:00.000Z");

describe("classificação da recuperação da base antiga", () => {
  it("nunca reaborda quem pediu para parar", () => {
    const r = classify({ optOutAt: ONTEM, stage: "PRIMEIRO_CONTATO", lastInboundAt: HA_UMA_HORA }, AGORA);
    expect(r.bucket).toBe("OPT_OUT");
    expect(r.nextAction).toBe("STOP");
  });

  // ⚠️ A regressão que esta suíte existe para impedir: a primeira versão filtrava
  // por nomes de estágio que NÃO EXISTEM no enum ("PROPOSTA", "NEGOCIACAO",
  // "FECHADO"). Quem já estava em proposta, negociando ou já era cliente caía no
  // balde de recuperação e ficava elegível para uma abordagem fria.
  it.each(["QUALIFICADO", "DEMO_AGENDADA", "DEMO_REALIZADA", "PROPOSTA_ENVIADA", "EM_NEGOCIACAO", "GANHO"])(
    "não joga %s na recuperação fria",
    (stage) => {
      const r = classify({ optOutAt: null, stage, lastInboundAt: ONTEM }, AGORA);
      expect(r.bucket).toBe("ALREADY_QUALIFIED");
      expect(r.nextAction).toBe("PRESERVE_CURRENT_FLOW");
    },
  );

  it.each(["NOVO", "DISPONIVEL_PARA_PROSPECCAO", "PRIMEIRO_CONTATO", "RESPONDEU", "EM_QUALIFICACAO", "NUTRICAO", "PERDIDO"])(
    "mantém %s elegível para recuperação",
    (stage) => {
      const r = classify({ optOutAt: null, stage, lastInboundAt: ONTEM }, AGORA);
      expect(r.bucket).not.toBe("ALREADY_QUALIFIED");
    },
  );

  it("usa a última ENTRADA do cliente para abrir a janela de 24h", () => {
    expect(classify({ optOutAt: null, stage: "PRIMEIRO_CONTATO", lastInboundAt: HA_UMA_HORA }, AGORA).bucket).toBe("OPEN_24H");
    expect(classify({ optOutAt: null, stage: "PRIMEIRO_CONTATO", lastInboundAt: ONTEM }, AGORA).bucket).toBe("CLOSED_24H");
  });

  it("separa quem nunca respondeu, que depende de template aprovado", () => {
    const r = classify({ optOutAt: null, stage: "PRIMEIRO_CONTATO", lastInboundAt: null }, AGORA);
    expect(r.bucket).toBe("NO_INBOUND_HISTORY");
    expect(r.nextAction).toBe("WAIT_APPROVED_TEMPLATE");
  });
});
