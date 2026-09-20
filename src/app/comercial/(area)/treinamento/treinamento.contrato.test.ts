import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROTAS, abasDoComercial } from "@/lib/sala/rotas";

const CLIENT = readFileSync(join(process.cwd(), "src/app/comercial/(area)/treinamento/TreinamentoClient.tsx"), "utf8");

describe("Centro de Treinamento dentro da Sala Comercial", () => {
  it("está no menu de todos os papéis humanos da Sala", () => {
    for (const papel of ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AGENTE_HUMANO", "AUDITOR_QA"] as const) {
      expect(abasDoComercial(papel).some((a) => a.href === ROTAS.treinamento), papel).toBe(true);
    }
  });

  it("desenha trilhas, prova e inteligência nominal do time", () => {
    expect(CLIENT).toContain("Trilhas e provas");
    expect(CLIENT).toContain("Inteligência do time");
    expect(CLIENT).toContain("Fazer prova desta trilha");
    expect(CLIENT).toContain("Não avaliado");
  });

  it("não desenha uma segunda moldura", () => {
    expect(CLIENT).not.toContain("bg-nav");
    expect(CLIENT).not.toContain("w-[230px]");
  });
});
