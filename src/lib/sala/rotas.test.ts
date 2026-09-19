/**
 * A SALA MUDOU DE ENDEREÇO — e nada pode ter ficado para trás.
 *
 * ── O QUE ESTE ARQUIVO GUARDA ───────────────────────────────────────────────
 *
 * Em 26/08/2026 a Sala saiu de `/admin/sala-de-vendas` para `/comercial`, por
 * decisão do CEO: quem atende cliente não trabalha dentro do painel de
 * administração da empresa.
 *
 * Mudança de endereço é o tipo de trabalho que o compilador não protege. Um
 * `href` esquecido não quebra o build — vira um botão que leva a lugar nenhum,
 * descoberto por um vendedor no meio de uma conversa com cliente. Daí estes
 * casos, que valem por três coisas:
 *
 *   1. **o endereço velho continua chegando**, inclusive nas duas telas que
 *      mudaram de nome no caminho;
 *   2. **ninguém digitou caminho à mão** em outro arquivo;
 *   3. **as abas continuam fechando por papel** — a mudança de casa não podia
 *      abrir portas que estavam fechadas.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  COMERCIAL,
  ENTRADA,
  ROTAS,
  BASE_ANTIGA,
  destinoDoEnderecoAntigo,
  abasDoComercial,
  menuDoComercial,
  grupoDoCaminho,
  GRUPOS,
} from "./rotas";

describe("o endereço antigo continua chegando", () => {
  it("a raiz cai na raiz nova", () => {
    expect(destinoDoEnderecoAntigo(BASE_ANTIGA)).toBe(COMERCIAL);
    expect(destinoDoEnderecoAntigo(`${BASE_ANTIGA}/`)).toBe(COMERCIAL);
  });

  it("⭐ as duas telas que mudaram de NOME também chegam", () => {
    // O caso que carrega o arquivo. Um redireciono que só trocasse o prefixo
    // mandaria `/admin/sala-de-vendas/atendimento` para `/comercial/atendimento`,
    // que não existe — e o 404 cairia justamente em cima da tela de trabalho do
    // dia do vendedor.
    expect(destinoDoEnderecoAntigo(`${BASE_ANTIGA}/atendimento`)).toBe(ROTAS.conversas);
    expect(destinoDoEnderecoAntigo(`${BASE_ANTIGA}/canal`)).toBe(ROTAS.whatsapp);
  });

  it("as que não mudaram de nome passam direto", () => {
    for (const [chave, destino] of [
      ["funil", ROTAS.funil],
      ["painel", ROTAS.painel],
      ["precos", ROTAS.precos],
      ["agentes", ROTAS.agentes],
      ["ensaio", ROTAS.ensaio],
      ["acessos", ROTAS.acessos],
    ] as const) {
      expect(destinoDoEnderecoAntigo(`${BASE_ANTIGA}/${chave}`), chave).toBe(destino);
    }
  });

  it("um caminho mais fundo preserva a cauda", () => {
    // Links de conversa levam o id do lead junto. Perder a cauda mandaria a
    // pessoa para a lista em vez da conversa que ela clicou.
    expect(destinoDoEnderecoAntigo(`${BASE_ANTIGA}/atendimento/lead-123`))
      .toBe(`${ROTAS.conversas}/lead-123`);
  });
});

describe("ninguém digitou o endereço à mão em outro lugar", () => {
  // A trava estrutural. Uma asserção de comportamento provaria que os endereços
  // de HOJE estão certos; ler o código-fonte prova que o caminho para errar
  // amanhã não existe — endereço vem daqui, e de lugar nenhum além.
  const RAIZ = path.resolve(__dirname, "../..");

  /**
   * Varredura recursiva com `readdirSync`, e não `fs.globSync`.
   *
   * ⚠️ `globSync` existe no Node da máquina de desenvolvimento e NÃO existe no
   * Node do CI — o teste passou aqui e reprovou lá com "globSync is not a
   * function". É o mesmo molde que `services/brain/architecture.test.ts` já
   * usava; usar duas técnicas para a mesma varredura era a diferença entre
   * verde local e vermelho no runner.
   */
  function listar(dir: string, acc: string[] = []): string[] {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules") continue;
        listar(completo, acc);
      } else if (/\.(ts|tsx)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
        acc.push(path.relative(RAIZ, completo).split(path.sep).join("/"));
      }
    }
    return acc;
  }

  function fontesDoProduto(): string[] {
    return listar(RAIZ)
      // Este módulo é a fonte, e o redireciono existe justamente para citar o
      // endereço velho. Os dois são o lugar certo de a string aparecer.
      .filter((f) => !f.endsWith("lib/sala/rotas.ts"))
      .filter((f) => !f.includes("sala-de-vendas/[[...resto]]"));
  }

  it("nenhuma tela do produto ainda aponta para /admin/sala-de-vendas", () => {
    const culpados = fontesDoProduto().filter((f) =>
      readFileSync(path.join(RAIZ, f), "utf8").includes('"/admin/sala-de-vendas'),
    );

    expect(culpados, `endereço antigo digitado à mão em: ${culpados.join(", ")}`).toEqual([]);
  });
});

describe("as abas continuam fechando por papel", () => {
  const rotulos = (papel: Parameters<typeof abasDoComercial>[0]) =>
    abasDoComercial(papel).map((a) => a.rotulo);

  it("⭐ o vendedor NÃO ganhou aba nova na mudança de casa", () => {
    // Mudar de endereço não podia ser a ocasião em que alguém passou a enxergar
    // o painel da operação, o canal da Meta ou a criação de acesso. Agrupar o
    // menu, em 18/09/2026, também não.
    const dele = rotulos("AGENTE_HUMANO");
    expect(dele).not.toContain("Painel");
    expect(dele).not.toContain("WhatsApp");
    expect(dele).not.toContain("Criar acesso");
  });

  it("⭐ o SDR humano também não ganha a aba da Supervisora", () => {
    // A Supervisora compara o desempenho dos agentes entre si — a mesma razão
    // de negócio por que o Painel é fechado para o SDR.
    expect(rotulos("AGENTE_HUMANO")).not.toContain("Supervisora");
    for (const papel of ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AUDITOR_QA"] as const) {
      expect(rotulos(papel), papel).toContain("Supervisora");
    }
  });

  it("mas ele continua alcançando o trabalho do dia", () => {
    // A metade que passa. Sem ela, uma lista que escondesse TUDO de todos
    // passaria no caso acima e deixaria o vendedor sem tela nenhuma.
    const dele = rotulos("AGENTE_HUMANO");
    expect(dele).toContain("Filas");
    expect(dele).toContain("Conversas");
    expect(dele).toContain("Funil");
  });

  it("criar acesso é só do dono", () => {
    expect(rotulos("MASTER_CEO")).toContain("Criar acesso");
    expect(rotulos("DIRETOR_FOOCCI")).toContain("Criar acesso");
    expect(rotulos("GERENTE_DEPARTAMENTO")).not.toContain("Criar acesso");
    expect(rotulos("AUDITOR_QA")).not.toContain("Criar acesso");
  });

  it("quem entra pela senha da casa vê tudo — ela não carrega papel", () => {
    expect(rotulos(null)).toContain("Criar acesso");
    expect(rotulos(null)).toContain("Painel");
  });

  it("toda aba pende de /comercial, e a entrada também", () => {
    for (const a of abasDoComercial(null)) {
      expect(a.href.startsWith(COMERCIAL), a.href).toBe(true);
    }
    expect(ENTRADA.startsWith(COMERCIAL)).toBe(true);
  });
});

/**
 * ── 24 ITENS DE MENU VIRARAM 10 (18/09/2026) ────────────────────────────────
 *
 * O CEO: *"não é MAIS coisas que a gente precisa, é um UPGRADE"*. O risco de um
 * agrupamento não é ele ficar feio — é ele **perder tela** no caminho, ou abrir
 * para o vendedor uma porta de gestão porque agora ela mora dentro de um grupo
 * que ele alcança. Estes casos existem para pegar as duas coisas.
 */
describe("⭐ agrupar o menu não perdeu endereço nem abriu porta", () => {
  /** Tudo que existia no menu antes do agrupamento, endereço a endereço. */
  const ANTES: readonly string[] = [
    ROTAS.filas, ROTAS.conversas, ROTAS.carteira, ROTAS.funil, ROTAS.meus,
    ROTAS.agentes, ROTAS.precos, ROTAS.ensaio, ROTAS.painel, ROTAS.agente,
    ROTAS.whatsapp, ROTAS.supervisora, ROTAS.prospeccao, ROTAS.baseFria,
    ROTAS.importacoes, ROTAS.torre, ROTAS.atendimento, ROTAS.sdr,
    ROTAS.qualificacao, ROTAS.roteamento, ROTAS.oferta, ROTAS.crm,
    ROTAS.relacionamento, ROTAS.acessos,
    /* 19/09/2026 — a 25ª. NÃO é uma tela "aproveitando a faxina": é a porta de
     * entrada manual que não existia, e cuja ausência deixou um lead pago 20
     * horas fora do sistema. Ela entra aqui para que a contagem continue sendo
     * uma DECISÃO escrita, e não um número que cresce sozinho. */
    ROTAS.cadastro,
  ];

  it("⛔ nenhum dos endereços do menu sumiu", () => {
    const hoje = new Set(GRUPOS.flatMap((g) => g.abas.map((a) => a.href)));
    const sumidos = ANTES.filter((h) => !hoje.has(h));
    expect(sumidos, `endereço que deixou de ser alcançável: ${sumidos.join(", ")}`).toEqual([]);
    // E o contrário: ninguém aproveitou a faxina para enfiar tela nova.
    expect(hoje.size).toBe(ANTES.length);
  });

  it("o menu tem os 10 itens do desenho do CEO, na ordem dele", () => {
    expect(GRUPOS.map((g) => g.rotulo)).toEqual([
      "Painel", "Prospecção", "SDR", "Atendimento", "Leads",
      "Vendas", "CRM", "Automações", "Relatórios", "Configurações",
    ]);
  });

  it("⭐ papel a papel, o que se alcança é EXATAMENTE o que se alcançava", () => {
    // A régua de cada aba é a mesma que o item tinha quando era linha de menu.
    // Este caso escreve essa expectativa à mão, papel a papel, em vez de
    // derivá-la do próprio código — derivar provaria só que o código é igual a
    // si mesmo.
    const gestao = [
      ROTAS.painel, ROTAS.torre, ROTAS.atendimento, ROTAS.roteamento,
      ROTAS.agente, ROTAS.supervisora, ROTAS.whatsapp,
    ];
    const deTodos = ANTES.filter((h) => !gestao.includes(h) && h !== ROTAS.acessos);

    const ve = (papel: Parameters<typeof abasDoComercial>[0]) =>
      new Set(abasDoComercial(papel).map((a) => a.href));

    const vendedor = ve("AGENTE_HUMANO");
    for (const h of deTodos) expect(vendedor.has(h), `vendedor perdeu ${h}`).toBe(true);
    for (const h of [...gestao, ROTAS.acessos]) {
      expect(vendedor.has(h), `vendedor GANHOU ${h}`).toBe(false);
    }

    const gerente = ve("GERENTE_DEPARTAMENTO");
    for (const h of [...deTodos, ...gestao]) expect(gerente.has(h), h).toBe(true);
    expect(gerente.has(ROTAS.acessos)).toBe(false);

    const dono = ve("MASTER_CEO");
    for (const h of ANTES) expect(dono.has(h), `o dono perdeu ${h}`).toBe(true);

    // O papel que não faz login continua sem menu nenhum.
    expect(abasDoComercial("AGENTE_IA")).toEqual([]);
    expect(menuDoComercial("AGENTE_IA")).toEqual([]);
  });

  it("⛔ o item do menu leva a uma tela que ESTA pessoa abre", () => {
    // O defeito que este caso existe para impedir: "Atendimento" apontando para
    // a central de gestão faria o vendedor bater num 403 no primeiro clique.
    for (const papel of ["AGENTE_HUMANO", "GERENTE_DEPARTAMENTO", "MASTER_CEO", null] as const) {
      for (const g of menuDoComercial(papel)) {
        expect(g.abas.length, `${g.rotulo} vazio para ${papel}`).toBeGreaterThan(0);
        expect(g.abas.some((a) => a.href === g.href), `${g.rotulo} para ${papel}`).toBe(true);
      }
    }
    const vendedor = menuDoComercial("AGENTE_HUMANO");
    expect(vendedor.find((g) => g.rotulo === "Atendimento")!.href).toBe(ROTAS.conversas);
    // Grupo inteiro de gestão simplesmente não aparece para ele.
    expect(vendedor.map((g) => g.rotulo)).not.toContain("Painel");
  });

  it("a barra de dentro casa pelo prefixo mais longo, não por `/comercial`", () => {
    const menu = menuDoComercial(null);
    const grupo = (c: string) => grupoDoCaminho(menu, c)?.rotulo;

    // `/comercial` é prefixo de tudo: casamento ingênuo poria a barra do SDR
    // em cima da casa inteira.
    expect(grupo(ROTAS.carteira)).toBe("Leads");
    expect(grupo(ROTAS.supervisora)).toBe("Relatórios");
    expect(grupo(ROTAS.filas)).toBe("SDR");
    expect(grupo(`${ROTAS.filas}/`)).toBe("SDR");
    // A ficha do lead abre de Leads e mantém a barra — sem ser item de menu.
    expect(grupo(`${COMERCIAL}/lead/abc-123`)).toBe("Leads");
    expect(
      GRUPOS.flatMap((g) => g.abas).some((a) => a.href === `${COMERCIAL}/lead`),
      "a ficha do lead virou item de menu",
    ).toBe(false);
    // Endereço de fora da área não inventa grupo.
    expect(grupo("/admin")).toBeUndefined();
  });

  it("a ficha do lead só é alcançada por quem alcança a Carteira", () => {
    // Coerência: o `prefixos` do grupo não pode virar uma porta lateral.
    const leads = menuDoComercial("AGENTE_HUMANO").find((g) => g.rotulo === "Leads")!;
    expect(leads.abas.map((a) => a.href)).toContain(ROTAS.carteira);
  });
});
