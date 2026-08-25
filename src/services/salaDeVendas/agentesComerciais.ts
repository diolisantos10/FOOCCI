/**
 * OS NOVE AGENTES COMERCIAIS — ficha e desempenho, lado a lado.
 *
 * ── A DISTINÇÃO QUE ESTE ARQUIVO INTEIRO DEPENDE DE MANTER ──────────────────
 *
 * Uma ficha é um **cargo**, não uma pessoa. "Agente SDR Humano" é a função; três
 * pessoas podem ocupá-la ao mesmo tempo, e o desempenho da ficha é o das três
 * juntas. Tratar ficha como pessoa produziria a pergunta errada — "como vai o
 * SDR?" em vez de "como vai o atendimento humano?".
 *
 * Por isso o desempenho de um cargo humano é sempre agregado, e o de um cargo de
 * IA é o do runtime que o executa.
 *
 * ── E A REGRA QUE VALE PARA CADA NÚMERO DAQUI ───────────────────────────────
 *
 * **Hoje quase tudo é "sem dados", e isso é a verdade.** Nenhum agente de IA
 * está ligado, e os cargos humanos estão vagos ou recém-criados. Um painel que
 * mostrasse zeros diria que os agentes trabalharam e não produziram nada — o que
 * é uma acusação, não uma medição.
 *
 * Cada indicador devolve `{ medido: false, motivo }` quando não há o que medir, e
 * a tela é obrigada a escrever isso.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lerCatalogo, cargoDaFicha, type FichaDaEmpresa } from "@/services/agents/fichasDaEmpresa";
import { desempenhoDe } from "./qa";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** O departamento de Vendas e Receita no catálogo. */
export const DEPARTAMENTO_DE_VENDAS = 1;

const CAMINHO_DO_CATALOGO =
  "docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md";

/**
 * Lê as fichas comerciais do catálogo.
 *
 * O documento é a FONTE — o código o interpreta, nunca o transcreve. Uma segunda
 * lista de agentes em TypeScript discordaria do documento no primeiro mês, e as
 * duas pareceriam certas.
 */
export function fichasComerciais(raiz = process.cwd()): FichaDaEmpresa[] {
  const md = readFileSync(path.join(raiz, CAMINHO_DO_CATALOGO), "utf8");
  return lerCatalogo(md).filter((f) => f.departamento === DEPARTAMENTO_DE_VENDAS);
}

export type Medida =
  | { medido: true; valor: number; nota?: string }
  | { medido: false; motivo: string };

export interface DesempenhoDoAgente {
  /** Mensagens que este agente escreveu, no período. */
  mensagens: Medida;
  /** Conversas que ele passou adiante. */
  handoffs: Medida;
  /** Nota média de QA. */
  qa: Medida;
  /** Leads sob responsabilidade agora — só faz sentido para cargo humano. */
  leadsAgora: Medida;
}

export interface AgenteComercial {
  numero: string;
  slug: string;
  nome: string;
  modo: FichaDaEmpresa["modo"];
  resumo: string | null;
  pode: string[];
  naoPode: string[];
  escalaQuando: string[];
  medeSePor: string[];
  regraDura: string[];

  // ── Estado no banco ────────────────────────────────────────────────────────
  /** A ficha existe como `AgentProfile`? */
  cadastrada: boolean;
  status: string | null;
  /** Está ligada e operando? Para agente de IA, isto é a pergunta que importa. */
  ligada: boolean;
  /** Quantas pessoas ocupam este cargo. Zero é o normal hoje. */
  pessoas: number;

  desempenho: DesempenhoDoAgente;
}

const SEM_DADOS = (motivo: string): Medida => ({ medido: false, motivo });

/**
 * Como o desempenho de cada modo é apurado.
 *
 * ── POR QUE NÃO HÁ UM CAMINHO ÚNICO ────────────────────────────────────────
 *
 * Um agente de IA é UM runtime: as mensagens dele são as que saíram com
 * `autor = IA`. Um cargo humano são N pessoas: as mensagens dele são as de todo
 * mundo que ocupa o cargo.
 *
 * Um caminho único teria de escolher um dos dois e mentir sobre o outro.
 */
async function desempenhoDeIA(
  db: Cliente,
  janela: { de: Date; ate: Date },
  ligada: boolean,
): Promise<DesempenhoDoAgente> {
  // Agente desligado não tem desempenho ruim — não tem desempenho. A distinção
  // é o ponto: "0 mensagens" de um agente ligado é um problema; de um agente
  // desligado é o esperado.
  if (!ligada) {
    const motivo = "o agente está desligado — nunca falou com ninguém";
    return {
      mensagens: SEM_DADOS(motivo),
      handoffs: SEM_DADOS(motivo),
      qa: SEM_DADOS(motivo),
      leadsAgora: SEM_DADOS("cargo de IA não acumula lead sob responsabilidade humana"),
    };
  }

  const [mensagens, handoffs, qa] = await Promise.all([
    db.leadMensagem.count({
      where: { direcao: "SAIDA", autor: "IA", createdAt: { gte: janela.de, lt: janela.ate } },
    }),
    db.leadHandoff.count({
      where: { de: "IA", createdAt: { gte: janela.de, lt: janela.ate } },
    }),
    desempenhoDe(db, { avaliado: "IA", de: janela.de, ate: janela.ate }),
  ]);

  return {
    mensagens: { medido: true, valor: mensagens },
    handoffs: { medido: true, valor: handoffs },
    qa: qa.medido
      ? { medido: true, valor: qa.media, nota: `${qa.avaliacoes} avaliação(ões)` }
      : SEM_DADOS("nenhuma conversa da IA foi avaliada ainda"),
    leadsAgora: SEM_DADOS("cargo de IA não acumula lead sob responsabilidade humana"),
  };
}

async function desempenhoDeHumanos(
  db: Cliente,
  janela: { de: Date; ate: Date },
  userIds: string[],
): Promise<DesempenhoDoAgente> {
  if (userIds.length === 0) {
    const motivo = "ninguém ocupa este cargo";
    return {
      mensagens: SEM_DADOS(motivo),
      handoffs: SEM_DADOS(motivo),
      qa: SEM_DADOS(motivo),
      leadsAgora: SEM_DADOS(motivo),
    };
  }

  const [mensagens, handoffs, leads, qa] = await Promise.all([
    db.leadMensagem.count({
      where: {
        direcao: "SAIDA",
        autorUserId: { in: userIds },
        createdAt: { gte: janela.de, lt: janela.ate },
      },
    }),
    db.leadHandoff.count({
      where: { deUserId: { in: userIds }, createdAt: { gte: janela.de, lt: janela.ate } },
    }),
    db.siteLead.count({
      where: {
        atendidoPor: "HUMANO",
        atendenteUserId: { in: userIds },
        stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
      },
    }),
    // Uma consulta por pessoa seria N+1; a média do cargo é a média das notas de
    // quem o ocupa, e `desempenhoDe` já aceita filtrar por pessoa — aqui o filtro
    // é o conjunto, feito na própria agregação.
    db.leadAvaliacaoQA.aggregate({
      where: {
        avaliadoUserId: { in: userIds },
        situacao: { in: ["PUBLICADA", "REVISADA"] },
        nota: { not: null },
        createdAt: { gte: janela.de, lt: janela.ate },
      },
      _avg: { nota: true },
      _count: { _all: true },
    }),
  ]);

  return {
    mensagens: { medido: true, valor: mensagens },
    handoffs: { medido: true, valor: handoffs },
    qa:
      qa._count._all > 0
        ? {
            medido: true,
            valor: Math.round(qa._avg.nota ?? 0),
            nota: `${qa._count._all} avaliação(ões)`,
          }
        : SEM_DADOS("ninguém neste cargo foi avaliado ainda"),
    leadsAgora: { medido: true, valor: leads },
  };
}

/**
 * Os nove agentes comerciais, com ficha e desempenho.
 *
 * O `slug` do cargo vem de `cargoResponsavelPor`, e é o mesmo que o seed usa —
 * é o que liga a ficha do catálogo às pessoas do banco.
 */
export async function agentesComerciais(
  db: PrismaClient,
  janela: { de: Date; ate: Date },
  raiz = process.cwd(),
): Promise<AgenteComercial[]> {
  const fichas = fichasComerciais(raiz);

  const perfis = await db.agentProfile.findMany({
    where: { slug: { in: fichas.map((f) => f.jaExisteComo ?? f.slug) } },
    select: { slug: true, status: true, isRuntimeEnabled: true },
  });
  const perfilPor = new Map(perfis.map((p) => [p.slug, p]));

  // Quem ocupa cada cargo. Uma consulta só: pessoa por cargo, e não cargo por
  // pessoa — são nove fichas, e nove consultas seriam nove viagens ao banco.
  const ocupantes = await db.internalUser.findMany({
    where: { isActive: true, position: { isNot: null } },
    select: { id: true, position: { select: { slug: true } } },
  });

  const pessoasPorCargo = new Map<string, string[]>();
  for (const o of ocupantes) {
    const slug = o.position?.slug;
    if (!slug) continue;
    const lista = pessoasPorCargo.get(slug);
    if (lista) lista.push(o.id);
    else pessoasPorCargo.set(slug, [o.id]);
  }

  const saida: AgenteComercial[] = [];

  for (const f of fichas) {
    const chave = f.jaExisteComo ?? f.slug;
    const perfil = perfilPor.get(chave);
    const ligada = perfil?.isRuntimeEnabled ?? false;

    // O cargo derivado da ficha, pela MESMA função que o seed usa.
    //
    // ⚠️ Aqui estava escrito `agente-${f.slug}`, montado à mão. O slug de verdade
    // é `ficha.slug`, e a diferença nunca teria sido notada: com o prefixo errado
    // a busca não acha ninguém, e todo cargo humano mostraria "ninguém ocupa este
    // cargo" — que é exatamente o que parece verdade hoje, porque de fato ninguém
    // foi contratado. O defeito só apareceria no dia da primeira contratação, e
    // apareceria como "o painel não vê o time".
    const cargoSlug = cargoDaFicha(f, "vendas").slug;
    const pessoas = pessoasPorCargo.get(cargoSlug) ?? [];

    const desempenho =
      f.modo === "HUMANO"
        ? await desempenhoDeHumanos(db, janela, pessoas)
        : await desempenhoDeIA(db, janela, ligada);

    saida.push({
      numero: f.numero,
      slug: f.slug,
      nome: f.nome,
      modo: f.modo,
      resumo: f.resumo,
      pode: f.pode,
      naoPode: f.naoPode,
      escalaQuando: f.escalaQuando,
      medeSePor: f.medeSePor,
      regraDura: f.regraDura,
      cadastrada: Boolean(perfil),
      status: perfil?.status ?? null,
      ligada,
      pessoas: pessoas.length,
      desempenho,
    });
  }

  return saida;
}

export interface ResumoDosAgentes {
  total: number;
  deIA: number;
  humanos: number;
  hibridos: number;
  /** Quantas fichas existem no banco. */
  cadastradas: number;
  /** Quantas estão LIGADAS. Hoje: zero, e é o desenho. */
  ligadas: number;
  /** Quantos cargos têm alguém. */
  ocupados: number;
}

export function resumir(agentes: AgenteComercial[]): ResumoDosAgentes {
  return {
    total: agentes.length,
    deIA: agentes.filter((a) => a.modo === "IA").length,
    humanos: agentes.filter((a) => a.modo === "HUMANO").length,
    hibridos: agentes.filter((a) => a.modo === "HIBRIDO").length,
    cadastradas: agentes.filter((a) => a.cadastrada).length,
    ligadas: agentes.filter((a) => a.ligada).length,
    ocupados: agentes.filter((a) => a.pessoas > 0).length,
  };
}
