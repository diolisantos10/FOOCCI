/**
 * ⭐ PASSOS 2 E 3 — o agente consulta as políticas ANTES de escalar.
 *
 * ─── O DEFEITO QUE ISTO CONSERTA ────────────────────────────────────────────
 *
 * O PR #178 pôs o agente a consultar o gerente de verdade. Mas ele escalava
 * **sempre**: toda pergunta fora da alçada virava uma consulta nova, mesmo
 * quando a empresa já tinha decidido aquilo na semana passada. O CEO não é
 * pombo-correio, e o gerente também não é: uma decisão tomada uma vez tem que
 * responder o segundo cliente sozinha.
 *
 * ─── ⛔ E A MEMÓRIA NÃO MORA AQUI ───────────────────────────────────────────
 *
 * Este arquivo **não guarda política nenhuma**. Ele pergunta ao núcleo e avalia
 * a resposta. Uma cópia local das decisões seria a segunda verdade, ela
 * divergiria do núcleo na primeira revogação, e a divergência não viraria erro —
 * o defeito-mãe desta casa.
 *
 * ─── ⭐ POR QUE O PRODUTO AVALIA DE NOVO O QUE O NÚCLEO JÁ FILTROU ──────────
 *
 * Porque "o outro lado disse que pode" é a mesma prova de despachante que o
 * Dioli Connect inteiro existe para recusar, só que virada do avesso. As duas
 * regras que decidem se o agente pode ABRIR A BOCA com um cliente — a política
 * está viva? ela vale para ESTE cliente? — são conferidas aqui, sobre os campos
 * de fato (`revogadaEm`, `vigenteAte`, `escopo`, `valeApenasPara`).
 *
 * Não é desconfiança do núcleo: é que o dano de um erro dele é o agente afirmar
 * a um cliente real uma condição comercial que a empresa revogou. Custo de
 * conferir: quatro comparações. Custo de não conferir: uma promessa que a
 * empresa não vai honrar, feita por escrito, em nome dela.
 */

import {
  CAMINHO_DA_CONSULTA_DE_POLITICA,
  TETO_DA_CONSULTA_MS,
  VARIAVEL_DA_URL_DO_NUCLEO,
  type PerguntaDePolitica,
  type PoliticaDoNucleo,
  type RespostaDeConsultaDePolitica,
} from "./contrato";
import { paraOCliente, VazamentoInterno } from "./barreira";
import { CABECALHO_DO_SEGREDO, VARIAVEL_DO_SEGREDO, segredoDaPorta } from "../porta";

/**
 * ⭐ POR QUE O AGENTE NÃO PODE RESPONDER — lista fechada, e ela é a auditoria.
 *
 * Texto livre produziria cinco jeitos de escrever "não achei" e nenhum jeito de
 * contar quantas vezes cada um aconteceu — que é a pergunta que decide se o
 * núcleo está vazio, se a rede está caindo, ou se a empresa está revogando
 * política demais.
 */
export const CAUSAS_DE_NAO_RESPONDER = [
  /** Não existe política para isto. Este é o caminho normal do primeiro caso. */
  "semPolitica",
  /** ⭐ Existe, e foi REVOGADA. O agente não pode responder com ela. */
  "politicaRevogada",
  /** Existe, e a vigência ainda não começou. */
  "aindaNaoVigente",
  /** Existe, e a vigência acabou. */
  "politicaExpirada",
  /** ⭐ Existe, é EXCEÇÃO de outro cliente. Exceção não vira regra. */
  "excecaoNaoEReRegra",
  /** É exceção e não diz de quem. Exceção sem dono não vale para ninguém. */
  "excecaoSemDono",
  /** Veio política sem texto para o cliente. Não há o que responder. */
  "semRespostaAoCliente",
  /** ⛔ O texto externo carregava material interno. Barreira. */
  "vazamentoInterno",
  /** `DIOLI_CONNECT_URL`/`DIOLI_CONNECT_SECRET` não configurados. */
  "nucleoNaoConfigurado",
  /** Não deu para falar com o núcleo: rede, DNS, TLS, processo. */
  "nucleoInalcancavel",
  /** Estourou o teto de espera. */
  "demorouDemais",
  /** O núcleo respondeu algo que não é o contrato dele. */
  "respostaIlegivel",
] as const;
export type CausaDeNaoResponder = (typeof CAUSAS_DE_NAO_RESPONDER)[number];

export type ResultadoDaPolitica =
  | {
      /** ⭐ Há política válida: o agente responde AGORA, sem escalar. */
      podeResponder: true;
      texto: string;
      politicaId: string;
      versao: number;
      escopo: "regra" | "excecao";
      /** Uma frase pronta para o rastro local. */
      paraORastro: string;
    }
  | {
      podeResponder: false;
      causa: CausaDeNaoResponder;
      detalhe: string;
      /**
       * ⚠️ Diferente de "não achei": aqui houve política e ela foi RECUSADA.
       * Quem escala precisa dizer isso ao gerente — a pergunta que ele recebe
       * muda quando existe uma decisão anterior que caiu.
       */
      houvePoliticaRecusada: boolean;
      paraORastro: string;
    };

export interface DependenciasDaConsulta {
  buscar?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  agora?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// A AVALIAÇÃO — pura, e é onde moram os dois cortes do produto.
// ═══════════════════════════════════════════════════════════════════════════

function naoResponder(
  causa: CausaDeNaoResponder,
  detalhe: string,
  houvePoliticaRecusada = false,
): ResultadoDaPolitica {
  return {
    podeResponder: false,
    causa,
    detalhe,
    houvePoliticaRecusada,
    paraORastro: houvePoliticaRecusada
      ? `⚠️ O agente ACHOU uma política e NÃO pôde usá-la (${causa}): ${detalhe}. Existe decisão anterior ` +
        "sobre este assunto, e ela não vale para este caso — quem for decidir precisa saber disso."
      : `O agente consultou as políticas e não pôde responder sozinho (${causa}): ${detalhe}.`,
  };
}

/** Data ISO que pode estar torta. `null` quando não dá para ler. */
function quando(iso: unknown): Date | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ⭐ AS QUATRO PERGUNTAS, NESTA ORDEM. Pura, sem rede, sem banco.
 *
 * A ordem é o desenho: revogação primeiro, porque uma política revogada não
 * volta a valer por ser exceção de alguém nem por estar dentro da vigência.
 */
export function avaliarPolitica(
  politica: PoliticaDoNucleo,
  ctx: { referenciaDoCliente: string; agora: Date },
): ResultadoDaPolitica {
  // ── 1. ⭐ REVOGADA — o corte do CEO, e o mais duro ────────────────────────
  //
  // `revogadaEm` no futuro ainda não revogou nada. A comparação é com o relógio
  // do turno, e não com "o campo está preenchido": uma revogação agendada para
  // semana que vem não pode calar o agente hoje.
  const revogada = quando(politica.revogadaEm);
  if (revogada && revogada.getTime() <= ctx.agora.getTime()) {
    return naoResponder(
      "politicaRevogada",
      `a política ${politica.politicaId} (v${politica.versao}) foi revogada em ` +
        `${revogada.toISOString()} e não responde mais por este assunto`,
      true,
    );
  }

  // ── 2. Vigência ──────────────────────────────────────────────────────────
  const de = quando(politica.vigenteDe);
  if (!de) {
    return naoResponder(
      "respostaIlegivel",
      `a política ${politica.politicaId} veio sem início de vigência legível`,
      true,
    );
  }
  if (de.getTime() > ctx.agora.getTime()) {
    return naoResponder(
      "aindaNaoVigente",
      `a política ${politica.politicaId} passa a valer em ${de.toISOString()}`,
      true,
    );
  }
  const ate = quando(politica.vigenteAte);
  if (politica.vigenteAte != null && !ate) {
    return naoResponder(
      "respostaIlegivel",
      `a política ${politica.politicaId} veio com fim de vigência ilegível`,
      true,
    );
  }
  if (ate && ate.getTime() < ctx.agora.getTime()) {
    return naoResponder(
      "politicaExpirada",
      `a política ${politica.politicaId} valeu até ${ate.toISOString()}`,
      true,
    );
  }

  // ── 3. ⭐ EXCEÇÃO NÃO VIRA REGRA — o segundo corte do CEO ─────────────────
  //
  // Uma condição concedida ao cliente A é fato sobre o cliente A. Reaproveitá-la
  // para o cliente B é a empresa dando, sem decidir, um desconto que ela decidiu
  // uma vez para outra pessoa — e é como uma exceção vira tabela por acidente.
  if (politica.escopo === "excecao") {
    const donos = (politica.valeApenasPara ?? []).map((r) => r.trim()).filter(Boolean);
    if (donos.length === 0) {
      return naoResponder(
        "excecaoSemDono",
        `a política ${politica.politicaId} está marcada como exceção e não diz a quem ela vale; ` +
          "exceção sem dono declarado não vale para ninguém",
        true,
      );
    }
    if (!donos.includes(ctx.referenciaDoCliente)) {
      return naoResponder(
        "excecaoNaoEReRegra",
        `a política ${politica.politicaId} é uma EXCEÇÃO concedida a outro cliente; ela não é regra da ` +
          "empresa e não se estende a quem está perguntando agora",
        true,
      );
    }
  }

  // ── 4. Há texto, e ele atravessa a barreira ──────────────────────────────
  let texto: string;
  try {
    const passagem = paraOCliente(politica);
    if (!passagem.ok) {
      return naoResponder("semRespostaAoCliente", passagem.motivo, true);
    }
    texto = passagem.texto;
  } catch (e) {
    if (e instanceof VazamentoInterno) {
      return naoResponder(
        "vazamentoInterno",
        `a barreira impediu a resposta: o texto da política ${politica.politicaId} repetia material ` +
          `interno (campo "${e.campo}")`,
        true,
      );
    }
    throw e;
  }

  return {
    podeResponder: true,
    texto,
    politicaId: politica.politicaId,
    versao: politica.versao,
    escopo: politica.escopo,
    paraORastro:
      `O agente respondeu sozinho pela política ${politica.politicaId} (v${politica.versao}, ` +
      `${politica.escopo}), consultada no Dioli Connect. Nenhuma escalada foi aberta.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A CONSULTA — rede, e ela nunca lança e nunca demora sem teto.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ "Existe política válida para isto?"
 *
 * **Nunca lança.** Quem chama está no turno de um cliente que está esperando na
 * tela; uma exceção aqui viraria o webhook reentregando a mensagem e o agente
 * respondendo duas vezes ao mesmo "oi". Tudo o que dá errado devolve
 * `podeResponder: false` com causa nomeada — e o conector segue para a escalada,
 * que é o chão que não sai do lugar.
 */
export async function consultarPolitica(
  pergunta: PerguntaDePolitica,
  deps: DependenciasDaConsulta = {},
): Promise<ResultadoDaPolitica> {
  const env = deps.env ?? process.env;
  const buscar = deps.buscar ?? fetch;
  const agora = deps.agora ?? new Date();

  const segredo = segredoDaPorta(env);
  const base = env[VARIAVEL_DA_URL_DO_NUCLEO]?.trim().replace(/\/$/, "");
  if (!segredo || !base) {
    return naoResponder(
      "nucleoNaoConfigurado",
      `o núcleo do Dioli Connect não está configurado neste ambiente (${VARIAVEL_DA_URL_DO_NUCLEO} e ` +
        `${VARIAVEL_DO_SEGREDO} precisam existir). Sem ele o agente não consulta política nenhuma e todo ` +
        "assunto fora da alçada segue direto para a escalada, como seguia antes.",
    );
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TETO_DA_CONSULTA_MS);

  let resposta: Response;
  try {
    resposta = await buscar(`${base}${CAMINHO_DA_CONSULTA_DE_POLITICA}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // ⛔ O único lugar em que o segredo aparece.
        [CABECALHO_DO_SEGREDO]: segredo,
      },
      body: JSON.stringify(pergunta),
      signal: controle.signal,
    });
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    return abortou
      ? naoResponder(
          "demorouDemais",
          `o núcleo não respondeu em ${TETO_DA_CONSULTA_MS} ms; o cliente não espera mais do que isso por ` +
            "causa de uma consulta interna",
        )
      : naoResponder(
          "nucleoInalcancavel",
          `não deu para falar com o núcleo: ${e instanceof Error ? e.message : String(e)}`,
        );
  } finally {
    clearTimeout(relogio);
  }

  let corpo: RespostaDeConsultaDePolitica;
  try {
    corpo = (await resposta.json()) as RespostaDeConsultaDePolitica;
  } catch {
    return naoResponder("respostaIlegivel", `o núcleo respondeu ${resposta.status} com um corpo que não é JSON`);
  }

  if (!resposta.ok) {
    return naoResponder("respostaIlegivel", `o núcleo respondeu HTTP ${resposta.status}`);
  }

  // ⚠️ `encontrada` tem que ser o literal `false` para valer como "não existe".
  // `undefined` não é `false`: um corpo que não traz o campo é resposta
  // ilegível, e não uma negação. Ausência de informação não é informação.
  if (corpo?.encontrada === false) {
    return naoResponder(
      "semPolitica",
      "o núcleo não tem decisão registrada para este assunto — é a primeira vez que a empresa é perguntada",
    );
  }
  if (corpo?.encontrada !== true || !corpo.politica || typeof corpo.politica !== "object") {
    return naoResponder("respostaIlegivel", "o núcleo respondeu fora do contrato da consulta de política");
  }

  return avaliarPolitica(corpo.politica, {
    referenciaDoCliente: pergunta.referenciaDoCliente,
    agora,
  });
}
