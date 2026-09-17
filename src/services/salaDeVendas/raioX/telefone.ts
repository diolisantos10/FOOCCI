/**
 * O TELEFONE SAI MASCARADO, E ABRIR É ATO DECLARADO.
 *
 * O raio-x existe para o Diretor LER o que aconteceu nas conversas. Ler a
 * conversa não exige o número inteiro de ninguém: o número é dado pessoal de
 * terceiro, e um relatório que o estampa por padrão vira uma lista de contatos
 * circulando em log, print e histórico de terminal.
 *
 * Então o padrão é máscara. O inteiro sai só com `?telefoneCompleto=1`, que é
 * **um ato**, fica registrado no log da rota, e por isso pode ser respondido
 * depois ("quem abriu, quando, para quê").
 *
 * ⚠️ A máscara preserva o que serve para RECONHECER (DDI, DDD, o 9 e os dois
 * últimos dígitos) e esconde o que serve para DISCAR.
 */

/** Só os dígitos — mesmo contrato de `SiteLead.whatsappDigits`. */
function digitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * `5511987654321` → `+55 11 9****-**21`.
 *
 * Número curto demais para ter DDI+DDD+assinante não é mascarado "mais ou
 * menos": vira `****`. Máscara que deixa passar metade de um número de 6
 * dígitos não é máscara.
 */
export function mascararTelefone(valor: string | null | undefined): string | null {
  const d = digitos(valor);
  if (!d) return null;
  if (d.length < 12) return "****";

  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const assinante = d.slice(4);
  const estrelasEsquerda = "*".repeat(assinante.length - 5);
  return `+${ddi} ${ddd} ${assinante[0]}${estrelasEsquerda}-**${assinante.slice(-2)}`;
}

/** O inteiro, em formato legível — só quando o pedido foi explícito. */
export function telefoneInteiro(valor: string | null | undefined): string | null {
  const d = digitos(valor);
  return d ? `+${d}` : null;
}

/**
 * A única porta por onde um telefone sai desta rota.
 *
 * Existe para que o teste de contrato tenha UM nome para exigir: se amanhã
 * alguém devolver `lead.whatsapp` cru em algum campo novo, o teste que proíbe
 * `whatsapp` fora daqui reprova.
 */
export function telefoneParaResposta(
  valor: string | null | undefined,
  completo: boolean,
): string | null {
  return completo ? telefoneInteiro(valor) : mascararTelefone(valor);
}
