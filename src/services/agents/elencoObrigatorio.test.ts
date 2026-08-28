/**
 * OS CINCO NÃO PODEM SUMIR.
 *
 * Em 07/08/2026 o CEO fechou a lista dos especialistas que vêm com todo projeto
 * e **não são apagados**: `qualidade`, `cerebro`, `interface`, `experiencia` e
 * `seguranca`. Palavras dele: *"não vão ser apagados de jeito nenhum, que já vem
 * junto com o projeto."*
 *
 * ── POR QUE ISTO É TESTE, E NÃO UMA LINHA NO CLAUDE.md ──
 *
 * Porque a regra escrita já falhou nesta casa, e custou um incidente. Guardrail
 * 4: prompt é aviso, código é trava. Um perfil de agente é um arquivo markdown
 * solto — some numa faxina, é renomeado por engano, tem as ferramentas mexidas
 * "só para destravar uma coisa", e **nada reclama**. Não há compilador nem
 * revisor que perceba.
 *
 * A perda é silenciosa e demora a aparecer: o projeto continua funcionando, os
 * outros agentes continuam trabalhando, e só semanas depois alguém nota que
 * ninguém mais está duvidando do resultado.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ──
 *
 * Não confere o CONTEÚDO das constituições — elas ainda não estão cristalizadas
 * (o material do Conselho está em produção em 07/08). Este teste garante a
 * EXISTÊNCIA e as restrições estruturais que já foram decididas. O portão do
 * conteúdo entra quando o conteúdo entrar.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PASTA = path.join(process.cwd(), ".claude", "agents");

/** Os cinco, com o motivo de cada um estar na lista — o alerta carrega a evidência. */
const OBRIGATORIOS = [
  { slug: "qualidade",   porque: "o que duvida do resultado, inclusive do Diretor" },
  { slug: "cerebro",     porque: "responde pela verdade e pela escada de autonomia" },
  { slug: "interface",   porque: "como a tela fica" },
  { slug: "experiencia", porque: "se a tela funciona para quem usa" },
  { slug: "seguranca",   porque: "quem consegue entrar sem ser convidado" },
] as const;

const ler = (slug: string) => readFileSync(path.join(PASTA, `${slug}.md`), "utf8");

/** Extrai a lista de `tools:` do frontmatter. */
function ferramentasDe(conteudo: string): string[] {
  const m = conteudo.match(/^tools:\s*\[(.*?)\]\s*$/m);
  if (!m) return [];
  return m[1]!.split(",").map((t) => t.trim()).filter(Boolean);
}

describe("o elenco obrigatório existe", () => {
  it.each(OBRIGATORIOS)("`$slug` está presente — $porque", ({ slug }) => {
    // A metade que reprova: apagar o arquivo, ou renomeá-lo.
    expect(existsSync(path.join(PASTA, `${slug}.md`))).toBe(true);
  });

  it.each(OBRIGATORIOS)("`$slug` declara o próprio nome no frontmatter", ({ slug }) => {
    // Arquivo presente com `name:` de outro agente é o mesmo que ausente: o
    // registro resolve por nome, não por nome de arquivo.
    expect(ler(slug)).toMatch(new RegExp(`^name:\\s*${slug}\\s*$`, "m"));
  });

  it.each(OBRIGATORIOS)("`$slug` não é casca vazia", ({ slug }) => {
    // Esvaziar um perfil desliga o agente sem apagá-lo — e some da vista, porque
    // o arquivo continua lá. Este é o jeito mais fácil de burlar o teste acima.
    const corpo = ler(slug).split(/^---\s*$/m).slice(2).join("").trim();
    expect(corpo.length).toBeGreaterThan(400);
  });
});

describe("as restrições que já foram decididas", () => {
  const ESCRITA = ["Write", "Edit", "NotebookEdit"];

  it("`qualidade` é SOMENTE LEITURA — de propósito", () => {
    /*
      Não é preferência de estilo: é restrição de ferramenta. Quem duvida do
      trabalho não pode ser quem conserta o trabalho, senão vira autor e perde a
      independência que justifica o cargo.

      A metade que reprova: acrescentar `Write` aqui "só para ele já ir
      arrumando". É a mudança mais tentadora do repositório inteiro.
    */
    const ferramentas = ferramentasDe(ler("qualidade"));
    expect(ferramentas.length).toBeGreaterThan(0); // o frontmatter tem que ser legível
    for (const proibida of ESCRITA) {
      expect(ferramentas).not.toContain(proibida);
    }
  });

  it("`experiencia` também é somente leitura", () => {
    // Mesmo motivo: ele audita percurso. Quem conserta a tela é o `interface` ou
    // o especialista do domínio.
    const ferramentas = ferramentasDe(ler("experiencia"));
    expect(ferramentas.length).toBeGreaterThan(0);
    for (const proibida of ESCRITA) {
      expect(ferramentas).not.toContain(proibida);
    }
  });

  it("`seguranca` TEM escrita — a metade que passa", () => {
    /*
      Sem esta asserção, o teste acima seria satisfeito tirando a escrita de
      todo mundo — e aí a lista de furos voltaria a travar exatamente como
      estava antes de 07/08: diagnóstico sem conserto.

      Guardrail 5: a proteção não pode ser mais destrutiva que o problema.
    */
    expect(ferramentasDe(ler("seguranca"))).toContain("Write");
  });

  it("`seguranca` proíbe imprimir o valor de um segredo", () => {
    // O log do GitHub Actions deste repositório é público. Esta linha é a única
    // coisa entre um diagnóstico e um vazamento.
    expect(ler("seguranca")).toMatch(/nunca imprime o \*\*valor\*\* de um segredo|nunca imprime o valor de um segredo/i);
  });
});

describe("os cinco apontam para a constituição", () => {
  /*
    "Regra não se copia, se aponta." Se a constituição for colada dentro de cada
    perfil, ela diverge em três meses e ninguém sabe qual versão vale — foi o
    motivo de o kit existir.

    O que este bloco protege é o VÍNCULO. Um perfil que perde o ponteiro deixa de
    ser um Essencial e vira um agente qualquer com o mesmo nome: continua sendo
    despachado, continua respondendo, e ninguém percebe que ele parou de operar
    sob as travas.
  */
  it.each(OBRIGATORIOS)("`$slug` se declara Essencial e cita a doutrina", ({ slug }) => {
    const perfil = ler(slug);
    expect(perfil).toMatch(/Essenciais/);
    expect(perfil).toMatch(/23-constituicao-dos-essenciais\.md/);
  });

  it.each(OBRIGATORIOS)("`$slug` carrega a regra da reversibilidade", ({ slug }) => {
    /*
      Não basta citar o arquivo: a regra que muda o comportamento no dia a dia
      tem que estar à mão. Um agente que precisa abrir outro repositório para
      saber se pode agir sozinho vai decidir sem abrir.

      A metade que reprova: apagar o parágrafo e deixar só o link.
    */
    expect(ler(slug)).toMatch(/reversibilidade/i);
  });
});

describe("a pasta não perde agentes em silêncio", () => {
  it("todo arquivo em .claude/agents tem frontmatter com nome e ferramentas", () => {
    // Um perfil malformado é carregado como nada. Falha silenciosa é a que mais
    // custa aqui, porque o Diretor continua despachando para um agente que não
    // existe mais.
    const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".md"));
    expect(arquivos.length).toBeGreaterThanOrEqual(OBRIGATORIOS.length);

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(path.join(PASTA, arquivo), "utf8");
      expect(conteudo, `${arquivo} sem name: no frontmatter`).toMatch(/^name:\s*\S+/m);
      expect(ferramentasDe(conteudo), `${arquivo} sem tools: legível`).not.toHaveLength(0);
    }
  });
});

describe("o departamento financeiro do produto existe — ordem do CEO, 28/08/2026", () => {
  /*
    "Todo produto precisa ter o seu departamento financeiro, que vai cuidar dos
    gastos, de quanto qual projeto está gastando, em todos os sentidos."

    ── POR QUE ISTO É TESTE ──

    Mesmo motivo dos cinco acima, com um agravante: o financeiro é o único agente
    cuja ausência NÃO produz sintoma. Se o `qualidade` some, um bug passa e
    alguém reclama. Se o financeiro some, a conta continua chegando e ninguém
    nota nada — até o dia em que ela dobra. Perda silenciosa por construção.

    ── O QUE ESTE BLOCO NÃO AFIRMA ──

    Que `financeiro` virou o sexto Essencial. A lista dos cinco foi fechada pelo
    CEO em 07/08 e mexer nela é doutrina — do Diretor Geral, não deste teste. O
    pedido de adoção está em `docs/perguntas-ao-diretor-geral.md`. Até lá ele é
    um especialista obrigatório DESTE produto, travado aqui.
  */
  const PERFIL = "financeiro";

  it("`financeiro` está presente", () => {
    expect(existsSync(path.join(PASTA, `${PERFIL}.md`))).toBe(true);
  });

  it("`financeiro` declara o próprio nome no frontmatter", () => {
    expect(ler(PERFIL)).toMatch(new RegExp(`^name:\\s*${PERFIL}\\s*$`, "m"));
  });

  it("`financeiro` não é casca vazia", () => {
    const corpo = ler(PERFIL).split(/^---\s*$/m).slice(2).join("").trim();
    expect(corpo.length).toBeGreaterThan(400);
  });

  it("`financeiro` NUNCA gasta — a trava que mais importa", () => {
    /*
      Um agente que mede dinheiro e também pode gastá-lo é a definição de
      conflito de interesse. E aqui a autonomia é vedada por natureza, não por
      grau: gastar é irreversível e move dinheiro de terceiro.

      A metade que reprova: apagar a linha "NUNCA gasta" do perfil para o agente
      "já ir resolvendo" um upgrade de plano. É a mudança mais tentadora deste
      arquivo, exatamente como o `Write` no `qualidade`.
    */
    expect(ler(PERFIL)).toMatch(/NUNCA gasta, contrata, cadastra cartão/i);
  });

  it("`financeiro` nunca escreve o valor de um segredo", () => {
    // Ele varre variáveis de ambiente atrás de serviço pago. Sem esta linha,
    // um relatório de custo vira vazamento de credencial.
    expect(ler(PERFIL)).toMatch(/nunca escreve segredo|use o \*\*nome da variável\*\*, nunca o valor/i);
  });

  it("`financeiro` aponta para o padrão da casa, e o padrão existe", () => {
    /*
      "Regra não se copia, se aponta." O contrato com o financeiro da companhia
      mora num arquivo só; perfil que perde o ponteiro passa a reportar no
      formato que inventar, e a compilação da Control Room deixa de ser uma soma.
    */
    expect(ler(PERFIL)).toMatch(/financeiro-padrao-da-casa\.md/);
    expect(existsSync(path.join(process.cwd(), "docs", "financeiro-padrao-da-casa.md"))).toBe(true);
  });
});
