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

import { NextRequest, NextResponse } from "next/server";
import { DEMO_URL } from "@/components/marketing/config";

/** Decidido a cada requisição: nada de resposta guardada em cache de borda. */
export const dynamic = "force-dynamic";

/**
 * ── A MARCAÇÃO DE CAMPANHA ATRAVESSA O DESVIO (05/09/2026) ──────────────────
 *
 * Esta rota não recebia a requisição — a assinatura era `GET()`, sem parâmetro.
 * O efeito era silencioso e caro: **toda marcação de campanha morria no primeiro
 * salto**. Um convite mandado com `?utm_source=sdr` chegava ao formulário sem
 * nada, o lead nascia sem origem, e a pergunta *"quantos vieram da abordagem?"*
 * ficava sem resposta possível.
 *
 * Não é defeito de quem escreveu: a rota nasceu como desvio fixo, e marcação de
 * campanha não existia ainda. Vira defeito no dia em que alguém manda 600
 * convites e não consegue medir um.
 *
 * ── POR QUE SÓ OS PARÂMETROS DE CAMPANHA, E NÃO A QUERY INTEIRA ─────────────
 *
 * Repassar tudo faria desta porta um redirecionador aberto de parâmetros: quem
 * montasse o endereço escolheria o que chega na próxima página. A lista fechada
 * abaixo é o oposto de um `?` livre — o que não está nela não passa, e isso não
 * quebra nada, porque o formulário só lê estes.
 */
const MARCACOES_DE_CAMPANHA = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  // Identificador de clique de anúncio, quando houver.
  "gclid",
  "fbclid",
] as const;

/**
 * ⚠️ `req` É OPCIONAL DE PROPÓSITO, e não por desleixo de tipo.
 *
 * O Next sempre passa a requisição em produção. Mas esta rota já era chamada
 * como `GET()` — sem argumento — por testes que existiam antes desta mudança, e
 * exigir o parâmetro os quebrou na primeira execução da CI.
 *
 * Podia-se ter reescrito aqueles testes. Não é o certo: eles descrevem o
 * contrato de quem chamava, e mudar o contrato dos outros para acomodar uma
 * adição minha é a forma cara de resolver. Sem requisição, a porta se comporta
 * exatamente como antes — leva ao formulário, sem marcação.
 */
export async function GET(req?: NextRequest): Promise<NextResponse> {
  const alvo = new URL(DEMO_URL, "https://foocci.com.br");

  for (const chave of MARCACOES_DE_CAMPANHA) {
    const valor = req?.nextUrl?.searchParams?.get(chave) ?? null;
    // Vazio não é marcação: `?utm_source=` sujaria o endereço e gravaria uma
    // origem em branco, que depois seria lida como "veio de algum lugar".
    if (valor && valor.trim() !== "") {
      alvo.searchParams.set(chave, valor.trim().slice(0, 120));
    }
  }

  const destino = alvo.toString();

  // 307 e não 308: o destino pode voltar a mudar — um desvio permanente fica
  // guardado no navegador e no índice de busca, e daria a quem clicou hoje um
  // atalho eterno para uma decisão que não é eterna.
  return NextResponse.redirect(destino, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
