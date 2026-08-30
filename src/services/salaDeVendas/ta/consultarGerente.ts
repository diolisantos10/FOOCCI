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
/**
 * ⚠️ DOIS NAMESPACES, E SÃO DOIS DE VERDADE.
 *
 * `cadastro.ts` tem os slugs do **organograma interno** do Foocci
 * (`diretor-foocci`, `agente-gerente-produto`), e é com eles que a porta de
 * ENTRADA deste produto trabalha. O **diretório corporativo** do Dioli Connect
 * conhece os mesmos cargos por outras chaves (`diretor`,
 * `gerente-de-produto-e-ia`) — e é para ele que este despacho vai.
 *
 * Medido contra produção em 30/08/2026: mandar o slug interno responde
 * `remetente_desconhecido`, e a escalada morre na porta sem gravar nada. A
 * ponte entre os dois registros mora no conector local, em um lugar só.
 */
/**
 * ⭐ E QUEM PERGUNTA É O TA, não o Diretor. Ver `conector/foocci/origem.ts`:
 * o `de` deste despacho é o crachá do agente que de fato atendeu o lead, e a
 * trava que impede o conector de cair para o Diretor quando ele não existir
 * mora lá, em código.
 */
import {
  CODIGO_DO_NUCLEO_PARA_ORIGEM_DESCONHECIDA,
  DECISOR_DO_CONECTOR,
  MOTIVO_ORIGEM_NAO_CADASTRADA,
  resolverOrigem,
} from "@/services/connect/conector/foocci/origem";
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
  /**
   * ⛔ O crachá do agente de ORIGEM não existe no diretório corporativo.
   *
   * ⚠️ Motivo PRÓPRIO, e distinto de todos os outros desta lista de propósito:
   * os demais são falhas de canal (rede, porta, tempo) que se resolvem sozinhas
   * ou com um retry. Esta **nunca** se resolve sozinha — alguém tem de cadastrar
   * um crachá. Quem pega a fila de correção precisa saber a diferença.
   */
  | "origemNaoCadastrada"
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
  /**
   * ⭐ O PROTOCOLO — e é ele que faz a resposta VOLTAR.
   *
   * Antes deste campo a consulta saía sem identidade: a decisão do gerente
   * chegaria ao produto e não teria como saber de qual cliente ela era. É o
   * campo que o núcleo devolve no `POST /api/connect/retorno`, e é por ele que
   * o conector acha a conversa certa (`connect/conector/pendencias.ts`).
   *
   * Opcional só porque a consulta continua funcionando sem ele — mas sem ele
   * ela é o que era no PR #178: um bilhete que sai e não volta.
   */
  protocolo?: string;
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

  // ── ⛔⭐ Portão 0: QUEM PERGUNTA existe no diretório? ────────────────────
  //
  // Antes da rede, antes do segredo, antes de tudo. A ordem do CEO é absoluta:
  // *"se o agente não existir no organograma, a operação deve entrar em fila de
  // correção, nunca assumir uma identidade superior"*.
  //
  // ⛔ Repare no que NÃO existe abaixo: um `else` que manda o Diretor. Não há
  // plano B, e é isso que faz disto uma trava em vez de uma intenção. Este
  // portão vem primeiro de propósito — se ele viesse depois do portão do
  // segredo, um ambiente sem porta configurada esconderia a origem inexistente
  // atrás de "portaNaoConfigurada", e o defeito voltaria a ser invisível.
  const origem = resolverOrigem();
  if (!origem.ok) {
    return {
      consultado: false,
      causa: MOTIVO_ORIGEM_NAO_CADASTRADA,
      detalhe: origem.detalhe,
      paraODossie: dossieDaFalha(MOTIVO_ORIGEM_NAO_CADASTRADA, origem.detalhe),
    };
  }

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
    // ⭐⭐ QUEM PERGUNTA E QUEM DECIDE — três identidades, não uma.
    //
    // ⚠️ Aqui havia `de: "diretor"`, e o comentário que justificava isso dizia
    // que *"o agente comercial não está na lista"*. **A premissa estava errada.**
    // Conferido no diretório corporativo consolidado, cuja impressão digital
    // bate byte a byte com o catálogo desta árvore: o TA tem crachá,
    // `dioli.foocci.vendas.sdr-ia-ta` (ficha 1.5), e responde ao Gerente
    // Comercial. Ele não precisava ser criado — precisava ser usado.
    //
    // O efeito do `de: diretor` foi medido em produção pelo CEO e era um beco
    // sem saída: 201 na abertura, escalada por `alcada_nao_declarada` de volta
    // para `dioli.foocci.direcao.diretor` — o mesmo crachá que abriu a consulta
    // — e o gatilho do Postgres barrando *"quem perguntou nao assina a propria
    // resposta"*. Três papéis num crachá só não fecham circuito nenhum.
    //
    // ⭐ Agora são três, e todos rastreáveis:
    //   pergunta   dioli.foocci.vendas.sdr-ia-ta          (o TA, ficha 1.5)
    //   decide     dioli.foocci.vendas.gerente-comercial  (ficha 1.1)
    //   escalada   dioli.foocci.direcao.diretor           (superior do decisor)
    //
    // ⚠️ E `para` mudou junto, por razão ESTRUTURAL: `gerente-comercial` é o
    // gerente da sala `vendas`, que é a sala onde o `sdr-ia-ta` trabalha. Quem
    // decide sobre a pergunta de um agente é o gerente da sala DELE — não o
    // gerente de outra sala que por acaso tem o assunto no nome. É a cadeia que
    // a ficha 1.5 já declara, e ela vale sem depender de alçada declarada.
    //
    // ⛔ CORREÇÃO DE UM COMENTÁRIO QUE ESTAVA AQUI. Ele dizia que a troca de
    // `para` PARAVA o `alcada_nao_declarada`. Está errado, e a medição contra
    // produção desmentiu: com `para: gerente-comercial` o despacho volta 201 e
    // o núcleo escala assim mesmo — a matriz de alçadas está vazia e vai
    // escalar até ela ser aplicada. O que a troca mudou é ONDE a escalada
    // aterrissa: `direcao.diretor` deixou de ser o remetente e passou a ser um
    // terceiro crachá. A medição inteira está em `conector/foocci/origem.ts`.
    de: origem.cracha.chave,
    para: DECISOR_DO_CONECTOR,
    assunto: assuntoDaConsulta(pedido.foraDaAlcada),
    caso: pedido.caso,
    /**
     * ⭐ O QUE ESTÁ FORA DA ALÇADA, CLASSIFICADO — e não descrito em prosa.
     *
     * ⚠️ O núcleo **recusa** o despacho sem este campo, e recusa de propósito:
     * ele não deduz assunto lendo texto corrido. Quem classifica é o produto,
     * em código (`foraDaAlcadaNaMensagem`), antes do modelo — e é a mesma
     * doutrina que já vale deste lado: a decisão de escalar não é do modelo.
     *
     * ⛔ E ele NÃO é substituível pelo `assunto`. `assunto` é uma linha de
     * metadado, com teto de 300 caracteres, que junta os nomes por vírgula para
     * caber numa coluna. Este campo é a lista estruturada, com o MOTIVO de cada
     * item — que é sobre o que o gerente decide, item a item. Mandar só o
     * `assunto` obrigaria o outro lado a desmontar a frase de volta em itens, e
     * a primeira vírgula dentro de um motivo quebraria a conta em silêncio.
     */
    foraDaAlcada: pedido.foraDaAlcada,
    // ⭐ O endereço de volta. Ver `PedidoDeConsulta.protocolo`.
    //
    // ⚠️ Vai como campo próprio, e não enfiado dentro da mensagem: a resposta
    // precisa achar a conversa por comparação exata, e um protocolo que o outro
    // lado tem que extrair de um parágrafo é um protocolo que um dia sai errado.
    ...(pedido.protocolo ? { protocolo: pedido.protocolo } : {}),
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
    // ⭐ A MESMA FALHA, VISTA DO OUTRO LADO DO FIO.
    //
    // O núcleo tem o diretório de verdade; esta casa tem uma leitura dele. Se o
    // crachá saiu de lá depois da última carga, o portão 0 passa e o núcleo
    // recusa com `remetente_desconhecido`. Isso NÃO é "a porta recusou" genérico:
    // é exatamente `origemNaoCadastrada`, e a fila de correção precisa lê-lo com
    // o mesmo nome — senão o caso vai para a fila esperando uma rede que já
    // estava boa.
    const codigo = typeof corpoDaResposta.codigo === "string" ? corpoDaResposta.codigo : null;
    if (codigo === CODIGO_DO_NUCLEO_PARA_ORIGEM_DESCONHECIDA) {
      const detalhe =
        `o núcleo NÃO reconhece o crachá de origem "${origem.cracha.chave}" ` +
        `(${origem.cracha.endereco}): ${motivo}. ⛔ Nenhum despacho saiu, e o conector não repetiu a ` +
        "consulta em nome do Diretor. O crachá existe na fonte desta casa mas não no diretório do " +
        "núcleo — o que falta é recarregar o diretório, e isso não se resolve sozinho.";
      return {
        consultado: false,
        causa: MOTIVO_ORIGEM_NAO_CADASTRADA,
        detalhe,
        paraODossie: dossieDaFalha(MOTIVO_ORIGEM_NAO_CADASTRADA, detalhe),
      };
    }
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
