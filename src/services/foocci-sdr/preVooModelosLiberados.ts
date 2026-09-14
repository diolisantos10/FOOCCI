import type { Prisma, PrismaClient } from "@prisma/client";
import { comOTokenDeVendas } from "./FoocciSalesChannel";
import {
  listarModelosDeVendas,
  type ConferenciaDoModelo,
  type ModeloNaMeta,
} from "./modelosDaMeta";
import {
  modelosLiberadosParaEnvio,
  type ModeloLiberadoParaEnvio,
} from "./modelosLiberados";

type Cliente = PrismaClient | Prisma.TransactionClient;

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
 * modelos APPROVED que a Sala liberou. Portanto o pré-voo confere exatamente
 * ESSE conjunto, ao vivo na Meta. Se qualquer modelo estiver ausente, reprovado
 * ou com contrato de variáveis diferente do retrato persistido, a rodada para
 * antes de falar com um lead.
 *
 * O retorno mantém o contrato `ConferenciaDoModelo` porque a fila só precisa de
 * um veredito pronto/não-pronto. No sucesso, `modelo` representa o primeiro do
 * pool; todos os modelos do pool já foram validados antes desse retorno.
 */
export async function conferirModelosLiberadosDeAbordagem(
  token: string,
  db: Cliente,
): Promise<ConferenciaDoModelo> {
  let liberados: ModeloLiberadoParaEnvio[];
  try {
    liberados = await modelosLiberadosParaEnvio(db);
  } catch (e) {
    return {
      pronto: false,
      causa: "naoAchado",
      detalhe: `não foi possível ler os modelos liberados: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (liberados.length === 0) {
    return {
      pronto: false,
      causa: "naoAchado",
      detalhe: "nenhum modelo APPROVED está liberado para envio na Sala Comercial",
    };
  }

  const lista = await listarModelosDeVendas(token);
  if (!lista.ok) {
    return { pronto: false, causa: "metaRecusou", detalhe: lista.erro };
  }

  let primeiroValidado: ModeloNaMeta | null = null;

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

    primeiroValidado ??= atual;
  }

  // `liberados.length > 0` e cada item achou correspondente na Meta.
  const modelo = primeiroValidado!;
  return {
    pronto: true,
    modelo,
    parametrosQueMandamos: modelo.variaveis,
  };
}

/** Produção: empresta o token sem jamais expô-lo ao chamador. */
export function preVooDosModelosLiberados(
  db: Cliente,
): Promise<ConferenciaDoModelo> {
  return comOTokenDeVendas<ConferenciaDoModelo>(
    (token) => conferirModelosLiberadosDeAbordagem(token, db),
    () => ({
      pronto: false,
      causa: "semToken",
      detalhe: "FOOCCI_SALES_ACCESS_TOKEN não está no ambiente",
    }),
  );
}
