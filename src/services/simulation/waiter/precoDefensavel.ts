/**
 * precoDefensavel — que valor em reais o Garçom pode dizer sem estar mentindo.
 *
 * O checador `no_fake_price` nasceu com uma régua curta demais: valia o preço
 * EXATO de um item do cardápio, e mais nada. Só que um garçom honesto fala
 * muito mais número que isso — ele soma.
 *
 *   "seu pedido dá R$ 87,00"        ← total do carrinho
 *   "os dois saem por R$ 64,00"     ← soma de dois itens que ele mostrou
 *   "com a sobremesa fica R$ 96,00" ← carrinho + o item sugerido
 *
 * Nenhum desses é preço de item, e os três eram marcados como CRÍTICO — a
 * mesma gaveta de "inventou preço". Pior: os cenários onde isso acontece são
 * justamente PAYMENT_QUESTION e WANTS_CHECKOUT, em que dizer o total é o
 * comportamento CERTO. O checador reprovava o agente por acertar.
 *
 * A régua nova é: o número precisa ser EXPLICÁVEL pelo que está na mesa —
 * o carrinho e os itens que o próprio agente mostrou nesta resposta. Note o
 * que ela continua reprovando, que é o ponto:
 *
 *   • preço de item que não existe no cardápio
 *   • soma de itens que ele NÃO mostrou (número tirado do nada)
 *   • qualquer valor que não bate com nenhuma combinação da mesa
 *
 * Em centavos inteiros de propósito: 32,90 + 32,90 em ponto flutuante dá
 * 65,80000000000001, e um checador que erra por dízima é pior que nenhum.
 */

/** Reais → centavos, sem herdar o erro do ponto flutuante. */
export function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

export interface MesaDoAgente {
  /** Preços de TODOS os itens do cardápio. */
  precosDoCatalogo: number[];
  /** Valor do carrinho no início do turno (0 quando não há carrinho). */
  valorDoCarrinho: number;
  /** Preços dos itens que o agente mostrou NESTA resposta. */
  precosMostrados: number[];
}

/**
 * Os valores que o agente pode dizer com honestidade.
 *
 * Combinação é limitada de propósito ao que está à vista: carrinho, cada item
 * mostrado, somas entre os mostrados e carrinho + mostrados. Abrir para
 * qualquer soma do cardápio inteiro transformaria o checador num carimbo —
 * com cardápio grande, quase todo número teria alguma combinação que fecha.
 */
export function valoresDefensaveis(mesa: MesaDoAgente): Set<number> {
  const ok = new Set<number>();

  // 1. Preço de item do cardápio — a régua original, mantida.
  for (const p of mesa.precosDoCatalogo) ok.add(emCentavos(p));

  const carrinho = emCentavos(mesa.valorDoCarrinho);
  const mostrados = mesa.precosMostrados.map(emCentavos);

  // 2. O total do carrinho.
  if (carrinho > 0) ok.add(carrinho);

  // 3. Carrinho + cada item mostrado (o upsell: "com a sobremesa fica X").
  for (const m of mostrados) {
    if (carrinho > 0) ok.add(carrinho + m);
  }

  // 4. Somas entre os itens mostrados ("os dois saem por X"), inclusive com o
  //    carrinho junto. Só o que está à vista entra na conta.
  for (let i = 0; i < mostrados.length; i++) {
    let soma = 0;
    for (let j = i; j < mostrados.length; j++) {
      soma += mostrados[j] ?? 0;
      ok.add(soma);
      if (carrinho > 0) ok.add(carrinho + soma);
    }
  }

  return ok;
}

/**
 * O valor dito pelo agente se sustenta?
 *
 * `toleranciaCentavos` cobre arredondamento de exibição — um total mostrado
 * como R$ 65,80 quando a soma exata dá 65,79. Um centavo não é mentira; é
 * formatação.
 */
export function precoSeSustenta(
  valorEmReais: number,
  defensaveis: Set<number>,
  toleranciaCentavos = 1,
): boolean {
  const alvo = emCentavos(valorEmReais);
  for (let d = -toleranciaCentavos; d <= toleranciaCentavos; d++) {
    if (defensaveis.has(alvo + d)) return true;
  }
  return false;
}
