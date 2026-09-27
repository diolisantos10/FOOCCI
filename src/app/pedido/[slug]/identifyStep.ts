/**
 * identifyStep — o que a Loja faz com a resposta do identify-customer.
 *
 * O identify NUNCA devolve customerId (decisão de segurança, CR C1). Duas
 * consequências que a tela tratava errado (auditoria de 27/09/2026):
 *
 *  1. Quem chegou pelo link da campanha já traz o id resolvido. A tela fazia
 *     `setCustId(json.customerId ?? null)` e APAGAVA esse id — o pedido saía
 *     sem customerId e sem o cupom da carteira (a venda não voltava para a
 *     campanha e o desconto prometido sumia).
 *  2. Cliente novo que digitou o nome recebe `{ found:false, name }`. O ramo
 *     que o levava adiante esperava um customerId que nunca vem, e a tela
 *     repetia "Digite seu nome para continuar".
 *
 * Módulo puro: sem rede, sem React.
 */

export interface RespostaIdentify {
  found?:      boolean;
  name?:       string | null;
  customerId?: string | null;
}

export type DecisaoIdentify =
  | { acao: "seguir"; custId: string | null; nome: string | null }
  | { acao: "pedirNome" };

export function decidirIdentify(
  json: RespostaIdentify,
  custIdAtual: string | null,
  nomeDigitado: string,
): DecisaoIdentify {
  // ⛔ Nunca apaga o id que a tela já tinha: o identify não o devolve.
  const custId = json.customerId ?? custIdAtual;
  const nome   = (json.name ?? "").trim() || nomeDigitado.trim();

  if (json.found) {
    return nome ? { acao: "seguir", custId, nome } : { acao: "pedirNome" };
  }
  // Cadastro novo criado com o nome informado: segue — o /finalize resolve o
  // cliente pelo telefone.
  if (json.customerId || json.name) {
    // O nome que a pessoa digitou (completo) vale mais que o primeiro nome devolvido.
    return { acao: "seguir", custId, nome: nomeDigitado.trim() || nome || null };
  }
  return { acao: "pedirNome" };
}
