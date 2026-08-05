/**
 * Trava da regra do CEO (04/08): a identificação por telefone é OBRIGATÓRIA na
 * Loja e no chat com IA, e PULÁVEL apenas no QR da mesa.
 *
 * ─── EMENDA DE 05/08: a vitrine ─────────────────────────────────────────────
 * A regra ganhou UMA exceção, e ela é estreita de propósito: o restaurante de
 * DEMONSTRAÇÃO (`Restaurant.isDemo`). `/site/experimente` promete "sem cadastro"
 * e jogava o visitante num painel de telefone sem saída — nem ×, nem Esc, nem
 * clique fora. Em loja de cliente de verdade nada mudou.
 *
 * O que estes testes protegem agora é a FORMA da exceção, não só a existência
 * dela: quem decide é o servidor, pela coluna, e o cliente só obedece à prop.
 * Um `required={false}` literal em `LojaClient`, ou um `onSkip` incondicional no
 * chat, reprovam aqui — porque seriam a exceção vazando para todo lojista.
 *
 * Por que um teste que lê o código-fonte, e não a tela: o vitest deste projeto
 * roda em `environment: "node"`, sem DOM nem testing-library — não há como
 * montar o componente. E a alternativa (deixar a regra só escrita no perfil do
 * agente ou num comentário) já falhou aqui antes: guardrail 4 do CLAUDE.md diz
 * que prompt é aviso e código é trava.
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
const PAGINA = "src/app/pedido/[slug]/page.tsx";

/** Extrai o trecho `<WelcomeModal ... />` de um arquivo. */
function usoDoWelcomeModal(fonte: string): string {
  const m = fonte.match(/<WelcomeModal[\s\S]*?\/>/);
  if (!m) throw new Error("Nenhum uso de <WelcomeModal /> encontrado no arquivo.");
  return m[0];
}

describe("identificação por telefone — obrigatoriedade por superfície", () => {
  it("Loja: exige identificação, e a única folga vem da prop do servidor", () => {
    const uso = usoDoWelcomeModal(ler(LOJA));
    expect(
      /\brequired\b/.test(uso),
      "A Loja precisa abrir o WelcomeModal com `required`. Sem isso volta a " +
        "aparecer o 'Pular identificação' e o cliente compra anônimo — o que " +
        "quebra cupom, histórico e a atribuição de receita do CRM.",
    ).toBe(true);
    // `required={!identificacaoOpcional}` é a ÚNICA forma aceita: a folga tem de
    // vir do servidor. `required={false}` desligaria a regra para todo lojista.
    expect(
      /required=\{\s*!\s*identificacaoOpcional\s*\}/.test(uso),
      "O `required` da Loja só pode ser o inverso da prop `identificacaoOpcional` " +
        "(que o servidor calcula de `Restaurant.isDemo`). Literal `false` aqui " +
        "abriria a loja de TODO cliente.",
    ).toBe(true);
  });

  it("Loja: a prop de folga nasce fechada (`identificacaoOpcional = false`)", () => {
    const fonte = ler(LOJA);
    expect(
      /identificacaoOpcional\s*=\s*false/.test(fonte),
      "A prop `identificacaoOpcional` precisa ter `false` como padrão. Prop " +
        "esquecida por um chamador não pode virar loja anônima (guardrail 1).",
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

  it("Chat com IA: a saída do telefone é condicionada, nunca incondicional", () => {
    const fonte = ler(CHAT);
    const uso = fonte.match(/<PhoneEntryCard[\s\S]*?\/>/);
    expect(uso, "Nenhum uso de <PhoneEntryCard /> encontrado no chat.").not.toBeNull();
    expect(
      /onSkip=\{\s*podePularIdentificacao\s*\?/.test(uso![0]),
      "O `onSkip` do chat só pode existir sob `podePularIdentificacao` — que " +
        "é `identificacaoOpcional && !identidadeExigida`. Um `onSkip` fixo " +
        "devolveria a saída para a loja de todo cliente.",
    ).toBe(true);
    expect(
      /const podePularIdentificacao\s*=\s*identificacaoOpcional\s*&&\s*!identidadeExigida/.test(fonte),
      "`podePularIdentificacao` precisa ser `identificacaoOpcional && " +
        "!identidadeExigida`: a folga é da vitrine E só vale antes de o telefone " +
        "virar condição para fechar o pedido.",
    ).toBe(true);
    expect(
      /identificacaoOpcional\s*=\s*false/.test(fonte),
      "A prop `identificacaoOpcional` do chat precisa ter `false` como padrão.",
    ).toBe(true);
  });

  it("Chat com IA: quem pulou volta a ser identificado ANTES de fechar o pedido", () => {
    const fonte = ler(CHAT);
    // Pular não pode virar pedido órfão: no `handleFinalizeClick` o telefone
    // volta a ser exigido, e a exigência é marcada para a tela não oferecer o
    // "Pular" de novo (laço).
    expect(
      /setIdentidadeExigida\(true\);[\s\S]{0,120}setEntryPhase\("identifying"\)/.test(fonte),
      "Ao finalizar sem identidade, o chat precisa marcar `identidadeExigida` e " +
        "voltar para `identifying`. Sem isso, quem pulou fecharia pedido sem " +
        "contato nenhum.",
    ).toBe(true);
  });

  it("Servidor: a folga vem de `isDemo`, e o cliente não decide nada", () => {
    const fonte = ler(PAGINA);
    expect(
      /identificacaoPodeSerPulada\(restaurant\)/.test(fonte),
      "A página precisa calcular a folga com `identificacaoPodeSerPulada(restaurant)`. " +
        "Qualquer outra origem (slug, query, env) tira a decisão da coluna do banco.",
    ).toBe(true);
    expect(
      /isDemo:\s*true/.test(fonte),
      "`isDemo` precisa estar no SELECT do restaurante — sem ele o campo chega " +
        "`undefined` e a trava, que é de falha fechada, nunca liberaria a vitrine.",
    ).toBe(true);
    // Os dois clientes recebem a MESMA prop calculada — nunca um literal.
    const usos = fonte.match(/identificacaoOpcional=\{identificacaoOpcional\}/g) ?? [];
    expect(
      usos.length,
      "Os dois clientes (chat e Loja) precisam receber `identificacaoOpcional` " +
        "calculado no servidor. Literal na prop é a exceção vazando.",
    ).toBe(2);
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

  it("WelcomeModal: Esc e clique fora fecham SÓ onde há saída", () => {
    const fonte = ler(MODAL);
    expect(
      /const dispensavel = !required/.test(fonte),
      "As três saídas (×, Esc, clique fora) precisam sair de uma variável só " +
        "(`dispensavel = !required`) — três condições separadas divergem.",
    ).toBe(true);
    expect(
      /if \(!dispensavel\) return;[\s\S]{0,400}"Escape"/.test(fonte),
      "O ouvinte de Esc precisa desistir quando o modal é obrigatório. Esc " +
        "fechando a identificação da Loja de um cliente libera compra anônima.",
    ).toBe(true);
    expect(
      /onClick=\{dispensavel && !loading \? \(\) => onClose\(null\) : undefined\}/.test(fonte),
      "O clique no fundo só pode fechar quando o modal é dispensável e não há " +
        "envio em curso — sumir com a tela no meio da verificação deixa a " +
        "pessoa sem saber se o telefone foi registrado.",
    ).toBe(true);
  });
});
