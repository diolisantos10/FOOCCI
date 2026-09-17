/**
 * AS TRÊS TELAS NOVAS SÓ LEEM — MEDIDO NO FONTE, NÃO PROMETIDO EM COMENTÁRIO.
 *
 * ── POR QUE UM TESTE QUE LÊ O PRÓPRIO CÓDIGO ────────────────────────────────
 *
 * "Esta rota só lê" é exatamente o tipo de frase que continua escrita no topo
 * do arquivo depois que alguém acrescentou um `update` no meio dele. Prompt é
 * aviso; código é trava. Este teste é a trava: ele lê os três fontes e recusa
 * qualquer escrita no banco e qualquer caminho de envio de mensagem.
 *
 * Molde da casa: o mesmo de `raioX/contrato.test.ts` e do contrato do copiloto.
 *
 * ── A ÚNICA ESCRITA PERMITIDA, E POR QUE ELA É PERMITIDA ────────────────────
 *
 * `internalAuditEvent.create` no caminho da RECUSA. Ela não é dado da operação:
 * é a trilha de quem tentou entrar e não podia. Proibi-la faria a porta ficar
 * muda justamente no caso que interessa auditar.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const AQUI = join(process.cwd(), "src/app/api/admin/sala-de-vendas");

const ROTAS = ["torre", "sdr", "crm"] as const;

function fonteDe(rota: string): string {
  return readFileSync(join(AQUI, rota, "route.ts"), "utf8");
}

/**
 * O CÓDIGO, sem os comentários.
 *
 * As proibições valem para o que EXECUTA. O comentário que explica por que
 * `enfileirarPlano` não é chamado aqui é justamente a documentação que se quer
 * manter — um teste que a proíbe ensina a próxima pessoa a apagar a explicação
 * em vez de manter a regra.
 */
function codigo(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** A trilha de recusa sai da conta: ela é auditoria, não dado da operação. */
function semTrilhaDeAuditoria(fonte: string): string {
  return fonte.replace(/prisma\.internalAuditEvent\.create\(/g, "TRILHA_DE_AUDITORIA(");
}

describe.each(ROTAS)("a rota /%s não escreve no banco", (rota) => {
  const fonte = semTrilhaDeAuditoria(codigo(fonteDe(rota)));

  it.each(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"])(
    "não chama .%s(",
    (metodo) => {
      expect(fonte).not.toContain(`.${metodo}(`);
    },
  );

  it("não usa SQL cru de escrita", () => {
    expect(fonte).not.toContain("$executeRaw");
    expect(fonte).not.toContain("$executeRawUnsafe");
  });
});

describe.each(ROTAS)("a rota /%s não abre caminho de envio", (rota) => {
  const fonte = codigo(fonteDe(rota));

  it.each([
    "entregarMensagem",
    "registrarSaida",
    "enfileirarPlano",
    "rodarCadencias",
    "executarPasso",
    "abordar",
    "/ta/",
    "whatsapp",
  ])("não menciona %s", (proibido) => {
    expect(fonte.toLowerCase()).not.toContain(proibido.toLowerCase());
  });
});

describe.each(ROTAS)("a rota /%s fecha a porta para quem não é gestão", (rota) => {
  const fonte = codigo(fonteDe(rota));

  it("exige a lista explícita de papéis, e AGENTE_HUMANO fica fora", () => {
    expect(fonte).toContain("autorizarInterno");
    expect(fonte).toContain("MASTER_CEO");
    expect(fonte).toContain("DIRETOR_FOOCCI");
    expect(fonte).toContain("GERENTE_DEPARTAMENTO");
    expect(fonte).toContain("AUDITOR_QA");
    expect(fonte).not.toContain("AGENTE_HUMANO");
  });

  it("registra a recusa na trilha antes de devolver o status", () => {
    expect(fonte).toContain("internalAuditEvent");
    expect(fonte).toContain('resultado: "NEGADO"');
  });
});

describe("telefone de terceiro nunca sai inteiro por estas portas", () => {
  it.each(["torre", "sdr"])("a rota /%s mascara o telefone", (rota) => {
    const fonte = codigo(fonteDe(rota));
    expect(fonte).toContain("mascararTelefone");
    // `telefoneInteiro` e o parâmetro que o liga não aparecem: o número
    // completo só sai pela porta do raio-X, que tem segredo próprio.
    expect(fonte).not.toContain("telefoneInteiro");
    expect(fonte).not.toContain("telefoneCompleto: true");
  });
});
