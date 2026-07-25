/**
 * PoliticaDeImagem — a regra de ouro, em código.
 *
 * Definida pelo dono (2026-07-25):
 *   "Nunca inventar. Trabalhar com o insumo que o cliente traz, a não ser que
 *    seja solicitado pelo próprio cliente — caso ele não tenha mídia."
 *
 * Ou seja, NÃO é um "nunca" binário: é nunca por padrão, com UMA exceção que só
 * o lojista pode abrir, e só quando ele não tem foto. O sistema jamais decide
 * gerar por conta própria.
 *
 * Determinístico de propósito: é regra de negócio com consequência jurídica
 * (propaganda enganosa), não julgamento estético. Não passa por IA.
 */

export type CategoriaVisual =
  /** O prato que o restaurante vende — é o produto anunciado. */
  | "prato"
  /** Salão, fachada, bastidor — retrato de um lugar real. */
  | "ambiente"
  /** Fundo, textura, arte de promo, data comemorativa — não retrata nada real. */
  | "grafismo"
  /** Cliente ou equipe. */
  | "pessoa";

/**
 * A autorização é um REGISTRO, nunca um booleano.
 *
 * Um `true` solto é fácil demais de cravar no código por engano e ninguém
 * descobre. Exigindo quem/quando/o quê, a autorização precisa ter existido de
 * verdade e fica auditável.
 */
export interface AutorizacaoDoLojista {
  /** Quem autorizou — usuário do restaurante, não o Foocci. */
  por: string;
  /** Quando, ISO 8601. */
  em: string;
  /** O que exatamente foi autorizado: "gerar imagem do Burger do Chef". */
  escopo: string;
}

export type CaminhoDaImagem = "realce" | "geracao" | "bloqueado";

export interface DecisaoDeImagem {
  caminho: CaminhoDaImagem;
  permitido: boolean;
  /** A peça precisa sair marcada como "imagem ilustrativa". */
  exigeSelo: boolean;
  motivo: string;
  /** O que o lojista faz pra destravar. Só quando bloqueado. */
  saida?: string;
}

/** Autorização velha não vale: o cardápio muda, a foto some, o dono troca. */
export const VALIDADE_DA_AUTORIZACAO_DIAS = 90;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A autorização cobre o que está sendo pedido?
 *
 * Cobertura é por ITEM, nunca em bloco: autorizar "gerar imagem do Burger do
 * Chef" não libera gerar a picanha. Autorização genérica é como não ter.
 */
export function autorizacaoCobre(
  autorizacao: AutorizacaoDoLojista | null | undefined,
  escopoPedido: string,
  agora: Date = new Date(),
): { vale: boolean; motivo: string } {
  if (!autorizacao) return { vale: false, motivo: "não há autorização do lojista registrada" };

  const por = autorizacao.por?.trim();
  if (!por) return { vale: false, motivo: "autorização sem autor registrado" };

  const em = Date.parse(autorizacao.em ?? "");
  if (Number.isNaN(em)) return { vale: false, motivo: "autorização sem data válida" };

  const dias = (agora.getTime() - em) / 86_400_000;
  if (dias < 0) return { vale: false, motivo: "autorização com data no futuro" };
  if (dias > VALIDADE_DA_AUTORIZACAO_DIAS) {
    return { vale: false, motivo: `autorização vencida (${Math.floor(dias)} dias, limite ${VALIDADE_DA_AUTORIZACAO_DIAS})` };
  }

  const escopo = normalizar(autorizacao.escopo ?? "");
  const pedido = normalizar(escopoPedido);
  if (!escopo || !pedido) return { vale: false, motivo: "autorização sem escopo definido" };
  if (!escopo.includes(pedido)) {
    return { vale: false, motivo: `autorização não cobre "${escopoPedido}" (cobre "${autorizacao.escopo}")` };
  }

  return { vale: true, motivo: `autorizado por ${por} em ${autorizacao.em}` };
}

export interface DecisaoInput {
  categoria: CategoriaVisual;
  /** O restaurante tem foto própria desse item? */
  temMidiaPropria: boolean;
  /** O que se quer gerar, pra conferir contra o escopo autorizado. */
  escopoPedido: string;
  autorizacao?: AutorizacaoDoLojista | null;
  /** Injetável para teste. */
  agora?: Date;
}

/**
 * Decide de onde a imagem vem.
 *
 * Ordem de precedência (a mais restritiva primeiro — segurança não negocia):
 *   1. pessoa           → sempre bloqueado
 *   2. tem mídia própria→ realce, sempre (o insumo do cliente ganha de tudo)
 *   3. grafismo         → geração livre (não retrata nada real)
 *   4. sem mídia + autorização válida → geração COM selo
 *   5. sem mídia sem autorização      → bloqueado, com a saída explicada
 */
export function decidirImagem(input: DecisaoInput): DecisaoDeImagem {
  const { categoria, temMidiaPropria, escopoPedido, autorizacao, agora } = input;

  // 1. Pessoa nunca é gerada. E a exceção do lojista NÃO se aplica: ele pode
  //    autorizar sobre o negócio dele, não sobre o rosto de outra pessoa. Uma
  //    pessoa gerada apresentada como cliente ou equipe é falsidade, não estilo.
  if (categoria === "pessoa") {
    return {
      caminho: "bloqueado",
      permitido: false,
      exigeSelo: false,
      motivo: "pessoa nunca é gerada — nem com autorização do lojista",
      saida: "use foto real, com cessão de imagem de quem aparece",
    };
  }

  // 2. O insumo do cliente ganha de tudo. Tendo foto, é ela — realçada.
  if (temMidiaPropria) {
    return {
      caminho: "realce",
      permitido: true,
      exigeSelo: false,
      motivo: "o restaurante tem foto própria — realçar o insumo dele, nunca substituir",
    };
  }

  // 3. Grafismo não retrata nada real: não há o que falsear.
  if (categoria === "grafismo") {
    return {
      caminho: "geracao",
      permitido: true,
      exigeSelo: false,
      motivo: "arte gráfica não retrata prato nem lugar real",
    };
  }

  // 4/5. Prato ou ambiente sem foto: só com pedido explícito do lojista.
  const cobertura = autorizacaoCobre(autorizacao, escopoPedido, agora);
  if (cobertura.vale) {
    return {
      caminho: "geracao",
      permitido: true,
      exigeSelo: true,
      motivo: `sem foto própria e com pedido do lojista — ${cobertura.motivo}`,
    };
  }

  const alvo = categoria === "prato" ? "do prato" : "do ambiente";
  return {
    caminho: "bloqueado",
    permitido: false,
    exigeSelo: false,
    motivo: `sem foto ${alvo} e sem autorização válida — ${cobertura.motivo}`,
    saida: `envie uma foto ${alvo}, ou autorize expressamente uma imagem ilustrativa de "${escopoPedido}"`,
  };
}

/** O selo que acompanha toda imagem gerada de prato ou ambiente. */
export const SELO_ILUSTRATIVO = "Imagem ilustrativa";
