/**
 * A área do cliente não pode prometer o que não entrega.
 *
 * ─── O caso (24/08/2026, print do CEO) ───────────────────────────────────────
 * "Olá, Diego 👋 / Meus dados, endereços e cupons". A faixa abria. Dentro:
 * endereços diziam "+ Adicionar meu primeiro endereço" e cupons diziam "Você
 * ainda não tem cupons" — para um cliente que tinha os dois. Nenhuma requisição
 * chegava a sair do navegador: sem a prova de posse do telefone (waToken), a
 * tela nem perguntava, e mostrava o não-perguntado como se fosse resposta.
 *
 * ─── Por que este teste é de CLASSE, e não deste print ───────────────────────
 * O erro não é uma frase errada numa tela. É um PADRÃO que se repete toda vez
 * que alguém acrescenta uma tela de cliente: as rotas gated de `/api/pedido/`
 * devolvem **200 com vazio** quando falta a prova (decisão de segurança correta,
 * `src/lib/pedido-identity.ts`), e uma tela nova lê esse vazio como "não tem".
 * O teste, então, VARRE todas as telas de cliente e cobra de cada uma:
 *
 *   1. quem consome rota gated tem de carregar a prova (`x-pedido-token`);
 *   2. quem consome rota gated tem de ter um estado honesto de RECUSA —
 *      `acessoDaAreaDoCliente()` aqui, ou o `LOCKED_WALLET` da Loja;
 *   3. nenhuma tela pode afirmar ausência ("você não tem…") sem esse estado;
 *   4. nenhuma tela de cliente pode ter link morto (`href="#"`, `href=""`).
 *
 * Uma tela NOVA que esqueça qualquer um dos quatro reprova, mesmo que este
 * arquivo nunca seja tocado. É esse o alcance pretendido.
 *
 * Guardrail 1 do CLAUDE.md: ausência de informação não é informação.
 * Guardrail 4: prompt é aviso, código é trava.
 *
 * Teste de código-fonte porque o vitest deste projeto roda em
 * `environment: "node"`, sem DOM — mesma escolha de `identificacaoNaTela.test.ts`.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  AFIRMACOES_DE_AUSENCIA,
  CHAVE_PROVA,
  EXPLICACAO_SEM_PROVA,
  ROTAS_COM_PROVA,
  acessoDaAreaDoCliente,
  promessaDaFaixa,
} from "./areaDoCliente";

const RAIZ  = process.cwd();
const TELAS = path.join("src", "app", "pedido", "[slug]");
const ler   = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

/** Toda tela de cliente do fluxo /pedido. Nova tela entra aqui sozinha. */
const telasDeCliente = readdirSync(path.join(RAIZ, TELAS))
  .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
  .map((f) => ({ nome: f, caminho: path.join(TELAS, f), fonte: ler(path.join(TELAS, f)) }));

/**
 * Uma tela pode delegar a busca a um módulo irmão (a Loja delega a
 * `lojaWallet.ts`). Então mede-se a tela MAIS os módulos locais que ela importa:
 * é esse conjunto que precisa carregar a prova.
 */
function fonteEfetiva(tela: { caminho: string; fonte: string }): string {
  const locais = [...tela.fonte.matchAll(/from "\.\/([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  const extras = locais.map((nome) => {
    for (const ext of [".ts", ".tsx"]) {
      try { return ler(path.join(TELAS, nome + ext)); } catch { /* próximo */ }
    }
    return "";
  });
  return [tela.fonte, ...extras].join("\n");
}

/** Só as que realmente falam com uma rota que exige prova de posse do telefone. */
const telasGated = telasDeCliente
  .map((t) => ({ ...t, efetiva: fonteEfetiva(t) }))
  .filter((t) => ROTAS_COM_PROVA.some((r) => new RegExp(`fetch\\([^)]*/${r}`).test(t.efetiva)));

/**
 * Marcas aceitas de "eu sei distinguir recusa de vazio". Exige USO, não import:
 * a chamada `acessoDaAreaDoCliente(` ou o estado `locked` da Loja. Só importar o
 * helper e não usar era o furo — a tela seguiria mentindo com a consciência limpa.
 */
const TEM_ESTADO_DE_RECUSA = /acessoDaAreaDoCliente\(|LOCKED_WALLET|status === "locked"|wallet\.status/;

/** E a recusa tem de ser DITA ao cliente, não só calculada. */
const DIZ_A_RECUSA = /\{EXPLICACAO_SEM_PROVA\}|LOCKED_WALLET|wallet\.status === "locked"/;

describe("área do cliente — a faixa só promete o que entrega", () => {
  it("sem prova, a faixa não promete endereços nem cupons", () => {
    const frase = promessaDaFaixa(acessoDaAreaDoCliente(null), 0);
    expect(frase.toLowerCase()).not.toContain("endereço");
    expect(frase.toLowerCase()).not.toContain("cupom");
    expect(frase.toLowerCase()).not.toContain("cupons");
    // …e continua prometendo o que de fato mostra: o que a pessoa informou.
    expect(frase).toContain("Meus dados");
  });

  it("com prova, a promessa completa volta — inclusive a contagem de cupons", () => {
    expect(promessaDaFaixa("com-prova", 0)).toBe("Meus dados, endereços e cupons");
    expect(promessaDaFaixa("com-prova", 1)).toContain("1 cupom disponível");
    expect(promessaDaFaixa("com-prova", 3)).toContain("3 cupons disponíveis");
  });

  it("token em branco não vale como prova", () => {
    for (const t of [null, undefined, "", "   "]) {
      expect(acessoDaAreaDoCliente(t)).toBe("sem-prova");
    }
    expect(acessoDaAreaDoCliente("abc.def")).toBe("com-prova");
  });

  it("a explicação da recusa diz o motivo E o caminho", () => {
    expect(EXPLICACAO_SEM_PROVA.toLowerCase()).toContain("whatsapp");
    expect(EXPLICACAO_SEM_PROVA).not.toMatch(/você (ainda )?não tem/i);
  });
});

describe("classe: toda tela de cliente que lê rota gated tem de saber recusar", () => {
  it("existe pelo menos uma tela gated para medir (a varredura não é vazia)", () => {
    expect(telasGated.length).toBeGreaterThan(0);
  });

  it.each(telasGated.map((t) => [t.nome, t] as const))(
    "%s carrega a prova e distingue recusa de ausência",
    (_nome, tela) => {
      expect(
        tela.efetiva.includes("x-pedido-token"),
        `${tela.caminho} chama uma rota que exige prova de posse do telefone, mas ` +
          "não envia o cabeçalho `x-pedido-token`. Sem ele a rota responde 200 com " +
          "vazio, e a tela mostra o vazio como verdade.",
      ).toBe(true);

      expect(
        TEM_ESTADO_DE_RECUSA.test(tela.efetiva),
        `${tela.caminho} não tem estado de RECUSA. Uma tela de cliente que lê ` +
          "`customer-profile`/`coupons`/`customer-address` precisa distinguir " +
          '"o servidor recusou" de "você não tem" — use `acessoDaAreaDoCliente()` ' +
          "(areaDoCliente.ts) ou o `LOCKED_WALLET` da Loja (lojaWallet.ts). " +
          "Foi exatamente isso que faltou no print do CEO de 24/08/2026.",
      ).toBe(true);
    },
  );

  it.each(telasDeCliente.map((t) => [t.nome, t] as const))(
    "%s não afirma ausência sem ter medido",
    (_nome, tela) => {
      const afirmacoes = AFIRMACOES_DE_AUSENCIA.filter((f) => tela.fonte.includes(f));
      if (afirmacoes.length === 0) return;
      expect(
        TEM_ESTADO_DE_RECUSA.test(tela.fonte) && DIZ_A_RECUSA.test(tela.fonte),
        `${tela.caminho} afirma ao cliente ${JSON.stringify(afirmacoes)} sem ter um ` +
          "estado de recusa. Só se pode dizer que a pessoa não tem endereço ou " +
          "cupom depois de PERGUNTAR e o servidor responder — não quando ele se " +
          "recusou a responder.",
      ).toBe(true);
    },
  );

  it.each(telasDeCliente.map((t) => [t.nome, t] as const))(
    "%s não tem link morto",
    (_nome, tela) => {
      const mortos = tela.fonte.match(/href=(?:"#"|""|\{""\}|\{"#"\})/g) ?? [];
      expect(
        mortos,
        `${tela.caminho} tem link morto (${mortos.join(", ")}). Numa tela de cliente, ` +
          "um link que não leva a lugar nenhum é promessa sem produtor.",
      ).toEqual([]);
    },
  );
});

describe("a prova sobrevive à recarga — e morre no 'Trocar'", () => {
  const chat = ler(path.join(TELAS, "PedidoClient.tsx"));

  it("o waToken é guardado na sessão, ao lado da identidade", () => {
    expect(
      /sessionStorage\.setItem\(CHAVE_PROVA\(slug\)/.test(chat),
      "A prova (waToken) precisa ser gravada na sessão. Enquanto ela vivia só na " +
        "URL, quem entrava pelo link do WhatsApp e recarregava a página continuava " +
        "sendo chamado pelo nome e PERDIA dados, endereços e cupons.",
    ).toBe(true);
    expect(
      /sessionStorage\.getItem\(CHAVE_PROVA\(slug\)\)/.test(chat),
      "…e precisa ser LIDA de volta no mount, senão guardar não serve de nada.",
    ).toBe(true);
  });

  it("'Trocar' apaga a prova de quem saiu", () => {
    const reset = chat.match(/function handleResetIdentity\(\)[\s\S]{0,1400}?\n {2}\}/)?.[0] ?? "";
    expect(reset.length, "handleResetIdentity não foi encontrado").toBeGreaterThan(0);
    expect(
      /removeItem\(CHAVE_PROVA\(slug\)\)/.test(reset) && /setAuthToken\(null\)/.test(reset),
      "Guardar a prova na sessão só é seguro se 'Trocar' a apagar junto — senão o " +
        "próximo a usar o aparelho herda os dados, endereços e cupons do anterior.",
    ).toBe(true);
  });

  it("a chave da prova é por loja", () => {
    expect(CHAVE_PROVA("sushi-cazza")).not.toBe(CHAVE_PROVA("foocci-bakery"));
  });
});
