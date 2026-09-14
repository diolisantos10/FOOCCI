export interface ContratoDeParametrosDoCorpo {
  variaveis: number;
  nomesParametros: string[];
  corpoRenderizavel: string;
}

/**
 * Lê o contrato das variáveis diretamente do BODY que veio da Meta.
 *
 * A Meta aceita dois formatos de placeholder no template:
 * - posicionais: {{1}}, {{2}}, ...
 * - nomeados: {{nome}}, {{restaurante}}, ...
 *
 * O restante da Sala trabalha internamente por posição. Para templates nomeados,
 * portanto, guardamos os nomes na ordem em que aparecem e produzimos uma cópia
 * renderizável do corpo com {{1}}, {{2}}, ... . O envio usa os nomes originais
 * para montar `parameter_name`; a conversa usa a cópia posicional para mostrar o
 * texto efetivamente enviado.
 */
export function contratoDeParametrosDoCorpo(
  corpo: string,
  variaveisPersistidas = 0,
): ContratoDeParametrosDoCorpo {
  const ocorrencias = [...corpo.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  if (ocorrencias.length === 0) {
    return {
      variaveis: Math.max(0, variaveisPersistidas),
      nomesParametros: [],
      corpoRenderizavel: corpo,
    };
  }

  const tokens = ocorrencias.map((m) => (m[1] ?? "").trim()).filter(Boolean);
  const todosPosicionais = tokens.every((t) => /^\d+$/.test(t));
  const todosNomeados = tokens.every((t) => !/^\d+$/.test(t));

  if (todosPosicionais) {
    const maior = tokens.reduce((max, token) => Math.max(max, Number(token)), 0);
    return {
      variaveis: maior,
      nomesParametros: [],
      corpoRenderizavel: corpo,
    };
  }

  if (todosNomeados) {
    const nomesParametros = [...new Set(tokens)];
    const indice = new Map(nomesParametros.map((nome, i) => [nome, i + 1]));
    const corpoRenderizavel = corpo.replace(
      /\{\{\s*([^{}]+?)\s*\}\}/g,
      (marcador, nome: string) => {
        const posicao = indice.get(String(nome).trim());
        return posicao ? `{{${posicao}}}` : marcador;
      },
    );

    return {
      variaveis: nomesParametros.length,
      nomesParametros,
      corpoRenderizavel,
    };
  }

  // A Meta não deveria aprovar BODY misturando os dois contratos. Se aparecer,
  // não inventamos uma conversão: preservamos o retrato persistido para que o
  // pré-voo continue fail-closed em vez de mandar parâmetros semanticamente
  // errados.
  return {
    variaveis: Math.max(0, variaveisPersistidas),
    nomesParametros: [],
    corpoRenderizavel: corpo,
  };
}
