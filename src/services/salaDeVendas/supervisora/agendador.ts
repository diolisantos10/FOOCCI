/**
 * Varredura automática da Supervisora em modo INTERVENTION.
 *
 * Roda dentro do processo Railway, como os outros agendadores da aplicação.
 * Nos modos OFF/SHADOW/GUARD, a função faz somente a leitura do interruptor e
 * encerra. A trava de reentrada impede duas varreduras simultâneas.
 */
import { prisma } from "@/lib/prisma";
import { varrerConversasEmAndamento } from "./intervencao";

const INTERVALO_MS = 5 * 60 * 1000;
const ATRASO_INICIAL_MS = 60 * 1000;

let iniciado = false;
let executando = false;
let temporizador: NodeJS.Timeout | null = null;

async function executar(): Promise<void> {
  if (executando) return;
  executando = true;
  try {
    const resultado = await varrerConversasEmAndamento(prisma, new Date());
    if (resultado.rodou) {
      console.info("[supervisora/agendador] varredura concluída", {
        avaliados: resultado.leadsAvaliados,
        pausados: resultado.leadsPausados.length,
      });
    }
  } catch (erro) {
    console.error("[supervisora/agendador] varredura falhou", {
      erro: erro instanceof Error ? erro.message : String(erro),
    });
  } finally {
    executando = false;
  }
}

export const AgendadorDaSupervisora = {
  start(): void {
    if (iniciado || process.env.NODE_ENV === "test") return;
    iniciado = true;
    const inicial = setTimeout(() => void executar(), ATRASO_INICIAL_MS);
    inicial.unref?.();
    temporizador = setInterval(() => void executar(), INTERVALO_MS);
    temporizador.unref?.();
    console.info("[supervisora/agendador] ativo; intervalo de 5 minutos");
  },
  stop(): void {
    if (temporizador) clearInterval(temporizador);
    temporizador = null;
    iniciado = false;
  },
};
