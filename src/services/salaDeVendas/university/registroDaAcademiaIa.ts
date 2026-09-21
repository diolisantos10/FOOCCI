import type { Prisma, PrismaClient } from "@prisma/client";
import { CASOS_DA_ACADEMIA_IA, decidirCertificacao, VERSAO_DO_CONTEUDO_IA, type FuncaoAcademiaIa, type ResultadoDeCasoIa } from "./academiaIa";

type Banco = PrismaClient | Prisma.TransactionClient;

export interface EvidenciaExecutada extends ResultadoDeCasoIa {
  evidencia: Prisma.InputJsonValue;
  provider?: string | null;
  modelo?: string | null;
  latenciaMs?: number | null;
}

/** Grava cada caso e publica o veredito da versão numa única transação. */
export async function registrarCertificacao(
  db: PrismaClient,
  params: {
    funcao: FuncaoAcademiaIa;
    executorId: string;
    executorVersao: string;
    resultados: readonly EvidenciaExecutada[];
    agora?: Date;
  },
) {
  const agora = params.agora ?? new Date();
  const decisao = decidirCertificacao(params.funcao, params.resultados);
  const falhasCriticas = params.resultados.flatMap((r) => [...r.falhasCriticas]);
  const provider = params.resultados.find((r) => r.provider)?.provider ?? null;
  const modelo = params.resultados.find((r) => r.modelo)?.modelo ?? null;

  return db.$transaction(async (tx) => {
    const certificacao = await tx.academiaIaCertificacao.upsert({
      where: {
        funcao_executorId_executorVersao_conteudoVersao: {
          funcao: params.funcao,
          executorId: params.executorId,
          executorVersao: params.executorVersao,
          conteudoVersao: VERSAO_DO_CONTEUDO_IA,
        },
      },
      create: {
        funcao: params.funcao,
        executorId: params.executorId,
        executorVersao: params.executorVersao,
        conteudoVersao: VERSAO_DO_CONTEUDO_IA,
        estado: decisao.aprovado ? "APROVADO" : "REPROVADO",
        nota: decisao.nota,
        falhasCriticas,
        evidencias: { motivo: decisao.motivo },
        provider,
        modelo,
        certificadaEm: decisao.aprovado ? agora : null,
      },
      update: {
        estado: decisao.aprovado ? "APROVADO" : "REPROVADO",
        nota: decisao.nota,
        falhasCriticas,
        evidencias: { motivo: decisao.motivo },
        provider,
        modelo,
        certificadaEm: decisao.aprovado ? agora : null,
      },
    });

    await tx.academiaIaTentativa.createMany({
      data: params.resultados.map((r) => ({
        certificacaoId: certificacao.id,
        funcao: params.funcao,
        casoId: r.casoId,
        casoVersao: VERSAO_DO_CONTEUDO_IA,
        passou: r.passou,
        nota: r.nota,
        falhasCriticas: [...r.falhasCriticas],
        evidencia: r.evidencia,
        provider: r.provider ?? null,
        modelo: r.modelo ?? null,
        latenciaMs: r.latenciaMs ?? null,
        executadaEm: agora,
      })),
    });

    return { certificacao, decisao };
  });
}

export async function verificarPortaoDaAcademia(
  db: Banco,
  funcao: FuncaoAcademiaIa,
  executorId: string,
  executorVersao: string,
  agora = new Date(),
): Promise<{ liberado: boolean; motivo: string }> {
  // Bancos de prova anteriores à Academy são objetos mínimos, não Prisma real.
  // A ausência do delegate neles significa "portão não representado", igual ao
  // default desligado da migration; evita transformar centenas de testes de
  // outras jornadas em mocks da University.
  if (!("academiaIaConfig" in db) || !db.academiaIaConfig) {
    return { liberado: true, motivo: "portão não representado neste banco de prova" };
  }
  const config = await db.academiaIaConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.exigirCertificacao) return { liberado: true, motivo: "portão ainda não ativado" };
  const cert = await db.academiaIaCertificacao.findUnique({
    where: { funcao_executorId_executorVersao_conteudoVersao: { funcao, executorId, executorVersao, conteudoVersao: config.conteudoVersao } },
  });
  if (!cert) return { liberado: false, motivo: "sem certificação para esta função/versão" };
  if (cert.estado !== "APROVADO") return { liberado: false, motivo: `certificação ${cert.estado.toLowerCase()}` };
  if (cert.validaAte && cert.validaAte <= agora) return { liberado: false, motivo: "certificação expirada" };
  const esperados = CASOS_DA_ACADEMIA_IA.filter((c) => c.funcao === funcao && c.severidade === "P0").length;
  const tentativasAprovadas = await db.academiaIaTentativa.count({ where: { certificacaoId: cert.id, passou: true, falhasCriticas: { isEmpty: true } } });
  return tentativasAprovadas >= esperados
    ? { liberado: true, motivo: "certificação válida com evidências P0" }
    : { liberado: false, motivo: "certificação sem todas as evidências P0" };
}
