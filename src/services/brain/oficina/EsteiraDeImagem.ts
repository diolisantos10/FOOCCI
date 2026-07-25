/**
 * EsteiraDeImagem — a Oficina aplicada a imagem.
 *
 *   política → [bloqueado | realce | geração] → ficha → comando → aprovação
 *
 * Diferença crucial em relação ao texto: a POLÍTICA vem primeiro, antes de
 * qualquer ficha. Não adianta forjar um comando lindo pra uma imagem que não
 * podia existir — e forjar custa tempo e abre espaço pra alguém usar o comando
 * assim mesmo. Barrar primeiro é mais barato e mais seguro.
 *
 * Segunda diferença, e é uma limitação HONESTA: o crítico determinístico sabe
 * ler texto, não pixel. Ele não consegue dizer se a imagem gerada tem seis dedos
 * ou um prato que não é o do cardápio. Então imagem NUNCA é liberada
 * automaticamente — sempre passa por gente. É a mesma regra que o
 * ImageEnhancementService já aplica no realce, agora valendo pro caminho todo.
 */

import type { BusinessType } from "../core/BrainTypes";
import type { Ficha, Pedido } from "./OficinaTypes";
import { resolveManual } from "./HouseManual";
import { montarFicha, type ForjarInput } from "./OficinaService";
import { criticar } from "./PromptCritic";
import { buscarVerdade } from "./TruthSource";
import {
  decidirImagem,
  SELO_ILUSTRATIVO,
  type AutorizacaoDoLojista,
  type CategoriaVisual,
  type DecisaoDeImagem,
} from "./PoliticaDeImagem";
import {
  chaveDeMemoria,
  resolverMemoria,
  JANELA_PADRAO,
} from "./AssinaturaMemory";
import type { Nota } from "./OficinaTypes";

export interface EsteiraDeImagemInput {
  pedido: Omit<Pedido, "medium">;
  businessType: BusinessType;
  businessId: string;
  categoria: CategoriaVisual;
  /** O que se quer retratar: "Burger do Chef". Confere contra o autorizado. */
  escopoPedido: string;
  /** Foto do restaurante, quando existe. Presença = tem insumo próprio. */
  midiaUrl?: string | null;
  autorizacao?: AutorizacaoDoLojista | null;
  rascunho?: ForjarInput["rascunho"];
  /** Quem realça a foto real. Ausente = a esteira só diz que é caso de realce. */
  realcar?: (midiaUrl: string, ficha: Ficha) => Promise<string>;
  /** Quem gera a imagem nova. Ausente = a esteira para no comando. */
  gerar?: (comando: string, ficha: Ficha) => Promise<string>;
  corte?: number;
  janela?: number;
  agora?: Date;
}

export interface EsteiraDeImagemResult {
  decisao: DecisaoDeImagem;
  /** Só existe quando a política deixou passar. */
  ficha?: Ficha;
  comando?: string;
  notaComando?: Nota;
  /** URL/id do que saiu (realçado ou gerado), quando houve execução. */
  resultado?: string;
  /** O selo obrigatório, quando a imagem foi gerada. */
  selo?: string;
  /**
   * SEMPRE true quando algo foi produzido: nenhum código aqui sabe olhar uma
   * imagem. Quem aprova é gente.
   */
  precisaAprovacaoHumana: boolean;
  faltando: string[];
  motivoFinal: string;
}

/**
 * O comando de imagem — a gramática de câmera da ficha, em rótulo e valor.
 *
 * Formato diferente do texto de propósito: um gerador de imagem responde melhor
 * a uma ficha técnica de fotografia (luz nomeada, lente em mm, profundidade)
 * do que a um briefing de redação.
 */
export function renderizarComandoDeImagem(ficha: Ficha, exigeSelo: boolean): string {
  const linhas: string[] = [`ASSUNTO: ${ficha.objetivo}`];

  const verdade = Object.entries(ficha.verdade);
  if (verdade.length > 0) {
    linhas.push("O QUE EXISTE DE VERDADE (retrate só isto):");
    for (const [chave, valor] of verdade) {
      linhas.push(`  - ${chave}: ${Array.isArray(valor) ? valor.join(", ") : valor}`);
    }
  }

  const eixos = Object.entries(ficha.eixos);
  if (eixos.length > 0) {
    linhas.push("CÂMERA:");
    for (const [nome, valor] of eixos) linhas.push(`  - ${nome}: ${valor}`);
  }

  if (ficha.tom.trim()) linhas.push(`CLIMA: ${ficha.tom}`);

  linhas.push("TEXTURA REAL: imperfeição natural — brilho irregular, migalha, sombra viva. Nada perfeito demais.");

  if (ficha.proibicoes.length > 0) {
    linhas.push("NÃO FAÇA:");
    for (const p of ficha.proibicoes) linhas.push(`  - ${p}`);
  }

  if (exigeSelo) {
    linhas.push(`SELO OBRIGATÓRIO: a peça sai marcada como "${SELO_ILUSTRATIVO}".`);
  }

  return linhas.join("\n");
}

/**
 * Roda a esteira de imagem.
 *
 * A ordem é a proteção: política → verdade → ficha → comando → execução. Se a
 * política barra, nada mais acontece — nem busca de verdade, nem forja, nem
 * chamada de IA.
 */
export async function rodarEsteiraDeImagem(input: EsteiraDeImagemInput): Promise<EsteiraDeImagemResult> {
  const temMidiaPropria = typeof input.midiaUrl === "string" && input.midiaUrl.trim().length > 0;

  // 1. A política primeiro. Barrou, acabou — e o lojista recebe a saída.
  const decisao = decidirImagem({
    categoria: input.categoria,
    temMidiaPropria,
    escopoPedido: input.escopoPedido,
    autorizacao: input.autorizacao ?? null,
    ...(input.agora !== undefined ? { agora: input.agora } : {}),
  });

  if (decisao.caminho === "bloqueado") {
    return {
      decisao,
      precisaAprovacaoHumana: false,
      faltando: [],
      motivoFinal: `Bloqueado: ${decisao.motivo}. ${decisao.saida ?? ""}`.trim(),
    };
  }

  // 2. A verdade e a ficha — valem para os dois caminhos: mesmo no realce, é
  //    ela que carrega as regras de preservação pro serviço de realce.
  const { verdade, faltando } = await buscarVerdade(input.businessType, input.businessId, {
    agentId: input.pedido.agentId,
    queryHint: input.escopoPedido,
  });

  const pedido: Pedido = { ...input.pedido, medium: "imagem" };
  const manual = resolveManual(pedido.dominio);
  if (!manual) {
    return {
      decisao,
      precisaAprovacaoHumana: false,
      faltando,
      motivoFinal: `Sem manual da casa para "${pedido.dominio}" — nenhuma peça é forjada.`,
    };
  }

  const memory = await resolverMemoria();
  const chave = chaveDeMemoria(input.businessId, pedido.agentId, input.escopoPedido);
  const usadas = await memory.recentes(chave, input.janela ?? JANELA_PADRAO);

  const { ficha } = montarFicha(
    {
      pedido,
      verdade,
      usadas,
      ...(input.rascunho !== undefined ? { rascunho: input.rascunho } : {}),
    },
    manual,
  );

  const notaComando = criticar(ficha, manual, input.corte);

  // 3. Realce: o insumo do cliente. Não passa pelo crítico do comando — não é
  //    um prompt criativo, é uma ordem de preservação sobre a foto dele.
  if (decisao.caminho === "realce") {
    const midiaUrl = input.midiaUrl as string;
    if (!input.realcar) {
      return {
        decisao, ficha, notaComando, faltando,
        precisaAprovacaoHumana: false,
        motivoFinal: "Caso de realce da foto do restaurante (sem realçador nesta chamada).",
      };
    }
    try {
      const resultado = await input.realcar(midiaUrl, ficha);
      await memory.registrar(chave, ficha.assinatura);
      return {
        decisao, ficha, notaComando, resultado, faltando,
        precisaAprovacaoHumana: true,
        motivoFinal: "Foto do restaurante realçada — precisa do aval de gente antes de publicar.",
      };
    } catch (err) {
      return {
        decisao, ficha, notaComando, faltando,
        precisaAprovacaoHumana: false,
        motivoFinal: `Realce falhou: ${err instanceof Error ? err.message.slice(0, 120) : "erro"}`,
      };
    }
  }

  // 4. Geração: comando reprovado não vira imagem. Barato falhar aqui.
  const comando = renderizarComandoDeImagem(ficha, decisao.exigeSelo);
  if (!notaComando.aprovado) {
    return {
      decisao, ficha, comando, notaComando, faltando,
      precisaAprovacaoHumana: false,
      motivoFinal: `Comando reprovado: ${notaComando.motivos[0] ?? "sem motivo registrado"}`,
    };
  }

  if (!input.gerar) {
    return {
      decisao, ficha, comando, notaComando, faltando,
      precisaAprovacaoHumana: false,
      ...(decisao.exigeSelo ? { selo: SELO_ILUSTRATIVO } : {}),
      motivoFinal: "Comando de imagem aprovado (sem gerador nesta chamada).",
    };
  }

  try {
    const resultado = await input.gerar(comando, ficha);
    await memory.registrar(chave, ficha.assinatura);
    return {
      decisao, ficha, comando, notaComando, resultado, faltando,
      precisaAprovacaoHumana: true,
      ...(decisao.exigeSelo ? { selo: SELO_ILUSTRATIVO } : {}),
      motivoFinal: "Imagem gerada — precisa do aval de gente antes de publicar.",
    };
  } catch (err) {
    return {
      decisao, ficha, comando, notaComando, faltando,
      precisaAprovacaoHumana: false,
      motivoFinal: `Geração falhou: ${err instanceof Error ? err.message.slice(0, 120) : "erro"}`,
    };
  }
}
