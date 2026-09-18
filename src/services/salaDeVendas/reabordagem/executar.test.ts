import { describe, expect, it } from "vitest";
import { ultimoLoteEm } from "./executar";

/**
 * ⚠️ A REGRESSÃO QUE ESTE ARQUIVO IMPEDE — medida em produção em 18/09/2026.
 *
 * O primeiro lote real da campanha bateu no portão da prospecção (desligada),
 * gravou 40 recusas e **não entregou nenhuma mensagem**. Mesmo assim o lote
 * seguinte foi barrado com *"o último lote saiu há 2 min"*: o freio olhava a
 * última linha de execução, qualquer uma.
 *
 * O freio existe pela saúde do número WABA, e o que machuca o número é
 * **mensagem**, não linha de log. Cobrar meia hora por um lote que não entregou
 * ninguém transforma a trava em pedágio — e pedágio que não protege é o tipo de
 * coisa que alguém arranca inteira no primeiro dia de pressa.
 */

/** Banco mínimo: guarda linhas e responde `findFirst` com o filtro `enviado`. */
function bancoComExecucoes(linhas: { enviado: boolean; criadoEm: Date }[]) {
  return {
    reabordagemExecucao: {
      findFirst: async (args: { where?: { enviado?: boolean } }) => {
        const filtradas = args?.where?.enviado === undefined
          ? linhas
          : linhas.filter((l) => l.enviado === args.where!.enviado);
        const ordenadas = [...filtradas].sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
        return ordenadas[0] ?? null;
      },
    },
  } as never;
}

const AGORA = new Date("2026-09-18T13:10:00.000Z"); // 10:10 em São Paulo
const HA_DOIS_MINUTOS = new Date(AGORA.getTime() - 2 * 60_000);

describe("o freio entre lotes conta do último ENVIO, não da última linha", () => {
  it("lote inteiro recusado NÃO consome o intervalo", async () => {
    const db = bancoComExecucoes([{ enviado: false, criadoEm: HA_DOIS_MINUTOS }]);
    expect(await ultimoLoteEm(db)).toBeNull();
  });

  it("mas um envio de verdade segura o próximo lote", async () => {
    const db = bancoComExecucoes([{ enviado: true, criadoEm: HA_DOIS_MINUTOS }]);
    expect(await ultimoLoteEm(db)).toEqual(HA_DOIS_MINUTOS);
  });

  it("entre uma recusa recente e um envio antigo, manda o ENVIO", async () => {
    const envioAntigo = new Date(AGORA.getTime() - 90 * 60_000);
    const db = bancoComExecucoes([
      { enviado: false, criadoEm: HA_DOIS_MINUTOS },
      { enviado: true, criadoEm: envioAntigo },
    ]);
    expect(await ultimoLoteEm(db)).toEqual(envioAntigo);
  });

  it("sem envio nenhum na história, não há freio a aplicar", async () => {
    expect(await ultimoLoteEm(bancoComExecucoes([]))).toBeNull();
  });
});
