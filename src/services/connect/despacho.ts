/**
 * O DESPACHO DO DIOLI CONNECT NO FOOCCI — quem executou é que carimba.
 *
 * ─── A MEDIÇÃO QUE ORIGINOU ESTE ARQUIVO ───────────────────────────────────
 *
 * Medido em 30/08/2026 pelo Diretor Geral, no mecanismo de acionamento da
 * plataforma: **ele devolve "sucesso" e não entrega nada.** Um despachante que
 * responde 200 por ter conseguido chamar alguém é um despachante que mente sobre
 * o mundo — e quem lê a resposta não tem como saber.
 *
 *   "O despachante disse ok é proibido como prova. Quem executou é que carimba."
 *
 * Então esta função NÃO deriva o resultado do que ela mesma fez. Ela roda o
 * agente de verdade (`runWaiterSimulation`), manda gravar, e depois **relê do
 * banco** a linha da rodada. O identificador que volta na resposta é o id
 * daquela linha, lido de volta — não um id que esta função inventou, e o
 * relatório é montado do que voltou, não do que estava na memória.
 *
 * ─── OS TRÊS ESTADOS, E O TERCEIRO NUNCA PASSA POR VERDE ───────────────────
 *
 *   executado        → há linha de rodada no banco, relida, com fim e cenários.
 *   recusado         → uma regra disse não, com o motivo, ANTES de executar.
 *   nao_verificavel  → tudo o mais: o agente estourou, a gravação falhou, a
 *                      releitura veio vazia ou veio de outro fio. NUNCA vira
 *                      sucesso, e o motivo vem junto.
 *
 * A ordem importa: `executado` só é devolvido DEPOIS da releitura. Se a
 * releitura falhar ou vier pela metade, o estado cai para `nao_verificavel`
 * mesmo com o agente tendo rodado — fail-closed até o fim.
 *
 * ─── ⚠️ O QUE UMA AUDITORIA INDEPENDENTE ENCONTROU AQUI (30/08/2026) ───────
 *
 * A arquitetura desta porta resistiu ao ataque: o segredo aguentou, a autoridade
 * barrou até o próprio Agente Gerente, a prova é relida de verdade, `acionado` é
 * impossível de gravar e `nao_verificavel` nunca chegou a 2xx. O que NÃO
 * resistiu foram três AFIRMAÇÕES sobre travas — e afirmação de trava que não
 * pode falhar é pior que trava ausente, porque ela vira ✅ falso mais tarde:
 *
 *   B-1  A "Trava 0" dizia LANÇAR "se qualquer efeito colateral estiver ligado".
 *        Não lançava e não podia: era um assert de uma constante congelada
 *        contra si mesma. Consertado por medição — ver a Trava 0 lá embaixo e
 *        `sentinela.ts`. A promessa de "acionamento sem rede" agora é um número
 *        que pode vir diferente de zero, não uma frase em comentário.
 *
 *   B-2  `runtime_tocado` e `usou_ia` eram literais escritos à mão DENTRO do
 *        bloco `prova`, que se declara `relido_do_banco: true`. O despachante
 *        assinando o próprio recibo, dentro do objeto que existe para provar que
 *        ele não faz isso. Agora `runtime_tocado` é lido do `metadata` da linha
 *        relida (quem escreve lá é o laboratório, não esta porta), e o que é
 *        MEDIDO e não relido saiu do bloco `prova` para o bloco `medicao`, que
 *        diz de onde veio.
 *
 *   B-4  O fio não tinha dono: `diretor-geral` abria a conversa e
 *        `diretor-foocci` respondia dentro dela. A releitura conferia que a
 *        LINHA pertence ao FIO; ninguém conferia que o FIO pertence a quem
 *        despacha. Ver a trava do dono, mais abaixo.
 *
 *   B-6  Erro ao ler o fio era engolido em `receber`/`iniciar`, e o artefato
 *        saía com `turnos_anteriores: 0` — indistinguível de "o fio está
 *        vazio". Agora não se lê o fio pela metade: falhou, é `nao_verificavel`.
 *
 * ─── E A CAIXA POSTAL RECEBE `entregue`, NUNCA `acionado` ──────────────────
 *
 * Ver `caixa.ts`. A porta grava que a mensagem chegou e está endereçada; quem
 * carimba `acionado` é quem lê a prova, do lado de lá. É a mesma regra vista de
 * outro ângulo: o despachante não assina o próprio recibo.
 */

import { assertSimulationSafeMode } from "@/services/simulation/SimulationSafeMode";
import { runWaiterSimulation } from "@/services/simulation/waiter/runWaiterSimulation";
import type { RunSimulationOptions } from "@/services/simulation/AgentSimulationService";
import type { SimulationRunResult } from "@/services/simulation/types";
import {
  donoDoFio,
  linhaPertenceAoFio,
  registroDaLinha,
  runtimeTocadoDaLinha,
  sementeDoTurno,
  type ArmazemDoConnect,
  type LinhaDeRodadaLida,
  type RegistroDaCaixa,
} from "./armazem";
import { PRODUTO_ID } from "./cadastro";
import {
  ESTADO_QUE_ESTA_PORTA_GRAVA,
  caixaSemRegistro,
  carimboDeEntrega,
  recusarCarimboIndevido,
  type CarimboDaCaixa,
} from "./caixa";
import { fioNovo, type PedidoConferido } from "./contrato";
import { medicaoConfiavel, medindoRede, CANAL_OBRIGATORIO, type MedicaoDeRede } from "./sentinela";
import { SELO_DE_RASCUNHO, artefatoDaRodada, type SeloDeRascunho } from "./rascunho";

/** O fio continua sendo cunhado aqui para quem já importava daqui. */
export { fioNovo };

/**
 * ⭐ A PROVA — e agora TODO campo deste bloco veio mesmo do banco.
 *
 * Era aqui que morava o achado B-2: dois campos literais (`runtime_tocado` e
 * `usou_ia`) sentados dentro de um objeto que se declara `relido_do_banco: true`.
 * Quem lesse a resposta concluiria que o banco tinha confirmado as duas coisas,
 * e o banco nunca tinha sido perguntado.
 *
 * A regra deste bloco passa a ser dura: **se um campo não foi lido da linha que
 * voltou de `relerRodada`, ele não entra aqui.** O que é medido em vez de lido
 * mora em `MedicaoDaExecucao`, com a fonte escrita.
 */
export interface ProvaDaExecucao {
  tabela: "agent_simulation_runs";
  relido_do_banco: true;
  rodadaId: string;
  agente: string;
  status: string;
  semente: string | null;
  inicio: string;
  fim: string;
  duracaoMs: number;
  cenarios: number;
  /**
   * Lido do `metadata` da própria linha relida. Quem grava esse campo é o
   * armazém do laboratório (`persistSimulationRun`), que o reimpõe DEPOIS do que
   * o chamador anexou — esta porta não consegue escrevê-lo, só lê de volta.
   */
  runtime_tocado: boolean;
}

/**
 * ⭐ O QUE FOI MEDIDO NESTA EXECUÇÃO — e que NÃO é prova relida.
 *
 * Este bloco existe para que a resposta não tenha uma zona cinzenta. Ele diz, na
 * primeira chave, que não foi lido do banco, e diz de onde veio cada número.
 * Ler "medido no processo" e ler "relido do banco" são coisas diferentes, e
 * misturar as duas dentro do mesmo objeto foi exatamente o defeito B-2.
 */
export interface MedicaoDaExecucao {
  relido_do_banco: false;
  fonte: "medido nesta execução, no processo — não lido do banco";
  /** Cenários que relataram uso de provedor de IA. Zero é o exigido. */
  cenarios_com_ia: number;
  /** Derivado de `cenarios_com_ia`, não afirmado à parte. */
  usou_ia: boolean;
  /** A contagem de saídas de rede durante o acionamento. Ver `sentinela.ts`. */
  rede: MedicaoDeRede;
  /**
   * O que o executor DECLAROU sobre si mesmo. Declaração não é prova, e por isso
   * ela mora aqui e não em `prova` — a prova equivalente é `prova.runtime_tocado`,
   * que voltou do banco.
   */
  runtime_tocado_declarado: boolean;
}

export type ResultadoDoDespacho =
  | ({
      estado: "executado";
      produto: typeof PRODUTO_ID;
      acao: string;
      de: string;
      para: string;
      agente: string;
      fio: string;
      turno: number;
      caixa: CarimboDaCaixa;
      rodadaId: string;
      prova: ProvaDaExecucao;
      medicao: MedicaoDaExecucao;
      artefato: string;
    } & SeloDeRascunho)
  | {
      estado: "recusado";
      produto: typeof PRODUTO_ID;
      acao: string;
      fio: string | null;
      turno: number;
      caixa: CarimboDaCaixa;
      motivo: string;
    }
  | {
      estado: "nao_verificavel";
      produto: typeof PRODUTO_ID;
      acao: string;
      fio: string | null;
      turno: number;
      caixa: CarimboDaCaixa;
      rodadaId: null;
      motivo: string;
    };

export interface DependenciasDoDespacho {
  armazem: ArmazemDoConnect;
  agora(): Date;
  /** Abre um fio novo. Injetável para o teste ser determinístico. */
  novoFio(): string;
  /**
   * ⭐ Injetável SÓ para provar que o acionamento cortado vira `nao_verificavel`.
   * O padrão é o agente de verdade, que roda sem chave de IA.
   */
  executar?: (opcoes: RunSimulationOptions) => Promise<SimulationRunResult>;
  /**
   * A conferência do contrato congelado do laboratório. Injetável para provar
   * que a porta para quando ela lança — não para afrouxá-la.
   *
   * ⚠️ O NOME MUDOU, e o motivo é o achado B-1: ela se chamava
   * `assegurarSandbox`, e "assegurar o sandbox" é exatamente o que ela **não**
   * faz. Ver a Trava 0.
   */
  conferirContratoDoLaboratorio?: () => void;
}

function naoVerificavel(
  pedido: PedidoConferido,
  fio: string | null,
  turno: number,
  motivo: string,
  caixa: CarimboDaCaixa = caixaSemRegistro(),
): ResultadoDoDespacho {
  return {
    estado: "nao_verificavel",
    produto: PRODUTO_ID,
    acao: pedido.acao,
    fio,
    turno,
    caixa,
    rodadaId: null,
    motivo,
  };
}

function recusado(pedido: PedidoConferido, fio: string | null, turno: number, motivo: string): ResultadoDoDespacho {
  return {
    estado: "recusado",
    produto: PRODUTO_ID,
    acao: pedido.acao,
    fio,
    turno,
    caixa: caixaSemRegistro(),
    motivo,
  };
}

function detalhe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function despachar(
  pedido: PedidoConferido,
  deps: DependenciasDoDespacho,
): Promise<ResultadoDoDespacho> {
  // ── Trava 0: o CONTRATO do laboratório, e só ele. ────────────────────────
  //
  // ⚠️ LEIA O QUE ELA É, PORQUE O COMENTÁRIO ANTIGO MENTIA (achado B-1).
  //
  // Ela dizia: "LANÇA se qualquer efeito colateral estiver ligado — envio,
  // pagamento, pedido". Isso era falso. `assertSimulationSafeMode()` sem
  // argumento confere o `SIMULATION_SAFE_MODE`, que é um `Object.freeze` com os
  // seis campos seguros ESCRITOS NO CÓDIGO. Não lê env, nem flag, nem config,
  // nem estado nenhum. Era um assert de uma constante contra si mesma: nenhuma
  // entrada e nenhum ambiente conseguiam fazê-la lançar, e os únicos testes que
  // a viam lançar passavam um objeto adulterado à mão.
  //
  // O que ela É, dito certo: uma conferência de INTEGRIDADE do contrato do
  // laboratório. Ela pega o caso em que alguém, um dia, trocar aqueles seis
  // campos ou passar outro objeto — e é útil por isso, e só por isso. Ela não
  // sabe nada sobre o ambiente e não deve fingir que sabe.
  //
  // A promessa que o comentário antigo fazia foi MOVIDA para onde ela se
  // sustenta, mais abaixo: a sentinela de rede, que mede, e cujo número pode
  // vir diferente de zero.
  try {
    (deps.conferirContratoDoLaboratorio ?? assertSimulationSafeMode)();
  } catch (e) {
    return recusado(
      pedido,
      pedido.fio,
      0,
      `o contrato congelado do laboratório não confere, e a porta não roda contra um laboratório adulterado: ` +
        `${detalhe(e)}. O laboratório declara seis capacidades desligadas (envio, pagamento, criação de ` +
        "pedido, efeito colateral, dry-run e modo de simulação); se alguma delas deixar de estar desligada no " +
        "contrato, nada executa.",
    );
  }

  // ── O fio: `iniciar` sempre abre um novo; os outros continuam o que veio. ─
  const fio = pedido.acao === "iniciar" || !pedido.fio ? fioNovo(deps.novoFio()) : pedido.fio;

  // ── ⭐ O histórico. E ele é PORTÃO para os três verbos (achado B-6). ──────
  //
  // Antes, o erro de leitura só derrubava `responder`; em `receber` e `iniciar`
  // ele era engolido e o artefato saía com `turnos_anteriores: 0`. Quem lesse
  // não conseguia distinguir "o fio está vazio" de "não consegui ler o fio" — e
  // essas duas coisas não são a mesma coisa em lugar nenhum desta casa.
  //
  // Pior: em `receber` COM fio, a leitura falha, o turno nasce como 1 dentro de
  // uma conversa que já tem turnos, e a trava do dono (logo abaixo) não teria
  // antecedente nenhum para conferir. O silêncio não era só feio, era um desvio.
  //
  // O custo, dito com honestidade: uma falha passageira de leitura agora impede
  // até `iniciar`, que definicionalmente não tem histórico. É o lado certo para
  // errar — quem não conseguiu ler o banco também não vai conseguir gravar nele,
  // e "não deu para saber" tem estado próprio nesta porta justamente para isto.
  let antecedentes: LinhaDeRodadaLida[] = [];
  try {
    antecedentes = (await deps.armazem.antecedentes(fio)).filter((l) => linhaPertenceAoFio(l, fio));
  } catch (e) {
    return naoVerificavel(
      pedido,
      fio,
      0,
      `a leitura do fio ${fio} falhou, e histórico que não foi lido não vira "histórico vazio": ${detalhe(e)}. ` +
        'Ausência de informação não é informação — o artefato diria "turnos_anteriores: 0" e quem lesse não ' +
        "teria como distinguir isso de uma conversa que realmente não começou.",
    );
  }

  if (pedido.acao === "responder" && antecedentes.length === 0) {
    return recusado(
      pedido,
      fio,
      0,
      `o fio ${fio} não tem nenhum turno gravado neste banco: não existe conversa para responder. Histórico ` +
        'que não pode ser lido não pode ser continuado — para abrir conversa nova, a ação é "iniciar".',
    );
  }

  // ── ⭐ A TRAVA DO DONO DO FIO (achado B-4) ───────────────────────────────
  //
  // O furo, medido: `diretor-geral` abriu o fio com `iniciar`; `diretor-foocci`
  // mandou `responder` NO FIO DELE e recebeu `executado`, turno 2, com o
  // registro gravado em nome de quem invadiu. A releitura conferia que a LINHA
  // pertence ao FIO; ninguém conferia que o FIO pertence a quem despacha.
  //
  // A conferência vale para TODO verbo que continue um fio existente — não só
  // `responder`. `receber` também aceita `fio` e também emenda turno; deixar a
  // trava só em `responder` seria fechar a porta apontada e deixar a vizinha
  // aberta. `iniciar` não passa por aqui porque o fio dele acabou de ser cunhado
  // e não tem antecedente nenhum: quem inicia vira o dono.
  //
  // ⚠️ E O QUE ESTA TRAVA **NÃO** É, para ninguém ler nela mais do que ela dá:
  // ela amarra o fio ao PAPEL declarado em `de`, e `de` é afirmado pelo próprio
  // chamador — quem prova a chamada é o segredo da porta, que é UM só para os
  // dois papéis autorizados. Ou seja: ela impede que uma conversa seja
  // continuada em nome de outro papel, e deixa isso auditável no rastro; ela NÃO
  // é uma fronteira de autenticação entre `diretor-geral` e `diretor-foocci`,
  // porque os dois apresentam o mesmo segredo. Separar de verdade exigiria
  // segredo por papel, e isso é decisão do CEO, não desta função.
  if (antecedentes.length > 0) {
    const dono = donoDoFio(antecedentes);
    if (!dono) {
      return naoVerificavel(
        pedido,
        fio,
        0,
        `o fio ${fio} tem turno gravado mas nenhum deles diz quem o abriu, e sem dono não dá para saber se ` +
          `"${pedido.de}" está continuando a própria conversa ou a de outro. Ausência de informação não é ` +
          "informação: sem o dono, não se emenda turno.",
      );
    }
    if (dono !== pedido.de) {
      return recusado(
        pedido,
        fio,
        0,
        `o fio ${fio} foi aberto por "${dono}" e quem está despachando é "${pedido.de}": conversa dos outros ` +
          "não se continua. O fio é a memória de UMA conversa, e emendar turno na conversa alheia faria o " +
          'rastro dizer que os dois falaram como um só. Para falar sobre o mesmo assunto, a ação é "iniciar" ' +
          "— ela abre um fio seu.",
      );
    }
  }

  const turno = antecedentes.length + 1;
  const semente = sementeDoTurno(fio, turno);

  // ── ⭐ O ACIONAMENTO, COM A SENTINELA DE REDE ABERTA (achado B-1) ────────
  //
  // Aqui é para onde a promessa da Trava 0 foi movida, e aqui ela se sustenta:
  // a janela mede as saídas de rede do processo enquanto o agente roda, e
  // devolve um NÚMERO. Ele pode vir diferente de zero — troque o executor por um
  // que chame um provedor de IA e a porta reprova. É a diferença entre uma
  // trava e uma frase.
  //
  // Ver `sentinela.ts` para o que ela não faz: ela mede, não impede, e a janela
  // é do processo e não da requisição.
  let resultado: SimulationRunResult;
  let rede: MedicaoDeRede;
  try {
    const medido = await medindoRede(() =>
      (deps.executar ?? runWaiterSimulation)({
        seed: semente,
        scenarioCount: pedido.cenarios,
        mode: "DIAGNOSTIC",
        now: deps.agora(),
        // Nenhum restaurante: a rodada é sintética e não pertence a ninguém real.
        restaurantId: null,
        // Nenhum exemplo de conversa real entra em ensaio de homologação.
        examples: [],
      }),
    );
    resultado = medido.valor;
    rede = medido.rede;
  } catch (e) {
    return naoVerificavel(pedido, fio, turno, `o agente lançou antes de concluir: ${detalhe(e)}`);
  }

  // Não medir não é medir zero: se o canal por onde sairia a chamada de IA não
  // pôde ser instrumentado, esta porta não tem como afirmar rede zero — e o que
  // ela não pode afirmar, ela não certifica.
  if (!medicaoConfiavel(rede)) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `a sentinela de rede não conseguiu instrumentar o canal "${CANAL_OBRIGATORIO}" (instrumentou ` +
        `${JSON.stringify(rede.canais)}), então esta execução não foi medida. Não medir não é medir zero: ` +
        "sem a medição, a promessa de acionamento sem rede não pode ser certificada.",
    );
  }
  if (rede.chamadas > 0) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `o acionamento saiu para a rede ${rede.chamadas} vez(es) (destinos vistos: ` +
        `${JSON.stringify(rede.destinos)}), e esta porta promete um ensaio que roda sem credencial e sem rede. ` +
        "O que não cumpre a promessa não é certificado: nem como sucesso, nem como custo zero.",
    );
  }

  // ── O que voltou do agente ainda NÃO é prova, mas já pode ser desqualificado. ─
  //
  // Isto aqui é DECLARAÇÃO do executor sobre si mesmo, e por isso vale pouco
  // sozinho — com o executor real ela é um literal na origem
  // (`AgentSimulationService.ts`), exatamente como o auditor apontou em B-2. Ela
  // fica como desqualificador barato de um executor injetado que se declare
  // sujo; quem carrega o peso é a medição de rede, acima, e a releitura do
  // `runtime_tocado` do banco, mais abaixo.
  if (resultado.runtimeTouched !== false) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      "a rodada voltou sem a declaração de que o runtime não foi tocado — sem essa garantia a execução não " +
        "pode ser certificada como sandbox, e não vira verde por insistência",
    );
  }
  const comIA = resultado.scenarios.filter((c) => c.output.usedLLM !== false).length;
  if (comIA > 0) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `${comIA} cenário(s) desta rodada relataram uso de provedor de IA, e esta porta promete acionamento sem ` +
        "credencial. O que não cumpre a promessa não é certificado: nem como sucesso, nem como custo zero",
    );
  }
  if (resultado.scenariosTotal === 0 || resultado.status === "FAILED") {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `o agente não completou nenhum cenário (status ${resultado.status}) — acionamento que não produziu ` +
        "trabalho nenhum não é acionamento",
    );
  }

  // ── A gravação. E ela é do registro da caixa junto com a rodada. ─────────
  const registro: RegistroDaCaixa = {
    fio,
    turno,
    acao: pedido.acao,
    de: pedido.de,
    para: pedido.para,
    // Literal, e vindo da única fonte que existe para esta palavra.
    estado: ESTADO_QUE_ESTA_PORTA_GRAVA,
    mensagem: pedido.mensagem,
    assunto: pedido.assunto,
    em: deps.agora().toISOString(),
  };

  // A trava do carimbo, no CAMINHO DE ESCRITA e não sobre uma constante.
  //
  // ⚠️ Honestidade sobre o que ela vale hoje: `registro.estado` acabou de ser
  // preenchido com o literal duas linhas acima, então ela não tem como falhar
  // agora — é o mesmo formato de tautologia que o achado B-1 pegou, e por isso
  // está dito aqui em vez de escondido. O que ela ganha por estar AQUI, e não
  // dentro de `carimboDeEntrega()`, é o dia em que `registro` passar a ser
  // montado de outro jeito: a trava está no objeto que vai para o banco, que é
  // onde `acionado` causaria dano. Quem a exercita de verdade é o teste, que
  // chama `recusarCarimboIndevido` com outro valor de propósito.
  recusarCarimboIndevido(registro.estado);

  let runId: string;
  try {
    const gravado = await deps.armazem.gravarRodada(resultado, registro);
    runId = gravado?.runId ?? "";
  } catch (e) {
    return naoVerificavel(pedido, fio, turno, `a gravação da rodada falhou: ${detalhe(e)}`);
  }
  if (!runId) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      "o agente rodou mas nenhuma rodada foi gravada — sem carimbo de quem executou, não há o que verificar",
    );
  }

  // ── ⭐ A RELEITURA. Daqui para baixo, só o que voltou do banco vale. ──────
  let linha: LinhaDeRodadaLida | null = null;
  try {
    linha = await deps.armazem.relerRodada(runId);
  } catch (e) {
    return naoVerificavel(pedido, fio, turno, `a releitura da rodada ${runId} falhou: ${detalhe(e)}`);
  }

  if (!linha) {
    return naoVerificavel(pedido, fio, turno, `a rodada ${runId} não voltou do banco — "eu gravei" não é prova de que gravou`);
  }
  if (!linha.finishedAt || linha.scenariosTotal === 0) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `a rodada ${runId} está no banco sem fim ou sem cenário nenhum — execução pela metade não é execução`,
    );
  }
  if (!linhaPertenceAoFio(linha, fio)) {
    const lido = registroDaLinha(linha);
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `a rodada ${runId} voltou do banco sem o registro de caixa deste fio (li ${JSON.stringify(lido?.fio ?? null)} ` +
        `e esperava ${JSON.stringify(fio)}) — prova de outra conversa não prova esta`,
    );
  }

  // ── ⭐ E O `runtime_tocado` VEM DO BANCO, não da nossa boa vontade (B-2). ─
  //
  // `null` aqui é "a linha não declarou nada", que não é `false`. As duas coisas
  // reprovam, e por motivos diferentes — o motivo diz qual foi.
  const runtimeTocado = runtimeTocadoDaLinha(linha);
  if (runtimeTocado !== false) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `a rodada ${runId} voltou do banco ${
        runtimeTocado === null
          ? "sem declarar `runtimeTouched` nos metadados"
          : "declarando `runtimeTouched: true` nos metadados"
      } — a garantia de que o runtime não foi tocado é escrita pelo laboratório e RELIDA daqui, nunca ` +
        "afirmada por esta porta. Sem ela na linha, não há sandbox provado, e sem sandbox provado não há verde.",
    );
  }

  // ── Só agora. E o carimbo da caixa é `entregue` — nunca `acionado`. ──────
  return {
    estado: "executado",
    // O selo vem no primeiro nível: quem lê a resposta não precisa abrir o
    // artefato para saber que isto é rascunho.
    ...SELO_DE_RASCUNHO,
    produto: PRODUTO_ID,
    acao: pedido.acao,
    de: pedido.de,
    para: pedido.para,
    agente: linha.agentSlug,
    fio,
    turno,
    caixa: carimboDeEntrega(),
    rodadaId: linha.id,
    prova: {
      tabela: "agent_simulation_runs",
      relido_do_banco: true,
      rodadaId: linha.id,
      agente: linha.agentSlug,
      status: linha.status,
      semente: linha.seed,
      inicio: linha.startedAt.toISOString(),
      fim: linha.finishedAt.toISOString(),
      duracaoMs: linha.durationMs,
      cenarios: linha.scenariosTotal,
      runtime_tocado: runtimeTocado,
    },
    medicao: {
      relido_do_banco: false,
      fonte: "medido nesta execução, no processo — não lido do banco",
      cenarios_com_ia: comIA,
      usou_ia: comIA > 0,
      rede,
      runtime_tocado_declarado: resultado.runtimeTouched,
    },
    artefato: artefatoDaRodada(pedido, fio, turno, linha, antecedentes),
  };
}
