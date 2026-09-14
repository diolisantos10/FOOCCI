/**
 * O QUE O TA SABE SOBRE O FOOCCI — e o muro que separa isso do que ele AFIRMA.
 *
 * ── DOIS ARQUIVOS, DUAS FUNÇÕES DIFERENTES ──────────────────────────────────
 *
 * `verdade.ts` guarda **frases prontas para o lead ler**: preço, FAQ do site,
 * posicionamento dos planos. Sai como está, palavra por palavra.
 *
 * Este arquivo guarda **contexto para o modelo pensar**: o Manual Operacional da
 * casa, que descreve o produto inteiro. Nada daqui sai verbatim — o manual foi
 * escrito para engenheiro, fala de `productIds`, de `stage`, de contrato de UI.
 * Despejar isso num dono de pizzaria seria pior que não responder.
 *
 * A separação é a razão de existirem dois arquivos: **saber não é poder afirmar.**
 *
 * ── ⚠️ O QUE NUNCA PODE ATRAVESSAR ESTE MURO ────────────────────────────────
 *
 * O Manual tem capítulos e seções que descrevem o que **ainda não existe**:
 * "Backlog", "Gaps conhecidos", "Histórico de Decisões". Um SDR com acesso a
 * isso vira o pior vendedor possível — o que promete o roadmap. O cliente compra
 * a promessa e descobre na implantação.
 *
 * Tem também o que é interno e não é da conta de um estranho: arquitetura,
 * segurança operacional, marca.
 *
 * Por isso o filtro é **lista de permissão em dois níveis**: o capítulo precisa
 * estar autorizado, E a seção precisa não estar na lista de proibidas. Lista de
 * bloqueio sozinha falha no dia em que o Manual ganha um capítulo novo — e o
 * capítulo novo entraria calado.
 *
 * O teste prova as duas coisas, e prova pelo conteúdo: ele procura frases reais
 * do backlog dentro da base e exige que não estejam lá.
 */

import { MANUAL_V01_CONTENT } from "@/services/manual/manualV01Content";
import {
  GUIA_COMERCIAL_ORIENTACAO_BASE_ID,
  GUIA_COMERCIAL_PARA_CONHECIMENTO,
} from "../guiaComercial";

export const CAPITULOS_PERMITIDOS = [
  "visao-geral",
  "waiter-agent",
  "crm-agent",
  "whatsapp-agent",
  "integracoes",
  "checkout-pagamentos",
  "analytics",
] as const;

const SECOES_PROIBIDAS =
  /^(#+\s*)?(gaps?\b|backlog|riscos?\b|d[ée]bito|pend[êe]ncias?\b|hist[óo]rico|decis[õo]es|arquitetura|seguran[çc]a|roadmap|pr[óo]ximos passos)/i;

export interface PedacoDeConhecimento {
  id: string;
  capitulo: string;
  secao: string;
  texto: string;
}

function secoesDe(slug: string, conteudo: string): PedacoDeConhecimento[] {
  const pedacos: PedacoDeConhecimento[] = [];
  const partes = conteudo.split(/\n(?=##\s)/);

  for (const parte of partes) {
    const linhas = parte.trim().split("\n");
    const cabecalho = (linhas[0] ?? "").replace(/^#+\s*/, "").trim();
    const corpo = linhas.slice(1).join("\n").trim();

    if (!corpo) continue;
    if (SECOES_PROIBIDAS.test(cabecalho)) continue;

    pedacos.push({
      id: `${slug}:${normalizarChave(cabecalho)}`,
      capitulo: slug,
      secao: cabecalho,
      texto: corpo,
    });
  }

  return pedacos;
}

function normalizarChave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "abertura";
}

export function baseDeConhecimento(): PedacoDeConhecimento[] {
  const permitidos = new Set<string>(CAPITULOS_PERMITIDOS);
  const guia: PedacoDeConhecimento[] = GUIA_COMERCIAL_PARA_CONHECIMENTO.map((item) => ({ ...item }));

  return [
    ...guia,
    ...MANUAL_V01_CONTENT
      .filter((c) => permitidos.has(c.slug))
      .flatMap((c) => secoesDe(c.slug, c.content)),
  ];
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VAZIAS = new Set(
  ("a o e de da do das dos em no na nos nas um uma uns umas para por com sem que " +
    "se ao aos as os ou mas como qual quais quanto quanta e sao tem ter " +
    "voce voces eu meu minha isso isto esse essa aqui la ja nao sim").split(" "),
);

function palavras(s: string): string[] {
  return normalizar(s).split(" ").filter((p) => p.length > 2 && !VAZIAS.has(p));
}

export const PEDACOS_POR_TURNO = 6;

/**
 * O que a base tem sobre esta pergunta.
 *
 * Regra de segurança: a orientação-base do guia só entra quando já existe pelo
 * menos um pedaço realmente relevante para a pergunta. Assim ela nunca vira
 * "prova de conhecimento" para uma pergunta sem fonte (por exemplo prazo de
 * implantação). E o conteúdo específico vem primeiro; o guia é complemento de
 * condução, não resposta de produto.
 */
export function buscarNoConhecimento(
  pergunta: string,
  base = baseDeConhecimento(),
  quantos = PEDACOS_POR_TURNO,
): PedacoDeConhecimento[] {
  const termos = palavras(pergunta);
  if (termos.length === 0) return [];

  const orientacaoBase = base.find((p) => p.id === GUIA_COMERCIAL_ORIENTACAO_BASE_ID) ?? null;
  const limiteDeBusca = Math.max(0, quantos - (orientacaoBase ? 1 : 0));

  const relevantes = base
    .filter((p) => p.id !== GUIA_COMERCIAL_ORIENTACAO_BASE_ID)
    .map((p) => {
      const texto = new Set(palavras(`${p.secao} ${p.texto}`));
      const cobertos = termos.filter((t) => texto.has(t)).length;
      return { p, nota: cobertos / termos.length };
    })
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, limiteDeBusca)
    .map((x) => x.p);

  if (relevantes.length === 0) return [];
  return orientacaoBase ? [...relevantes, orientacaoBase] : relevantes;
}
