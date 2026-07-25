/**
 * TruthSource — a Oficina busca a verdade, ela não espera receber.
 *
 * O passo que separa um prompt genérico de um que só a gente consegue escrever.
 * A fonte é a MESMA do resto do Brain (o KnowledgeAdapter do negócio), então a
 * Oficina nunca inventa uma segunda versão da verdade.
 *
 * Regra herdada do BusinessKnowledgeContract: nível agregado, NUNCA PII crua.
 * O que sai daqui vai dentro de um prompt — tratar como se fosse publicado.
 */

import type { BusinessType } from "../core/BrainTypes";
import { resolveKnowledgeAdapter } from "../knowledge/KnowledgeAdapterRegistry";
import type { Verdade } from "./OficinaTypes";

/** Quantos exemplos de cada fonte entram na ficha antes de virar só contagem. */
const AMOSTRA = 8;

export interface VerdadeBuscada {
  verdade: Verdade;
  /** O que o negócio ainda não configurou — some da ficha e vira aviso. */
  faltando: string[];
  /** 0–1, do snapshot. Verdade rala explica peça fraca. */
  completude: number;
}

/** Extrai um rótulo legível de um item desconhecido, sem estourar se vier torto. */
function rotular(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (typeof item === "number") return String(item);
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    for (const chave of ["nome", "name", "titulo", "title", "label"]) {
      const valor = obj[chave];
      if (typeof valor === "string" && valor.trim()) return valor.trim();
    }
  }
  return null;
}

/** Uma fonte do snapshot vira uma linha da ficha: amostra + total. */
function resumirLista(itens: unknown[]): string | null {
  if (itens.length === 0) return null;
  const rotulos = itens.map(rotular).filter((r): r is string => r !== null);
  if (rotulos.length === 0) return `${itens.length} item(ns)`;
  const amostra = rotulos.slice(0, AMOSTRA).join(", ");
  return rotulos.length > AMOSTRA ? `${amostra} (+${rotulos.length - AMOSTRA} outros)` : amostra;
}

/**
 * Fontes que NUNCA entram na ficha: viram número, nunca conteúdo. Conversa e
 * pedido carregam nome, telefone e endereço de cliente — isso não vai pra
 * dentro de um prompt de peça de marketing.
 */
const SO_CONTAGEM = new Set(["customers", "orders", "conversations"]);

export function snapshotParaVerdade(truthSources: Record<string, unknown>): Verdade {
  const verdade: Verdade = {};
  for (const [fonte, valor] of Object.entries(truthSources)) {
    if (valor === undefined || valor === null) continue;

    if (Array.isArray(valor)) {
      if (valor.length === 0) continue;
      if (SO_CONTAGEM.has(fonte)) {
        verdade[`${fonte}_total`] = valor.length;
        continue;
      }
      const resumo = resumirLista(valor);
      if (resumo) verdade[fonte] = resumo;
      continue;
    }

    if (typeof valor === "string" || typeof valor === "number") {
      verdade[fonte] = valor;
      continue;
    }

    // objeto solto (horários, pagamentos): só as chaves com valor simples
    if (typeof valor === "object") {
      const partes = Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
        .slice(0, AMOSTRA)
        .map(([k, v]) => `${k}: ${v}`);
      if (partes.length > 0) verdade[fonte] = partes.join(" · ");
    }
  }
  return verdade;
}

/**
 * Busca a verdade do negócio pro pedido em questão.
 *
 * Sem adapter registrado, devolve verdade VAZIA — e é de propósito: o
 * PromptCritic reprova ficha sem verdade, então um negócio sem base de
 * conhecimento não consegue forjar peça. Falhar alto é melhor que publicar
 * genérico.
 */
export async function buscarVerdade(
  businessType: BusinessType,
  businessId: string,
  opts: { agentId?: string; queryHint?: string } = {},
): Promise<VerdadeBuscada> {
  const adapter = resolveKnowledgeAdapter(businessType);
  if (!adapter) {
    return { verdade: {}, faltando: [`Nenhuma base de conhecimento registrada para "${businessType}".`], completude: 0 };
  }

  try {
    const snapshot = await adapter.getSnapshot(businessId, {
      ...(opts.agentId  !== undefined ? { agentId: opts.agentId }   : {}),
      ...(opts.queryHint !== undefined ? { queryHint: opts.queryHint } : {}),
    });
    return {
      verdade: snapshotParaVerdade(snapshot.truthSources as Record<string, unknown>),
      faltando: snapshot.missingContext ?? [],
      completude: snapshot.completenessScore ?? 0,
    };
  } catch (err) {
    return {
      verdade: {},
      faltando: [`Falha ao ler a verdade: ${err instanceof Error ? err.message.slice(0, 120) : "erro"}`],
      completude: 0,
    };
  }
}
