/**
 * Amostra — "veio" ou "não veio, e por quê". Nunca vazio silencioso.
 *
 * ── Por que este tipo existe ──────────────────────────────────────────────────
 * A Sala dos Agentes lê de três lugares que podem falhar de forma independente:
 * o registro de perfis (banco/código), a pasta `.claude/agents` e a pasta
 * `docs/agents`. Em produção, qualquer uma delas pode simplesmente não estar na
 * imagem — e uma leitura que devolve lista vazia é indistinguível de "não tem
 * agente nenhum".
 *
 * Separar COLETA de JULGAMENTO é a regra já aprendida nesta casa (vitrine do
 * `cerebro`, 05/08): a sonda não consegue ver zero no lugar de "não li", porque
 * são tipos diferentes. Quem lê devolve `Amostra`; quem decide o estado da
 * medida recebe `Amostra` e é obrigado pelo compilador a tratar a falha.
 */

export type Amostra<T> =
  | { readonly ok: true; readonly dados: T }
  | { readonly ok: false; readonly motivo: string };

export const veio = <T>(dados: T): Amostra<T> => ({ ok: true, dados });

/**
 * O motivo é obrigatório e vira texto de tela (o `motivo` de `naoMedido`).
 * Guardrail 6: o alerta carrega a própria evidência.
 */
export const naoVeio = <T>(motivo: string): Amostra<T> => ({ ok: false, motivo });
