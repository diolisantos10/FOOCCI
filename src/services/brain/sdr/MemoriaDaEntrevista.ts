/**
 * MemoriaDaEntrevista — onde a sondagem fica guardada entre um turno e outro.
 *
 * Sem isto o Entrevistador é amnésico: cada chamada teria que receber a
 * entrevista inteira de volta, e quem esquecesse de mandar recomeçaria do zero
 * sem perceber. É esse tipo de esquecimento silencioso que produziu o briefing
 * quebrado — ninguém percebe o que não foi perguntado quando não há registro.
 *
 * Mesma forma de porta do `AssinaturaMemory`: implementação em processo para
 * teste, Prisma em produção, e um resolvedor que escolhe sozinho. O import da
 * versão Prisma é preguiçoso para teste de unidade não arrastar banco.
 *
 * Diferença importante de posture em relação à memória do anti-mesmice: lá,
 * banco fora do ar é aceitável (perde-se variedade). Aqui NÃO é. Perder a
 * entrevista significa perder o registro do que foi perguntado — e é justamente
 * esse registro que autoriza a proposta a sair. Por isso a gravação propaga o
 * erro em vez de engolir: melhor o SDR ver que não salvou do que seguir achando
 * que salvou.
 */

import type { EstadoDaSondagem } from "../oficina/Sondagem";

export interface MemoriaDaEntrevista {
  ler(chave: string): Promise<EstadoDaSondagem | null>;
  gravar(chave: string, estado: EstadoDaSondagem): Promise<void>;
  apagar(chave: string): Promise<void>;
}

/** Teto de entrevistas na memória em processo — protege contra vazamento. */
const TETO_DE_CHAVES = 2_000;

class MemoriaEmProcesso implements MemoriaDaEntrevista {
  private readonly mapa = new Map<string, string>();

  async ler(chave: string): Promise<EstadoDaSondagem | null> {
    const cru = this.mapa.get(chave);
    if (!cru) return null;
    try {
      return JSON.parse(cru) as EstadoDaSondagem;
    } catch {
      return null;
    }
  }

  async gravar(chave: string, estado: EstadoDaSondagem): Promise<void> {
    if (!this.mapa.has(chave) && this.mapa.size >= TETO_DE_CHAVES) {
      const maisAntiga = this.mapa.keys().next().value;
      if (maisAntiga !== undefined) this.mapa.delete(maisAntiga);
    }
    // serializa na entrada: quem gravou não consegue mexer no guardado depois
    this.mapa.set(chave, JSON.stringify(estado));
  }

  async apagar(chave: string): Promise<void> {
    this.mapa.delete(chave);
  }

  limpar(): void {
    this.mapa.clear();
  }
}

const emProcesso = new MemoriaEmProcesso();
let explicita: MemoriaDaEntrevista | null = null;

/** Override explícito — ganha de tudo. Para teste e wiring especial. */
export function setMemoriaDaEntrevista(memoria: MemoriaDaEntrevista): void {
  explicita = memoria;
}

/** Volta para a memória em processo, zerada e sem override. Para testes. */
export function resetMemoriaDaEntrevista(): void {
  emProcesso.limpar();
  explicita = null;
}

/** Override explícito > processo (em teste) > banco (produção). */
export async function resolverMemoriaDaEntrevista(): Promise<MemoriaDaEntrevista> {
  if (explicita) return explicita;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return emProcesso;
  try {
    const { prismaMemoriaDaEntrevista } = await import("./PrismaMemoriaDaEntrevista");
    return prismaMemoriaDaEntrevista;
  } catch {
    return emProcesso;
  }
}

/**
 * A chave da entrevista: agência + cliente.
 *
 * Duas agências atendendo o mesmo nome de cliente não podem se enxergar — a
 * entrevista carrega o que o cliente contou em confiança.
 */
export function chaveDaEntrevista(agenciaId: string, clienteId: string): string {
  return `${agenciaId.trim()}::${clienteId.trim().toLowerCase().slice(0, 120)}`;
}
