/**
 * O SITE NÃO PUBLICA PREÇO QUE NINGUÉM DECIDIU E NENHUM MOTOR COBRA.
 *
 * Por que este portão existe, e não uma correção só: em 04/08/2026 a seção
 * "Cobrado à parte" de `/site/precos` nasceu com SEIS serviços e cinco preços —
 * WhatsApp oficial R$ 149/mês, nota fiscal R$ 89/mês, pacote de 1.000 mensagens
 * R$ 79, unidade adicional a 60% do plano e implantação por R$ 299/599/1.490.
 * O commit citava um documento comercial ("Planos Foocci v3") que **não existe no
 * repositório**, e o CEO, ao auditar a seção em 06/08, não reconheceu nenhum
 * daqueles serviços: "não sei de onde vieram essas ideias".
 *
 * O agravante que transforma isto em portão: **nenhum dos cinco era cobrado.**
 * `@/lib/billing/pricing` — a mesma fonte que o checkout usa — conhece três planos
 * e três ciclos. Não existe add-on, taxa de setup, pacote de mensagem nem unidade
 * adicional. A página vendia o que o produto não sabia faturar, e a "cota de
 * mensagem" que o pacote de R$ 79 aliviava não existe em plano nenhum.
 *
 * Preço publicado é promessa. Número escrito à mão numa página de preço parece
 * decidido mesmo quando foi só razoável — e o próximo agente que passar por aqui
 * vai ler o valor antigo como fato e recolocá-lo. Este teste é a trava contra
 * exatamente esse movimento: enquanto não houver valor decidido pelo CEO **e**
 * motor que o cobre, o preço é "Sob consulta".
 *
 * Se um dia algum destes serviços ganhar preço de verdade, o caminho é: decidir com
 * o CEO → ensinar `@/lib/billing/pricing` a cobrar → ler o valor de lá na página →
 * e só então tirar a linha daqui, com a justificativa junto. Apagar o teste para
 * fazer o número passar é desfazer a decisão de 06/08 sem falar com quem a tomou.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SERVICOS_A_PARTE, SOB_CONSULTA } from "@/lib/site/servicosAParte";

const RAIZ = process.cwd();

/** A superfície que o visitante vê: as páginas públicas e o que elas montam. */
const PASTAS = ["src/app/site", "src/components/marketing"];

/**
 * Cada valor aposentado, com o dono da decisão junto — alerta que não carrega a
 * evidência vira ruído que ninguém investiga (guardrail 6).
 *
 * As expressões são deliberadamente cirúrgicas: `R\$\s*89(?!,)` barra "R$ 89/mês"
 * (a nota fiscal) e deixa passar **R$ 89,50**, que é legítimo — é a metade exata de
 * R$ 179,00 no primeiro mês, calculada por `firstChargeCents`. Mesma lógica para
 * 149 (o equivalente mensal do anual é R$ 149,17) e para 79. Um portão que reprova
 * o número certo ensina a desligar o portão.
 */
const APOSENTADOS: { padrao: RegExp; item: string; decisao: string }[] = [
  {
    padrao: /R\$\s*149(?!,)/,
    item: "WhatsApp oficial da Meta — R$ 149/mês",
    decisao: "SAIU (06/08): o custo entra na mensalidade de quem usa o CRM.",
  },
  {
    padrao: /R\$\s*89(?!,)/,
    item: "Nota fiscal (NFC-e) — R$ 89/mês",
    decisao:
      "SAIU o preço (06/08): o Foocci só integra. Certificado e custo por documento " +
      "são do lojista, direto com o emissor. (R$ 89,50 do primeiro mês continua valendo.)",
  },
  {
    padrao: /R\$\s*79(?!,)/,
    item: "Pacote de 1.000 mensagens — R$ 79",
    decisao: "SAIU (06/08): não existe cota de mensagem em plano nenhum — vendia alívio sem problema.",
  },
  {
    padrao: /60\s*%\s*do\s*plano/i,
    item: "Unidade adicional — 60% do plano",
    decisao: "SAIU (06/08): 'cada loja vai pagar o valor que tem que pagar'.",
  },
  {
    padrao: /R\$\s*299(?!,)/,
    item: "Implantação — R$ 299",
    decisao: "SAIU (06/08): virou 'Configuração', sob consulta. A faixa nasceu do documento que não existe.",
  },
  {
    padrao: /(R\$\s*)?\b599\b/,
    item: "Implantação — R$ 599",
    decisao: "SAIU (06/08): virou 'Configuração', sob consulta.",
  },
  {
    padrao: /\b1\.490\b/,
    item: "Implantação — R$ 1.490",
    decisao: "SAIU (06/08): virou 'Configuração', sob consulta.",
  },
];

/** Todo arquivo de código sob as pastas, menos os próprios testes. */
function arquivosDoSite(): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) { andar(completo); continue; }
      if (!/\.(tsx|ts)$/.test(entrada.name)) continue;
      if (/\.test\.tsx?$/.test(entrada.name)) continue;
      achados.push(completo);
    }
  };
  for (const pasta of PASTAS) {
    const completo = path.join(RAIZ, pasta);
    if (fs.existsSync(completo)) andar(completo);
  }
  return achados;
}

/**
 * Só o texto que VAI PARA A TELA. Comentário é onde se explica por que o número
 * foi aposentado — se o teste olhasse comentário, o cabeçalho deste arquivo e o de
 * `servicosAParte.ts` reprovariam a si mesmos, e a única saída seria parar de
 * documentar. Teste que pune a explicação ensina a apagar a explicação.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // bloco  /* … */  (cobre JSX {/* … */})
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // linha  // …     (o [^:] poupa https://)
}

describe("nenhum preço sem lastro volta para o site", () => {
  const arquivos = arquivosDoSite();

  it("varre uma quantidade plausível de arquivos (senão o teste passa por não ter olhado nada)", () => {
    expect(arquivos.length).toBeGreaterThan(20);
  });

  for (const { padrao, item, decisao } of APOSENTADOS) {
    it(`não republica "${item}"`, () => {
      const culpados: string[] = [];
      for (const arquivo of arquivos) {
        const visivel = semComentarios(fs.readFileSync(arquivo, "utf8"));
        if (padrao.test(visivel)) culpados.push(path.relative(RAIZ, arquivo));
      }
      expect(
        culpados,
        `Valor aposentado de volta na tela, em: ${culpados.join(", ")}\n` +
          `${item} → ${decisao}\n` +
          `Preço publicado é promessa: o checkout (@/lib/billing/pricing) só sabe cobrar ` +
          `plano e ciclo. Enquanto não houver valor decidido pelo CEO E motor que o cobre, ` +
          `o preço do serviço é "${SOB_CONSULTA}".`,
      ).toEqual([]);
    });
  }

  /*
    A OUTRA METADE DO PORTÃO. A varredura acima pega o valor VELHO voltando; esta
    pega o valor NOVO sendo inventado — que é como o defeito nasceu da primeira
    vez. Nenhum serviço à parte pode anunciar dígito enquanto o checkout não souber
    cobrá-lo.
  */
  it("todo serviço à parte anuncia preço sem dígito nenhum", () => {
    const comNumero = SERVICOS_A_PARTE.filter((s) => /\d/.test(s.price)).map((s) => s.name);
    expect(
      comNumero,
      `Serviço com número no preço: ${comNumero.join(", ")}. ` +
        `O motor de cobrança não conhece add-on — anunciar valor aqui é prometer ` +
        `uma cobrança que o checkout não faz.`,
    ).toEqual([]);
  });

  it('todo serviço à parte anuncia exatamente "Sob consulta"', () => {
    for (const s of SERVICOS_A_PARTE) {
      expect(s.price, `"${s.name}" anuncia "${s.price}"`).toBe(SOB_CONSULTA);
    }
  });

  it("a Configuração diz o que determina o preço e o que o lojista recebe", () => {
    const cfg = SERVICOS_A_PARTE.find((s) => s.name === "Configuração");
    expect(cfg, 'o serviço "Configuração" sumiu da lista').toBeTruthy();
    const d = cfg!.desc.toLowerCase();
    // O que determina o preço (ordem do CEO: "por quantidade de itens no cardápio
    // e se precisa cadastrar clientes").
    expect(d, "a linha não diz que o preço depende do tamanho do cardápio").toContain("cardápio");
    expect(d, "a linha não diz que o preço depende de importar clientes").toContain("clientes");
    // E o que ele recebe: sem trabalho humano do Foocci, setup não se justifica —
    // "ninguém vai lá instalar nada, o cliente sobe o seu cadastro, tem um manual".
    expect(d, "a linha não diz que somos NÓS que subimos o cardápio").toContain("a gente sobe");
  });
});
