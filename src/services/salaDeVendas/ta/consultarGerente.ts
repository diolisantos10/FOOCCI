/**
 * ⭐ O SDR CONSULTA O GERENTE — pelo Dioli Connect, e de verdade.
 *
 * ─── O CASO REAL QUE ORIGINOU ESTE ARQUIVO (30/08/2026) ─────────────────────
 *
 * Um lead escreveu, na terceira tentativa sem retorno:
 *
 *   "Preciso de resposta objetiva sobre: 1) proposta para 28–30 posts/mês,
 *    3 carrosséis/semana, ciclo de 30 dias; 2) se topam pagamento via
 *    parceria/permuta, sem dinheiro."
 *
 * O agente respondeu certo — aquilo está acima do que a tabela entrega, e
 * permuta não é coisa que ele possa autorizar — e disse: *"vou chamar agora o
 * gerente do projeto pra conversar com você."*
 *
 * **E não acontecia nada parecido com isso.** Medido: `atender.ts` chamava
 * `passarParaGente()`, que tira o lead da IA e o põe numa fila com dossiê. Isso
 * funciona e está no ar. Mas **não havia gerente nenhum sendo consultado** —
 * quem pega a fila é uma pessoa, e o orçamento ficou quatro dias parado.
 *
 * Este arquivo é o gerente que faltava.
 *
 * ─── ⚠️ O QUE ESTA CONSULTA CONSEGUE, E O QUE ELA NÃO CONSEGUE ─────────────
 *
 * Dito na frente, porque é a parte que mais fácil se leria com otimismo:
 *
 *   · **CONSEGUE:** entregar a pergunta ao gerente, com o caso do lead inteiro,
 *     registrada como operação real, com prova relida do banco.
 *   · **NÃO CONSEGUE:** voltar com a resposta dele. A porta do Connect carimba
 *     `entregue` e **nunca** `respondido` — ela não tem canal de resposta (ver
 *     `services/connect/caixa.ts`, e o motivo: "o despachante não assina o
 *     próprio recibo"). A resposta do gerente chega pelo lado dele.
 *
 * Por isso `RespostaDaConsulta.respostaDoGerente` é **sempre `null` hoje**, e é
 * um campo escrito em vez de um campo omitido: ausência de informação não é
 * informação, e quem chamar isto tem que ver que a resposta não veio.
 *
 * ─── ⭐ E POR ISSO A FILA HUMANA NÃO SAI DO LUGAR ──────────────────────────
 *
 * A consulta é o caminho MELHOR, nunca o único. `atender.ts` continua chamando
 * `passarParaGente()` exatamente como chamava, em todos os caminhos, e o cliente
 * continua recebendo o aviso de que alguém vem. Um canal novo que deixasse o
 * cliente esperando em silêncio seria pior que o defeito que ele conserta.
 *
 * Consequência direta: **esta função nunca lança e nunca demora sem teto.** Ela
 * devolve `{ consultado: false, causa }` para tudo o que der errado — porta não
 * configurada, rede fora, 4xx, 5xx, `nao_verificavel`, estouro de tempo. Quem
 * chama nem precisa de `try/catch`.
 *
 * ─── ⛔ SEGREDO ────────────────────────────────────────────────────────────
 *
 * `DIOLI_CONNECT_SECRET` é lido do ambiente, vai no cabeçalho e **não aparece em
 * lugar nenhum além dele**: não é logado, não entra em mensagem de erro, não
 * volta na causa da recusa. As causas abaixo dizem "porta não configurada", e
 * nunca qual pedaço faltou.
 */

import {
  CABECALHO_DO_SEGREDO,
  VARIAVEL_DO_SEGREDO,
  segredoDaPorta,
} from "@/services/connect/porta";
import {
  DIRETOR_DO_PRODUTO,
  GERENTE_DO_PRODUTO,
} from "@/services/connect/cadastro";
import { MODO_DE_PRODUCAO, type CasoDoLead } from "@/services/connect/contrato";

/** A variável que diz ONDE a porta do Connect atende. */
export const VARIAVEL_DA_URL = "DIOLI_CONNECT_URL";

/** O caminho da porta, um lugar só para não divergir da rota. */
export const CAMINHO_DO_DESPACHO = "/api/connect/despacho";

/**
 * O teto de espera. O lead está do outro lado desde antes desta chamada.
 *
 * Oito segundos não é um número bonito, é um número escolhido: acima disso o
 * webhook da Meta começa a reentregar a mensagem, e o agente responderia duas
 * vezes ao mesmo "oi". Estourar o teto é `consultado: false` e a fila humana
 * segue — nunca é o cliente esperando mais.
 */
export const TETO_DE_ESPERA_MS = 8_000;

export type CausaDeNaoConsultar =
  /** `DIOLI_CONNECT_SECRET` ou `DIOLI_CONNECT_URL` não configurados. */
  | "portaNaoConfigurada"
  /** A porta respondeu, e respondeu "não" — 4xx com motivo. */
  | "portaRecusou"
  /** A porta respondeu, e o acionamento não se completou — 502/`nao_verificavel`. */
  | "naoVerificavel"
  /** Não deu para falar com a porta: rede, DNS, TLS, processo. */
  | "portaInalcancavel"
  /** Estourou `TETO_DE_ESPERA_MS`. */
  | "demorouDemais"
  /** A porta respondeu algo que não é o contrato dela. */
  | "respostaIlegivel";

export type ResultadoDaConsulta =
  | {
      consultado: true;
      /** O fio da conversa com o gerente — por onde o histórico é achado. */
      fio: string;
      /** A rodada relida do banco. É a prova de que a entrega existiu. */
      rodadaId: string;
      /** O que a caixa do gerente registrou. `entregue`, sempre. */
      estadoNaCaixa: string;
      /**
       * ⚠️ `null`, sempre, hoje. A porta do Connect entrega e não colhe
       * resposta. Campo escrito, e não omitido, de propósito.
       */
      respostaDoGerente: null;
      /** Uma frase pronta para o dossiê do handoff. */
      paraODossie: string;
    }
  | {
      consultado: false;
      causa: CausaDeNaoConsultar;
      /** O detalhe, em português, sem segredo dentro. */
      detalhe: string;
      /** Uma frase pronta para o dossiê — a fila precisa saber que falhou. */
      paraODossie: string;
    };

export interface PedidoDeConsulta {
  /** O caso do lead, como o gerente precisa ler para decidir. */
  caso: CasoDoLead;
  /** Os assuntos que estão fora da alçada do agente, já com o motivo escrito. */
  foraDaAlcada: Array<{ assunto: string; motivo: string }>;
}

export interface DependenciasDaConsulta {
  /** Injetável para o teste. O padrão é o `fetch` do runtime. */
  buscar?: typeof fetch;
  /** Injetável para o teste. O padrão é `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * ⭐ O ASSUNTO DA CONSULTA — e por que ele NÃO carrega o caso dentro dele.
 *
 * `assunto` tem teto de 300 caracteres na porta e vira coluna de metadados; o
 * caso vai no campo `caso`, que tem forma conferida e teto próprio. Enfiar o
 * briefing dentro do assunto faria a porta recusar por tamanho no primeiro lead
 * que escrevesse um parágrafo — e a recusa chegaria como "assunto grande
 * demais", que não diz nada a quem estivesse depurando.
 */
export function assuntoDaConsulta(foraDaAlcada: PedidoDeConsulta["foraDaAlcada"]): string {
  const lista = foraDaAlcada.map((f) => f.assunto).join(", ");
  return `Decisão comercial fora da alçada do agente: ${lista || "não classificado"}`;
}

/**
 * A mensagem que o gerente lê. O caso viaja no campo `caso`; aqui vai a
 * PERGUNTA — o que se está pedindo que ele decida, e o motivo de o agente não
 * poder decidir sozinho.
 */
export function perguntaAoGerente(pedido: PedidoDeConsulta): string {
  const pontos = pedido.foraDaAlcada
    .map((f, i) => `${i + 1}) ${f.assunto} — ${f.motivo}`)
    .join("\n");

  return [
    "Consulta do agente comercial (TA) ao gerente. Preciso de decisão para responder a um lead que já está",
    "esperando; o caso completo vai no campo `caso` deste despacho.",
    "",
    "O que está fora da minha alçada, e por quê:",
    pontos || "(nenhum assunto classificado — ver o caso)",
    "",
    "O que eu preciso de volta: uma decisão por item, para eu poder responder. Enquanto ela não vem, o lead",
    "segue na fila humana e já foi avisado de que alguém do time vem falar com ele.",
  ].join("\n");
}

/** A frase que entra no dossiê quando a consulta deu certo. */
function dossieDoSucesso(fio: string, rodadaId: string): string {
  return (
    `O agente consultou o gerente pelo Dioli Connect: fio ${fio}, rodada ${rodadaId}, registrada como ` +
    "operação real e relida do banco. ⚠️ A porta do Connect ENTREGA e não colhe resposta — a decisão do " +
    "gerente ainda não chegou, e este lead continua precisando de quem pegue esta fila. Se a decisão já " +
    "estiver com você, responda por aqui."
  );
}

/** A frase que entra no dossiê quando a consulta NÃO aconteceu. */
function dossieDaFalha(causa: CausaDeNaoConsultar, detalhe: string): string {
  return (
    `⚠️ O agente TENTOU consultar o gerente pelo Dioli Connect e não conseguiu (${causa}): ${detalhe}. ` +
    "Ninguém do outro lado foi acionado — quem pegar esta fila é a única pessoa que sabe deste lead. A " +
    "decisão comercial abaixo continua pendente."
  );
}

/**
 * ⭐ A CONSULTA. Nunca lança, nunca demora sem teto, nunca vaza segredo.
 */
export async function consultarGerente(
  pedido: PedidoDeConsulta,
  deps: DependenciasDaConsulta = {},
): Promise<ResultadoDaConsulta> {
  const env = deps.env ?? process.env;
  const buscar = deps.buscar ?? fetch;

  // ── Portão 0: a porta está configurada? ─────────────────────────────────
  //
  // "Não configurado = fechado" é a doutrina da própria porta (`porta.ts`), e
  // aqui ela vale do lado de fora também: sem segredo ou sem URL, não se tenta.
  //
  // ⛔ A causa NÃO diz qual dos dois faltou, e isso é deliberado: "o segredo não
  // está configurado" é informação sobre o segredo, e ela não tem por que sair
  // daqui para um dossiê que uma pessoa lê na tela.
  const segredo = segredoDaPorta(env);
  const base = env[VARIAVEL_DA_URL]?.trim().replace(/\/$/, "");
  if (!segredo || !base) {
    const detalhe =
      `a porta do Dioli Connect não está configurada neste ambiente (${VARIAVEL_DA_URL} e ` +
      `${VARIAVEL_DO_SEGREDO} precisam existir; o segredo tem piso de tamanho próprio). Enquanto não ` +
      "estiver, nenhuma consulta é tentada — e o lead continua indo para a fila humana como sempre foi.";
    return {
      consultado: false,
      causa: "portaNaoConfigurada",
      detalhe,
      paraODossie: dossieDaFalha("portaNaoConfigurada", detalhe),
    };
  }

  const corpo = {
    // ⭐ Operação real, registrada como real. Ver o cabeçalho de `contrato.ts`:
    // `producao` liga a operação — e NÃO é, por si só, licença para mandar o que
    // se quiser. O `caso` viaja porque tem motivo próprio e forma conferida.
    modo: MODO_DE_PRODUCAO,
    sintetico: false,
    // ⚠️ `receber`, e não `iniciar`, e o motivo é o contrato da porta: `iniciar`
    // **recusa** `mensagem` ("quem inicia não está respondendo ninguém"), e a
    // pergunta ao gerente é justamente a mensagem. `receber` aceita a mensagem e,
    // sem `fio`, cunha um fio novo — que é exatamente o que uma consulta nova é.
    acao: "receber" as const,
    mensagem: perguntaAoGerente(pedido),
    // ⚠️ QUEM FALA, dito com honestidade sobre o que isto é e não é.
    //
    // `de` é uma lista fechada de dois papéis, e o agente comercial não está
    // nela. Eu **não** acrescentei um item: a lista saiu de auditoria hoje, e
    // mexer nela por conveniência é como as travas caem.
    //
    // O que a Sala faz é o que uma empresa faz: o agente não escreve direto ao
    // gerente de outro departamento — quem endereça é a camada de direção do
    // produto. Então o despacho sai em nome do Diretor da Foocci, e a origem
    // verdadeira (o TA) vai escrita na PERGUNTA e no CASO, para o rastro não
    // dizer que o Diretor perguntou sozinho.
    de: DIRETOR_DO_PRODUTO,
    para: GERENTE_DO_PRODUTO,
    assunto: assuntoDaConsulta(pedido.foraDaAlcada),
    caso: pedido.caso,
  };

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TETO_DE_ESPERA_MS);

  let resposta: Response;
  try {
    resposta = await buscar(`${base}${CAMINHO_DO_DESPACHO}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // ⛔ O único lugar em que o segredo aparece.
        [CABECALHO_DO_SEGREDO]: segredo,
      },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    const causa: CausaDeNaoConsultar = abortou ? "demorouDemais" : "portaInalcancavel";
    const detalhe = abortou
      ? `a porta não respondeu em ${TETO_DE_ESPERA_MS} ms e a consulta foi abortada — o cliente não espera ` +
        "mais do que isso por causa de uma consulta interna"
      : `não deu para falar com a porta do Connect: ${e instanceof Error ? e.message : String(e)}`;
    return { consultado: false, causa, detalhe, paraODossie: dossieDaFalha(causa, detalhe) };
  } finally {
    clearTimeout(relogio);
  }

  let corpoDaResposta: Record<string, unknown>;
  try {
    corpoDaResposta = (await resposta.json()) as Record<string, unknown>;
  } catch {
    const detalhe = `a porta respondeu ${resposta.status} com um corpo que não é JSON`;
    return {
      consultado: false,
      causa: "respostaIlegivel",
      detalhe,
      paraODossie: dossieDaFalha("respostaIlegivel", detalhe),
    };
  }

  const estado = typeof corpoDaResposta.estado === "string" ? corpoDaResposta.estado : null;
  const motivo = typeof corpoDaResposta.motivo === "string" ? corpoDaResposta.motivo : "(sem motivo)";

  // ── ⭐ "A porta respondeu 200" NÃO é a prova. A prova é o que voltou. ────
  //
  // Este é o mesmo defeito que o Dioli Connect inteiro existe para matar, agora
  // do lado de cá: um chamador que trata 2xx como sucesso está confiando no
  // despachante. Só `executado` COM `rodadaId` conta — e `rodadaId` é o id da
  // linha que a porta releu do banco.
  if (estado === "recusado") {
    return {
      consultado: false,
      causa: "portaRecusou",
      detalhe: `a porta recusou (HTTP ${resposta.status}): ${motivo}`,
      paraODossie: dossieDaFalha("portaRecusou", motivo),
    };
  }
  if (estado === "nao_verificavel") {
    return {
      consultado: false,
      causa: "naoVerificavel",
      detalhe: `o acionamento não se completou (HTTP ${resposta.status}): ${motivo}`,
      paraODossie: dossieDaFalha("naoVerificavel", motivo),
    };
  }

  const fio = typeof corpoDaResposta.fio === "string" ? corpoDaResposta.fio : null;
  const rodadaId = typeof corpoDaResposta.rodadaId === "string" ? corpoDaResposta.rodadaId : null;

  if (estado !== "executado" || !resposta.ok || !fio || !rodadaId) {
    const detalhe =
      `a porta respondeu HTTP ${resposta.status} com estado ${JSON.stringify(estado)}, fio ` +
      `${JSON.stringify(fio)} e rodada ${JSON.stringify(rodadaId)} — sem os três, não há entrega provada. ` +
      '"A porta respondeu ok" não é prova de que alguém foi consultado.';
    return {
      consultado: false,
      causa: "respostaIlegivel",
      detalhe,
      paraODossie: dossieDaFalha("respostaIlegivel", detalhe),
    };
  }

  const caixa = corpoDaResposta.caixa as { estado?: unknown } | undefined;
  const estadoNaCaixa = typeof caixa?.estado === "string" ? caixa.estado : "(não declarado)";

  return {
    consultado: true,
    fio,
    rodadaId,
    estadoNaCaixa,
    // A porta entrega; ela não colhe resposta. Escrito, não omitido.
    respostaDoGerente: null,
    paraODossie: dossieDoSucesso(fio, rodadaId),
  };
}
