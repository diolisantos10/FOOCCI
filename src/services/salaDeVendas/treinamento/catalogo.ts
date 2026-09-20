/**
 * O CENTRO DE TREINAMENTO COMERCIAL — uma projeção didática das fontes que já
 * governam o produto e os agentes.
 *
 * Não existe texto de produto digitado aqui. Produto vem de `verdade.ts`;
 * condução vem do Guia; limites de marca vêm da mesma doutrina que alimenta a
 * Supervisora. Assim a aula não consegue ensinar uma promessa que o TA está
 * proibido de fazer.
 */

import type { EixoDoTreinamentoComercial } from "@prisma/client";
import { baseDeVerdade } from "../ta/verdade";
import { GUIA_COMERCIAL_PARA_CONHECIMENTO } from "../guiaComercial";
import { doutrinaParaTreinamento, VERSAO_DO_PLAYBOOK_COMERCIAL } from "../supervisora/conhecimentoComercial";

export interface UnidadeDeTreinamento {
  id: string;
  eixo: EixoDoTreinamentoComercial;
  titulo: string;
  resumo: string;
  conteudo: readonly string[];
  fonte: string;
}

export interface TrilhaDeTreinamento {
  eixo: EixoDoTreinamentoComercial;
  titulo: string;
  objetivo: string;
  publico: "Humanos e agentes de IA";
  unidades: readonly UnidadeDeTreinamento[];
}

export interface QuestaoDeTreinamento {
  id: string;
  eixo: EixoDoTreinamentoComercial;
  enunciado: string;
  opcoes: ReadonlyArray<{ id: string; texto: string }>;
}

interface QuestaoComGabarito extends QuestaoDeTreinamento {
  resposta: string;
}

function unidadesDeProduto(): UnidadeDeTreinamento[] {
  return baseDeVerdade().map((item) => ({
    id: `produto:${item.id}`,
    eixo: "PRODUTO",
    titulo: item.sobre,
    resumo: item.texto,
    conteudo: [item.texto],
    fonte: item.fonte,
  }));
}

function unidadesDeVenda(): UnidadeDeTreinamento[] {
  return GUIA_COMERCIAL_PARA_CONHECIMENTO.map((item) => ({
    id: `venda:${item.id}`,
    eixo: "VENDA_CONSULTIVA",
    titulo: item.secao,
    resumo: item.texto.split("\n")[0] ?? item.secao,
    conteudo: item.texto.split("\n").filter(Boolean),
    fonte: "Guia comercial publicado",
  }));
}

function unidadesDeSeguranca(): UnidadeDeTreinamento[] {
  return doutrinaParaTreinamento().map((frente) => ({
    id: `seguranca:${frente.id}`,
    eixo: "SEGURANCA_E_MARCA",
    titulo: frente.titulo,
    resumo: frente.faz[0] ?? frente.titulo,
    conteudo: [...frente.faz, ...frente.nuncaFaz],
    fonte: VERSAO_DO_PLAYBOOK_COMERCIAL,
  }));
}

export function catalogoDoTreinamento(): readonly TrilhaDeTreinamento[] {
  return [
    {
      eixo: "PRODUTO",
      titulo: "Produto Foocci",
      objetivo: "Dominar benefícios, planos, limites e respostas que podem ser afirmadas ao cliente.",
      publico: "Humanos e agentes de IA",
      unidades: unidadesDeProduto(),
    },
    {
      eixo: "VENDA_CONSULTIVA",
      titulo: "Venda consultiva",
      objetivo: "Diagnosticar antes do pitch, demonstrar o recurso certo e avançar sem transformar conversa em formulário.",
      publico: "Humanos e agentes de IA",
      unidades: unidadesDeVenda(),
    },
    {
      eixo: "SEGURANCA_E_MARCA",
      titulo: "Segurança e marca",
      objetivo: "Persuadir sem pressão, promessa, mentira, invasão ou desrespeito ao opt-out.",
      publico: "Humanos e agentes de IA",
      unidades: unidadesDeSeguranca(),
    },
  ];
}

function deslocar<T>(itens: readonly T[], n: number): T[] {
  if (itens.length === 0) return [];
  const corte = n % itens.length;
  return [...itens.slice(corte), ...itens.slice(0, corte)];
}

/** Gera uma prova sempre a partir do conteúdo publicado, nunca de um gabarito
 * duplicado. A ordem é determinística para retry/revisão e não muda no reload. */
function provaComGabarito(eixo: EixoDoTreinamentoComercial): QuestaoComGabarito[] {
  const trilha = catalogoDoTreinamento().find((t) => t.eixo === eixo);
  if (!trilha || trilha.unidades.length < 4) return [];

  return trilha.unidades.slice(0, 5).map((unidade, indice) => {
    const outras = deslocar(trilha.unidades.filter((u) => u.id !== unidade.id), indice).slice(0, 3);
    const opcoesBrutas = [
      { id: unidade.id, texto: unidade.resumo },
      ...outras.map((u) => ({ id: u.id, texto: u.resumo })),
    ];
    const opcoes = deslocar(opcoesBrutas, indice + 1);

    const enunciado = eixo === "PRODUTO"
      ? `Qual afirmação aprovada responde com segurança a: “${unidade.titulo}”?`
      : eixo === "VENDA_CONSULTIVA"
        ? `Qual orientação pertence ao módulo “${unidade.titulo}”?`
        : `Qual regra protege a marca na frente “${unidade.titulo}”?`;

    return {
      id: `${eixo.toLowerCase()}:${indice + 1}`,
      eixo,
      enunciado,
      opcoes,
      resposta: unidade.id,
    };
  });
}

export function provaDoTreinamento(eixo: EixoDoTreinamentoComercial): QuestaoDeTreinamento[] {
  return provaComGabarito(eixo).map(({ resposta: _resposta, ...questao }) => questao);
}

export function corrigirProva(
  eixo: EixoDoTreinamentoComercial,
  respostas: ReadonlyArray<{ questaoId: string; opcaoId: string }>,
): { acertos: number; total: number; nota: number; itens: Array<{ questaoId: string; acertou: boolean }> } {
  const prova = provaComGabarito(eixo);
  const porQuestao = new Map(respostas.map((r) => [r.questaoId, r.opcaoId]));
  const itens = prova.map((q) => ({ questaoId: q.id, acertou: porQuestao.get(q.id) === q.resposta }));
  const acertos = itens.filter((i) => i.acertou).length;
  const total = prova.length;
  return { acertos, total, nota: total > 0 ? Math.round((acertos / total) * 100) : 0, itens };
}

export function nivelDeDominio(nota: number | null): "Não avaliado" | "Em formação" | "Operacional" | "Proficiente" | "Especialista" {
  if (nota === null) return "Não avaliado";
  if (nota < 50) return "Em formação";
  if (nota < 70) return "Operacional";
  if (nota < 85) return "Proficiente";
  return "Especialista";
}
