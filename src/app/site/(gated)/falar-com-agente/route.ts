/**
 * /site/falar-com-agente — a porta única para o WhatsApp de vendas.
 *
 * ── Por que um DESVIO no servidor, e não o `wa.me` direto no botão ──────────
 * Se cada botão do site apontasse para `https://wa.me/...`, o endereço estaria
 * assado dentro do HTML de cada página — e ligar ou desligar o canal viraria um
 * novo build. Com o desvio, todo botão do site aponta para um caminho INTERNO e
 * estável, e a decisão de para onde ele leva é tomada **a cada clique**, no
 * servidor:
 *
 *   • canal no ar    → WhatsApp do Foocci, com a mensagem já escrita;
 *   • canal desligado → o formulário, que é a porta que de fato funciona hoje.
 *
 * Assim o dia em que a Meta terminar a verificação do número é o dia em que o
 * CEO troca UMA variável no Railway — sem deploy, sem build, sem depender de
 * alguém lembrar da armadilha do `NEXT_PUBLIC_`.
 *
 * ── O que este desvio NUNCA faz ─────────────────────────────────────────────
 * Não manda mensagem. Quem escreve primeiro é o visitante — o envio automático
 * do SDR continua desligado por outra chave, e nada aqui o liga.
 */

import { NextResponse } from "next/server";
import { canalDeVendasAtivo, linkDoWhatsAppDeVendas } from "@/lib/site/canalDeVendas";
import { DEMO_URL } from "@/components/marketing/config";

/** Decidido a cada requisição: nada de resposta guardada em cache de borda. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const destino = canalDeVendasAtivo()
    ? linkDoWhatsAppDeVendas()
    : new URL(DEMO_URL, "https://foocci.com.br").toString();

  // 307 e não 308: o destino MUDA quando o canal acende, e desvio permanente
  // fica guardado no navegador e no índice de busca. Um 308 daria a quem clicou
  // hoje um atalho eterno para o formulário, mesmo depois do WhatsApp no ar.
  return NextResponse.redirect(destino, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
