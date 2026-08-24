/**
 * NÃO CONFORMIDADE — o que a auditoria acha.
 *
 * Duas regras governam este arquivo, e as duas vêm do documento 09 da v3.
 *
 * ── 1. AUSÊNCIA DE EVIDÊNCIA NÃO É APROVAÇÃO ──
 *
 * Toda falha nasce com evidência anexada. Sem ela a falha não é aberta.
 *
 * Parece burocracia e não é: uma não conformidade sem prova é opinião, e opinião
 * não sustenta bloqueio de mudança crítica. No dia em que o Agente Gerente de
 * Qualidade barrar um rollout, ele vai precisar mostrar o quê — e "eu vi" não é
 * o quê.
 *
 * ── 2. QUEM AUDITA NÃO ASSINA A LIBERAÇÃO DO QUE AUDITOU ──
 *
 * Aceitar o risco de uma falha é uma decisão executiva legítima: nem tudo se
 * conserta, e às vezes o custo de consertar é maior que o do defeito.
 *
 * O que não pode é a mesma pessoa achar o problema e assinar que ele está
 * aceito. Isso transforma auditoria em teatro — e o pior é que fica indistinguível
 * de uma auditoria de verdade, porque os dois produzem o mesmo relatório limpo.
 */

import type { Prisma, PrismaClient, GravidadeDaFalha } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface NovaFalha {
  titulo: string;
  descricao: string;
  gravidade: GravidadeDaFalha;
  evidencia: string[];
  departmentId?: string | null;
  agentProfileId?: string | null;
  planoDeAcao?: string | null;
  prazo?: Date | null;
  encontradaPorId: string;
}

export interface RecusaDeFalha {
  campo: string;
  motivo: string;
}

export function validarFalha(nova: NovaFalha): RecusaDeFalha[] {
  const recusas: RecusaDeFalha[] = [];

  if (!nova.titulo?.trim()) {
    recusas.push({ campo: "titulo", motivo: "sem título a falha não é encontrável depois" });
  }

  if (!nova.descricao?.trim()) {
    recusas.push({ campo: "descricao", motivo: "sem descrição ninguém sabe o que consertar" });
  }

  if (!nova.evidencia?.length) {
    // A regra 1. Sem prova, a auditoria vira opinião — e opinião não bloqueia
    // rollout de agente.
    recusas.push({
      campo: "evidencia",
      motivo: "não conformidade sem evidência é opinião, e opinião não sustenta bloqueio",
    });
  }

  if (!nova.encontradaPorId) {
    recusas.push({ campo: "encontradaPorId", motivo: "toda falha tem quem a encontrou" });
  }

  // Bloqueante sem plano de ação é um alarme sem saída: para a operação e não
  // diz o que fazer para voltar.
  if (nova.gravidade === "BLOQUEANTE" && !nova.planoDeAcao?.trim()) {
    recusas.push({
      campo: "planoDeAcao",
      motivo: "falha bloqueante precisa dizer o que fazer para destravar",
    });
  }

  return recusas;
}

export type ResultadoDeAbrir =
  | { ok: true; falhaId: string }
  | { ok: false; recusas: RecusaDeFalha[] };

export async function abrirFalha(db: Cliente, nova: NovaFalha): Promise<ResultadoDeAbrir> {
  const recusas = validarFalha(nova);
  if (recusas.length) return { ok: false, recusas };

  const criada = await db.naoConformidade.create({
    data: {
      titulo: nova.titulo.trim(),
      descricao: nova.descricao.trim(),
      gravidade: nova.gravidade,
      evidencia: nova.evidencia,
      departmentId: nova.departmentId ?? null,
      agentProfileId: nova.agentProfileId ?? null,
      planoDeAcao: nova.planoDeAcao ?? null,
      prazo: nova.prazo ?? null,
      encontradaPorId: nova.encontradaPorId,
    },
  });

  return { ok: true, falhaId: criada.id };
}

export type ResultadoDeAceitar =
  | { ok: true; falhaId: string }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "semMotivo" }
  | { ok: false; causa: "mesmaPessoa" }
  | { ok: false; causa: "jaResolvida"; situacao: string };

/**
 * Aceitar o risco de uma falha.
 *
 * A trava da regra 2 está aqui: quem encontrou não aceita. E a escrita é
 * condicional na situação, pelo mesmo motivo de sempre — duas pessoas aceitando
 * ao mesmo tempo não podem produzir dois registros de aceite.
 */
export async function aceitarRisco(
  db: Cliente,
  params: { falhaId: string; aceitaPorId: string; motivo: string; agora?: Date },
): Promise<ResultadoDeAceitar> {
  const motivo = params.motivo?.trim();
  if (!motivo) return { ok: false, causa: "semMotivo" };

  const falha = await db.naoConformidade.findUnique({
    where: { id: params.falhaId },
    select: { encontradaPorId: true, situacao: true },
  });

  if (!falha) return { ok: false, causa: "naoExiste" };

  if (falha.encontradaPorId && falha.encontradaPorId === params.aceitaPorId) {
    // A regra 2. Sem esta linha, auditoria vira teatro — e o pior é que fica
    // indistinguível de uma auditoria de verdade no relatório.
    return { ok: false, causa: "mesmaPessoa" };
  }

  const alterados = await db.naoConformidade.updateMany({
    where: { id: params.falhaId, situacao: { in: ["ABERTA", "EM_TRATAMENTO"] } },
    data: {
      situacao: "ACEITA",
      aceitaPorId: params.aceitaPorId,
      motivoDaAceite: motivo,
      resolvidaEm: params.agora ?? new Date(),
    },
  });

  if (alterados.count === 1) return { ok: true, falhaId: params.falhaId };

  const atual = await db.naoConformidade.findUnique({
    where: { id: params.falhaId },
    select: { situacao: true },
  });
  return { ok: false, causa: "jaResolvida", situacao: atual?.situacao ?? "desconhecida" };
}

// ── O painel de qualidade do departamento ────────────────────────────────────

export interface SaudeDoDepartamento {
  abertas: number;
  bloqueantes: number;
  aceitas: number;
  /** `null` quando nunca houve auditoria — que é diferente de "está limpo". */
  leitura: "semAuditoria" | "limpo" | "atencao" | "bloqueado";
}

/**
 * Como está a qualidade de um departamento.
 *
 * A leitura `semAuditoria` é a que impede a mentira mais cara desta tela: um
 * departamento que nunca foi auditado aparece com zero falhas, exatamente como
 * um departamento auditado e limpo. Os dois são zero, e só um é boa notícia.
 */
export async function saudeDoDepartamento(
  db: Cliente,
  departmentId: string,
): Promise<SaudeDoDepartamento> {
  const [abertas, bloqueantes, aceitas, total] = await Promise.all([
    db.naoConformidade.count({
      where: { departmentId, situacao: { in: ["ABERTA", "EM_TRATAMENTO"] } },
    }),
    db.naoConformidade.count({
      where: { departmentId, gravidade: "BLOQUEANTE", situacao: { in: ["ABERTA", "EM_TRATAMENTO"] } },
    }),
    db.naoConformidade.count({ where: { departmentId, situacao: "ACEITA" } }),
    db.naoConformidade.count({ where: { departmentId } }),
  ]);

  if (total === 0) return { abertas: 0, bloqueantes: 0, aceitas: 0, leitura: "semAuditoria" };
  if (bloqueantes > 0) return { abertas, bloqueantes, aceitas, leitura: "bloqueado" };
  if (abertas > 0) return { abertas, bloqueantes, aceitas, leitura: "atencao" };
  return { abertas, bloqueantes, aceitas, leitura: "limpo" };
}
