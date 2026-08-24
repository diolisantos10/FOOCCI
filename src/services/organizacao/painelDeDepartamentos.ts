/**
 * O PAINEL DE DEPARTAMENTOS E AGENTES.
 *
 * Monta o que a área `/admin/departamentos` mostra: os 6 cards, o Agente Gerente
 * destacado em cada um, os agentes subordinados e os indicadores resumidos.
 *
 * ── A REGRA QUE GOVERNA OS INDICADORES ──
 *
 * Nenhum número aqui é inventado, e nenhum é zero por preguiça. Quando a leitura
 * falha, o painel devolve `leituraOk: false` com o motivo — não uma lista vazia.
 *
 * A diferença importa: lista vazia faz a tela escrever "nenhum agente
 * cadastrado", que é uma afirmação sobre a empresa. "Não consegui perguntar ao
 * banco" é uma afirmação sobre o sistema. Só a segunda é verdade quando o banco
 * está fora.
 */

import { prisma } from "@/lib/prisma";
import { DEPARTAMENTOS } from "./departamentosCanonicos";
import { caminhoDoComando, type CaminhoDoComando } from "@/services/governanca/delegacao";
import { saudeDoDepartamento, type SaudeDoDepartamento } from "@/services/governanca/naoConformidade";

export type ModoNaTela = "AI" | "HUMAN" | "HYBRID";

export type PopulacaoNaTela = "PRODUTO" | "DESENVOLVIMENTO" | "EMPRESA";

export interface AgenteNaTela {
  slug: string;
  nome: string;
  catalogNumber: string | null;
  modo: ModoNaTela;
  /** `PRODUTO` = agente vendido dentro do produto. `EMPRESA` = função da Foocci. */
  populacao: PopulacaoNaTela;
  /** `true` quando o cargo dele é de gerência do departamento. */
  ehGerente: boolean;
  status: string;
  isRuntimeEnabled: boolean;
  /** Cargo responsável. `ocupante` nulo é VAGO — informação, não defeito. */
  responsavel: { titulo: string; ocupante: string | null } | null;
  pode: string[];
  naoPode: string[];
  escalaQuando: string[];
}

export interface IndicadoresDoDepartamento {
  agentes: number;
  ia: number;
  humano: number;
  hibrido: number;
  /** Quantos estão com runtime ligado. Hoje: zero, e a tela diz isso. */
  ligados: number;
  /** Cargos sem ocupante. */
  vagos: number;
  /** Agentes de produto que já rodam de verdade dentro do sistema. */
  jaOperam: number;
  /** Itens de trabalho abertos: a fila do departamento. */
  backlogAberto: number;
}

export interface DepartamentoNaTela {
  numero: number;
  slug: string;
  nome: string;
  missao: string;
  rota: string;
  isActive: boolean;
  gerente: AgenteNaTela | null;
  agentes: AgenteNaTela[];
  indicadores: IndicadoresDoDepartamento;

  // ── O mínimo de governança do documento 01 ──
  /** O que o departamento controla. É a fronteira entre as áreas. */
  controla: readonly string[];
  /** Quando devolve a decisão para cima. */
  escalaQuando: string;
  /** Não conformidades. `semAuditoria` NÃO é o mesmo que limpo. */
  saude: SaudeDoDepartamento;
  /** Quantas ordens pularam o Agente Gerente nos últimos 30 dias. */
  comando: CaminhoDoComando;
}

export interface PessoaNaDirecao {
  cargo: string;
  titulo: string;
  ocupante: string | null;
}

export interface PainelDeDepartamentos {
  direcao: PessoaNaDirecao[];
  departamentos: DepartamentoNaTela[];
  /** Departamentos da v1 desativados. Aparecem discretos, mas aparecem. */
  aposentados: Array<{ nome: string; missao: string }>;
}

export type ResultadoDoPainel =
  | { leituraOk: true; painel: PainelDeDepartamentos }
  | { leituraOk: false; motivo: string };

function comoAgente(row: {
  slug: string;
  name: string;
  catalogNumber: string | null;
  executionMode: ModoNaTela;
  population: PopulacaoNaTela;
  status: string;
  isRuntimeEnabled: boolean;
  allowedActions: unknown;
  forbiddenActions: unknown;
  escalationRules: unknown;
  ownerPosition: { titulo: string; ocupantes: Array<{ nome: string }> } | null;
  posicaoPropria: { nivel: string; ocupantes: Array<{ nome: string }> } | null;
}): AgenteNaTela {
  const lista = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

  return {
    slug: row.slug,
    nome: row.name,
    catalogNumber: row.catalogNumber,
    modo: row.executionMode,
    populacao: row.population,
    ehGerente: row.posicaoPropria?.nivel === "GERENTE",
    status: row.status,
    isRuntimeEnabled: row.isRuntimeEnabled,
    responsavel: row.ownerPosition
      ? {
          titulo: row.ownerPosition.titulo,
          ocupante: row.ownerPosition.ocupantes[0]?.nome ?? null,
        }
      : null,
    pode: lista(row.allowedActions),
    naoPode: lista(row.forbiddenActions),
    escalaQuando: lista(row.escalationRules),
  };
}

/** Ordena pelo número do catálogo ("2.10" depois de "2.9"), não por texto. */
function porNumeroDoCatalogo(a: AgenteNaTela, b: AgenteNaTela): number {
  const parte = (n: string | null) => (n ?? "99.99").split(".").map(Number);
  const [ad = 99, ai = 99] = parte(a.catalogNumber);
  const [bd = 99, bi = 99] = parte(b.catalogNumber);
  return ad - bd || ai - bi;
}

export async function montarPainel(): Promise<ResultadoDoPainel> {
  try {
    const [departamentos, fichas, cargosDeDirecao] = await Promise.all([
      prisma.department.findMany({ orderBy: { numero: "asc" } }),

      prisma.agentProfile.findMany({
        // ── POR QUE ESTA CONSULTA NÃO FILTRA POR POPULAÇÃO ──
        //
        // Em todo o resto do sistema, população é trava: o runtime do produto
        // nunca enxerga ficha de empresa, e vice-versa. Aqui é diferente de
        // propósito, e o critério é outro: **ter departamento**.
        //
        // O Waiter, o CRM e o WhatsApp são agentes de PRODUTO e pertencem ao
        // departamento 3 — o catálogo diz isso, e o organograma da empresa
        // precisa mostrá-los. Filtrar por `EMPRESA` faria o card de "Produto e
        // Agentes de IA" exibir 2 agentes onde existem 5, escondendo justamente
        // os três que já operam de verdade.
        //
        // A tela marca cada um com a população, para ninguém confundir "agente
        // que a Foocci vende" com "função da Foocci".
        //
        // ARCHIVED fica de fora: são as fichas da v1 que saíram da planta. Elas
        // continuam no banco para auditoria, mas mostrá-las no painel diário
        // faria o CEO contar 52 agentes onde existem 28.
        where: { departmentId: { not: null }, status: { not: "ARCHIVED" } },
        include: {
          ownerPosition: { include: { ocupantes: { where: { isActive: true }, take: 1 } } },
        },
      }),

      prisma.position.findMany({
        where: { slug: { in: ["ceo", "diretor-foocci"] } },
        include: { ocupantes: { where: { isActive: true }, take: 1 } },
      }),
    ]);

    // O cargo de cada ficha é o que diz se ela é o Agente Gerente. O slug da
    // ficha e o do cargo são o mesmo na v3 — ficha e cargo são a mesma coisa
    // vista de dois ângulos.
    const cargosDasFichas = await prisma.position.findMany({
      where: { slug: { in: fichas.map((f) => f.slug) } },
      include: { ocupantes: { where: { isActive: true }, take: 1 } },
    });
    const cargoPorSlug = new Map(cargosDasFichas.map((c) => [c.slug, c]));

    const porDepartamento = new Map<string, AgenteNaTela[]>();
    for (const f of fichas) {
      if (!f.departmentId) continue;
      const agente = comoAgente({
        ...f,
        posicaoPropria: cargoPorSlug.get(f.slug) ?? null,
      });
      const lista = porDepartamento.get(f.departmentId) ?? [];
      lista.push(agente);
      porDepartamento.set(f.departmentId, lista);
    }

    const ativos = departamentos.filter((d) => d.isActive);

    // Trinta dias: janela curta o bastante para o número reagir a uma mudança de
    // hábito, e longa o bastante para não oscilar com uma semana atípica.
    const ate = new Date();
    const de = new Date(ate.getTime() - 30 * 86_400_000);

    const governanca = await Promise.all(
      ativos.map(async (d) => ({
        id: d.id,
        backlogAberto: await prisma.task.count({
          where: { departmentId: d.id, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
        }),
        saude: await saudeDoDepartamento(prisma, d.id),
        comando: await caminhoDoComando(prisma, { departmentId: d.id, de, ate }),
      })),
    );
    const porId = new Map(governanca.map((g) => [g.id, g]));

    const cards: DepartamentoNaTela[] = ativos.map((d) => {
      const todos = (porDepartamento.get(d.id) ?? []).sort(porNumeroDoCatalogo);
      const gerente = todos.find((a) => a.ehGerente) ?? null;
      const subordinados = todos.filter((a) => !a.ehGerente);
      const canonico = DEPARTAMENTOS.find((c) => c.slug === d.slug);
      const g = porId.get(d.id);

      return {
        numero: d.numero,
        slug: d.slug,
        nome: d.nome,
        missao: d.missao,
        rota: canonico?.rota ?? `/admin/${d.slug}`,
        isActive: d.isActive,
        gerente,
        agentes: subordinados,
        indicadores: {
          agentes: todos.length,
          ia: todos.filter((a) => a.modo === "AI").length,
          humano: todos.filter((a) => a.modo === "HUMAN").length,
          hibrido: todos.filter((a) => a.modo === "HYBRID").length,
          ligados: todos.filter((a) => a.isRuntimeEnabled).length,
          vagos: todos.filter((a) => !a.responsavel?.ocupante).length,
          jaOperam: todos.filter((a) => a.populacao === "PRODUTO").length,
          backlogAberto: g?.backlogAberto ?? 0,
        },
        controla: canonico?.controla ?? [],
        escalaQuando: canonico?.escalaQuando ?? "",
        saude: g?.saude ?? { abertas: 0, bloqueantes: 0, aceitas: 0, leitura: "semAuditoria" },
        comando: g?.comando ?? {
          total: 0,
          pularamOGerente: 0,
          proporcao: null,
          leitura: "semDados",
        },
      };
    });

    return {
      leituraOk: true,
      painel: {
        direcao: cargosDeDirecao
          .sort((a, b) => (a.slug === "ceo" ? -1 : b.slug === "ceo" ? 1 : 0))
          .map((c) => ({
            cargo: c.slug,
            titulo: c.titulo,
            ocupante: c.ocupantes[0]?.nome ?? null,
          })),
        departamentos: cards,
        aposentados: departamentos
          .filter((d) => !d.isActive)
          .map((d) => ({ nome: d.nome, missao: d.missao })),
      },
    };
  } catch (erro) {
    return {
      leituraOk: false,
      motivo: erro instanceof Error ? erro.message : "erro desconhecido ao montar o painel",
    };
  }
}
