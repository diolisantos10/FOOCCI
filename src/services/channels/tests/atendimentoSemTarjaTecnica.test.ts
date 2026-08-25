/**
 * A tarja técnica não volta para a tela de Atendimento — e o canal caído não
 * some do sistema.
 *
 * 24/08/2026. O CEO abriu o Atendimento do Sushi Cazza e encontrou uma tarja
 * vermelha ocupando um terço da tela, com três parágrafos e duas citações
 * literais da Meta, por cima da única linha que o atendente precisava ler:
 * "1 sem resposta há +1080 min — cliente esperando". Mandou tirar dali.
 *
 * "Dali" não é "do sistema": silenciar um alarme para resolver o problema troca
 * um incômodo por uma cegueira, e a cegueira já custou 15 dias de Instagram
 * morto. Então este arquivo trava as DUAS pontas ao mesmo tempo:
 *
 *   1. nenhum texto técnico de provedor chega à Central de Atendimento;
 *   2. um canal fora do ar NUNCA desaparece — encolhe, e continua em Integrações
 *      com a evidência inteira.
 *
 * Quem quebrar uma delas quebra o build.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import {
  evaluateInstagramHealth,
  toAtendimentoSeals,
  sealShortText,
  containsProviderJargon,
  SEAL_MAX_CHARS,
} from "../channelHealth";

/** O texto EXATO que estava na tela do Sushi Cazza em 24/08/2026. */
const ERRO_REAL_DA_META =
  'Conexão instável: o Instagram devolveu um token de curta duração (expira em ~1h) em vez do de 60 dias — '
  + 'a Meta respondeu: "Unsupported request - method type: get (code 100)". Reconecte; se repetir, a troca '
  + 'long-lived está falhando em produção. Além disso, a conta não foi inscrita no webhook de mensagens — a '
  + 'Meta respondeu: "Unsupported request - method type: post (code 100) [alvo: 27899980922965770]". Sem isso '
  + 'nenhuma DM chega. Além disso, não foi possível ler o perfil da conta — a Meta respondeu: '
  + '"Unsupported request - method type: get (code 100)".';

const AGORA = new Date("2026-08-24T21:30:00.000Z");

const CANAL_CAIDO = {
  configured: true,
  enabled: true,
  paused: false,
  mode: "RECEIVE_ONLY",
  lastError: ERRO_REAL_DA_META,
  lastWebhookAt: new Date("2026-08-23T00:00:00.000Z"),
  connectedAt: new Date("2026-08-24T21:02:00.000Z"),
  now: AGORA,
};

describe("Atendimento não recebe parágrafo técnico", () => {
  it("o selo do canal caído não carrega uma palavra do que a Meta respondeu", () => {
    const seals = toAtendimentoSeals(evaluateInstagramHealth(CANAL_CAIDO));
    expect(seals.length).toBeGreaterThan(0);

    for (const seal of seals) {
      // Todo campo de texto que a tela pode renderizar.
      for (const texto of [seal.short, seal.action, seal.label]) {
        expect(containsProviderJargon(texto)).toBe(false);
      }
      // Selo é UMA LINHA. Parágrafo já roubou a tela uma vez.
      expect(seal.short.length).toBeLessThanOrEqual(SEAL_MAX_CHARS);
      // E diz o EFEITO, que é o que o dono do restaurante entende.
      expect(seal.short.toLowerCase()).toContain("instagram");
    }
  });

  it("o objeto do selo não tem NENHUM campo por onde o texto da Meta possa entrar", () => {
    const [seal] = toAtendimentoSeals(evaluateInstagramHealth(CANAL_CAIDO));
    // A trava real é o tipo (`ChannelSeal` não tem `detail` nem `headline`);
    // isto aqui prova em runtime que a projeção não vaza nada por descuido.
    const serializado = JSON.stringify(seal);
    expect(containsProviderJargon(serializado)).toBe(false);
    expect(Object.keys(seal).sort()).toEqual(
      ["action", "actionHref", "channel", "label", "level", "short"],
    );
  });

  it("a trava é de execução, não de boa intenção: texto sujo é RECUSADO na hora", () => {
    // Se alguém amanhã escrever o erro da Meta no texto do selo, ele não vai
    // para a tela — o texto seguro entra no lugar (guardrail 4).
    const saida = sealShortText("down", ERRO_REAL_DA_META);
    expect(containsProviderJargon(saida)).toBe(false);
    expect(saida.length).toBeLessThanOrEqual(SEAL_MAX_CHARS);
  });

  it("nenhum arquivo da tela de Atendimento importa o tipo rico de saúde de canal", () => {
    // Importar `ChannelHealthItem` de volta é o primeiro passo para a tarja
    // renascer: é o único tipo que carrega `detail` e `headline`.
    const raizes = [
      join(process.cwd(), "src/components/atendimento"),
      join(process.cwd(), "src/app/(dashboard)/atendimento"),
    ];
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) arquivos.push(caminho);
      }
    };
    raizes.forEach(varrer);
    expect(arquivos.length).toBeGreaterThan(0);

    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(
        /ChannelHealthItem/.test(fonte),
        `${arquivo} voltou a importar ChannelHealthItem — é por ele que o parágrafo técnico volta`,
      ).toBe(false);
    }
  });
});

describe("mas o canal caído NÃO some do sistema", () => {
  it("canal fora do ar continua aparecendo no Atendimento — encolhido, nunca ausente", () => {
    const seals = toAtendimentoSeals(evaluateInstagramHealth(CANAL_CAIDO));
    expect(seals.some((s) => s.level === "down")).toBe(true);
    // E continua sendo acionável: leva para a tela onde se conserta.
    expect(seals[0].actionHref).toBe("/integracoes/instagram");
    expect(seals[0].action.length).toBeGreaterThan(0);
  });

  it("a evidência técnica sobrevive INTEIRA — só que em Integrações", () => {
    const [item] = evaluateInstagramHealth(CANAL_CAIDO);
    expect(item.level).toBe("down");
    // O texto literal da Meta, palavra por palavra, para quem vai consertar.
    expect(item.detail).toBe(ERRO_REAL_DA_META);
    // E o headline, que qualquer pessoa entende, NÃO o repete.
    expect(containsProviderJargon(item.headline)).toBe(false);
  });

  it("canal saudável não inventa alarme em lugar nenhum", () => {
    const items = evaluateInstagramHealth({
      ...CANAL_CAIDO,
      mode: "FULL",
      lastError: null,
      lastWebhookAt: new Date(AGORA.getTime() - 60 * 1000),
    });
    expect(items).toEqual([]);
    expect(toAtendimentoSeals(items)).toEqual([]);
  });
});
