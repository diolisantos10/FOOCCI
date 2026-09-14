import { Prisma, type PrismaClient } from "@prisma/client";
import { foocciSalesPhoneNumberId } from "./FoocciSalesChannel";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface ModeloComPermissaoDeEnvio {
  nome: string;
  idioma: string;
  categoria: string | null;
  situacao: string;
  variaveis: number;
  corpo: string | null;
  podeEnviar: boolean;
}

export interface ModeloLiberadoParaEnvio {
  nome: string;
  idioma: string;
  variaveis: number;
  corpo: string;
}

export type ResultadoDePermissao =
  | { ok: true; podeEnviar: boolean }
  | { ok: false; causa: "semNumero" | "naoEncontrado" | "naoAprovado"; detalhe: string };

/**
 * Lista o retrato efetivo da tela: aprovação da Meta + decisão operacional da Foocci.
 * A ausência de uma linha de controle equivale a FALSE. Essa é a trava que impede
 * template antigo de voltar a ser usado só por continuar APPROVED na Meta.
 */
export async function modelosComPermissaoDeEnvio(
  db: Cliente,
): Promise<ModeloComPermissaoDeEnvio[]> {
  const phoneNumberId = foocciSalesPhoneNumberId();
  if (!phoneNumberId) return [];

  return db.$queryRaw<ModeloComPermissaoDeEnvio[]>(Prisma.sql`
    SELECT
      m."nome",
      m."idioma",
      m."categoria",
      m."situacao",
      m."variaveis",
      m."corpo",
      COALESCE(e."podeEnviar", FALSE) AS "podeEnviar"
    FROM "modelos_de_vendas" m
    LEFT JOIN "modelos_de_vendas_envio" e
      ON e."phoneNumberId" = m."phoneNumberId"
     AND e."nome" = m."nome"
     AND e."idioma" = m."idioma"
    WHERE m."phoneNumberId" = ${phoneNumberId}
    ORDER BY m."situacao" ASC, m."nome" ASC
  `);
}

/**
 * Liga/desliga um modelo. Ligar exige que ele exista AGORA no espelho da Meta e
 * esteja APPROVED. Desligar nunca depende de fallback: uma vez FALSE, não sai.
 */
export async function definirPodeEnviar(
  db: Cliente,
  params: { nome: string; idioma: string; podeEnviar: boolean },
): Promise<ResultadoDePermissao> {
  const phoneNumberId = foocciSalesPhoneNumberId();
  if (!phoneNumberId) {
    return {
      ok: false,
      causa: "semNumero",
      detalhe: "O número comercial não está configurado; nenhum modelo foi alterado.",
    };
  }

  const nome = params.nome.trim();
  const idioma = params.idioma.trim();
  const [modelo] = await db.$queryRaw<Array<{ situacao: string }>>(Prisma.sql`
    SELECT "situacao"
    FROM "modelos_de_vendas"
    WHERE "phoneNumberId" = ${phoneNumberId}
      AND "nome" = ${nome}
      AND "idioma" = ${idioma}
    LIMIT 1
  `);

  if (!modelo) {
    return {
      ok: false,
      causa: "naoEncontrado",
      detalhe: "Este modelo não existe no espelho atual da conta da Meta.",
    };
  }

  if (params.podeEnviar && modelo.situacao !== "APPROVED") {
    return {
      ok: false,
      causa: "naoAprovado",
      detalhe: "Só um modelo APPROVED pela Meta pode ser liberado para envio.",
    };
  }

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "modelos_de_vendas_envio"
      ("phoneNumberId", "nome", "idioma", "podeEnviar", "updatedAt")
    VALUES
      (${phoneNumberId}, ${nome}, ${idioma}, ${params.podeEnviar}, CURRENT_TIMESTAMP)
    ON CONFLICT ("phoneNumberId", "nome", "idioma")
    DO UPDATE SET
      "podeEnviar" = EXCLUDED."podeEnviar",
      "updatedAt" = CURRENT_TIMESTAMP
  `);

  return { ok: true, podeEnviar: params.podeEnviar };
}

/**
 * Somente modelos que passam pelas DUAS autorizações entram no sorteio:
 * 1) APPROVED na Meta; 2) Pode enviar ligado na Sala.
 * Corpo nulo também é excluído — não se manda algo que a própria Sala não consegue
 * renderizar e auditar antes de falar com um lead frio.
 */
export async function modelosLiberadosParaEnvio(
  db: Cliente,
): Promise<ModeloLiberadoParaEnvio[]> {
  const phoneNumberId = foocciSalesPhoneNumberId();
  if (!phoneNumberId) return [];

  return db.$queryRaw<ModeloLiberadoParaEnvio[]>(Prisma.sql`
    SELECT
      m."nome",
      m."idioma",
      m."variaveis",
      m."corpo"
    FROM "modelos_de_vendas" m
    INNER JOIN "modelos_de_vendas_envio" e
      ON e."phoneNumberId" = m."phoneNumberId"
     AND e."nome" = m."nome"
     AND e."idioma" = m."idioma"
    WHERE m."phoneNumberId" = ${phoneNumberId}
      AND m."situacao" = 'APPROVED'
      AND e."podeEnviar" = TRUE
      AND m."corpo" IS NOT NULL
    ORDER BY m."nome" ASC, m."idioma" ASC
  `);
}

/** Sorteio uniforme; random injetável deixa a regra verificável em teste. */
export function escolherAleatorio<T>(
  itens: readonly T[],
  random: () => number = Math.random,
): T | null {
  if (itens.length === 0) return null;
  const bruto = random();
  const normalizado = Number.isFinite(bruto) ? Math.min(Math.max(bruto, 0), 0.9999999999999999) : 0;
  return itens[Math.floor(normalizado * itens.length)] ?? itens[0] ?? null;
}

export async function escolherModeloLiberado(
  db: Cliente,
  random: () => number = Math.random,
): Promise<ModeloLiberadoParaEnvio | null> {
  return escolherAleatorio(await modelosLiberadosParaEnvio(db), random);
}
