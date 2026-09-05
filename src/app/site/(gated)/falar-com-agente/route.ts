/**
 * /site/falar-com-agente — a porta única para o atendimento comercial.
 *
 * ── Por que um DESVIO no servidor, e não o `wa.me` direto no botão ──────────
 * Se cada botão do site apontasse para `https://wa.me/...`, o endereço estaria
 * assado dentro do HTML de cada página — e mudar para onde ele leva viraria um
 * novo build. Com o desvio, todo botão aponta para um caminho INTERNO e estável,
 * e a decisão é tomada **a cada clique**, no servidor.
 *
 * ── ⚠️ TODO MUNDO PASSA PELO FORMULÁRIO. INCLUSIVE QUEM CLICOU NO WHATSAPP ──
 *
 * Este desvio tinha duas saídas: canal no ar → `wa.me` direto; canal desligado →
 * formulário. O CEO fechou a primeira em 27/08/2026:
 *
 *   *"Quando eles clicarem no botão do WhatsApp, venha um formulário de leads,
 *   e não apenas 'oi, vim pelo site'. Aí eles preenchem e entram na fila de
 *   leads pra serem atendidos."*
 *
 * O motivo é medível, e o texto que saía denunciava o problema sozinho:
 *
 *     "Olá! Quero saber mais sobre o Foocci."
 *
 * Chegava um número desconhecido. Sem nome, sem restaurante, sem cidade, sem o
 * desafio que a pessoa tem. O agente gastava as três primeiras mensagens
 * descobrindo quem estava do outro lado — **exatamente o que o formulário já
 * perguntava na tela anterior**. Duas portas, e a mais bonita entregava a pior
 * conversa.
 *
 * Pelo formulário a mesma pessoa chega assim:
 *
 *     "Oi! Sou Marina, do restaurante Sabor Caseiro, e quero conhecer o
 *      Foocci. #A3F9"
 *
 * Com ficha criada antes de a conversa começar, e o `#código` casando a
 * mensagem com ela. O agente abre o WhatsApp já sabendo com quem fala.
 *
 * ── E O QUE ACONTECE DEPOIS DO FORMULÁRIO ───────────────────────────────────
 *
 * Ele leva ao WhatsApp com a mensagem pronta — quem aperta enviar é a pessoa.
 * Isso importa: mensagem enviada PELO CLIENTE não precisa de modelo aprovado
 * pela Meta, e abre a janela em que o agente pode conversar livre. Uma primeira
 * mensagem partindo da empresa precisaria de modelo, aprovação e espera.
 *
 * ⚠️ Sobra uma fresta conhecida: quem preenche o formulário e **não aperta
 * enviar** no WhatsApp vira lead sem conversa. A ficha existe, o agente não tem
 * o que responder. Está no backlog como "resgate de quem parou no último
 * clique"; não se resolve aqui.
 *
 * ── O que este desvio NUNCA faz ─────────────────────────────────────────────
 * Não manda mensagem. Quem escreve primeiro é sempre o visitante.
 */

import { NextResponse } from "next/server";
import { linkDoWhatsAppDeVendas } from "@/lib/site/canalDeVendas";

/** Decidido a cada requisição: nada de resposta guardada em cache de borda. */
export const dynamic = "force-dynamic";

/**
 * ── 05/09/2026: O BOTÃO VERDE VOLTA A IR DIRETO PARA O WHATSAPP ────────────
 *
 * O CEO clicou no botão verde do site, caiu no formulário e mandou corrigir:
 * *"o botão do WhatsApp tem que mandar direto pro WhatsApp"*.
 *
 * Isso desfaz a decisão dele de 27/08, e o motivo daquela decisão fica escrito
 * porque continua verdadeiro: pelo formulário o agente recebe nome, restaurante,
 * cidade e o desafio; pelo WhatsApp direto chega um número desconhecido e o
 * agente gasta as três primeiras mensagens descobrindo com quem fala.
 *
 * ── POR QUE MUDOU, E POR QUE NÃO É CONTRADIÇÃO ─────────────────────────────
 *
 * Porque agora existem DUAS portas, e em 27/08 existia uma. No mesmo dia o topo
 * ganhou "Fale com nossos consultores", que leva ao formulário. O botão verde
 * passa a ser a porta de quem quer falar AGORA — e essa pessoa, obrigada a
 * preencher formulário, desiste.
 *
 * Quem quer ser ATENDIDO escreve; quem quer ser ENTENDIDO preenche. Ter as duas
 * é o que faltava.
 */
export async function GET(): Promise<NextResponse> {
  const destino = linkDoWhatsAppDeVendas();

  // 307 e não 308: o destino pode voltar a mudar — um desvio permanente fica
  // guardado no navegador e no índice de busca, e daria a quem clicou hoje um
  // atalho eterno para uma decisão que não é eterna.
  return NextResponse.redirect(destino, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
