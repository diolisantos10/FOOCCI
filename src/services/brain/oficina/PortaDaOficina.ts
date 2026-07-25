/**
 * PortaDaOficina — a entrada única da Oficina, para QUALQUER meio.
 *
 * A Oficina é a especialista em prompt do Brain: ela fabrica o comando de
 * altíssimo nível para que cada projeto entregue o melhor possível na demanda
 * dele. Imagem é UM dos meios — tem também legenda, mensagem, anúncio, roteiro,
 * e-mail, título, resposta de atendimento, descrição de produto.
 *
 * Quem chama diz o que quer em português. Aqui dentro se descobre o meio e se
 * entrega o comando pronto. Quem EXECUTA o comando é o projeto.
 */

import { atenderPedidoDeFoto, type Atendimento as AtendimentoDeFoto } from "./AtendenteDeFoto";
import { detectarTipoDeTexto, forjarOpcoesDeTexto, type PromptDeTexto } from "./ForjaDeTexto";
import { detectarTipo as detectarTipoDeFoto } from "./ForjaDeFoto";

export type Meio = "imagem" | "texto";

export interface PedidoNaPorta {
  /** O pedido em linguagem solta. */
  texto: string;
  /** Força o meio em vez de deixar detectar. */
  meio?: Meio;
  /** Fatos verdadeiros que a peça pode citar. */
  verdade?: string[];
  publico?: string;
  tom?: string;
  proibicoes?: string[];
  /** Só para imagem. */
  negocio?: string;
  ofertas?: string[];
  insumos?: string[];
  detalhes?: string;
  cenario?: string;
  formato?: string;
  quantos?: number;
  agentId?: string;
}

export interface RespostaDaPorta {
  meio: Meio;
  /** Por que caiu nesse meio — dá pra conferir se a leitura foi certa. */
  leitura: string;
  /** Preenchido quando o meio é texto. */
  textos?: PromptDeTexto[];
  /** Preenchido quando o meio é imagem (com pauta, quando o pedido é amplo). */
  imagem?: AtendimentoDeFoto;
}

/** Palavras que indicam que se quer uma IMAGEM, não um texto. */
const MARCAS_DE_IMAGEM = [
  "foto", "fotografia", "imagem", "banner", "arte", "criativo visual",
  "capa", "thumbnail", "ilustracao", "clique", "retrato", "registro visual",
];

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Imagem ou texto?
 *
 * Empate vai para TEXTO: um comando de texto entregue a quem queria foto é
 * facilmente redirecionado; um comando de foto para quem queria legenda é
 * inútil. Quem tem certeza passa `meio`.
 */
export function lerMeio(texto: string): { meio: Meio; leitura: string } {
  const alvo = normalizar(texto);

  const marcaTexto = detectarTipoDeTexto(texto);
  if (marcaTexto !== "generico") {
    return { meio: "texto", leitura: `o pedido nomeia uma peça escrita (${marcaTexto})` };
  }

  const marcaImagem = MARCAS_DE_IMAGEM.find((m) => alvo.includes(normalizar(m)));
  if (marcaImagem) {
    return { meio: "imagem", leitura: `o pedido fala de imagem ("${marcaImagem}")` };
  }

  if (detectarTipoDeFoto(texto) !== "generico") {
    return { meio: "imagem", leitura: "o pedido nomeia um assunto fotografável" };
  }

  return { meio: "texto", leitura: "o pedido não indica imagem — na dúvida, texto" };
}

/** Atende qualquer pedido, de qualquer meio. */
export async function atender(p: PedidoNaPorta): Promise<RespostaDaPorta> {
  const lido = p.meio ? { meio: p.meio, leitura: "meio escolhido por quem chamou" } : lerMeio(p.texto);

  if (lido.meio === "texto") {
    return {
      meio: "texto",
      leitura: lido.leitura,
      textos: forjarOpcoesDeTexto(
        {
          pedido: p.texto,
          ...(p.verdade    !== undefined ? { verdade: p.verdade }       : {}),
          ...(p.publico    !== undefined ? { publico: p.publico }       : {}),
          ...(p.tom        !== undefined ? { tom: p.tom }               : {}),
          ...(p.proibicoes !== undefined ? { proibicoes: p.proibicoes } : {}),
        },
        p.quantos ?? 3,
      ),
    };
  }

  return {
    meio: "imagem",
    leitura: lido.leitura,
    imagem: await atenderPedidoDeFoto({
      texto: p.texto,
      ...(p.negocio  !== undefined ? { negocio: p.negocio }   : {}),
      ...(p.ofertas  !== undefined ? { ofertas: p.ofertas }   : {}),
      ...(p.publico  !== undefined ? { publico: p.publico }   : {}),
      ...(p.insumos  !== undefined ? { insumos: p.insumos }   : {}),
      ...(p.detalhes !== undefined ? { detalhes: p.detalhes } : {}),
      ...(p.cenario  !== undefined ? { cenario: p.cenario }   : {}),
      ...(p.formato  !== undefined ? { formato: p.formato }   : {}),
      ...(p.quantos  !== undefined ? { quantos: p.quantos }   : {}),
      ...(p.agentId  !== undefined ? { agentId: p.agentId }   : {}),
    }),
  };
}
