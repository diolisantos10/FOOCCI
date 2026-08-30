/**
 * ⭐⭐ O PASSO 8 — a resposta do gerente chega DENTRO da conversa original.
 *
 * ─── É ISTO QUE FALTAVA ─────────────────────────────────────────────────────
 *
 * *"a resposta não volta"*. `respostaDoGerente: null`, escrito e não omitido, no
 * PR #178. Este arquivo é o caminho de volta, e ele é curto de propósito: a
 * parte difícil já está resolvida em `pendencias.ts` (achar a conversa certa) e
 * em `barreira.ts` (não deixar nada interno atravessar).
 *
 * ─── ⭐ QUEM INICIA O MOVIMENTO, E POR QUE NÃO É O PRODUTO ──────────────────
 *
 * **O núcleo empurra.** O produto não fica perguntando "já decidiram?" — não
 * teria como: o turno do cliente acabou, o processo do webhook morreu, e um
 * agente que fica em laço de polling é uma conta de nuvem crescendo por
 * pergunta que ninguém respondeu ainda.
 *
 * ⚠️ Consequência honesta: **o produto precisa estar de pé para receber.** Se
 * ele estiver fora do ar quando a decisão sair, quem reentrega é o núcleo. Do
 * lado de cá, o que garante que o cliente não fica órfão é outra coisa: a
 * pendência é gravada em banco, sobrevive ao restart, e o retorno que chega
 * depois acha a conversa exatamente como acharia antes. É o corte "o produto
 * perde conexão e depois volta" — e ele é testado.
 *
 * ─── A ORDEM DOS PASSOS, E ELA É O DESENHO ──────────────────────────────────
 *
 *   1. o corpo tem forma? (fail-closed, sem citar o valor inteiro)
 *   2. o protocolo casa com uma pendência PENDENTE desta conversa?
 *   3. ⛔ o texto atravessa a barreira?
 *   4. fala com o cliente
 *   5. **só então** fecha a pendência
 *
 * O 5 vem depois do 4 de propósito. Fechar antes de falar deixaria uma consulta
 * marcada como respondida com o cliente sem ter recebido nada — e ninguém
 * olharia para ela de novo. Falhar em falar mantém a pendência aberta, que é o
 * estado verdadeiro.
 */

import { paraOCliente, VazamentoInterno } from "./barreira";
import { DECISOES_DO_GERENTE, type RespostaAoRetorno, type RetornoDoNucleo } from "./contrato";
import type { LigacaoLocal } from "./ligacaoLocal";
import { casarRetorno } from "./pendencias";
import { contratoCompativel, VERSAO_DO_CONTRATO } from "./versao";

export interface DependenciasDoRetorno {
  agora?: Date;
}

/** Teto do texto que entra na conversa de um cliente. Recusa, nunca corte. */
export const MAX_RESPOSTA_AO_CLIENTE = 4_000;

/**
 * ⭐ Recebe o retorno do núcleo. **Nunca lança.**
 *
 * A rota HTTP em cima disto é uma casca de cinco linhas — de propósito, para que
 * o passo 8 inteiro seja provável sem levantar servidor, e para que os quatro
 * produtos usem esta mesma função com a rota que cada framework deles pedir.
 */
export async function receberRetorno(
  bruto: unknown,
  ligacao: LigacaoLocal,
  deps: DependenciasDoRetorno = {},
): Promise<RespostaAoRetorno> {
  const agora = deps.agora ?? new Date();

  if (!bruto || typeof bruto !== "object") {
    return { estado: "recusado", protocolo: null, motivo: "o corpo do retorno não é um objeto" };
  }
  const corpo = bruto as Partial<RetornoDoNucleo> & Record<string, unknown>;

  // ── 0. ⭐ A VERSÃO DO CONTRATO — bloqueia, não avisa (decisão C3) ─────────
  //
  // Primeiro portão de propósito: se as duas pontas não falam a mesma língua,
  // nada do que vem depois quer dizer o que parece querer dizer, e entregar
  // isso a um cliente é o pior desfecho possível.
  const compat = contratoCompativel(VERSAO_DO_CONTRATO, corpo.versaoDoContrato);
  if (!compat.compativel) {
    return { estado: "recusado", protocolo: null, motivo: compat.motivo };
  }

  // ── 1. Forma ─────────────────────────────────────────────────────────────
  if (typeof corpo.decisao !== "string" || !DECISOES_DO_GERENTE.includes(corpo.decisao as never)) {
    return {
      estado: "recusado",
      protocolo: null,
      motivo: `"decisao" precisa ser uma de: ${DECISOES_DO_GERENTE.join(", ")}`,
    };
  }
  if (typeof corpo.respostaAoCliente !== "string" || !corpo.respostaAoCliente.trim()) {
    return {
      estado: "recusado",
      protocolo: null,
      motivo:
        '"respostaAoCliente" é obrigatória e é o ÚNICO campo que vira texto para o cliente. Uma decisão ' +
        "que volta sem ela não tem como ser entregue, e o conector não redige por cima do gerente.",
    };
  }
  if (corpo.respostaAoCliente.length > MAX_RESPOSTA_AO_CLIENTE) {
    return {
      estado: "recusado",
      protocolo: null,
      motivo:
        `"respostaAoCliente" tem ${corpo.respostaAoCliente.length} caracteres; o teto é ` +
        `${MAX_RESPOSTA_AO_CLIENTE}. A recusa é de propósito: cortar entregaria ao cliente um texto ` +
        "diferente do que o gerente escreveu, sem ninguém ficar sabendo.",
    };
  }

  // ── 2. ⭐ A conversa certa ────────────────────────────────────────────────
  //
  // A leitura do banco vem do protocolo que chegou; quem decide é a comparação
  // em `casarRetorno`, que confere produto, existência e conversa gravada.
  const protocoloBruto = typeof corpo.protocolo === "string" ? corpo.protocolo.trim() : corpo.protocolo;
  const pendencia =
    typeof protocoloBruto === "string" && protocoloBruto
      ? await ligacao.armazem.porProtocolo(protocoloBruto)
      : null;

  const casamento = casarRetorno(ligacao.produto, protocoloBruto, pendencia);
  if (!casamento.ok) {
    // Retorno repetido não é erro do núcleo: é o núcleo sendo cuidadoso.
    if (casamento.causa === "jaRespondida") {
      return { estado: "duplicado", protocolo: String(protocoloBruto), motivo: casamento.motivo };
    }
    return {
      estado: "recusado",
      protocolo: typeof protocoloBruto === "string" ? protocoloBruto : null,
      motivo: `${casamento.causa}: ${casamento.motivo}`,
    };
  }

  // ── 3. ⛔ A barreira ──────────────────────────────────────────────────────
  let texto: string;
  try {
    const passagem = paraOCliente(corpo);
    if (!passagem.ok) {
      return { estado: "recusado", protocolo: casamento.pendencia.protocolo, motivo: passagem.motivo };
    }
    texto = passagem.texto;
  } catch (e) {
    if (e instanceof VazamentoInterno) {
      return {
        estado: "recusado",
        protocolo: casamento.pendencia.protocolo,
        motivo:
          `a barreira impediu a entrega: o texto externo repetia o conteúdo do campo interno ` +
          `"${e.campo}". A pendência CONTINUA aberta — o cliente não recebeu material interno e também ` +
          "não foi dado por respondido.",
      };
    }
    throw e;
  }

  // ── 4. Falar com o cliente ───────────────────────────────────────────────
  const fala = await ligacao.falarComOCliente(casamento.pendencia.conversa, texto, { agora });
  if (!fala.registrada) {
    // ⚠️ A pendência fica ABERTA. O estado verdadeiro é "ninguém recebeu".
    return {
      estado: "recusado",
      protocolo: casamento.pendencia.protocolo,
      motivo:
        `a resposta não foi registrada na conversa do cliente (${fala.causa ?? "sem causa declarada"}). ` +
        "A pendência continua aberta de propósito: fechá-la aqui daria a consulta por respondida com o " +
        "cliente sem ter recebido nada, e ninguém olharia para ela de novo.",
    };
  }

  // ── 5. Só agora, registrar — e RECEBER NÃO É ENTREGAR (decisões C4/C5) ───
  //
  // ⭐ A pendência só é dada por respondida quando o cliente RECEBEU. Quando o
  // canal não entrega sozinho, ela vai para `AGUARDANDO_ENVIO` — fila humana
  // pronta para envio, que não é verde e não conta como respondido. Não existe
  // "entregue" que signifique "alguém entrega depois".
  await ligacao.armazem.registrarResposta(casamento.pendencia.protocolo, {
    decisao: corpo.decisao,
    entregueAoCliente: fala.entregue,
    em: agora,
  });

  return {
    estado: "entregue",
    protocolo: casamento.pendencia.protocolo,
    conversa: casamento.pendencia.conversa,
    // ⚠️ As DUAS confirmações, separadas, na mesma resposta: a mensagem existe
    // na conversa (`estado: "entregue"` = recebemos e gravamos) e o cliente
    // recebeu, ou não (`entregueAoCliente`). O núcleo lê as duas.
    entregueAoCliente: fala.entregue,
  };
}
