import { Prisma, type PrismaClient } from "@prisma/client";
import { foocciSalesPhoneNumberId } from "./FoocciSalesChannel";
import { modeloAprovadoDaSala } from "./sincronizarModelos";
import { contratoDeParametrosDoCorpo } from "./templateParamFormat";

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
  /** Vazio = template posicional. Preenchido = Meta espera parameter_name. */
  nomesParametros: string[];
}

type ModeloLiberadoDoBanco = Omit<ModeloLiberadoParaEnvio, "nomesParametros">;

export type ResultadoDePermissao =
  | { ok: true; podeEnviar: boolean }
  | { ok: false; causa: "semNumero" | "naoEncontrado" | "naoAprovado"; detalhe: string };

/**
 * Lista o retrato efetivo da tela: somente modelos APPROVED pela Meta, junto da
 * decisão operacional da Foocci. A ausência de uma linha de controle equivale a
 * FALSE. Modelos pendentes, rejeitados ou removidos não aparecem na página e
 * nunca entram no pool de envio.
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
      AND m."situacao" = 'APPROVED'
    ORDER BY m."nome" ASC, m."idioma" ASC
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

function aplicarContratoDoCorpo(modelo: ModeloLiberadoDoBanco): ModeloLiberadoParaEnvio {
  const contrato = contratoDeParametrosDoCorpo(modelo.corpo, modelo.variaveis);
  return {
    nome: modelo.nome,
    idioma: modelo.idioma,
    variaveis: contrato.variaveis,
    corpo: contrato.corpoRenderizavel,
    nomesParametros: contrato.nomesParametros,
  };
}

async function lerLiberados(db: Cliente): Promise<ModeloLiberadoParaEnvio[]> {
  const phoneNumberId = foocciSalesPhoneNumberId();
  if (!phoneNumberId) return [];

  const linhas = await db.$queryRaw<ModeloLiberadoDoBanco[]>(Prisma.sql`
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

  return linhas.map(aplicarContratoDoCorpo);
}

/**
 * Reserva exclusiva para ambiente em que o ENVIO REAL está desligado.
 *
 * As jornadas e diagnósticos antigos simulam a entrega com a chave global de
 * outbound desligada; eles precisam de um corpo de template para atravessar a
 * lógica sem jamais alcançar cliente. Nessa condição — e SOMENTE nela — pode-se
 * reaproveitar o modelo legado já APPROVED no espelho local quando a Meta não
 * está acessível. Com `FOOCCI_SDR_SEND_ENABLED=true`, esta função sempre devolve
 * vazio: produção continua fail-closed e nunca cai naquela frase fixa.
 */
async function modeloSomenteParaDryRun(db: Cliente): Promise<ModeloLiberadoParaEnvio[]> {
  if (process.env.FOOCCI_SDR_SEND_ENABLED === "true") return [];

  const nome = (process.env.FOOCCI_SDR_MODELO_ABORDAGEM ?? "").trim();
  const idioma = (process.env.FOOCCI_SDR_MODELO_IDIOMA ?? "pt_BR").trim();
  if (!nome) return [];

  const modelo = await modeloAprovadoDaSala(db, nome, idioma);
  if (!modelo?.corpo) return [];
  return [aplicarContratoDoCorpo({
    nome: modelo.nome,
    idioma: modelo.idioma,
    variaveis: modelo.variaveis,
    corpo: modelo.corpo,
  })];
}

/**
 * A decisão operacional é uma só: APPROVED na Meta + toggle "Pode enviar"
 * ligado na Sala. Não existe mais regra de "melhores", "últimos seis" ou
 * seleção automática. Em produção, zero toggles verdes significa zero modelos
 * liberados e o pré-voo bloqueia o disparo.
 */
export async function modelosLiberadosParaEnvio(
  db: Cliente,
): Promise<ModeloLiberadoParaEnvio[]> {
  const liberados = await lerLiberados(db);
  if (liberados.length > 0) return liberados;
  return modeloSomenteParaDryRun(db);
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
