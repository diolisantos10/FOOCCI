/**
 * O TOPO DO SITE: DOIS BOTÕES, E O DE ASSINAR PRECISA ASSINAR DE VERDADE.
 *
 * Ordem do CEO (24/08/2026): *"O botão laranja lá em cima (…) tem que ser banido
 * do site. No lugar disso, colocar pro cliente já assinar. (…) E o contato com
 * dúvida (…) é WhatsApp."*
 *
 * Contra o código anterior estes testes reprovam: o cabeçalho carregava o CTA de
 * conversa (`chamada.href`/`chamada.label`) e não existia `ASSINAR_URL`.
 *
 * O teste que mais importa aqui é o do DESTINO. "Assinar" caindo num formulário
 * de contato seria exatamente a doença que acabamos de arrancar do site — texto
 * prometendo o que o destino não entrega —, só que com a palavra mais séria que
 * um site pode usar. Por isso ele não confere só o link: confere que a página do
 * outro lado monta o checkout que cobra.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ASSINAR_URL, ASSINAR_CTA_LABEL } from "../config";

const RAIZ = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

const HEADER = "src/components/marketing/MarketingHeader.tsx";

describe("o cabeçalho tem dois botões, e são estes", () => {
  it("Entrar e Assinar — os dois presentes", () => {
    const codigo = semComentarios(ler(HEADER));
    expect(codigo).toContain("LOGIN_URL");
    expect(codigo).toContain("ASSINAR_URL");
    expect(codigo).toContain("ASSINAR_CTA_LABEL");
  });

  it("a conversa com o agente SAIU do topo", () => {
    const codigo = semComentarios(ler(HEADER));
    expect(codigo).not.toContain("AGENTE_URL");
    expect(codigo).not.toContain("chamada.href");
    expect(codigo).not.toContain("DEMO_URL");
  });

  it("nenhum convite de conversa escrito à mão volta para o topo", () => {
    const codigo = semComentarios(ler(HEADER));
    for (const proibido of [/fale com/i, /especialista/i, /demonstra/i, /consultor/i, /agende/i]) {
      expect(codigo, `voltou "${proibido}" para o topo`).not.toMatch(proibido);
    }
  });

  it("o rótulo é uma palavra de compromisso, não de conversa", () => {
    expect(ASSINAR_CTA_LABEL).toBe("Assinar");
  });
});

describe("o destino de 'Assinar' assina de verdade", () => {
  const arquivoDaPagina = path.join(RAIZ, "src/app", `${ASSINAR_URL}/page.tsx`);

  it("a página existe", () => {
    expect(fs.existsSync(arquivoDaPagina), `${ASSINAR_URL} não existe como página`).toBe(true);
  });

  it("monta o CHECKOUT, não um formulário de contato", () => {
    const fonte = fs.readFileSync(arquivoDaPagina, "utf8");
    expect(fonte).toContain("<CheckoutClient");
    expect(fonte).not.toContain("<DemoForm");
  });

  it("o checkout chama a rota que cobra de verdade", () => {
    const cliente = ler("src/app/contratar/novo/CheckoutClient.tsx");
    expect(cliente).toContain('"/api/billing/checkout"');
  });

  it("o preço vem da fonte única do servidor — a página não inventa cifra", () => {
    const fonte = fs.readFileSync(arquivoDaPagina, "utf8");
    expect(fonte).toContain("@/lib/billing/pricing");
    // nenhum valor em reais escrito à mão na página do checkout
    expect(semComentarios(fonte)).not.toMatch(/R\$\s?\d/);
  });

  it("e o aceite do Termo acontece antes do pagamento", () => {
    const rota = ler("src/app/api/billing/checkout/route.ts");
    expect(rota).toContain("aceiteTermos");
    expect(rota).toContain("recordAcceptance");
  });
});

describe("quem tem dúvida não fica sem porta", () => {
  it("a barra fixa do celular carrega o mesmo convite do topo", () => {
    const sticky = semComentarios(ler("src/components/marketing/StickyMobileCta.tsx"));
    expect(sticky).toContain("ASSINAR_URL");
  });

  it("o botão do agente aparece TAMBÉM no celular — a dúvida não pode ficar sem saída", () => {
    const botao = ler("src/components/marketing/BotaoAgenteFlutuante.tsx");
    // lê a constante, não escreve o caminho à mão — mesma regra do resto do site
    expect(botao).toContain("AGENTE_URL");
    // era `hidden … lg:inline-flex` (só desktop); agora existe em toda tela
    expect(botao).not.toMatch(/className="group fixed[^"]*\bhidden\b/);
  });
});
