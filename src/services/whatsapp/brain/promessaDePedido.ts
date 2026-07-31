/**
 * promessaDePedido — a trava que impede o agente de prometer o que não pode fazer.
 *
 * O incidente:
 *
 *   agente : Perfeito! Vou adicionar tare ao seu pedido e não incluirei shoyu.
 *            Posso confirmar o seu pedido agora?
 *   cliente: Sim Prfv
 *   agente : (nada acontece — não existe pedido)
 *   cliente: Sim Prfv
 *   agente : (nada acontece de novo)
 *
 * O caminho de conversa do WhatsApp NÃO tem carrinho. Nenhuma capacidade de
 * criar pedido, somar total ou registrar item. Mesmo assim o agente encenou uma
 * comanda inteira: adicionou, ajustou, pediu confirmação. A cliente ainda mandou
 * endereço e forma de pagamento — que ninguém leu, porque não havia onde gravar.
 *
 * O erro NÃO foi alucinar um fato. Foi **encenar uma capacidade**. É um modo de
 * falha diferente: nenhum verificador de preço ou de cardápio pega, porque o
 * agente não disse nada falso sobre o restaurante — ele mentiu sobre si mesmo.
 *
 * A regra: **capacidade que o agente não tem precisa de TRAVA, não de prompt.**
 * "Não prometa pedido" já estava escrito no perfil. Não segurou.
 *
 * Módulo puro — sem banco, sem rede.
 */

/** Tira acento e caixa para as regras valerem com e sem acentuação. */
function limpar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * As formas de encenar uma comanda que o agente não tem.
 *
 * Cada uma foi tirada de fala real ou é a variação óbvia dela. Deliberadamente
 * ancoradas em "pedido/comanda/carrinho" — sem essa âncora, "vou adicionar"
 * pegaria frases legítimas ("vou adicionar essa informação").
 */
const PROMESSAS: ReadonlyArray<{ nome: string; re: RegExp }> = [
  { nome: "anotou item",       re: /\b(vou |ja |já )?(adicion|anot|inclu|coloqu|coloc|acrescent|botei|bot)\w*\b[^.!?]{0,40}\b(no |ao |seu |teu |na )?(pedido|comanda|carrinho)\b/ },
  { nome: "montou o pedido",   re: /\b(montei|fechei|registrei|separei|criei)\b[^.!?]{0,30}\b(o |seu |teu )?(pedido|comanda|carrinho)\b/ },
  { nome: "pede confirmação",  re: /\b(posso|vou|quer que eu)\b[^.!?]{0,25}\bconfirm\w*\b[^.!?]{0,25}\b(pedido|comanda)\b/ },
  { nome: "pede confirmação",  re: /\bconfirm(a|ar|o|amos)\b[^.!?]{0,20}\b(o |seu |teu )(pedido|comanda)\b/ },
  { nome: "promete registrar", re: /\b(pedido|comanda)\b[^.!?]{0,20}\b(anotad|registrad|confirmad|fechad)\w*\b/ },
  { nome: "coleta de entrega", re: /\b(qual|me (passa|informa|diz)|pode (passar|informar))\b[^.!?]{0,30}\b(endereco|endereço)\b[^.!?]{0,30}\b(entrega|entregar)\b/ },
  { nome: "coleta de troco",   re: /\b(precisa|vai precisar|quer)\b[^.!?]{0,15}\btroco\b/ },
];

export interface VeredictoDaPromessa {
  /** true = a frase encena uma capacidade que o agente não tem. */
  prometeu: boolean;
  /** Quais encenações foram detectadas (nomes estáveis, para log e teste). */
  motivos: string[];
}

/**
 * A resposta promete um pedido que este agente não consegue criar?
 *
 * Use APENAS em agentes sem carrinho. Num agente que realmente cria pedido, as
 * mesmas frases são o comportamento certo.
 */
export function prometeuPedido(resposta: string): VeredictoDaPromessa {
  const texto = limpar(resposta);
  const motivos: string[] = [];
  for (const { nome, re } of PROMESSAS) {
    if (re.test(texto) && !motivos.includes(nome)) motivos.push(nome);
  }
  return { prometeu: motivos.length > 0, motivos };
}

/**
 * O que dizer no lugar. Não é queda de erro — é o encaminhamento certo: quem
 * quer pedir vai para o cardápio, que é onde o pedido realmente existe.
 */
export function encaminharParaOCardapio(linkDoCardapio?: string | null): string {
  const base = "Pra fechar o pedido é rapidinho pelo nosso cardápio 😊";
  const link = linkDoCardapio?.trim();
  return link ? `${base}\n\n${link}` : base;
}
