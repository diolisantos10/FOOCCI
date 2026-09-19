/**
 * ⭐ AS CAIXAS DE CONVERSA E OS CANAIS DE ORIGEM — a coluna esquerda da tela 03.
 *
 * ── DE ONDE ISTO VEM ────────────────────────────────────────────────────────
 *
 * `desenho-03-central-de-atendimento.png` pede uma coluna com oito **Caixas de
 * Conversa** (Meus leads · Novos · Quentes · Aguardando cliente · Follow-up ·
 * Pagamento pendente · Fechados · Perdidos) e seis **Canais de Origem**
 * (WhatsApp · Instagram · Facebook · Site · Indicação · Outros). Auditado em
 * 19/09/2026: **nenhum dos dois existia em lugar nenhum da área.**
 *
 * ── POR QUE NÃO SÃO AS `FILAS` QUE JÁ EXISTEM ───────────────────────────────
 *
 * `filas.ts` responde "quem atende?" (meu, largado, com a IA, esperando gente).
 * As caixas do desenho respondem "em que ponto do ATENDIMENTO a conversa está?".
 * Um mesmo lead aparece nas duas visões, e é isso mesmo — foi a mesma decisão
 * já registrada em `FILAS` quando as duas listas do CEO entraram.
 *
 * Três caixas casam com fila existente (Meus leads), e as outras não têm
 * equivalente. Forçar as oito dentro de `NomeDaFila` mudaria o significado das
 * filas que o SDR já usa, e o de-para fica no relatório, não numa gambiarra.
 *
 * ── ⛔ A CAIXA QUE NÃO TEM FONTE FICA, DIZENDO QUE NÃO TEM ──────────────────
 *
 * **Pagamento pendente não é medido.** A base comercial não guarda pagamento de
 * lead: `LeadProposta.situacao` vai até ACEITA e para ali; quem cobra é o
 * gateway, noutra casa. A caixa continua na coluna, com `medida: false` e o
 * motivo escrito — regra 2 de `00-MOLDURA-COMUM.md`. Contar zero ali seria
 * dizer "ninguém deve nada", que é uma afirmação, e ela não foi medida.
 *
 * ── E O ESCOPO DA SESSÃO ENTRA NO `where`, COMO EM `filas.ts` ───────────────
 *
 * Mesma doutrina: a rota protege o endereço, a consulta protege o dado. Toda
 * caixa é `AND` de escopo + régua da caixa + "tem mensagem".
 */

import type { Prisma, PrismaClient, SiteLeadSource, SiteLeadStage } from "@prisma/client";
import type { SessaoInterna } from "@/lib/internal-auth";
import { escopoDaConsulta } from "./filas";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type NomeDaCaixa =
  | "meusLeads"
  | "novos"
  | "quentes"
  | "aguardandoCliente"
  | "followUp"
  | "pagamentoPendente"
  | "fechados"
  | "perdidos";

export interface Caixa {
  nome: NomeDaCaixa;
  titulo: string;
  /** A pergunta que a caixa responde. Vira o `title` do botão na tela. */
  pergunta: string;
  /**
   * `false` = não há fonte para contar. A caixa aparece assim mesmo, com o
   * motivo — nunca com zero.
   */
  medida: boolean;
  porQueNaoMedida?: string;
}

/** O funil ainda aberto. GANHO e PERDIDO saíram; NUTRICAO é espera deliberada. */
const FORA_DO_JOGO: SiteLeadStage[] = ["GANHO", "PERDIDO"];
const ABERTAS = { notIn: FORA_DO_JOGO };

export const CAIXAS: readonly Caixa[] = [
  { nome: "meusLeads", titulo: "Meus leads", pergunta: "o que é meu?", medida: true },
  { nome: "novos", titulo: "Novos", pergunta: "quem chegou e ninguém moveu ainda?", medida: true },
  {
    nome: "quentes",
    titulo: "Quentes",
    pergunta: "quem foi medido como quente ou prioridade máxima?",
    medida: true,
  },
  {
    nome: "aguardandoCliente",
    titulo: "Aguardando cliente",
    pergunta: "a última palavra foi nossa — a bola está com ele",
    medida: true,
  },
  {
    nome: "followUp",
    titulo: "Follow-up",
    pergunta: "o que tem próxima ação combinada?",
    medida: true,
  },
  {
    nome: "pagamentoPendente",
    titulo: "Pagamento pendente",
    medida: false,
    pergunta: "quem aceitou e ainda não pagou?",
    porQueNaoMedida:
      "A base comercial não registra pagamento de lead: a proposta vai até ACEITA e a cobrança vive no gateway. Um zero aqui diria “ninguém deve nada”, e isso não foi medido.",
  },
  { nome: "fechados", titulo: "Fechados", pergunta: "quem virou cliente?", medida: true },
  { nome: "perdidos", titulo: "Perdidos", pergunta: "quem saiu do funil?", medida: true },
] as const;

/**
 * ⭐ A RÉGUA DE TODA CAIXA: conversa é quem TEM MENSAGEM.
 *
 * A mesma de `filas.ts` — e ela precisa ser a mesma, senão a contagem da coluna
 * e a lista do meio contam populações diferentes, que foi o defeito de 18/09.
 */
const TEM_CONVERSA: Prisma.SiteLeadWhereInput = { mensagens: { some: {} } };

/**
 * O filtro de uma caixa, já somado ao escopo da sessão.
 *
 * Devolve `null` quando a caixa **não é medida** — e quem chama é obrigado a
 * tratar esse caso, que é o ponto: o tipo não deixa "não medido" virar consulta
 * vazia por descuido.
 */
export function filtroDaCaixa(
  caixa: NomeDaCaixa,
  sessao: SessaoInterna,
): Prisma.SiteLeadWhereInput | null {
  const escopo = escopoDaConsulta(sessao);

  const daCaixa: Prisma.SiteLeadWhereInput | null = (() => {
    switch (caixa) {
      case "meusLeads":
        return { atendenteUserId: sessao.userId };
      case "novos":
        // NOVO é "chegou e ninguém moveu". Com mensagem registrada, é gente que
        // falou e continua sem tratamento — a leitura do desenho.
        return { stage: "NOVO" };
      case "quentes":
        // Só o que foi MEDIDO como quente. `temperatura: null` é "ninguém
        // mediu", e entra aqui seria inventar leitura.
        return { temperatura: { in: ["PRIORIDADE_MAXIMA", "QUENTE"] }, stage: ABERTAS };
      case "aguardandoCliente":
        // A última mensagem foi NOSSA: a bola está com ele. É o cache
        // `ultimaMensagemDeQuem`, não uma regra de dias — "aguardando cliente"
        // é sobre de quem é a vez, não sobre atraso.
        return { ultimaMensagemDeQuem: "SAIDA", stage: ABERTAS };
      case "followUp":
        return { proximaAcaoEm: { not: null }, stage: ABERTAS };
      case "pagamentoPendente":
        return null;
      case "fechados":
        return { stage: "GANHO" };
      case "perdidos":
        return { stage: "PERDIDO" };
      default:
        return null;
    }
  })();

  if (daCaixa === null) return null;
  return { AND: [escopo, daCaixa, TEM_CONVERSA] };
}

// ─────────────────────────────────────────────────────────────────────────────
// OS CANAIS DE ORIGEM
// ─────────────────────────────────────────────────────────────────────────────

export type NomeDoCanal =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "site"
  | "indicacao"
  | "outros";

export interface Canal {
  nome: NomeDoCanal;
  rotulo: string;
  /** As `SiteLeadSource` que caem neste balde. */
  fontes: readonly SiteLeadSource[];
}

/**
 * Os seis baldes do desenho, sobre as onze fontes que a base tem.
 *
 * ⚠️ `CAMPANHA_PAGA` cai em **Outros**, e isso é perda de informação real: o
 * desenho não tem balde de anúncio. Está escrito aqui, e no relatório, para o
 * CEO decidir se quer um sétimo balde — não para ser descoberto depois.
 */
export const CANAIS: readonly Canal[] = [
  { nome: "whatsapp", rotulo: "WhatsApp", fontes: ["WHATSAPP_DIRETO"] },
  { nome: "instagram", rotulo: "Instagram", fontes: ["INSTAGRAM"] },
  { nome: "facebook", rotulo: "Facebook", fontes: ["FACEBOOK"] },
  { nome: "site", rotulo: "Site", fontes: ["FORMULARIO_DEMONSTRACAO", "AGENDAMENTO"] },
  { nome: "indicacao", rotulo: "Indicação", fontes: ["INDICACAO"] },
  {
    nome: "outros",
    rotulo: "Outros",
    fontes: ["MANUAL", "CAMPANHA_PAGA", "LISTA_PROSPECCAO", "IMPORTACAO", "OUTRO"],
  },
] as const;

/** Em que balde do desenho uma fonte cai. Nenhuma fonte fica de fora. */
export function canalDaFonte(fonte: SiteLeadSource): NomeDoCanal {
  const achado = CANAIS.find((c) => c.fontes.includes(fonte));
  return achado?.nome ?? "outros";
}

// ─────────────────────────────────────────────────────────────────────────────
// A MONTAGEM
// ─────────────────────────────────────────────────────────────────────────────

export interface ContagemDaCaixa {
  nome: NomeDaCaixa;
  titulo: string;
  pergunta: string;
  /** `null` quando a caixa não é medida — e a tela escreve o motivo. */
  total: number | null;
  porQueNaoMedida?: string;
}

export interface ContagemDoCanal {
  nome: NomeDoCanal;
  rotulo: string;
  total: number;
}

export interface ConversaNaCaixa {
  leadId: string;
  nome: string;
  restaurante: string | null;
  cidade: string | null;
  whatsapp: string;
  stage: string;
  temperatura: string | null;
  atendidoPor: string;
  atendenteUserId: string | null;
  prioritario: boolean;
  canal: NomeDoCanal;
  /** Espelho da última mensagem. `null` = não há espelho gravado. */
  previa: string | null;
  ultimaMensagemEm: string | null;
  naoLidas: number;
}

/**
 * Para quem se pode transferir.
 *
 * ⚠️ É o MÍNIMO que o ato exige: id e nome de quem tem disponibilidade
 * cadastrada. Não vai carga, nem estado, nem produtividade — isso é informação
 * de gestão sobre pessoas, e ela mora no painel do gerente, que tem guarda
 * própria. Uma tela de trabalho não precisa saber o desempenho dos colegas para
 * passar uma conversa adiante.
 */
export interface AtendenteParaTransferir {
  userId: string;
  nome: string;
}

export interface CentralDeConversas {
  agora: string;
  caixa: NomeDaCaixa;
  canal: NomeDoCanal | null;
  caixas: ContagemDaCaixa[];
  canais: ContagemDoCanal[];
  conversas: ConversaNaCaixa[];
  atendentes: AtendenteParaTransferir[];
  /** `false` quando a caixa escolhida não é medida — a lista vem vazia de propósito. */
  caixaMedida: boolean;
  porQueNaoMedida?: string;
}

/** Teto da lista. A mesa de trabalho é uma mesa, não uma exportação da base. */
export const TETO_DA_LISTA = 200;

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export async function montarCentralDeConversas(
  db: Cliente,
  params: {
    sessao: SessaoInterna;
    caixa: NomeDaCaixa;
    canal?: NomeDoCanal | null;
    busca?: string;
    ordem?: "recentes" | "antigas";
    agora?: Date;
    limite?: number;
  },
): Promise<CentralDeConversas> {
  const agora = params.agora ?? new Date();
  const canal = params.canal ?? null;
  const limite = Math.min(Math.max(params.limite ?? TETO_DA_LISTA, 1), TETO_DA_LISTA);
  const escolhida = CAIXAS.find((c) => c.nome === params.caixa) ?? CAIXAS[0]!;

  // As contagens das caixas medidas, em paralelo: são consultas independentes e
  // serializá-las faria a coluna inteira esperar pela mais lenta em série.
  const medidas = CAIXAS.filter((c) => c.medida);
  const contagens = await Promise.all(
    medidas.map((c) => {
      const onde = filtroDaCaixa(c.nome, params.sessao);
      return onde ? db.siteLead.count({ where: onde }) : Promise.resolve(0);
    }),
  );
  const porCaixa = new Map<NomeDaCaixa, number>(
    medidas.map((c, i) => [c.nome, contagens[i] ?? 0]),
  );

  // Os canais contam sobre a MESMA população da coluna: quem tem conversa,
  // dentro do escopo. Contar a base inteira aqui faria a soma dos canais não
  // bater com a soma das caixas, e ninguém confiaria em nenhuma das duas.
  const porFonte = await db.siteLead.groupBy({
    by: ["fonte"],
    where: { AND: [escopoDaConsulta(params.sessao), TEM_CONVERSA] },
    _count: { _all: true },
  });

  const canais: ContagemDoCanal[] = CANAIS.map((c) => ({
    nome: c.nome,
    rotulo: c.rotulo,
    total: porFonte
      .filter((linha) => c.fontes.includes(linha.fonte))
      .reduce((soma, linha) => soma + linha._count._all, 0),
  }));

  const pessoas = await db.internalUser.findMany({
    where: { isActive: true, disponibilidade: { isNot: null } },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  const atendentes: AtendenteParaTransferir[] = pessoas
    .filter((p) => p.id !== params.sessao.userId)
    .map((p) => ({ userId: p.id, nome: p.nome }));

  const filtro = filtroDaCaixa(escolhida.nome, params.sessao);

  let conversas: ConversaNaCaixa[] = [];

  if (filtro) {
    const onde: Prisma.SiteLeadWhereInput = canal
      ? { AND: [filtro, { fonte: { in: [...(CANAIS.find((c) => c.nome === canal)?.fontes ?? [])] } }] }
      : filtro;

    const linhas = await db.siteLead.findMany({
      where: onde,
      orderBy: [
        // ⚠️ `nulls: "last"` é deliberado: quem não tem espelho de mensagem não
        // pode ocupar o topo da mesa de trabalho por acidente de ordenação.
        { ultimaMensagemEm: params.ordem === "antigas" ? "asc" : ("desc" as const) },
        { createdAt: "desc" },
      ],
      take: limite,
      select: {
        id: true,
        nome: true,
        restaurante: true,
        cidade: true,
        whatsapp: true,
        stage: true,
        temperatura: true,
        atendidoPor: true,
        atendenteUserId: true,
        prioritario: true,
        fonte: true,
        ultimaMensagemTexto: true,
        ultimaMensagemEm: true,
        naoLidas: true,
      },
    });

    const busca = normalizar(params.busca);

    conversas = linhas
      .filter((l) =>
        busca
          ? [l.nome, l.restaurante, l.cidade].map(normalizar).join(" ").includes(busca)
          : true,
      )
      .map((l) => ({
        leadId: l.id,
        nome: l.nome,
        restaurante: l.restaurante,
        cidade: l.cidade,
        whatsapp: l.whatsapp,
        stage: l.stage,
        temperatura: l.temperatura,
        atendidoPor: l.atendidoPor,
        atendenteUserId: l.atendenteUserId,
        prioritario: l.prioritario,
        canal: canalDaFonte(l.fonte),
        previa: l.ultimaMensagemTexto,
        ultimaMensagemEm: l.ultimaMensagemEm ? l.ultimaMensagemEm.toISOString() : null,
        naoLidas: l.naoLidas,
      }));
  }

  return {
    agora: agora.toISOString(),
    caixa: escolhida.nome,
    canal,
    caixas: CAIXAS.map((c) => ({
      nome: c.nome,
      titulo: c.titulo,
      pergunta: c.pergunta,
      total: c.medida ? (porCaixa.get(c.nome) ?? 0) : null,
      porQueNaoMedida: c.porQueNaoMedida,
    })),
    canais,
    conversas,
    atendentes,
    caixaMedida: escolhida.medida,
    porQueNaoMedida: escolhida.porQueNaoMedida,
  };
}
