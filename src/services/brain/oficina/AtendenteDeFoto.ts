/**
 * AtendenteDeFoto — a porta única. O cliente pede de qualquer jeito; aqui dentro
 * a gente descobre o que ele quis dizer.
 *
 * O pedido chega em mil formatos:
 *   "traz a foto do meu hambúrguer"          → assunto concreto, forja direto
 *   "preciso divulgar minha clínica"         → objetivo de negócio, monta pauta
 *   "me ajuda com o instagram desse mês"     → amplo, monta pauta
 *   "uma foto bonita"                        → vago, monta pauta
 *
 * Nunca devolve "não entendi". Se der pra fotografar, sai comando; se o pedido
 * for amplo demais, sai uma pauta com várias opções — que é o que um diretor de
 * arte faria com um briefing vago, em vez de mandar o cliente reformular.
 */

import { detectarTipo, forjarOpcoesDeFoto, limparPedido, type PromptDeFoto } from "./ForjaDeFoto";
import { montarPauta, type ItemDaPauta, type PedidoDePauta } from "./PautaDeFotos";

export type ModoDeAtendimento = "direto" | "pauta";

export interface PedidoAberto {
  /** O texto do cliente, como veio. */
  texto: string;
  /** O negócio, quando se sabe: "clínica de estética", "hamburgueria". */
  negocio?: string;
  /** Serviços/produtos reais — ancora a resposta na verdade. */
  ofertas?: string[];
  publico?: string;
  /** O que o cliente já tem de imagem, pra servir de inspiração. */
  insumos?: string[];
  detalhes?: string;
  cenario?: string;
  formato?: string;
  /** Quantas opções/conceitos devolver. Padrão 3 no direto, 6 na pauta. */
  quantos?: number;
  /** Força o modo em vez de deixar decidir. */
  modo?: ModoDeAtendimento;
  agentId?: string;
}

export interface Atendimento {
  modo: ModoDeAtendimento;
  /** Por que caiu nesse modo — pra você conferir se a leitura foi certa. */
  leitura: string;
  /** Preenchido no modo direto. */
  opcoes?: PromptDeFoto[];
  /** Preenchido no modo pauta. */
  pauta?: ItemDaPauta[];
  /** true quando a pauta veio da reserva porque a IA falhou. */
  reserva?: boolean;
}

/** Marcas de que o cliente falou de OBJETIVO, não de foto. */
const MARCAS_DE_OBJETIVO = [
  "divulgar", "divulgacao", "promover", "promocao", "campanha", "marketing",
  "conteudo", "instagram", "redes sociais", "posts", "postagens", "calendario",
  "atrair", "vender mais", "aumentar", "lancar", "lancamento", "estrategia",
  "nao sei", "me ajuda", "preciso de ideias", "sugestao", "o que postar",
  "mes", "semana", "planejamento",
];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Amplo ou concreto?
 *
 * Na dúvida, vai pra PAUTA. Entregar seis opções para quem queria uma é um
 * incômodo pequeno; entregar uma foto errada para quem queria direção é perder
 * a entrega inteira.
 */
export function lerPedido(texto: string): { modo: ModoDeAtendimento; leitura: string } {
  const alvo = normalizar(texto);

  const marca = MARCAS_DE_OBJETIVO.find((m) => alvo.includes(normalizar(m)));
  if (marca) {
    return { modo: "pauta", leitura: `o pedido fala de objetivo ("${marca}"), não de uma foto específica` };
  }

  const assunto = limparPedido(texto);
  if (assunto.trim().length < 3 || assunto === "assunto não informado") {
    return { modo: "pauta", leitura: "o pedido não nomeia nada fotografável" };
  }

  // Não reconhecemos o que seria fotografado. Forjar um comando pra assunto
  // desconhecido produz exatamente a foto genérica que a gente combateu; a
  // pauta devolve caminhos concretos. Quem tem certeza força modo: "direto".
  const tipo = detectarTipo(texto);
  if (tipo === "generico") {
    return { modo: "pauta", leitura: "o pedido não nomeia um assunto reconhecível — a pauta oferece caminhos" };
  }

  return { modo: "direto", leitura: `o pedido nomeia um assunto concreto (${tipo})` };
}

/**
 * Atende o pedido, seja ele qual for.
 *
 * O modo pode ser forçado — às vezes o operador sabe que quer a pauta mesmo
 * tendo dito o assunto ("quero várias ideias em cima do hambúrguer").
 */
export async function atenderPedidoDeFoto(p: PedidoAberto): Promise<Atendimento> {
  const lido = p.modo ? { modo: p.modo, leitura: "modo escolhido por quem chamou" } : lerPedido(p.texto);

  if (lido.modo === "direto") {
    return {
      modo: "direto",
      leitura: lido.leitura,
      opcoes: forjarOpcoesDeFoto(
        {
          pedido: p.texto,
          ...(p.detalhes !== undefined ? { detalhes: p.detalhes } : {}),
          ...(p.cenario  !== undefined ? { cenario:  p.cenario }  : {}),
          ...(p.formato  !== undefined ? { formato:  p.formato }  : {}),
        },
        p.quantos ?? 3,
      ),
    };
  }

  const pedidoDePauta: PedidoDePauta = {
    negocio:  p.negocio?.trim() || "o negócio do cliente",
    objetivo: p.texto,
    quantos:  p.quantos ?? 6,
    ...(p.ofertas !== undefined ? { ofertas: p.ofertas } : {}),
    ...(p.publico !== undefined ? { publico: p.publico } : {}),
    ...(p.insumos !== undefined ? { insumos: p.insumos } : {}),
    ...(p.formato !== undefined ? { formato: p.formato } : {}),
    ...(p.agentId !== undefined ? { agentId: p.agentId } : {}),
  };

  const pauta = await montarPauta(pedidoDePauta);
  return { modo: "pauta", leitura: lido.leitura, pauta: pauta.itens, reserva: pauta.reserva };
}
