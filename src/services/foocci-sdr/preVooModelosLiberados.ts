import type { Prisma, PrismaClient } from "@prisma/client";
import { comOTokenDeVendas } from "./FoocciSalesChannel";
import { listarModelosDeVendas, type ModeloNaMeta } from "./modelosDaMeta";
import {
  modelosLiberadosParaEnvio,
  type ModeloLiberadoParaEnvio,
} from "./modelosLiberados";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type ConferenciaDosModelosLiberados =
  | {
      pronto: true;
      modelos: Array<{ nome: string; idioma: string; variaveis: number }>;
    }
  | {
      pronto: false;
      causa:
        | "semToken"
        | "semModelosLiberados"
        | "metaRecusou"
        | "naoAchado"
        | "naoAprovado"
        | "variaveisNaoBatem"
        | "bancoRecusou";
      detalhe: string;
    };

function acharNaMeta(
  modelo: ModeloLiberadoParaEnvio,
  modelosNaMeta: readonly ModeloNaMeta[],
): ModeloNaMeta | null {
  return (
    modelosNaMeta.find(
      (m) => m.nome === modelo.nome && m.idioma === modelo.idioma,
    ) ?? null
  );
}

/**
 * Pré-voo da regra atual da Sala Comercial.
 *
 * O envio real não usa mais um template fixo de ambiente: ele sorteia entre os
 * modelos APPROVED que a Sala liberou. Portanto o pré-voo precisa conferir
 * exatamente ESSE conjunto, ao vivo na Meta. Se qualquer modelo do conjunto
 * estiver ausente, reprovado ou com contrato de variáveis diferente do retrato
 * persistido, a rodada para antes de falar com um lead.
 */
export async function conferirModelosLiberadosDeAbordagem(
  token: string,
  db: Cliente,
): Promise<ConferenciaDosModelosLiberados> {
  let liberados: ModeloLiberadoParaEnvio[];
  try {
    liberados = await modelosLiberadosParaEnvio(db);
  } catch (e) {
    return {
      pronto: false,
      causa: "bancoRecusou",
      detalhe: `não foi possível ler os modelos liberados: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (liberados.length === 0) {
    return {
      pronto: false,
      causa: "semModelosLiberados",
      detalhe: "nenhum modelo APPROVED está liberado para envio na Sala Comercial",
    };
  }

  const lista = await listarModelosDeVendas(token);
  if (!lista.ok) {
    return { pronto: false, causa: "metaRecusou", detalhe: lista.erro };
  }

  for (const local of liberados) {
    const atual = acharNaMeta(local, lista.modelos);
    if (!atual) {
      return {
        pronto: false,
        causa: "naoAchado",
        detalhe: `"${local.nome}" (${local.idioma}) está liberado na Sala, mas não está entre os ${lista.modelos.length} modelos atuais da Meta`,
      };
    }

    if (atual.status !== "APPROVED") {
      return {
        pronto: false,
        causa: "naoAprovado",
        detalhe: `"${atual.nome}" (${atual.idioma}) está ${atual.status} na Meta`,
      };
    }

    if (atual.variaveis !== local.variaveis) {
      return {
        pronto: false,
        causa: "variaveisNaoBatem",
        detalhe:
          `"${atual.nome}" (${atual.idioma}) espera ${atual.variaveis} variável(is) na Meta, ` +
          `mas o espelho da Sala tem ${local.variaveis}. Sincronize os modelos antes de disparar.`,
      };
    }
  }

  return {
    pronto: true,
    modelos: liberados.map(({ nome, idioma, variaveis }) => ({ nome, idioma, variaveis })),
  };
}

/** Produção: empresta o token sem jamais expô-lo ao chamador. */
export function preVooDosModelosLiberados(
  db: Cliente,
): Promise<ConferenciaDosModelosLiberados> {
  return comOTokenDeVendas(
    (token) => conferirModelosLiberadosDeAbordagem(token, db),
    () => ({
      pronto: false,
      causa: "semToken",
      detalhe: "FOOCCI_SALES_ACCESS_TOKEN não está no ambiente",
    }),
  );
}
