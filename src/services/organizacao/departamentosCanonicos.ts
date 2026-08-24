/**
 * OS 6 DEPARTAMENTOS OFICIAIS E O ORGANOGRAMA (v3).
 *
 * Fonte: `docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md`
 * e `01-HIERARQUIA-E-GOVERNANCA.md`.
 *
 * ── O QUE MUDOU DA v1 PARA A v3, E POR QUÊ ──
 *
 * A planta anterior tinha 9 departamentos e reproduzia funções da agência Dioli
 * que não pertencem à operação interna da Foocci. Decisão do CEO em 25/08/2026:
 *
 *   - **Marketing sai.** A aquisição é executada pela Dioli. A Foocci recebe o
 *     lead, registra origem e campanha, vende, e DEVOLVE à Dioli os dados de
 *     conversão e qualidade. Duplicar a estrutura da agência aqui dentro
 *     produziria dois times fazendo a mesma coisa e brigando pelo mesmo número.
 *   - **Implantação funde com Sucesso do Cliente.** Quem implanta é quem
 *     acompanha; separar cria um handoff a mais dentro da mesma jornada.
 *   - **Produto funde com Agentes de IA.** O backlog do produto e a governança
 *     dos agentes vendidos são a mesma fila de decisão.
 *   - **Não existe Gerente Geral.** O Diretor da Foocci já ocupa essa camada.
 *     O cargo criaria um degrau a mais entre o Diretor e os Agentes Gerentes,
 *     sem ninguém para ocupá-lo.
 *
 * Este arquivo é a única definição da estrutura. O seed lê daqui; a tela lê do
 * banco que o seed preencheu. Departamento que não estiver aqui não existe.
 */

export interface DepartamentoCanonico {
  numero: number;
  slug: string;
  nome: string;
  missao: string;
  rota: string;
}

export const DEPARTAMENTOS: readonly DepartamentoCanonico[] = [
  {
    numero: 1,
    slug: "vendas",
    nome: "Vendas e Receita",
    missao:
      "Receber, qualificar, nutrir e converter restaurantes interessados em contratar a Foocci.",
    rota: "/admin/vendas",
  },
  {
    numero: 2,
    slug: "cliente",
    nome: "Implantação e Sucesso do Cliente",
    missao:
      "Receber o cliente vendido, implantar, acompanhar a operação, prestar suporte e trabalhar retenção.",
    rota: "/admin/cliente",
  },
  {
    numero: 3,
    slug: "produto",
    nome: "Produto e Agentes de IA",
    missao:
      "Evoluir a plataforma e governar os agentes que fazem parte do produto vendido aos restaurantes.",
    rota: "/admin/produto",
  },
  {
    numero: 4,
    slug: "tecnologia",
    nome: "Tecnologia e Confiabilidade",
    missao: "Construir, integrar e manter a plataforma estável e disponível.",
    rota: "/admin/tecnologia",
  },
  {
    numero: 5,
    slug: "qualidade",
    nome: "Qualidade, Segurança e Governança",
    missao:
      "Impedir falha comercial, operacional, técnica, legal e comportamental dos agentes de IA.",
    rota: "/admin/qualidade",
  },
  {
    numero: 6,
    slug: "financeiro",
    nome: "Financeiro e Administrativo",
    missao: "Administrar o financeiro e os contratos da Foocci.",
    rota: "/admin/financeiro",
  },
] as const;

/**
 * Departamentos da v1 que NÃO existem mais.
 *
 * Ficam nomeados aqui, e não só apagados, porque o seed precisa desativá-los em
 * bancos que já rodaram a v1 — e porque daqui a três meses alguém vai propor
 * "criar um departamento de Marketing" sem saber que ele existiu e saiu por
 * decisão do CEO.
 */
export const DEPARTAMENTOS_APOSENTADOS: ReadonlyArray<{ slug: string; motivo: string }> = [
  { slug: "marketing", motivo: "aquisição é executada pela Dioli, não pela Foocci" },
  { slug: "implantacao", motivo: "fundido em Implantação e Sucesso do Cliente" },
  { slug: "sucesso", motivo: "fundido em Implantação e Sucesso do Cliente" },
  { slug: "agentes", motivo: "fundido em Produto e Agentes de IA" },
];

/** Sem `GERENTE_GERAL`: o Diretor da Foocci já ocupa essa camada (regra 10). */
export type PositionLevelCanonico = "CEO" | "DIRETOR" | "GERENTE" | "OPERACAO";

export interface CargoCanonico {
  slug: string;
  titulo: string;
  nivel: PositionLevelCanonico;
  /** Slug do departamento. Ausente para os cargos acima dos departamentos. */
  departamento?: string;
  /** Slug do cargo a quem este se reporta. Ausente só para o CEO. */
  reportaA?: string;
}

/**
 * Os dois cargos de direção.
 *
 * Os outros 28 NÃO estão aqui de propósito: eles são derivados do catálogo
 * (`02-DEPARTAMENTOS-E-AGENTES.md`) pelo seed, para não existirem duas listas
 * de agentes que podem discordar. O catálogo é a fonte; este arquivo é a moldura.
 */
export const CARGOS_DE_DIRECAO: readonly CargoCanonico[] = [
  { slug: "ceo", titulo: "CEO / Master", nivel: "CEO" },
  { slug: "diretor-foocci", titulo: "Diretor da Foocci", nivel: "DIRETOR", reportaA: "ceo" },
] as const;

/** Cargo do Agente Gerente de um departamento. */
export function slugDoGerente(slugDoDepartamento: string): string {
  return `agente-gerente-${slugDoDepartamento}`;
}

export function departamentoPorSlug(slug: string): DepartamentoCanonico | undefined {
  return DEPARTAMENTOS.find((d) => d.slug === slug);
}

export function departamentoPorNumero(numero: number): DepartamentoCanonico | undefined {
  return DEPARTAMENTOS.find((d) => d.numero === numero);
}
