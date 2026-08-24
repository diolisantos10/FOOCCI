/**
 * PrismaArquivoDoDiario — o diário que sobrevive ao deploy.
 *
 * A versão em memória respondia "o que aconteceu no último minuto?". A pergunta
 * que decide se o SDR pode falar com gente de verdade é "o que aconteceu na
 * semana?" — e essa nenhuma memória de processo responde: o app roda em mais de
 * uma instância e reinicia a cada subida.
 *
 * Duas posturas opostas, e as duas de propósito:
 *
 *  • GRAVAR não propaga erro. O diário observa a entrevista; observar não pode
 *    derrubar o observado (guardrail 5). A falha vai para o log com a palavra
 *    `sdr-diario`, e a leitura declara essa cegueira.
 *
 *  • LER propaga. Uma leitura que devolve lista vazia por falha de banco seria
 *    lida como "não aconteceu nada" — exatamente a ausência virando informação
 *    que o guardrail 1 proíbe. Quem chama transforma isso em cegueira escrita.
 *
 * 🔒 A tabela não tem uma palavra de cliente dentro: só forma e desfecho.
 */

import { prisma } from "@/lib/prisma";
import type { MotivoDeFalhaDaIA } from "../engines/FalhaDeMotor";
import {
  RETENCAO_EM_DIAS,
  TETO_DE_LEITURA,
  type ArquivoDoDiario,
  type TurnoDoDiario,
} from "./DiarioDoSdr";

/** Chance de uma gravação também podar o que passou da retenção. */
const CHANCE_DE_PODA = 0.02;

export class PrismaArquivoDoDiario implements ArquivoDoDiario {
  readonly onde = "banco" as const;

  async gravar(turno: TurnoDoDiario): Promise<void> {
    try {
      await prisma.sdrDiarioTurno.create({
        data: {
          quando: new Date(turno.quando),
          conversa: turno.conversa,
          iaRespondeu: turno.iaRespondeu,
          motivoSemIA: turno.motivoSemIA,
          camposPelaIA: turno.camposPelaIA,
          camposPeloMotor: turno.camposPeloMotor,
          chavesPeloMotor: turno.chavesPeloMotor,
          perguntasNoAr: turno.perguntasNoAr,
          seguemSemResposta: turno.seguemSemResposta,
          travou: turno.travou,
          cobertura: turno.cobertura,
          podePropor: turno.podePropor,
        },
      });
    } catch (e) {
      console.error("[sdr-diario] falha ao gravar o turno no banco:", e);
      return;
    }

    // Poda amostrada: diário não é arquivo eterno, e uma tarefa agendada só para
    // isto seria uma peça a mais para alguém esquecer de ligar (o robô noturno
    // deste repositório já ficou sem motor uma vez, e ninguém percebeu).
    if (Math.random() < CHANCE_DE_PODA) {
      const corte = new Date(Date.now() - RETENCAO_EM_DIAS * 24 * 60 * 60 * 1000);
      await prisma.sdrDiarioTurno
        .deleteMany({ where: { quando: { lt: corte } } })
        .catch((e) => console.error("[sdr-diario] falha ao podar turnos antigos:", e));
    }
  }

  async ler(desde: Date): Promise<TurnoDoDiario[]> {
    const linhas = await prisma.sdrDiarioTurno.findMany({
      where: { quando: { gte: desde } },
      orderBy: { quando: "asc" },
      take: TETO_DE_LEITURA,
    });

    return linhas.map((l) => ({
      quando: l.quando.toISOString(),
      conversa: l.conversa,
      iaRespondeu: l.iaRespondeu,
      motivoSemIA: (l.motivoSemIA as MotivoDeFalhaDaIA | null) ?? null,
      camposPelaIA: l.camposPelaIA,
      camposPeloMotor: l.camposPeloMotor,
      chavesPeloMotor: l.chavesPeloMotor,
      perguntasNoAr: l.perguntasNoAr,
      seguemSemResposta: l.seguemSemResposta,
      travou: l.travou,
      cobertura: l.cobertura,
      podePropor: l.podePropor,
    }));
  }
}

export const prismaArquivoDoDiario = new PrismaArquivoDoDiario();
