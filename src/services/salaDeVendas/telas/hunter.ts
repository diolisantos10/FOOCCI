/**
 * O HUNTER IA / INTELIGÊNCIA COMERCIAL — a leitura da base de empresas.
 *
 * ── A PERGUNTA DA TELA (desenho 14 do CEO) ──────────────────────────────────
 *
 * "Quantos restaurantes nós descobrimos, quantos já foram enriquecidos, quais
 * têm ICP alto, de quantos já sabemos o decisor, quantos estão prontos para o
 * SDR — e, na tabela, QUAIS são eles."
 *
 * ── ⛔ O CONTEXTO QUE MANDA NESTE ARQUIVO ───────────────────────────────────
 *
 * O Hunter de verdade — o que sai varrendo a internet e descobre restaurante
 * novo — **depende de uma fonte de dados paga que a empresa ainda não
 * contratou**. Isso já está decidido e o CEO sabe.
 *
 * A consequência prática, e ela é a alma deste arquivo: **a tabela `Empresa`
 * existe, o ICP existe, o pipeline existe — e quase ninguém entrou lá ainda.**
 *
 * Diante disso havia dois caminhos. O errado é o que a tela de demonstração
 * faria: preencher com 12.482 empresas encontradas, 8.321 enriquecidas e uma
 * lista de restaurantes de exemplo, como está no desenho. O certo — e é o que
 * este arquivo faz — é **contar de verdade**, e deixar o número ser pequeno ou
 * zero quando ele for pequeno ou zero.
 *
 * ⚠️ **Zero aqui é ZERO MEDIDO, e isso é diferente de "não sei".** A contagem
 * roda de verdade contra o banco; se ela devolve 0, nós de fato não temos
 * nenhuma empresa naquele estado. A tela escreve o zero e explica POR QUE ele
 * é zero (a fonte paga não foi contratada) — não some com o cartão e não
 * inventa número para ele parecer vivo.
 *
 * A única coisa que este arquivo se recusa a responder é o que ele realmente
 * não tem como medir. Está marcado `Medida<T>` com `medido: false` e o motivo
 * junto, e a tela mostra o motivo no lugar do número.
 *
 * ── SÓ LÊ ───────────────────────────────────────────────────────────────────
 *
 * Nenhuma escrita. O Hunter não descobre empresa a partir desta tela, não
 * enriquece e não dispara abordagem — ver a trava de `EstagioDaEmpresa`, que
 * declara `PRONTA_PARA_SDR` como o teto da descoberta automática.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** O mesmo contrato de "medi ou não medi" das outras telas desta pasta. */
export type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

/** O que conta como "ICP alto". Uma régua só, escrita uma vez. */
export const ICP_ALTO = 80;

/** Quantos restaurantes a tabela da tela mostra por página. O desenho diz 10. */
export const POR_PAGINA_PADRAO = 10;
export const POR_PAGINA_MAXIMA = 50;

/**
 * O motivo que se repete em todo cartão que depende da descoberta automática.
 *
 * Escrito UMA vez porque ele precisa ser idêntico em todos os lugares: se um
 * cartão diz "sem fonte" e o outro diz "fonte não contratada", quem lê acha
 * que são duas ausências diferentes e vai procurar duas causas.
 */
export const MOTIVO_DA_FONTE_NAO_CONTRATADA =
  "a descoberta automática depende de uma fonte de dados paga que a empresa ainda não contratou";

export interface NumerosDoHunter {
  /** Toda empresa já descoberta, por qualquer fonte. */
  encontradas: number;
  /**
   * Quantas já passaram por enriquecimento de verdade.
   *
   * A régua é `scoreIcpEm` OU `apuradoMarketplaceEm` preenchidos: são os dois
   * carimbos que só existem quando alguém (gente ou máquina) de fato apurou.
   * Contar "tem categoria preenchida" incluiria quem veio com categoria da
   * planilha de origem e nunca foi enriquecido.
   */
  enriquecidas: number;
  /** ICP medido e maior ou igual a `ICP_ALTO`. Quem não tem ICP não entra. */
  icpAlto: number;
  /** Empresas com pelo menos um `Contato` marcado `ehDecisor`. */
  decisoresEncontrados: number;
  prontasParaSdr: number;
  /** Descobertas de hoje (desde a meia-noite local do servidor). */
  novasHoje: number;
  /** Descobertas de ontem — a base da comparação "vs. ontem" do desenho. */
  novasOntem: number;
}

export interface LinhaDoPipeline {
  estagio: string;
  rotulo: string;
  total: number;
}

export interface FonteMonitorada {
  fonte: string;
  total: number;
}

export interface CategoriaComIcp {
  categoria: string;
  /** A MÉDIA do ICP das empresas daquela categoria que têm ICP medido. */
  icpMedio: number;
  /** Quantas empresas entraram nessa média — sem isso, média de 1 engana. */
  base: number;
}

export interface TarefaDeEnriquecimento {
  empresaId: string;
  empresa: string;
  /** O que falta apurar nesta empresa, em português. */
  tarefa: string;
  prioridade: string | null;
  /** Há quanto tempo ela está em ENRIQUECENDO, em dias. */
  diasNoEstagio: number;
}

export interface RestauranteProspectado {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  categoria: string | null;
  /** As três fontes do desenho: site, Instagram e Maps — só as que existem. */
  temSite: boolean;
  temInstagram: boolean;
  temMaps: boolean;
  /** `null` = ninguém apurou. Diferente de `false` = apurado e não tem. */
  deliveryProprio: boolean | null;
  /**
   * iFood: `null` quando o marketplace nunca foi apurado nesta empresa.
   * Sem `apuradoMarketplaceEm`, lista vazia não quer dizer "não está no iFood".
   */
  ifood: boolean | null;
  numeroDeUnidades: number | null;
  /** O telefone geral publicado pela empresa, quando existe. */
  contatoGeral: string | null;
  /** O decisor, quando algum `Contato` da empresa está marcado como tal. */
  decisor: { nome: string; cargo: string | null } | null;
  /** `null` = ICP nunca medido. Nunca 0 por omissão. */
  scoreIcp: number | null;
  prioridade: string | null;
  estagio: string;
}

export interface DadosDoHunter {
  agora: string;
  numeros: NumerosDoHunter;
  pipeline: LinhaDoPipeline[];
  fontes: FonteMonitorada[];
  categorias: CategoriaComIcp[];
  filaDeEnriquecimento: TarefaDeEnriquecimento[];
  restaurantes: {
    itens: RestauranteProspectado[];
    total: number;
    pagina: number;
    porPagina: number;
  };
  /**
   * As "Sugestões da IA" do desenho.
   *
   * ⚠️ NÃO existe hoje um serviço que gere recomendação de prospecção. O
   * desenho traz três sugestões de exemplo ("priorize quem tem delivery
   * próprio", "foque em 2+ unidades"…) e escrevê-las fixas no código seria
   * vender conselho de máquina que nenhuma máquina deu.
   */
  sugestoesDaIa: Medida<string[]>;
  /** A base fria (`SiteLead`), que é o que a casa TEM de verdade hoje. */
  baseFria: { total: number; comEmpresa: number };
}

/** O rótulo humano de cada estágio do pipeline, na ordem do desenho. */
export const ROTULO_DO_ESTAGIO: Record<string, string> = {
  DESCOBERTA: "Descoberta",
  ENRIQUECENDO: "Enriquecendo",
  PRONTA_PARA_SDR: "Pronta para SDR",
  GATEKEEPER: "Gatekeeper",
  DECISOR_ENCONTRADO: "Decisor encontrado",
  QUALIFICADA: "Qualificada",
  DESCARTADA: "Descartada",
};

/** A ordem em que o pipeline é lido — a do percurso, não a do alfabeto. */
const ORDEM_DO_PIPELINE = [
  "DESCOBERTA",
  "ENRIQUECENDO",
  "PRONTA_PARA_SDR",
  "GATEKEEPER",
  "DECISOR_ENCONTRADO",
  "QUALIFICADA",
] as const;

function meiaNoite(agora: Date): Date {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Está no iFood? — e o terceiro estado, que o desenho não tem.
 *
 * ⚠️ Lista de marketplaces vazia **não** quer dizer "não está no iFood": quer
 * dizer "ninguém olhou", a menos que exista o carimbo `apuradoMarketplaceEm`.
 * Devolver `false` nesse caso apagaria a fila de enriquecimento inteira — quem
 * lê a tela procuraria o "Não" e nunca o "não apurado".
 */
export function ifoodDe(
  marketplaces: string[],
  apuradoMarketplaceEm: Date | null,
): boolean | null {
  if (apuradoMarketplaceEm === null) return null;
  return marketplaces.some((m) => m.toLowerCase().includes("ifood"));
}

/**
 * O que falta apurar numa empresa, escrito para quem vai apurar.
 *
 * A ordem importa: ela é a do trabalho, e a primeira lacuna é a que vira a
 * tarefa. Uma lista de seis pendências não é tarefa — é um relatório que
 * ninguém executa.
 */
export function tarefaQueFalta(e: {
  scoreIcp: number | null;
  apuradoMarketplaceEm: Date | null;
  numeroDeUnidades: number | null;
  deliveryProprio: boolean | null;
  telefone: string | null;
  whatsappPublicado: string | null;
  _temDecisor: boolean;
}): string {
  if (!e._temDecisor) return "Buscar decisor";
  if (e.telefone === null && e.whatsappPublicado === null) return "Confirmar contato geral";
  if (e.apuradoMarketplaceEm === null) return "Verificar presença em marketplace";
  if (e.deliveryProprio === null) return "Apurar delivery próprio";
  if (e.numeroDeUnidades === null) return "Validar número de unidades";
  if (e.scoreIcp === null) return "Medir o ICP";
  return "Revisar a ficha";
}

/**
 * Lê tudo o que a tela do Hunter mostra, numa transação só.
 *
 * `db` é o cliente já dentro da sessão (`comSessao`), como nas outras telas
 * desta família — a política de linha do banco continua valendo.
 */
export async function lerOHunter(
  db: PrismaClient | Prisma.TransactionClient,
  opcoes: { agora: Date; pagina: number; porPagina: number },
): Promise<DadosDoHunter> {
  const { agora, pagina, porPagina } = opcoes;
  const inicioDeHoje = meiaNoite(agora);
  const inicioDeOntem = new Date(inicioDeHoje.getTime() - 86_400_000);

  const comDecisor: Prisma.EmpresaWhereInput = {
    contatos: { some: { ehDecisor: true } },
  };

  const [
    encontradas,
    enriquecidas,
    icpAlto,
    decisoresEncontrados,
    prontasParaSdr,
    novasHoje,
    novasOntem,
    porEstagio,
    porFonte,
    baseFriaTotal,
    baseFriaComEmpresa,
    totalDeRestaurantes,
  ] = await Promise.all([
    db.empresa.count(),
    db.empresa.count({
      where: {
        OR: [{ scoreIcpEm: { not: null } }, { apuradoMarketplaceEm: { not: null } }],
      },
    }),
    db.empresa.count({ where: { scoreIcp: { gte: ICP_ALTO } } }),
    db.empresa.count({ where: comDecisor }),
    db.empresa.count({ where: { estagio: "PRONTA_PARA_SDR" } }),
    db.empresa.count({ where: { descobertaEm: { gte: inicioDeHoje } } }),
    db.empresa.count({
      where: { descobertaEm: { gte: inicioDeOntem, lt: inicioDeHoje } },
    }),
    db.empresa.groupBy({ by: ["estagio"], _count: { _all: true } }),
    db.empresa.groupBy({ by: ["fonteDaDescoberta"], _count: { _all: true } }),
    db.siteLead.count(),
    db.siteLead.count({ where: { empresaId: { not: null } } }),
    db.empresa.count(),
  ]);

  const contagemPorEstagio = new Map<string, number>(
    porEstagio.map((l) => [String(l.estagio), l._count._all]),
  );

  const pipeline: LinhaDoPipeline[] = ORDEM_DO_PIPELINE.map((estagio) => ({
    estagio,
    rotulo: ROTULO_DO_ESTAGIO[estagio] ?? estagio,
    total: contagemPorEstagio.get(estagio) ?? 0,
  }));

  const fontes: FonteMonitorada[] = porFonte
    .map((l) => ({ fonte: l.fonteDaDescoberta, total: l._count._all }))
    .sort((a, b) => b.total - a.total);

  // ── A TABELA ───────────────────────────────────────────────────────────────
  // A ordem do desenho é a do trabalho: o ICP alto primeiro. Quem não tem ICP
  // medido vai para o fim — e não para o começo, que é onde um `null` tratado
  // como zero o colocaria numa ordenação ingênua.
  const linhas = await db.empresa.findMany({
    orderBy: [{ scoreIcp: { sort: "desc", nulls: "last" } }, { descobertaEm: "desc" }],
    skip: (pagina - 1) * porPagina,
    take: porPagina,
    select: {
      id: true,
      nome: true,
      cidade: true,
      estado: true,
      categoria: true,
      site: true,
      instagram: true,
      googleMapsUrl: true,
      deliveryProprio: true,
      marketplaces: true,
      apuradoMarketplaceEm: true,
      numeroDeUnidades: true,
      telefone: true,
      whatsappPublicado: true,
      scoreIcp: true,
      prioridade: true,
      estagio: true,
      contatos: {
        where: { ehDecisor: true },
        select: { nome: true, cargo: true },
        take: 1,
      },
    },
  });

  const restaurantes: RestauranteProspectado[] = linhas.map((e) => {
    const decisor = e.contatos[0] ?? null;
    return {
      id: e.id,
      nome: e.nome,
      cidade: e.cidade,
      estado: e.estado,
      categoria: e.categoria,
      temSite: e.site !== null,
      temInstagram: e.instagram !== null,
      temMaps: e.googleMapsUrl !== null,
      deliveryProprio: e.deliveryProprio,
      // Lista vazia SEM carimbo de apuração não é "não está no iFood": é
      // "ninguém olhou". A diferença é a fila de trabalho do enriquecimento.
      ifood: ifoodDe(e.marketplaces, e.apuradoMarketplaceEm),
      numeroDeUnidades: e.numeroDeUnidades,
      contatoGeral: e.telefone ?? e.whatsappPublicado,
      decisor: decisor ? { nome: decisor.nome, cargo: decisor.cargo } : null,
      scoreIcp: e.scoreIcp,
      prioridade: e.prioridade === null ? null : String(e.prioridade),
      estagio: String(e.estagio),
    };
  });

  // ── CATEGORIAS COM MAIOR ICP ───────────────────────────────────────────────
  // Só entram categorias com ICP medido. A média de uma categoria cujo ICP
  // ninguém mediu não é zero — ela não existe, e desenhar uma barra no chão
  // afirmaria "medimos e esta categoria é ruim".
  const porCategoria = await db.empresa.groupBy({
    by: ["categoria"],
    where: { categoria: { not: null }, scoreIcp: { not: null } },
    _avg: { scoreIcp: true },
    _count: { _all: true },
  });

  const categorias: CategoriaComIcp[] = porCategoria
    .filter((c) => c.categoria !== null && c._avg.scoreIcp !== null)
    .map((c) => ({
      categoria: c.categoria as string,
      icpMedio: Math.round(c._avg.scoreIcp as number),
      base: c._count._all,
    }))
    .sort((a, b) => b.icpMedio - a.icpMedio)
    .slice(0, 5);

  // ── FILA DE ENRIQUECIMENTO ─────────────────────────────────────────────────
  const emEnriquecimento = await db.empresa.findMany({
    where: { estagio: "ENRIQUECENDO" },
    orderBy: [{ prioridade: { sort: "asc", nulls: "last" } }, { estagioMudouEm: "asc" }],
    take: 6,
    select: {
      id: true,
      nome: true,
      prioridade: true,
      estagioMudouEm: true,
      scoreIcp: true,
      apuradoMarketplaceEm: true,
      numeroDeUnidades: true,
      deliveryProprio: true,
      telefone: true,
      whatsappPublicado: true,
      contatos: { where: { ehDecisor: true }, select: { id: true }, take: 1 },
    },
  });

  const filaDeEnriquecimento: TarefaDeEnriquecimento[] = emEnriquecimento.map((e) => ({
    empresaId: e.id,
    empresa: e.nome,
    tarefa: tarefaQueFalta({
      scoreIcp: e.scoreIcp,
      apuradoMarketplaceEm: e.apuradoMarketplaceEm,
      numeroDeUnidades: e.numeroDeUnidades,
      deliveryProprio: e.deliveryProprio,
      telefone: e.telefone,
      whatsappPublicado: e.whatsappPublicado,
      _temDecisor: e.contatos.length > 0,
    }),
    prioridade: e.prioridade === null ? null : String(e.prioridade),
    diasNoEstagio: Math.max(
      0,
      Math.floor((agora.getTime() - e.estagioMudouEm.getTime()) / 86_400_000),
    ),
  }));

  return {
    agora: agora.toISOString(),
    numeros: {
      encontradas,
      enriquecidas,
      icpAlto,
      decisoresEncontrados,
      prontasParaSdr,
      novasHoje,
      novasOntem,
    },
    pipeline,
    fontes,
    categorias,
    filaDeEnriquecimento,
    restaurantes: {
      itens: restaurantes,
      total: totalDeRestaurantes,
      pagina,
      porPagina,
    },
    sugestoesDaIa: {
      medido: false,
      motivo:
        "nenhum motor de recomendação de prospecção foi construído — as três sugestões do desenho seriam texto fixo nosso com cara de conselho de máquina",
    },
    baseFria: { total: baseFriaTotal, comEmpresa: baseFriaComEmpresa },
  };
}
