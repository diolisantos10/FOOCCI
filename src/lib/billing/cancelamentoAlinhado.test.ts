/**
 * AS BOCAS DA CASA DIZEM A MESMA REGRA DE CANCELAMENTO — OU ISTO REPROVA.
 *
 * ── O defeito real, que não é o texto errado ────────────────────────────────
 *
 * Em 29/08/2026 a Foocci prometia TRÊS coisas diferentes sobre cancelamento, ao
 * mesmo tempo, sem nada reprovando:
 *
 *   · **O site** (`/site/precos`, linha do ciclo MENSAL): *"Cancela avisando 30
 *     dias antes."* — uma obrigação que o contrato NUNCA criou. Exigência
 *     inventada na vitrine.
 *   · **O contrato** (`docs/juridico/termo-de-contratacao-foocci.md`, 5.2):
 *     *"valores de ciclos já pagos (trimestral/anual) não são reembolsados"* —
 *     reter dinheiro de meses pré-pagos e não prestados.
 *   · **Os termos que o cliente realmente aceita** (`terms.ts`, seção 4): **nada
 *     sobre dinheiro.** Zero ocorrências de "reembols".
 *
 * O texto errado a gente conserta num commit. O defeito que sobrevive ao commit
 * é **três fontes poderem discordar sem nada reprovar** — e é esse que este
 * arquivo fecha. Não há abstração nova aqui: cada boca continua escrevendo com
 * as palavras que fazem sentido para o leitor dela. O que não pode é uma delas
 * afirmar o que as outras negam.
 *
 * ── A REGRA (decisão do CEO, 29/08/2026) ────────────────────────────────────
 *
 * Cancela a qualquer momento, sem multa e sem fidelidade obrigatória. O mês em
 * curso, já pago, segue até o fim e não é devolvido — o serviço está sendo
 * prestado. Abaixo de 6 meses, devolve-se o proporcional não entregue. De 6
 * meses para cima, o período usado é recalculado pelo preço do plano mensal e a
 * diferença volta, nunca negativa, nunca recuperando mais que o desconto
 * concedido. E os 7 dias de arrependimento de quem contratou pelo site devolvem
 * tudo, acima de qualquer cláusula.
 *
 * A conta em centavos mora em `saidaDoPlano.ts` e é testada em
 * `saidaDoPlano.test.ts`. Aqui se testa o que está ESCRITO.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Um arquivo só com "não pode dizer X" ficaria verde contra uma página em
 * branco. Por isso cada boca tem de AFIRMAR a regra inteira (a metade que
 * passa), nenhuma pode exigir aviso prévio nem negar a devolução (a metade que
 * reprova) — e os detectores são exercitados contra as frases reais que estavam
 * publicadas, para provar que eles mordem.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TERMS_SECTIONS } from "./terms";
import { REGRA_DE_SAIDA } from "./saidaDoPlano";
import { CONSEQUENCIAS_DO_CANCELAMENTO } from "@/services/billing/cancelamento";

const RAIZ = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const PAGINA_DE_PRECOS = "src/app/site/(gated)/precos/page.tsx";
const TERMOS_PUBLICOS = "src/app/termos/page.tsx";
const CONTRATO = "docs/juridico/termo-de-contratacao-foocci.md";
const RESUMO_DA_EQUIPE = "docs/juridico/resumo-contrato-equipe.md";

/**
 * Texto comparável: sem tags, sem `{" "}`, numa linha só.
 *
 * A quebra de linha é o falso negativo mais bobo possível — "O mês em\ncurso"
 * não contém "mês em curso", e o teste passaria achando que a frase sumiu
 * quando ela está lá. Markdown quebra em 80 colunas; JSX quebra onde couber.
 */
function normalizar(texto: string): string {
  return texto
    .replace(/\{"\s*"\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Comentário não é o que o cliente lê. O explicativo desta correção citaria as frases proibidas. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Onde a frase proibida bate, em um pedaço de texto que cabe numa linha.
 *
 * Devolve `null` quando não bate — e é por isso que existe: um
 * `expect(arquivoInteiro).not.toMatch(...)` reprova despejando a página
 * NORMALIZADA inteira no terminal, e um erro de trinta mil caracteres não é lido
 * por ninguém. Aqui a reprovação mostra o trecho culpado e o arquivo.
 */
function ondeBate(onde: string, texto: string, padrao: RegExp): string | null {
  const achado = padrao.exec(normalizar(texto));
  if (!achado) return null;
  const i = Math.max(0, achado.index - 60);
  return `${onde} → …${normalizar(texto).slice(i, achado.index + achado[0].length + 60)}…`;
}

/** O pedaço entre duas marcas, marca inicial incluída. Vazio se a marca sumiu. */
function fatiar(texto: string, inicio: string, fim: RegExp): string {
  const i = texto.indexOf(inicio);
  if (i < 0) return "";
  const resto = texto.slice(i + inicio.length);
  const m = resto.match(fim);
  return inicio + (m && m.index !== undefined ? resto.slice(0, m.index) : resto);
}

/* ═══════════════════════════════════════════════════════════════════════════
   AS BOCAS
   ═══════════════════════════════════════════════════════════════════════════ */

const FONTES: { nome: string; onde: string; trecho: () => string }[] = [
  {
    nome: "a vitrine — a regra publicada junto do preço",
    onde: `${PAGINA_DE_PRECOS} (REGRA_DE_SAIDA)`,
    // Cláusula que o cliente não teve como conhecer na hora de contratar não o
    // obriga: por isso a regra é publicada NA TELA DE PLANOS, e não só no
    // contrato. A página renderiza estas frases — o teste `renderiza` abaixo é
    // quem garante que elas não ficaram só na constante.
    trecho: () => REGRA_DE_SAIDA.join(" "),
  },
  {
    nome: "os termos que o cliente ACEITA (seção 4)",
    onde: "src/lib/billing/terms.ts",
    trecho: () =>
      TERMS_SECTIONS.find((s) => s.title === "4. Vigência, cancelamento e dados")?.body ?? "",
  },
  {
    nome: "o contrato assinado (cláusula 5)",
    onde: CONTRATO,
    trecho: () => trechoDoContrato(),
  },
  {
    nome: "os termos de uso públicos (/termos, seção 14)",
    onde: TERMOS_PUBLICOS,
    trecho: () =>
      fatiar(semComentarios(ler(TERMOS_PUBLICOS)), '<Block heading="14.', /<Block heading=/),
  },
  {
    nome: "o resumo de bolso da equipe",
    onde: RESUMO_DA_EQUIPE,
    // A equipe é uma boca como as outras: vendedor que repete a regra velha
    // ("dinheiro de ciclo pago não volta") faz o mesmo estrago que a página.
    trecho: () => fatiar(ler(RESUMO_DA_EQUIPE), "## Cancelamento e devolução", /^## /m),
  },
];

/**
 * A cláusula 5 do contrato, MENOS a 5.3.
 *
 * A 5.3 é a rescisão feita POR NÓS ("a Foocci pode rescindir… com aviso prévio
 * de 15 dias"): ali o aviso é obrigação nossa, não do cliente, e é legítimo. Um
 * teste que a acusasse estaria proibindo a coisa certa — e portão que reprova o
 * caso certo ensina a desligar o portão.
 */
function trechoDoContrato(): string {
  const secao = fatiar(ler(CONTRATO), "## 5. Vigência e rescisão", /^## /m);
  return secao
    .split(/^(?=5\.\d+\.)/m)
    .filter((bloco) => !bloco.startsWith("5.3."))
    .join("\n");
}

/* ═══════════════════════════════════════════════════════════════════════════
   A METADE QUE PASSA: cada boca afirma a regra inteira
   ═══════════════════════════════════════════════════════════════════════════ */

const AFIRMACOES: { nome: string; padrao: RegExp }[] = [
  { nome: "cancela a qualquer momento", padrao: /a qualquer momento|quando quiser/i },
  { nome: "sem multa", padrao: /sem multa|n[ãa]o h[áa] multa|nem multa/i },
  { nome: "sem fidelidade", padrao: /fidelidade/i },
  { nome: "o mês em curso já pago segue até o fim", padrao: /m[êe]s em curso/i },
  { nome: "há devolução", padrao: /devolv/i },
  { nome: "proporcional nos ciclos curtos", padrao: /proporcional/i },
  { nome: "o corte dos 6 meses", padrao: /6 meses|seis meses/i },
  { nome: "recálculo pelo preço do plano mensal", padrao: /pre[çc]o do plano mensal|recalcul/i },
  {
    nome: "a devolução nunca fica negativa",
    padrao: /nunca (é|fica|ser[áa]) negativ|no m[íi]nimo zero|nunca (paga|pagar) a mais|nunca deve/i,
  },
  { nome: "os 7 dias", padrao: /7 dias/ },
  { nome: "e que eles são o arrependimento", padrao: /arrepend/i },
];

describe("⭐ todas as bocas dizem a MESMA regra de cancelamento", () => {
  for (const fonte of FONTES) {
    describe(fonte.nome, () => {
      it("o trecho de cancelamento existe (a âncora não sumiu)", () => {
        // Se a seção for renomeada, `fatiar` devolve vazio — e um trecho vazio
        // passaria por todas as proibições abaixo sem dizer nada. É este teste
        // que impede o arquivo inteiro de ficar verde por ausência.
        expect(normalizar(fonte.trecho()).length, `trecho vazio em ${fonte.onde}`).toBeGreaterThan(
          200,
        );
      });

      for (const a of AFIRMACOES) {
        it(`afirma: ${a.nome}`, () => {
          expect(
            normalizar(fonte.trecho()),
            `${fonte.onde} deixou de dizer "${a.nome}".\n` +
              `As bocas da casa (vitrine, termos aceitos, contrato, termos de uso e o ` +
              `resumo da equipe) têm de dizer a MESMA regra de cancelamento. Uma delas ` +
              `calada sobre dinheiro foi exatamente o defeito de 29/08/2026.`,
          ).toMatch(a.padrao);
        });
      }
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   A METADE QUE REPROVA: o que nenhuma boca pode dizer
   ═══════════════════════════════════════════════════════════════════════════ */

/** Exigir do cliente um aviso com prazo para poder cancelar. */
const EXIGENCIA_DE_AVISO: { nome: string; padrao: RegExp }[] = [
  { nome: 'avisar com prazo ("cancela avisando 30 dias antes")', padrao: /avis\w*[^.]{0,40}\d+\s*dias/i },
  { nome: 'prazo antes ("30 dias antes")', padrao: /\d+\s*dias\s+antes/i },
  { nome: "aviso prévio", padrao: /aviso\s+pr[ée]vio/i },
  { nome: "antecedência", padrao: /anteced[êe]ncia/i },
];

/**
 * Negar a devolução do que foi pago e não foi entregue.
 *
 * ⚠️ Deliberadamente estreito. "O mês em curso não é devolvido" é a metade
 * LEGÍTIMA da regra — o serviço está sendo prestado — e um detector genérico de
 * "não devolve" acusaria justamente a frase certa.
 */
const NEGATIVA_DE_DEVOLUCAO: { nome: string; padrao: RegExp }[] = [
  { nome: 'a frase da v1 ("não são reembolsados")', padrao: /n[ãa]o\s+s[ãa]o\s+reembolsad/i },
  { nome: '"sem reembolso" / "sem direito a reembolso"', padrao: /sem\s+(direito\s+a\s+)?reembolso/i },
  { nome: '"não há devolução"', padrao: /n[ãa]o\s+h[áa]\s+(devolu[çc][ãa]o|reembolso)/i },
  {
    nome: "negar o ciclo já pago",
    padrao: /ciclos?\s+j[áa]\s+pagos?[^.]{0,80}n[ãa]o\s+(s[ãa]o|é|ser[ãa]o)\s+(reembolsad|devolvid)/i,
  },
];

/**
 * Onde a proibição vale: tudo que fala com o cliente sobre cancelamento —
 * inclusive a tela de confirmação, que é a última coisa que ele lê.
 *
 * As páginas entram INTEIRAS (sem comentários): a exigência de aviso pode
 * renascer em qualquer parágrafo, não só no trecho fatiado. O contrato entra
 * pelo trecho, por causa da 5.3.
 */
const SUPERFICIES: { onde: string; texto: () => string }[] = [
  { onde: PAGINA_DE_PRECOS, texto: () => semComentarios(ler(PAGINA_DE_PRECOS)) },
  { onde: TERMOS_PUBLICOS, texto: () => semComentarios(ler(TERMOS_PUBLICOS)) },
  {
    // Só a seção 4, e não o Termo inteiro: a seção 9 promete que MUDANÇAS deste
    // Termo são "avisadas com 30 dias" — obrigação nossa, e legítima. Varrer o
    // contrato inteiro acusaria justamente a cláusula que protege o cliente.
    onde: "src/lib/billing/terms.ts (seção 4, o texto aceito)",
    texto: () =>
      TERMS_SECTIONS.find((s) => s.title === "4. Vigência, cancelamento e dados")?.body ?? "",
  },
  { onde: `${CONTRATO} (cláusula 5, sem a 5.3)`, texto: trechoDoContrato },
  { onde: RESUMO_DA_EQUIPE, texto: () => ler(RESUMO_DA_EQUIPE) },
  {
    onde: "src/services/billing/cancelamento.ts (a tela de confirmação)",
    texto: () => CONSEQUENCIAS_DO_CANCELAMENTO.map((c) => c.texto).join(" "),
  },
  {
    // A tela do lojista mostra as frases do servidor, mas tem uma linha própria
    // na caixa de confirmação — e foi ali que "até o fim do ciclo já pago"
    // sobreviveu à correção do contrato até 29/08. Texto solto perto de botão de
    // confirmar é onde a regra velha se esconde.
    onde: "src/app/(dashboard)/settings/plano/page.tsx (a tela de cancelar)",
    texto: () => semComentarios(ler("src/app/(dashboard)/settings/plano/page.tsx")),
  },
];

describe("⛔ nenhuma boca exige aviso prévio para cancelar", () => {
  for (const s of SUPERFICIES) {
    for (const p of EXIGENCIA_DE_AVISO) {
      it(`${s.onde} não exige ${p.nome}`, () => {
        expect(
          ondeBate(s.onde, s.texto(), p.padrao),
          `${s.onde} voltou a exigir aviso prévio do cliente para cancelar.\n` +
            `O Termo de Contratação diz "a qualquer momento" (cláusula 5.2) e não pede ` +
            `aviso nenhum. Exigir na vitrine uma obrigação que o contrato não cria é ` +
            `cobrar do cliente algo que ninguém combinou — foi a frase "Cancela avisando ` +
            `30 dias antes", publicada até 29/08/2026.`,
        ).toBeNull();
      });
    }
  }
});

describe("⛔ nenhuma boca nega a devolução do que não foi entregue", () => {
  for (const s of SUPERFICIES) {
    for (const p of NEGATIVA_DE_DEVOLUCAO) {
      it(`${s.onde} não diz ${p.nome}`, () => {
        expect(
          ondeBate(s.onde, s.texto(), p.padrao),
          `${s.onde} voltou a negar a devolução de período já pago.\n` +
            `Reter o mês EM CURSO é legítimo (o serviço está sendo prestado). Reter o ` +
            `dinheiro de meses ainda NÃO entregues num plano pré-pago é vantagem ` +
            `excessiva — era a cláusula 5.2 da v1, e o CEO a derrubou em 29/08/2026.`,
        ).toBeNull();
      });
    }
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   OS DETECTORES MORDEM (senão as proibições acima não valem nada)
   ═══════════════════════════════════════════════════════════════════════════ */

const exigeAviso = (t: string) => EXIGENCIA_DE_AVISO.some((p) => p.padrao.test(normalizar(t)));
const negaDevolucao = (t: string) => NEGATIVA_DE_DEVOLUCAO.some((p) => p.padrao.test(normalizar(t)));

describe("os detectores acusam as frases que estavam publicadas de verdade", () => {
  it("acusa a linha do site, palavra por palavra", () => {
    expect(exigeAviso('MENSAL: { badge: "Sem fidelidade", gain: "Cancela avisando 30 dias antes." }')).toBe(true);
  });

  it("acusa as outras formas de exigir o mesmo", () => {
    expect(exigeAviso("O cancelamento exige aviso prévio.")).toBe(true);
    expect(exigeAviso("Comunique com antecedência mínima de 30 dias.")).toBe(true);
    expect(exigeAviso("Cancele 15 dias antes da renovação.")).toBe(true);
  });

  it("acusa a cláusula 5.2 da v1, palavra por palavra", () => {
    expect(
      negaDevolucao(
        "Valores de ciclos já pagos (trimestral/anual) não são reembolsados na saída voluntária.",
      ),
    ).toBe(true);
  });

  /* ── E NÃO acusam o que é legítimo ─────────────────────────────────────── */

  it("não acusa a metade legítima: o mês em curso não volta", () => {
    expect(
      negaDevolucao(
        "O mês em curso, já pago, segue até o fim e não é devolvido — o serviço continua " +
          "sendo prestado até lá.",
      ),
    ).toBe(false);
  });

  it("não acusa o aviso que é obrigação NOSSA (cláusula 5.3)", () => {
    // A Foocci rescindindo por inadimplência avisa com 15 dias. Isso protege o
    // cliente; proibir seria proibir a coisa certa.
    const clausula53 = ler(CONTRATO).split(/^(?=5\.\d+\.)/m).find((b) => b.startsWith("5.3."));
    expect(clausula53, "a cláusula 5.3 sumiu do contrato").toBeDefined();
    expect(/aviso pr[ée]vio de 15 dias/.test(clausula53!)).toBe(true);
    // …e ela está FORA do trecho que o teste examina, de propósito.
    expect(trechoDoContrato()).not.toContain("A Foocci pode rescindir");
  });

  it("não acusa os prazos de dados e de mudança de termos", () => {
    expect(exigeAviso("Por 30 dias após o término, você pode exportar seus dados.")).toBe(false);
    expect(negaDevolucao("Após 60 dias os dados são excluídos.")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   A REGRA ESTÁ NA TELA, NÃO SÓ NA CONSTANTE
   ═══════════════════════════════════════════════════════════════════════════ */

describe("⭐ a regra aparece ANTES da assinatura, junto do preço", () => {
  const pagina = () => semComentarios(ler(PAGINA_DE_PRECOS));

  it("a página de planos renderiza a regra de saída", () => {
    // Cláusula que o cliente não teve como conhecer no momento da contratação
    // não o obriga. Se a regra do plano longo ficar só no contrato, ela não
    // protege ninguém — e o desconto recuperado na saída seria contestável.
    const codigo = pagina();
    expect(codigo).toContain("REGRA_DE_SAIDA");
    expect(codigo).toContain("REGRA_DE_SAIDA.map");
  });

  it("a página não digita a regra à mão — ela lê a fonte única", () => {
    // Duas redações da mesma regra é como elas voltam a divergir. A página
    // importa; quem escreve é `saidaDoPlano`.
    expect(pagina()).toContain('from "@/lib/billing/saidaDoPlano"');
  });

  it("a regra de saída aparece na MESMA seção dos ciclos e preços", () => {
    // Enterrada no rodapé ela existe e não é conhecível. Tem de estar onde o
    // preço está — antes do botão de contratar daquela seção.
    const codigo = pagina();
    const secaoDosCiclos = codigo.indexOf('aria-labelledby="ciclos-title"');
    const proximaSecao = codigo.indexOf("<section", secaoDosCiclos + 10);
    const regra = codigo.indexOf("REGRA_DE_SAIDA.map");
    expect(secaoDosCiclos, "a seção de ciclos sumiu").toBeGreaterThan(-1);
    expect(regra, "a regra de saída sumiu da página").toBeGreaterThan(secaoDosCiclos);
    expect(regra, "a regra de saída saiu da seção de preços").toBeLessThan(proximaSecao);
  });

  it("a linha do ciclo mensal não vende cancelamento com condição", () => {
    // Onde a frase proibida morava. O badge continua "Sem fidelidade"; o ganho
    // agora diz a verdade do contrato.
    const copy = fatiar(pagina(), "const CYCLE_COPY", /^};/m);
    expect(copy).toContain("Sem fidelidade");
    expect(exigeAviso(copy)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   A TELA DE CANCELAMENTO REPETE A MESMA CONTA
   ═══════════════════════════════════════════════════════════════════════════ */

describe("⭐ a tela de confirmação diz a mesma regra de dinheiro", () => {
  // Ela não precisa dizer "a qualquer momento" — quem está lendo já apertou
  // cancelar. Precisa, sim, dizer o que acontece com o dinheiro, e dizer igual.
  const juntas = () => CONSEQUENCIAS_DO_CANCELAMENTO.map((c) => c.texto).join(" ");

  it("fala do proporcional e do recálculo pelo mensal", () => {
    expect(juntas()).toMatch(/proporcional/i);
    expect(juntas()).toMatch(/pre[çc]o do plano mensal/i);
  });

  it("fala dos 7 dias de arrependimento", () => {
    expect(juntas()).toMatch(/7 dias/);
    expect(juntas()).toMatch(/arrepend/i);
  });

  it("cada frase continua citando a cláusula de onde saiu", () => {
    for (const c of CONSEQUENCIAS_DO_CANCELAMENTO) {
      expect(c.clausula, c.texto).toMatch(/^5\.\d$/);
    }
  });
});
