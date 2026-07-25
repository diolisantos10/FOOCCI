/**
 * Variator — o anti-mesmice.
 *
 * Pedir "seja criativo" pra uma IA não funciona: ela volta pra média toda vez.
 * A variedade tem que vir de fora, em código: a gente gira os eixos e LEMBRA o
 * que já usou. Determinístico de propósito — mesma semente, mesma escolha —
 * pra dar teste, replay e auditoria.
 */

export interface Eixo {
  nome:   string;
  opcoes: string[];
}

export interface Variacao {
  eixos:      Record<string, string>;
  /** Identidade legível da combinação — é isso que vai pra memória. */
  assinatura: string;
  /** true quando TODAS as combinações já foram usadas: hora de ampliar os eixos. */
  esgotado:   boolean;
}

/** `angulo:45°|luz:janela de manhã` — legível de propósito, pra dar debug. */
export function assinar(eixos: Record<string, string>): string {
  return Object.keys(eixos)
    .sort()
    .map((k) => `${k}:${eixos[k]}`)
    .join("|");
}

/** Decodifica um índice em uma combinação, tipo um odômetro. */
function combinacaoNoIndice(eixos: Eixo[], indice: number): Record<string, string> {
  const escolha: Record<string, string> = {};
  let resto = indice;
  for (const eixo of eixos) {
    const opcao = eixo.opcoes[resto % eixo.opcoes.length];
    if (opcao !== undefined) escolha[eixo.nome] = opcao;
    resto = Math.floor(resto / eixo.opcoes.length);
  }
  return escolha;
}

export function totalDeCombinacoes(eixos: Eixo[]): number {
  return eixos.reduce((total, e) => total * e.opcoes.length, 1);
}

/**
 * Escolhe a próxima combinação que NÃO está entre as recentes.
 *
 * @param usadas assinaturas das últimas peças daquele restaurante/prato.
 * @param semente de onde começar a procurar — normalmente derivada do tenant +
 *        assunto, pra dois restaurantes não caírem na mesma sequência.
 */
export function variar(eixos: Eixo[], usadas: string[] = [], semente = 0): Variacao {
  const validos = eixos.filter((e) => e.opcoes.length > 0);
  if (validos.length === 0) return { eixos: {}, assinatura: "", esgotado: true };

  const total = totalDeCombinacoes(validos);
  const jaUsadas = new Set(usadas);
  const inicio = ((semente % total) + total) % total;   // semente negativa não quebra

  for (let passo = 0; passo < total; passo++) {
    const escolha = combinacaoNoIndice(validos, (inicio + passo) % total);
    const assinatura = assinar(escolha);
    if (!jaUsadas.has(assinatura)) return { eixos: escolha, assinatura, esgotado: false };
  }

  // Tudo já rodou: devolve a da semente e avisa — quem chama decide se amplia
  // os eixos ou aceita repetir. Melhor repetir sabendo do que repetir sem saber.
  const escolha = combinacaoNoIndice(validos, inicio);
  return { eixos: escolha, assinatura: assinar(escolha), esgotado: true };
}

/** Semente estável a partir de textos (tenant, prato, data). Sem Math.random. */
export function semear(...partes: string[]): number {
  let h = 5381;
  for (const parte of partes.join("|")) h = ((h * 33) ^ parte.charCodeAt(0)) >>> 0;
  return h;
}
