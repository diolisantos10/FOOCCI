/**
 * AssinaturaMemory — a memória do anti-mesmice.
 *
 * O Variador só não repete se alguém lembrar o que já foi usado. Aqui é uma
 * PORTA: a implementação padrão é em processo (funciona, testável, custo zero)
 * e uma persistente pode ser plugada depois com `setAssinaturaMemory()` sem
 * mexer em nenhum caller.
 *
 * Limite honesto da versão em processo: a memória zera a cada deploy/reinício.
 * O anti-mesmice segura dentro de uma janela de execução, não entre elas.
 * Trocar por uma porta persistente é o passo que fecha isso.
 */

export interface AssinaturaMemory {
  /** As assinaturas mais recentes daquela chave, da mais nova pra mais velha. */
  recentes(chave: string, limite: number): Promise<string[]>;
  registrar(chave: string, assinatura: string): Promise<void>;
}

/** Quantas peças pra trás o Variador enxerga por padrão. */
export const JANELA_PADRAO = 10;

/** Teto por chave — a memória em processo não pode crescer sem limite. */
const TETO_POR_CHAVE = 50;
/** Teto de chaves distintas — protege contra vazamento em multi-tenant. */
const TETO_DE_CHAVES = 5_000;

class MemoriaEmProcesso implements AssinaturaMemory {
  private readonly mapa = new Map<string, string[]>();

  async recentes(chave: string, limite: number): Promise<string[]> {
    return (this.mapa.get(chave) ?? []).slice(0, limite);
  }

  async registrar(chave: string, assinatura: string): Promise<void> {
    if (!this.mapa.has(chave) && this.mapa.size >= TETO_DE_CHAVES) {
      // descarta a chave mais antiga (Map preserva ordem de inserção)
      const maisAntiga = this.mapa.keys().next().value;
      if (maisAntiga !== undefined) this.mapa.delete(maisAntiga);
    }
    const atual = this.mapa.get(chave) ?? [];
    this.mapa.set(chave, [assinatura, ...atual.filter((a) => a !== assinatura)].slice(0, TETO_POR_CHAVE));
  }

  limpar(): void {
    this.mapa.clear();
  }
}

const padrao = new MemoriaEmProcesso();
let atual: AssinaturaMemory = padrao;

export function setAssinaturaMemory(memory: AssinaturaMemory): void {
  atual = memory;
}

export function getAssinaturaMemory(): AssinaturaMemory {
  return atual;
}

/** Volta pra memória em processo, zerada. Para testes. */
export function resetAssinaturaMemory(): void {
  padrao.limpar();
  atual = padrao;
}

/**
 * A chave da memória: por negócio + agente + assunto. Restaurantes diferentes
 * não disputam a mesma janela, e "post de dia dos pais" não gasta o repertório
 * de "mensagem de recuperação".
 */
export function chaveDeMemoria(businessId: string, agentId: string, assunto: string): string {
  return `${businessId}::${agentId}::${assunto.trim().toLowerCase().slice(0, 80)}`;
}
