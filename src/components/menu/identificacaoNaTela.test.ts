/**
 * O cartão de identificação não pode aparecer com o cabeçalho cortado.
 *
 * ─── O defeito que isto tranca (05/08, print do CEO na padaria de vitrine) ────
 * Loja FECHADA, celular: a pessoa via um campo de telefone e um botão, sem o
 * título nem a frase que dizem POR QUE o telefone está sendo pedido. Não era
 * sobreposição de camada nem altura calculada errada — era ROLAGEM:
 *
 *  1. no chat, o cartão mora dentro do rolador de mensagens e um efeito rolava
 *     esse rolador até o FIM a cada render. Conteúdo maior que a área visível =
 *     o que sai de cena é o topo, e o topo é o cabeçalho do cartão. A tarja de
 *     "estamos fechados" come 134px do chat a 375px, o que sobe o limiar da
 *     falha de ~314px para ~448px de janela — qualquer celular com o teclado
 *     aberto (medido: área do chat em 85px, corte de 58,8px);
 *  2. na Loja sem IA, o mesmo cartão é um modal centralizado por `items-end` /
 *     `items-center`. Quando o painel é mais alto que a janela, o excedente sai
 *     pelo TOPO e não há rolagem nenhuma para alcançá-lo (medido a 375×283: topo
 *     em -93px, levando junto o "×" que é a saída da vitrine).
 *
 * Os dois consertos são de uma linha cada e por isso mesmo somem fácil numa
 * refatoração. Guardrail 4 do CLAUDE.md: prompt é aviso, código é trava.
 *
 * Teste de código-fonte porque o vitest deste projeto roda em `environment:
 * "node"`, sem DOM — a mesma escolha (e o mesmo motivo) de
 * `identificacaoObrigatoria.test.ts`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");

const CHAT  = "src/app/pedido/[slug]/PedidoClient.tsx";
const MODAL = "src/components/menu/WelcomeModal.tsx";

describe("cartão de identificação — o cabeçalho não pode ser cortado", () => {
  it("Chat: a rolagem automática não vai para o fim enquanto a identificação está aberta", () => {
    const fonte = ler(CHAT);
    expect(
      /if \(entryPhase !== "browsing"\) \{[\s\S]{0,200}identificacaoRef\.current\?\.scrollIntoView\(\{ block: "start" \}\)/.test(fonte),
      'O efeito de auto-scroll precisa desviar quando `entryPhase !== "browsing"` e ' +
        "ancorar o TOPO do bloco de identificação. Voltar a rolar sempre para o fim " +
        "encosta o rodapé do cartão na base e joga o título — e a frase que explica " +
        "o pedido de telefone — para fora da tela.",
    ).toBe(true);
    expect(
      /useEffect\(\(\) => \{[\s\S]{0,400}bottomRef\.current\?\.scrollIntoView[\s\S]{0,80}\}, \[messages, ui, entryPhase\]\)/.test(fonte),
      "`entryPhase` precisa estar nas dependências do efeito: sem ela, a âncora " +
        "não muda quando a pessoa sai da identificação e entra na conversa.",
    ).toBe(true);
    expect(
      /<div ref=\{identificacaoRef\} className="scroll-mt-\d+ space-y-3">/.test(fonte),
      "Convite e cartão precisam viver no MESMO bloco marcado por " +
        "`identificacaoRef`, com margem de rolagem. A margem é o que deixa à " +
        "mostra o balão anterior quando o telefone é pedido de novo no fechamento.",
    ).toBe(true);
  });

  it("Modal: o topo do painel é sempre alcançável", () => {
    const fonte = ler(MODAL);
    const overlay = fonte.match(/className="fixed inset-0 z-50[^"]*"/)?.[0] ?? "";
    expect(
      /overflow-y-auto/.test(overlay),
      "O fundo do modal precisa de `overflow-y-auto`. Com `items-end`/" +
        "`items-center` e painel mais alto que a janela, o excedente sai pelo topo " +
        "e não há gesto que alcance — sumiram o título, o motivo e o próprio '×'.",
    ).toBe(true);
    const painel = fonte.match(/className="relative[^"]*rounded-t-3xl[^"]*"/)?.[0] ?? "";
    expect(
      /max-h-full/.test(painel) && /overflow-y-auto/.test(painel),
      "O painel precisa de `max-h-full` + `overflow-y-auto`: assim ele nunca " +
        "ultrapassa a janela e o conteúdo rola por dentro, com o topo no lugar.",
    ).toBe(true);
  });

  it("Os dois cartões: botão habilitado, com a validação no toque", () => {
    // Vitrine de 05/08: "botão desabilitado é uma resposta que ninguém consegue
    // ouvir" — no celular não há hover nem foco para insinuar o motivo. O
    // `disabled` só vale enquanto a requisição está em curso.
    for (const arquivo of [CHAT, MODAL]) {
      const fonte = ler(arquivo);
      expect(
        /disabled=\{\s*!\s*(phoneInput|nameInput)\.trim\(\)/.test(fonte),
        `${arquivo}: o botão não pode nascer desabilitado por campo vazio. ` +
          "Quem toca precisa receber uma resposta — a mensagem no campo e o foco " +
          "no pendente —, não um botão morto.",
      ).toBe(false);
      expect(
        /setError\("Informe um WhatsApp válido\."\);\s*campoRef\.current\?\.focus\(\)/.test(fonte),
        `${arquivo}: a validação do toque precisa devolver o foco ao campo ` +
          "pendente, senão a mensagem pode nascer fora da área visível.",
      ).toBe(true);
    }
  });
});
