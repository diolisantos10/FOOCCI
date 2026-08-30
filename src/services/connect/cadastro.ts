/**
 * O CADASTRO DO PRODUTO NO DIOLI CONNECT — quem é o Foocci, e quem fala por ele.
 *
 * ─── POR QUE ISTO NÃO É UMA LISTA NOVA DE CARGOS ────────────────────────────
 *
 * O defeito-mãe desta casa é duas verdades competindo: alguém escreve uma
 * segunda lista de agentes, ela discorda da primeira, e a partir daí ninguém
 * sabe qual vale. Então este arquivo **não declara cargo nenhum**. Ele LÊ o
 * organograma canônico (`services/organizacao/departamentosCanonicos.ts`), que
 * é a única definição da estrutura da Foocci, e apenas diz **quais daquelas
 * fichas o Dioli Connect conecta**.
 *
 * Se o organograma mudar, este cadastro muda junto, sem ninguém editar aqui.
 *
 * ─── ⚠️ A DIVERGÊNCIA QUE EU NÃO POSSO RESOLVER SOZINHO ─────────────────────
 *
 * A ordem que originou este trabalho pede para "conectar Diretor e Gerente
 * Geral". **O Foocci não tem Gerente Geral, e isso é decisão registrada do
 * CEO**, de 25/08/2026, com o motivo escrito no organograma:
 *
 *   "Não existe Gerente Geral. O Diretor da Foocci já ocupa essa camada. O
 *    cargo criaria um degrau a mais entre o Diretor e os Agentes Gerentes, sem
 *    ninguém para ocupá-lo."
 *
 * A regra tem trava: `PositionLevelCanonico` não tem o degrau, e dois testes da
 * casa reprovam quem tentar criá-lo (`organizacao.test.ts` e
 * `fichasDaEmpresa.test.ts`).
 *
 * Inventar aqui um "gerente-geral" para cumprir a ordem ao pé da letra seria
 * exatamente a segunda taxonomia — e ainda por cima contra uma decisão do dono.
 * Então o cadastro faz o honesto: **declara que a camada existe, declara que
 * ela está VAGA por decisão, e nomeia quem a ocupa hoje.** Quem lê a resposta
 * da porta vê isso escrito, não descobre depois.
 *
 * O que o Connect conecta, então, é o par que existe de verdade:
 *
 *   Diretor da Foocci  (`diretor-foocci`)          — a camada de direção
 *   Agente Gerente     (`agente-gerente-produto`)  — quem responde pelo agente
 *
 * O Agente Gerente de **Produto e Agentes de IA** é o gerente certo porque é o
 * departamento que "governa os agentes que fazem parte do produto vendido" — e
 * o agente que esta porta aciona é um deles.
 */

import {
  CARGOS_DE_DIRECAO,
  departamentoPorSlug,
  slugDoGerente,
  type CargoCanonico,
  type DepartamentoCanonico,
} from "@/services/organizacao/departamentosCanonicos";

/** O produto, como o Dioli Connect o conhece. */
export const PRODUTO_ID = "foocci" as const;
export const PRODUTO_NOME = "Foocci" as const;

/**
 * O departamento dono do agente que esta porta aciona. Não é escolha de estilo:
 * é quem "governa os agentes que fazem parte do produto vendido aos
 * restaurantes", na própria missão registrada dele.
 */
export const DEPARTAMENTO_DO_AGENTE = "produto" as const;

/**
 * ⭐ O AGENTE ACIONÁVEL É UMA LISTA DE UM.
 *
 * Não é um padrão: é conjunto fechado. O que não está aqui não atravessa, e a
 * forma do código diz a regra — no dia em que o CEO liberar um segundo agente,
 * o conserto é acrescentar um item, e a trava continua sendo a lista.
 *
 * Hoje o único é o `waiter`, e por um motivo medido: ele é o único agente deste
 * produto que **executa de verdade sem gastar chave de IA** — `WaiterBrainV2.decide`
 * é função pura, e o laboratório de simulação o roda com `usedLLM: false`.
 */
export const AGENTE_DO_PILOTO = "waiter" as const;
export const AGENTES_PERMITIDOS: readonly string[] = [AGENTE_DO_PILOTO];

/**
 * ⭐ A AUTORIDADE — quem pode fazer esta porta agir.
 *
 * Lista fechada, e ela é curta de propósito. O segredo prova que quem chama é a
 * Control Room; este campo diz **em nome de quem** ela fala. Um papel que não
 * está aqui não passa nem com o segredo certo — é o que impede que a porta
 * corporativa vire um canal por onde qualquer ficha do catálogo despacha ordem.
 *
 * `diretor-geral` é o da Control Room (o cérebro acima dos produtos);
 * `diretor-foocci` é o cargo canônico deste produto.
 */
export const DIRETOR_GERAL = "diretor-geral" as const;
export const DIRETOR_DO_PRODUTO = "diretor-foocci" as const;
export const QUEM_PODE_DESPACHAR: readonly string[] = [DIRETOR_GERAL, DIRETOR_DO_PRODUTO];

/**
 * O destinatário único: o Agente Gerente do departamento dono do agente. Derivado
 * do organograma (`slugDoGerente`), nunca digitado à mão.
 */
export const GERENTE_DO_PRODUTO = slugDoGerente(DEPARTAMENTO_DO_AGENTE);

/**
 * ⚠️ A CAMADA DE "GERENTE GERAL" — declarada VAGA, com o motivo, e não inventada.
 *
 * `null` aqui é uma afirmação, não um esquecimento: a ausência é decisão do CEO
 * e está registrada. Ausência de informação não seria informação; ausência
 * DECIDIDA é — e por isso vem com o porquê colado.
 */
export const GERENTE_GERAL: null = null;
export const POR_QUE_NAO_HA_GERENTE_GERAL =
  "o Foocci não tem cargo de Gerente Geral por decisão do CEO em 25/08/2026, registrada no organograma " +
  "canônico (regra 10): o Diretor da Foocci já ocupa essa camada, e o cargo criaria um degrau a mais entre " +
  "o Diretor e os Agentes Gerentes sem ninguém para ocupá-lo. O Dioli Connect NÃO cria o cargo para cumprir " +
  "a ordem ao pé da letra — criar seria a segunda taxonomia do mesmo organograma, contra decisão do dono. " +
  `Quem ocupa a camada é ${DIRETOR_DO_PRODUTO}; quem responde pelo agente acionado é ${GERENTE_DO_PRODUTO}.`;

/** Uma ficha conectada, do jeito que ela sai na resposta da porta. */
export interface FichaConectada {
  slug: string;
  titulo: string;
  nivel: string;
  /** De onde esta ficha foi lida. Nunca "escrita aqui". */
  fonte: "organograma-canonico";
}

function fichaDe(cargo: CargoCanonico): FichaConectada {
  return { slug: cargo.slug, titulo: cargo.titulo, nivel: cargo.nivel, fonte: "organograma-canonico" };
}

/** O Diretor da Foocci, lido do organograma. Lança se o cargo sumir de lá. */
export function diretorDoProduto(): FichaConectada {
  const cargo = CARGOS_DE_DIRECAO.find((c) => c.slug === DIRETOR_DO_PRODUTO);
  if (!cargo) {
    throw new Error(
      `cadastro do Dioli Connect quebrado: o cargo "${DIRETOR_DO_PRODUTO}" não existe mais no organograma ` +
        "canônico. A porta não inventa cargo: conserte o organograma ou o cadastro, nesta ordem.",
    );
  }
  return fichaDe(cargo);
}

/** O departamento dono do agente, lido do organograma. */
export function departamentoDoAgente(): DepartamentoCanonico {
  const dep = departamentoPorSlug(DEPARTAMENTO_DO_AGENTE);
  if (!dep) {
    throw new Error(
      `cadastro do Dioli Connect quebrado: o departamento "${DEPARTAMENTO_DO_AGENTE}" não existe mais no ` +
        "organograma canônico.",
    );
  }
  return dep;
}

/** O produto inteiro, como ele se cadastra no Dioli Connect. */
export interface CadastroDoProduto {
  produto: typeof PRODUTO_ID;
  nome: typeof PRODUTO_NOME;
  diretor: FichaConectada;
  gerente_geral: null;
  por_que_sem_gerente_geral: string;
  gerente_do_agente: { slug: string; departamento: string; nome_do_departamento: string };
  agentes_acionaveis: readonly string[];
  quem_pode_despachar: readonly string[];
}

/**
 * O cadastro montado. É função, e não constante, porque ele LÊ o organograma —
 * uma constante congelaria no import e esconderia a quebra se o cargo sumisse.
 */
export function cadastroDoProduto(): CadastroDoProduto {
  const dep = departamentoDoAgente();
  return {
    produto: PRODUTO_ID,
    nome: PRODUTO_NOME,
    diretor: diretorDoProduto(),
    gerente_geral: GERENTE_GERAL,
    por_que_sem_gerente_geral: POR_QUE_NAO_HA_GERENTE_GERAL,
    gerente_do_agente: { slug: GERENTE_DO_PRODUTO, departamento: dep.slug, nome_do_departamento: dep.nome },
    agentes_acionaveis: AGENTES_PERMITIDOS,
    quem_pode_despachar: QUEM_PODE_DESPACHAR,
  };
}
