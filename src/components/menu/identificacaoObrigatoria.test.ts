/**
 * Trava da regra do CEO (04/08): a identificação por telefone é OBRIGATÓRIA na
 * Loja e no chat com IA, e PULÁVEL apenas no QR da mesa.
 *
 * Por que um teste que lê o código-fonte, e não a tela: o vitest deste projeto
 * roda em `environment: "node"`, sem DOM nem testing-library — não há como
 * montar o componente. E a alternativa (deixar a regra só escrita no perfil do
 * agente ou num comentário) já falhou aqui antes: guardrail 4 do CLAUDE.md diz
 * que prompt é aviso e código é trava. Então a trava possível é esta: se alguém
 * remover o `required` da Loja, religar o "pular", ou fazer o portão da Loja
 * voltar a consultar a marca compartilhada com a mesa, o teste reprova e diz o
 * porquê.
 *
 * É deliberadamente literal. Se o código for reescrito de uma forma que quebre
 * estes casamentos SEM quebrar a regra, atualize o teste junto — mas leia o
 * motivo antes de afrouxar.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");

const LOJA = "src/app/pedido/[slug]/LojaClient.tsx";
const MESA = "src/app/qr/[slug]/QRMenuClient.tsx";
const CHAT = "src/app/pedido/[slug]/PedidoClient.tsx";
const MODAL = "src/components/menu/WelcomeModal.tsx";

/** Extrai o trecho `<WelcomeModal ... />` de um arquivo. */
function usoDoWelcomeModal(fonte: string): string {
  const m = fonte.match(/<WelcomeModal[\s\S]*?\/>/);
  if (!m) throw new Error("Nenhum uso de <WelcomeModal /> encontrado no arquivo.");
  return m[0];
}

describe("identificação por telefone — obrigatoriedade por superfície", () => {
  it("Loja: exige identificação (passa `required` ao WelcomeModal)", () => {
    const uso = usoDoWelcomeModal(ler(LOJA));
    expect(
      /\brequired\b/.test(uso),
      "A Loja precisa abrir o WelcomeModal com `required`. Sem isso volta a " +
        "aparecer o 'Pular identificação' e o cliente compra anônimo — o que " +
        "quebra cupom, histórico e a atribuição de receita do CRM.",
    ).toBe(true);
  });

  it("Loja: o portão NÃO consulta a marca compartilhada com a mesa", () => {
    const fonte = ler(LOJA);
    // A marca `qr-welcome-seen-<slug>` é gravada também pelo QR da mesa, onde
    // pular é permitido. Se a Loja voltar a LER essa marca para decidir se
    // abre o modal, quem pulou no salão entra na Loja sem se identificar — e a
    // obrigatoriedade vira decorativa.
    expect(
      /getItem\(\s*`qr-welcome-seen/.test(fonte),
      "A Loja não pode LER `qr-welcome-seen-<slug>` para decidir se pede " +
        "identificação: essa marca é compartilhada com o QR da mesa, onde " +
        "pular é permitido. O portão da Loja deve olhar só para identidade " +
        "real (waToken ou `foocci-customer-<slug>`).",
    ).toBe(false);
  });

  it("Mesa: continua pulável (NÃO passa `required`)", () => {
    const uso = usoDoWelcomeModal(ler(MESA));
    expect(
      /\brequired\b/.test(uso),
      "O QR da mesa deve continuar pulável: quem já está sentado no salão não " +
        "pode ser barrado para ver o cardápio. Decisão do CEO em 04/08.",
    ).toBe(false);
  });

  it("Chat com IA: a entrada por telefone não oferece saída (sem `onSkip`)", () => {
    const fonte = ler(CHAT);
    const uso = fonte.match(/<PhoneEntryCard[\s\S]*?\/>/);
    expect(uso, "Nenhum uso de <PhoneEntryCard /> encontrado no chat.").not.toBeNull();
    expect(
      /\bonSkip\b/.test(uso![0]),
      "O chat com IA não pode passar `onSkip` ao PhoneEntryCard — a tela de " +
        "telefone é obrigatória ali, e é o espelho que a Loja segue.",
    ).toBe(false);
  });

  it("WelcomeModal: o 'Pular identificação' só existe quando NÃO é obrigatório", () => {
    const fonte = ler(MODAL);
    // O botão de pular precisa estar dentro de um ramo condicionado a
    // `required` — se ele voltar a ser incondicional, as duas superfícies
    // obrigatórias passam a oferecer saída sem ninguém perceber.
    //
    // Casa com `{required ?` (com a chave do JSX) de propósito: sem a chave, a
    // própria declaração da prop (`required?: boolean`) satisfaria o teste e
    // ele passaria a aprovar qualquer coisa. Usa a ÚLTIMA ocorrência do texto
    // porque o rótulo também aparece no comentário que documenta a prop.
    const trecho = fonte.slice(0, fonte.lastIndexOf("Pular identificação"));
    expect(
      /\{\s*required\s*\?/.test(trecho),
      "O botão 'Pular identificação' precisa estar sob a condicional de " +
        "`required`. Incondicional, ele fura a obrigatoriedade da Loja e do chat.",
    ).toBe(true);
  });
});
