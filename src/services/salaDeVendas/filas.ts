/**
 * AS FILAS DA SALA DE VENDAS.
 *
 * Cada fila responde a uma pergunta que o SDR faz de verdade durante o dia. Não
 * são filtros bonitos: são as sete perguntas do documento 03.
 *
 * ── A FILA MAIS IMPORTANTE É "AGUARDANDO HUMANO" ──
 *
 * Um lead que a IA devolveu e que ninguém pegou é uma venda em queda livre — e
 * ele é **invisível** em qualquer lista organizada por etapa do funil, porque
 * continua em CONTATADO ou QUALIFICADO como qualquer outro. Sem esta fila, o
 * defeito só aparece quando o lead some.
 *
 * ── ONDE O ESCOPO DO SDR É APLICADO ──
 *
 * No `where` da consulta, não na tela e não só na rota.
 *
 * A rota protege o endereço; a consulta protege o dado. Basta um parâmetro
 * esquecido para a consulta devolver a base inteira e a tela mostrar tudo — que
 * é o defeito clássico de RBAC que só vive na porta. Aqui o filtro é montado por
 * `escopoDaConsulta`, que recebe a sessão e não aceita ser chamado sem ela.
 */

import type { Prisma, PrismaClient, LeadAtendidoPor, SiteLeadStage } from "@prisma/client";
import type { SessaoInterna } from "@/lib/internal-auth";
import { enxergaTudo } from "@/lib/internal-auth";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type NomeDaFila =
  | "semResponsavel"
  | "meusLeads"
  | "comIA"
  | "aguardandoHumano"
  | "semResposta"
  | "followUpVencido"
  | "todos";

export interface Fila {
  nome: NomeDaFila;
  titulo: string;
  /** A pergunta que a fila responde. Aparece na tela. */
  pergunta: string;
}

export const FILAS: readonly Fila[] = [
  {
    nome: "aguardandoHumano",
    titulo: "Aguardando humano",
    pergunta: "o que a IA parou e me espera?",
  },
  { nome: "semResponsavel", titulo: "Sem responsável", pergunta: "o que está largado?" },
  { nome: "meusLeads", titulo: "Meus leads", pergunta: "o que é meu?" },
  { nome: "comIA", titulo: "Atendidos pela IA", pergunta: "o que está andando sozinho?" },
  { nome: "semResposta", titulo: "Sem resposta", pergunta: "quem eu falei e não voltou?" },
  {
    nome: "followUpVencido",
    titulo: "Follow-ups vencidos",
    pergunta: "o que eu prometi e não fiz?",
  },
  { nome: "todos", titulo: "Todos", pergunta: "a base inteira do meu escopo" },
] as const;

/**
 * O recorte que a sessão pode enxergar.
 *
 * Quem enxerga a empresa inteira recebe `{}` — sem filtro. O agente humano
 * recebe um filtro que o prende aos leads DELE mais os que estão livres para
 * pegar. Nunca à base inteira.
 *
 * ── POR QUE O SDR VÊ OS LEADS LIVRES ──
 *
 * Sem isso ele veria só o que já é dele, e as filas "sem responsável" e
 * "aguardando humano" viriam sempre vazias — as duas filas que existem
 * justamente para ele pegar trabalho. O isolamento é contra ver a carteira dos
 * OUTROS, não contra ver o que está disponível.
 */
export function escopoDaConsulta(sessao: SessaoInterna): Prisma.SiteLeadWhereInput {
  if (enxergaTudo(sessao)) return {};

  // O Agente Gerente Comercial administra Vendas e enxerga o departamento
  // inteiro — é ele quem distribui a fila e responde pelo SLA.
  if (sessao.gerencia.includes("vendas")) return {};

  return {
    OR: [
      { atendenteUserId: sessao.userId },
      { atendidoPor: { in: ["NINGUEM", "AGUARDANDO_HUMANO"] } },
    ],
  };
}

/** Dias sem resposta que fazem um lead cair na fila "sem resposta". */
const DIAS_SEM_RESPOSTA = 3;

/**
 * O filtro de uma fila, já combinado com o escopo da sessão.
 *
 * O `AND` é deliberado: fila e escopo se somam, nunca se substituem. Um `OR`
 * aqui deixaria a fila furar o isolamento — e é o tipo de erro que passa
 * despercebido porque a tela continua parecendo certa.
 */
export function filtroDaFila(
  fila: NomeDaFila,
  sessao: SessaoInterna,
  agora: Date,
): Prisma.SiteLeadWhereInput {
  const escopo = escopoDaConsulta(sessao);
  const limite = new Date(agora.getTime() - DIAS_SEM_RESPOSTA * 86_400_000);

  const daFila: Prisma.SiteLeadWhereInput = (() => {
    switch (fila) {
      case "aguardandoHumano":
        return { atendidoPor: "AGUARDANDO_HUMANO" };
      case "semResponsavel":
        return { atendidoPor: "NINGUEM" };
      case "meusLeads":
        return { atendenteUserId: sessao.userId, atendidoPor: "HUMANO" };
      case "comIA":
        return { atendidoPor: "IA" };
      case "semResposta":
        // Falamos e a pessoa não voltou: existe contato de saída, e o último
        // movimento de qualquer tipo é o próprio contato — ou seja, nada
        // aconteceu depois. E o funil ainda está aberto.
        return {
          lastContactedAt: { not: null, lt: limite },
          // "Funil ainda aberto" = não terminou. As três terminais entram aqui:
          // GANHO e PERDIDO encerraram, e NUTRICAO é espera deliberada — cobrar
          // silêncio de quem a gente mesmo mandou esperar seria ruído.
          stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
        };
      case "followUpVencido":
        // Prometido e não cumprido: alguém pediu gente há mais de um dia e o
        // lead continua esperando.
        return {
          atendidoPor: "AGUARDANDO_HUMANO",
          atendenteDesde: { lt: new Date(agora.getTime() - 86_400_000) },
        };
      case "todos":
      default:
        return {};
    }
  })();

  return { AND: [escopo, daFila] };
}

export interface LeadNaFila {
  id: string;
  nome: string;
  restaurante: string | null;
  cidade: string | null;
  stage: SiteLeadStage;
  atendidoPor: LeadAtendidoPor;
  atendenteUserId: string | null;
  atendenteNome: string | null;
  motivoDoPedido: string | null;
  atendenteDesde: Date | null;
  origem: { utmSource: string | null; utmCampaign: string | null };
  lastContactedAt: Date | null;
  createdAt: Date;
}

export interface ResultadoDaFila {
  leituraOk: boolean;
  motivo?: string;
  leads: LeadNaFila[];
  /** Quantos leads existem em cada fila, dentro do escopo da sessão. */
  contagens: Record<NomeDaFila, number>;
}

const VAZIO: Record<NomeDaFila, number> = {
  semResponsavel: 0,
  meusLeads: 0,
  comIA: 0,
  aguardandoHumano: 0,
  semResposta: 0,
  followUpVencido: 0,
  todos: 0,
};

export async function listarFila(
  db: Cliente,
  params: { fila: NomeDaFila; sessao: SessaoInterna; agora?: Date; limite?: number },
): Promise<ResultadoDaFila> {
  const agora = params.agora ?? new Date();

  try {
    const [linhas, ...contados] = await Promise.all([
      db.siteLead.findMany({
        where: filtroDaFila(params.fila, params.sessao, agora),
        orderBy: [{ atendenteDesde: "asc" }, { createdAt: "desc" }],
        take: params.limite ?? 100,
        include: { atendente: { select: { nome: true } } },
      }),
      ...FILAS.map((f) =>
        db.siteLead.count({ where: filtroDaFila(f.nome, params.sessao, agora) }),
      ),
    ]);

    const contagens = { ...VAZIO };
    FILAS.forEach((f, i) => {
      contagens[f.nome] = contados[i] ?? 0;
    });

    return {
      leituraOk: true,
      contagens,
      leads: linhas.map((l) => ({
        id: l.id,
        nome: l.nome,
        restaurante: l.restaurante,
        cidade: l.cidade,
        stage: l.stage,
        atendidoPor: l.atendidoPor,
        atendenteUserId: l.atendenteUserId,
        atendenteNome: l.atendente?.nome ?? null,
        motivoDoPedido: l.motivoDoPedido,
        atendenteDesde: l.atendenteDesde,
        origem: { utmSource: l.utmSource, utmCampaign: l.utmCampaign },
        lastContactedAt: l.lastContactedAt,
        createdAt: l.createdAt,
      })),
    };
  } catch (erro) {
    // Lista vazia com sucesso faria a tela escrever "nenhum lead", que é uma
    // afirmação sobre a base. "Não consegui perguntar" é sobre o sistema.
    return {
      leituraOk: false,
      motivo: erro instanceof Error ? erro.message : "erro desconhecido ao ler a fila",
      leads: [],
      contagens: { ...VAZIO },
    };
  }
}
