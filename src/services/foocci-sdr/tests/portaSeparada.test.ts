/**
 * TESTE ESTRUTURAL — o SDR não pode reaproveitar caminho de envio de outro dono.
 *
 * `docs/sdr-foocci-desenho.md` marcou como P0: `BuildNotifier` é *"a função mais
 * parecida com o que o SDR precisa e a mais perigosa"* — é o único envio sem
 * restaurante, e nasceu sem freio nenhum. A frase do documento é **"nasce
 * explicitamente proibida"**.
 *
 * O que existia para garantir isso era uma frase num documento. Guardrail 4:
 * prompt é aviso, código é trava. Este arquivo é a trava — lê o código-fonte do
 * módulo do SDR e reprova se ele importar qualquer porta que não seja a sua.
 *
 * POR QUE UM TESTE DE TEXTO, e não um teste de comportamento: o dia em que
 * alguém escrever `import { sendBuildConfirmation }` no SDR, todo teste de
 * comportamento continua verde — a mensagem sai, o teste de "manda mensagem"
 * passa, e o freio de outro dono é que fica sendo o único obstáculo. O erro
 * precisa aparecer na hora em que a linha é escrita.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const PASTA = join(process.cwd(), "src/services/foocci-sdr");

/**
 * As portas que o SDR NÃO pode usar, e o motivo de cada uma — o motivo importa
 * mais que a lista, porque é ele que diz o que fazer quando a lista crescer.
 */
const PROIBIDOS: { alvo: string; porque: string }[] = [
  { alvo: "buildos/BuildNotifier", porque: "canal do operador — não fala com estranho" },
  { alvo: "buildos/BuildOsMetaChannel", porque: "canal Master interno — não é lista de contatos" },
  { alvo: "support/SupportWhatsAppService", porque: "número do suporte técnico, outro público" },
  { alvo: "whatsapp/activeProvider", porque: "envio por restaurante — a Foocci não é um" },
  { alvo: "whatsapp/WhatsAppMessagingService", porque: "porta do restaurante, exige restaurantId" },
];

function arquivosDoSdr(): string[] {
  const saida: string[] = [];
  const anda = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) anda(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) saida.push(p);
    }
  };
  anda(PASTA);
  return saida;
}

describe("o SDR da Foocci usa a porta dele, e só a dele", () => {
  const arquivos = arquivosDoSdr();

  it("existe módulo do SDR para conferir (senão este teste passaria por vazio)", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it.each(PROIBIDOS)("não importa $alvo — $porque", ({ alvo }) => {
    const infratores = arquivos.filter((f) => {
      const src = readFileSync(f, "utf8");
      // Só linhas de import/require de verdade — menção em comentário é
      // documentação, e documentar por que NÃO se usa algo é desejável.
      return /^\s*(import\b[^;]*from\s*["'][^"']*|.*\brequire\(["'][^"']*|.*\bimport\(["'][^"']*)/gm
        .test(src) && new RegExp(`(from|require\\(|import\\()\\s*["'][^"']*${alvo}`).test(src);
    });
    expect(infratores).toEqual([]);
  });

  it("e o envio do SDR passa obrigatoriamente pelo portão de lead", () => {
    const canal = readFileSync(join(PASTA, "FoocciSalesChannel.ts"), "utf8");
    // A decisão é o PRIMEIRO parâmetro da função de envio. Se alguém trocar a
    // assinatura para aceitar envio sem decisão, isto reprova.
    expect(canal).toMatch(/enviarTextoDeVendas\(\s*\n?\s*decisao:\s*LeadSafetyDecision/);
    expect(canal).toMatch(/if \(!decisao\.sendable\)/);
  });
});
