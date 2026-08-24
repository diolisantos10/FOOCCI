/**
 * OS 9 DEPARTAMENTOS CANÔNICOS E O ORGANOGRAMA.
 *
 * Fonte: `docs/arquitetura-operacional-foocci-v1/01-DEPARTAMENTOS-E-AGENTES.md`
 * e `09-PLANO-MESTRE-DO-PROJETO-INTEIRO.md`.
 *
 * Este arquivo é a única definição da estrutura. O seed lê daqui; a tela lê do
 * banco que o seed preencheu. Departamento que não estiver aqui não existe.
 */

export interface DepartamentoCanonico {
  numero: number;
  slug: string;
  nome: string;
  missao: string;
  /** Rota sugerida no plano mestre, seção 7. */
  rota: string;
}

export const DEPARTAMENTOS: readonly DepartamentoCanonico[] = [
  {
    numero: 1,
    slug: "marketing",
    nome: "Marketing & Growth",
    missao: "Gerar demanda qualificada e rastreável.",
    rota: "/admin/marketing",
  },
  {
    numero: 2,
    slug: "vendas",
    nome: "Vendas e Receita",
    missao: "Transformar demanda em receita.",
    rota: "/admin/vendas",
  },
  {
    numero: 3,
    slug: "implantacao",
    nome: "Implantação e Onboarding",
    missao: "Levar o cliente ganho ao primeiro valor.",
    rota: "/admin/implantacao",
  },
  {
    numero: 4,
    slug: "sucesso",
    nome: "Sucesso do Cliente e Suporte",
    missao: "Adoção, retenção, expansão e resolução.",
    rota: "/admin/sucesso",
  },
  {
    numero: 5,
    slug: "produto",
    nome: "Produto e Experiência",
    missao: "Decidir e desenhar o valor do produto.",
    rota: "/admin/produto",
  },
  {
    numero: 6,
    slug: "agentes",
    nome: "Agentes e Inteligência do Produto",
    missao: "Garantir qualidade e segurança dos agentes oficiais.",
    rota: "/admin/agentes",
  },
  {
    numero: 7,
    slug: "tecnologia",
    nome: "Tecnologia, Operações e Integrações",
    missao: "Construir e manter a plataforma confiável.",
    rota: "/admin/tecnologia",
  },
  {
    numero: 8,
    slug: "qualidade",
    nome: "Qualidade, Segurança e Compliance",
    missao: "Proteger clientes, dados, produto e marca.",
    rota: "/admin/qualidade",
  },
  {
    numero: 9,
    slug: "financeiro",
    nome: "Financeiro e Administrativo",
    missao: "Sustentar economicamente e administrativamente a operação.",
    rota: "/admin/financeiro",
  },
] as const;

export type PositionLevelCanonico =
  | "CEO"
  | "DIRETOR"
  | "GERENTE_GERAL"
  | "GERENTE"
  | "OPERACAO";

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
 * O organograma.
 *
 * Cargo existe INDEPENDENTE de ter gente nele. O plano mestre é explícito:
 * "o sistema preserva a posição organizacional para permitir crescimento sem
 * reconstrução". Cargo vago é informação — "o Gerente de Produto não existe" e
 * "ninguém ocupa o cargo de Gerente de Produto" são frases muito diferentes, e
 * só a segunda é verdadeira hoje.
 */
export const CARGOS: readonly CargoCanonico[] = [
  { slug: "ceo", titulo: "CEO", nivel: "CEO" },
  { slug: "diretor-foocci", titulo: "Diretor Foocci", nivel: "DIRETOR", reportaA: "ceo" },
  {
    slug: "gerente-geral",
    titulo: "Gerente Geral",
    nivel: "GERENTE_GERAL",
    reportaA: "diretor-foocci",
  },
  ...DEPARTAMENTOS.map((d) => ({
    slug: `gerente-${d.slug}`,
    titulo: `Gerente de ${d.nome}`,
    nivel: "GERENTE" as const,
    departamento: d.slug,
    reportaA: "gerente-geral",
  })),
] as const;

export function departamentoPorSlug(slug: string): DepartamentoCanonico | undefined {
  return DEPARTAMENTOS.find((d) => d.slug === slug);
}
