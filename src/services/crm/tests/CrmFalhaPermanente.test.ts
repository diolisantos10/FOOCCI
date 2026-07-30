/**
 * Falha permanente para de ser retentada pra sempre.
 *
 * O runner tratava toda falha igual: esperava a janela de 24h e devolvia o
 * cliente para a fila. Para um número inválido isso significa reenviar ao mesmo
 * número errado todo dia, para sempre — cada rodada produzindo uma falha nova
 * idêntica à anterior. Não é retentativa, é loop.
 *
 * A regra que resolve tem duas metades, e a segunda é a que quase se erra:
 * bloqueio NÃO é falha. Cooldown e cap semanal existem justamente para deixar
 * passar depois — se eles saíssem da fila junto, o CRM parava de mandar para
 * quem só estava esperando a vez.
 */

import { describe, it, expect } from "vitest";

import {
  classifyExecution,
  podeRetentarSozinho,
  saiDaFilaParaSempre,
} from "../crmExecutionClassification";

const falha = (errorMessage: string) => ({ status: "FAILED", errorMessage });
const bloqueio = (errorMessage: string) => ({ status: "BLOCKED", errorMessage });

describe("falha: o que o robô pode tentar de novo sozinho", () => {
  it("instância caída volta — ela reconecta sem ninguém mexer", () => {
    expect(podeRetentarSozinho(falha("EVOLUTION_INSTANCE_DISCONNECTED"))).toBe(true);
    expect(saiDaFilaParaSempre(falha("EVOLUTION_INSTANCE_DISCONNECTED"))).toBe(false);
  });

  it("erro 5xx e timeout voltam — foi soluço do provedor", () => {
    for (const c of ["EVOLUTION_HTTP_502", "EVOLUTION_HTTP_524", "EVOLUTION_HTTP_408"]) {
      expect(saiDaFilaParaSempre(falha(c)), c).toBe(false);
    }
  });

  it("erro desconhecido volta — na dúvida, dá mais uma chance", () => {
    expect(saiDaFilaParaSempre({ status: "FAILED", failedReason: "algo estranho aconteceu" })).toBe(false);
  });

  it("número inválido sai de vez — nenhuma tentativa conserta cadastro errado", () => {
    expect(classifyExecution(falha("EVOLUTION_HTTP_400")).retryability).toBe("RETRYABLE_AFTER_FIX");
    expect(saiDaFilaParaSempre(falha("EVOLUTION_HTTP_400"))).toBe(true);
  });

  it("credencial vencida sai de vez — precisa de gente", () => {
    for (const c of ["EVOLUTION_HTTP_401", "EVOLUTION_HTTP_403"]) {
      expect(classifyExecution(falha(c)).retryability, c).toBe("RETRYABLE_AFTER_FIX");
      expect(saiDaFilaParaSempre(falha(c)), c).toBe(true);
    }
  });

  it("template quebrado sai de vez — a mensagem renderizou vazia", () => {
    expect(saiDaFilaParaSempre(falha("EMPTY_MESSAGE_AFTER_RENDER"))).toBe(true);
  });
});

describe("bloqueio: quem só está esperando a vez TEM que voltar", () => {
  it("cooldown, cap semanal e cap global voltam", () => {
    for (const c of [
      "CUSTOMER_COOLDOWN_ACTIVE",
      "RECENT_CRM_MESSAGE_24H",
      "CUSTOMER_WEEKLY_CAP_REACHED",
      "DAILY_GLOBAL_CAP_REACHED",
    ]) {
      expect(saiDaFilaParaSempre(bloqueio(c)), c).toBe(false);
    }
  });

  it("janela de envio e restaurante fechado voltam", () => {
    for (const c of ["QUIET_HOURS", "WEEKEND_BLOCKED", "OUTSIDE_SENDING_WINDOW", "RESTAURANT_CLOSED"]) {
      expect(saiDaFilaParaSempre(bloqueio(c)), c).toBe(false);
    }
  });

  it("opt-out NÃO volta — não é limite, é a vontade do cliente", () => {
    expect(classifyExecution(bloqueio("CUSTOMER_OPTED_OUT")).retryability).toBe("NEVER_RETRY");
    expect(saiDaFilaParaSempre(bloqueio("CUSTOMER_OPTED_OUT"))).toBe(true);
  });
});

describe("a decisão nunca contradiz a política declarada", () => {
  it("toda falha que sai de vez é uma falha não-RETRYABLE_LATER", () => {
    const codigos = [
      "EVOLUTION_HTTP_400", "EVOLUTION_HTTP_401", "EVOLUTION_HTTP_403",
      "EMPTY_MESSAGE_AFTER_RENDER", "EVOLUTION_HTTP_502", "EVOLUTION_HTTP_524",
      "EVOLUTION_INSTANCE_DISCONNECTED",
    ];
    for (const c of codigos) {
      const cls = classifyExecution(falha(c));
      expect(saiDaFilaParaSempre(falha(c)), c).toBe(cls.retryability !== "RETRYABLE_LATER");
    }
  });

  it("nenhum bloqueio temporário é confundido com definitivo", () => {
    const temporarios = ["CUSTOMER_COOLDOWN_ACTIVE", "CUSTOMER_WEEKLY_CAP_REACHED", "QUIET_HOURS"];
    for (const c of temporarios) {
      expect(classifyExecution(bloqueio(c)).retryability, c).toBe("RETRYABLE_LATER");
      expect(saiDaFilaParaSempre(bloqueio(c)), c).toBe(false);
    }
  });
});
