/**
 * areaDoCliente — o que a "área do cliente" pode PROMETER, dado o acesso que ela
 * realmente tem naquele instante.
 *
 * ─── O defeito que isto tranca (24/08/2026, print do CEO na loja do cliente) ──
 * No celular, já reconhecido, a faixa do topo dizia:
 *
 *     Olá, Diego 👋
 *     Meus dados, endereços e cupons                              [ Trocar ]
 *
 * A faixa ABRIA (não era link morto). Dentro dela, as três promessas:
 *
 *   1. "meus dados"     — devolvia só o que o próprio navegador já tinha na
 *                         sessão (nome e telefone digitados). Nada da conta.
 *   2. "meus endereços" — mostrava "+ Adicionar meu primeiro endereço" a quem
 *                         TEM endereços salvos. Afirmação falsa; e o botão
 *                         terminaria em 401.
 *   3. "meus cupons"    — mostrava "Você ainda não tem cupons" a quem pode ter.
 *
 * A causa não é a tela: é o portão. `/customer-profile`, `/coupons` e
 * `/customer-address` exigem PROVA de posse do telefone (o waToken assinado —
 * CR C1 / LGPD, ver `src/lib/pedido-identity.ts`). Sem prova, as rotas de
 * leitura devolvem **200 com vazio** (`{profile:null}`, `{coupons:[]}`) — e a
 * tela lia esse vazio como "não tem", que é a leitura errada. Pior: sem token o
 * cliente da conversa nem chegava a PERGUNTAR ao servidor — nenhuma requisição
 * saía.
 *
 * São duas coisas diferentes, e as duas precisavam de conserto:
 *
 *   • BUG — a prova (waToken) chegava só pela URL do link do WhatsApp e nunca
 *     era guardada, enquanto a identidade (nome, customerId) era. Logo, quem
 *     entrou pelo WhatsApp e recarregou a página continuava sendo chamado pelo
 *     nome e PERDIA a área do cliente. Conserto: guardar a prova junto da
 *     identidade, na mesma sessão do navegador.
 *
 *   • PROMESSA SEM PRODUTO — para quem só digitou o telefone no site, o produto
 *     **decidiu** não entregar endereços e cupons (e essa decisão está certa: o
 *     customerId não é credencial). Então a saída não é inventar a
 *     funcionalidade: é a faixa PARAR DE PROMETER. Vitrine é promessa; promessa
 *     sem produtor é dívida.
 *
 * Guardrail 1 do CLAUDE.md, que é o coração deste arquivo: **ausência de
 * informação não é informação**. "Não consegui perguntar" nunca pode ser
 * exibido como "você não tem".
 *
 * Módulo puro (sem React, sem DOM, sem `window`) para poder ser medido de
 * verdade pelo vitest, que neste projeto roda em `environment: "node"`.
 */

/** Rotas de `/api/pedido/[slug]/` que só respondem com prova de posse do telefone. */
export const ROTAS_COM_PROVA = ["customer-profile", "coupons", "customer-address"] as const;

/** Chave de sessão onde a prova (waToken) fica guardada, ao lado da identidade. */
export const CHAVE_PROVA = (slug: string) => `foocci-prova-${slug}`;

/**
 * O acesso da área do cliente AGORA.
 *
 * - `com-prova`: há waToken válido em mãos — dados, endereços e cupons são reais.
 * - `sem-prova`: só identidade local (nome/telefone). As rotas devolveriam vazio,
 *   e esse vazio NÃO é resposta — é recusa.
 */
export type AcessoAreaCliente = "com-prova" | "sem-prova";

export function acessoDaAreaDoCliente(token: string | null | undefined): AcessoAreaCliente {
  return typeof token === "string" && token.trim().length > 0 ? "com-prova" : "sem-prova";
}

/**
 * A frase da faixa do topo. **Só promete o que o acesso atual entrega.**
 *
 * Sem prova, a única promessa que a área cumpre é mostrar o nome e o telefone
 * que a própria pessoa acabou de informar — então é só isso que a faixa diz.
 */
export function promessaDaFaixa(acesso: AcessoAreaCliente, cupons: number): string {
  if (acesso === "sem-prova") return "Meus dados";
  if (cupons > 0) return `🎟️ ${cupons} ${cupons === 1 ? "cupom disponível" : "cupons disponíveis"}`;
  return "Meus dados, endereços e cupons";
}

/**
 * O que a área diz no lugar do vazio falso, quando não há prova. Explica o
 * motivo e aponta o caminho — em vez de afirmar uma ausência que ela não mediu.
 */
export const EXPLICACAO_SEM_PROVA =
  "Por segurança, seus endereços e cupons salvos aparecem quando você entra pelo link do WhatsApp do restaurante.";

/**
 * Palavras que afirmam AUSÊNCIA ao cliente. Nenhuma delas pode ser renderizada
 * enquanto o acesso for `sem-prova` — é aí que a tela mente. Usada pelo teste de
 * classe (`areaDoCliente.test.ts`) para varrer as telas de cliente.
 */
export const AFIRMACOES_DE_AUSENCIA = [
  "ainda não tem cupons",
  "meu primeiro endereço",
  "Nenhum endereço salvo",
] as const;
