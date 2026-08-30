/**
 * O ARMAZÉM DO CONNECT — o contrato de gravação e RELEITURA, sem Prisma dentro.
 *
 * Está separado da implementação (`armazem-prisma.ts`) por um motivo prático e
 * um doutrinário. O prático: `despacho.ts` fica puro e testável sem banco. O
 * doutrinário: é aqui que se lê, em uma tela, **o que esta porta escreve e o que
 * ela relê** — e a releitura é a peça inteira do projeto.
 *
 * ⚠️ Repare no que NÃO existe neste contrato: nenhum método que escreva em
 * pedido, cliente, conversa, cobrança ou qualquer tabela de negócio. As duas
 * tabelas que o Connect toca são as do laboratório de simulação, que declaram no
 * próprio código: *"stores ONLY synthetic simulation data… never writes to any
 * business table"*. O domínio operacional do Foocci não é alterado por esta
 * obra, e a forma do contrato é o que garante isso — não a boa intenção.
 */

/** A rodada como ela volta do banco — a prova relida. */
export interface LinhaDeRodadaLida {
  id: string;
  agentSlug: string;
  status: string;
  seed: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number;
  scenariosTotal: number;
  scenariosPassed: number;
  scenariosWarning: number;
  scenariosFailed: number;
  p0Count: number;
  opportunityCount: number;
  /** O JSON de metadados como está gravado. É onde o fio da conversa mora. */
  metadata: string | null;
  cenarios: {
    scenarioKey: string;
    status: string;
    severity: string;
    score: number;
    summary: string;
  }[];
  oportunidades: {
    type: string;
    severity: string;
    title: string;
    recommendation: string;
  }[];
}

/** O que a porta grava nos metadados da rodada — o registro da caixa postal. */
export interface RegistroDaCaixa {
  fio: string;
  turno: number;
  acao: string;
  de: string;
  para: string;
  /** Sempre `entregue`. Ver `caixa.ts` — a porta não escreve outra coisa. */
  estado: string;
  mensagem: string | null;
  assunto: string | null;
  em: string;
}

export interface ArmazemDoConnect {
  /** O fio: as rodadas que já aconteceram sob o mesmo identificador. */
  antecedentes(fio: string): Promise<LinhaDeRodadaLida[]>;
  /** Grava a rodada do laboratório com o registro da caixa nos metadados. */
  gravarRodada(resultado: unknown, registro: RegistroDaCaixa): Promise<{ runId: string }>;
  /** ⭐ A RELEITURA. É esta chamada que transforma "eu gravei" em prova. */
  relerRodada(runId: string): Promise<LinhaDeRodadaLida | null>;
}

/**
 * A marca que amarra uma rodada ao seu fio, dentro do campo `seed`.
 *
 * O `seed` do laboratório é a semente determinística da geração de cenários — e
 * derivá-la do fio + turno mata dois coelhos: o ensaio de um mesmo turno é
 * reproduzível, e o fio fica gravado numa **coluna consultável**, em vez de
 * enterrado num JSON. O `#t` não é enfeite: sem o separador, o fio `…:abc` seria
 * prefixo de `…:abc2` e um fio arrastaria as rodadas do outro.
 */
export function sementeDoTurno(fio: string, turno: number): string {
  return `${fio}#t${turno}`;
}

/** O prefixo com que se procuram todas as rodadas de um fio. */
export function prefixoDoFio(fio: string): string {
  return `${fio}#t`;
}

/**
 * A reconferência em código do que o banco devolveu.
 *
 * "O banco filtrou" não é o mesmo que "eu conferi": a consulta usa `startsWith`,
 * que é comparação de texto, e uma linha só conta como deste fio se o registro
 * de caixa gravado nela **disser** que é. Sem isto, bastaria alguém gravar um
 * `seed` parecido para injetar turnos falsos no histórico de outra conversa.
 */
export function linhaPertenceAoFio(linha: LinhaDeRodadaLida, fio: string): boolean {
  const registro = registroDaLinha(linha);
  return registro !== null && registro.fio === fio;
}

/** Lê o registro de caixa gravado numa linha. `null` quando não há ou não parseia. */
export function registroDaLinha(linha: LinhaDeRodadaLida): RegistroDaCaixa | null {
  if (!linha.metadata) return null;
  try {
    const bruto = JSON.parse(linha.metadata) as { connect?: unknown };
    const registro = bruto?.connect as Partial<RegistroDaCaixa> | undefined;
    if (!registro || typeof registro.fio !== "string" || typeof registro.turno !== "number") return null;
    return registro as RegistroDaCaixa;
  } catch {
    return null;
  }
}

/**
 * ⭐ QUEM ABRIU O FIO — lido do turno mais antigo, e nunca do pedido em curso.
 *
 * ─── O DEFEITO QUE ORIGINOU ESTA FUNÇÃO (achado B-4, 30/08/2026) ───────────
 *
 * A releitura já conferia que a LINHA pertence ao FIO (`linhaPertenceAoFio`).
 * Ninguém conferia que o FIO pertence a quem despacha. Medido: `diretor-geral`
 * abriu o fio com `iniciar`; `diretor-foocci` mandou `responder` no fio dele e
 * recebeu `executado`, turno 2, com o registro gravado em nome dele. Um fio sem
 * dono é uma conversa que qualquer autorizado continua no lugar do outro.
 *
 * O dono é o `de` do turno de menor número — o turno em que a conversa nasceu.
 * Não é o `de` do pedido que está chegando (isso seria o despachante assinando o
 * próprio recibo, de novo) e não é o da linha mais recente (senão bastaria um
 * turno intruso para o intruso virar dono).
 *
 * `null` quer dizer "não deu para saber quem abriu", e é diferente de "não tem
 * dono": ausência de informação não é informação, e quem chama tem que tratar os
 * dois casos diferente.
 */
export function donoDoFio(antecedentes: LinhaDeRodadaLida[]): string | null {
  let dono: string | null = null;
  let menorTurno = Number.POSITIVE_INFINITY;
  for (const linha of antecedentes) {
    const registro = registroDaLinha(linha);
    if (!registro) continue;
    if (typeof registro.de !== "string" || !registro.de.trim()) continue;
    if (registro.turno < menorTurno) {
      menorTurno = registro.turno;
      dono = registro.de;
    }
  }
  return dono;
}

/**
 * ⭐ A GARANTIA DE SANDBOX, RELIDA DO BANCO — e não afirmada pela porta.
 *
 * ─── O DEFEITO QUE ORIGINOU ESTA FUNÇÃO (achado B-2, 30/08/2026) ───────────
 *
 * A resposta trazia `runtime_tocado: false` como LITERAL escrito à mão, dentro
 * de um bloco que se declara `relido_do_banco: true`. Era o despachante
 * assinando o próprio recibo dentro do objeto que existe para provar que ele não
 * faz isso.
 *
 * Quem escreve esse campo no banco é o armazém do laboratório
 * (`persistSimulationRun`), que o reimpõe DEPOIS do que o chamador anexou — a
 * porta não consegue gravá-lo. Então ele pode ser LIDO de volta, e é isso que
 * esta função faz: devolve o que a linha diz, não o que a porta gostaria que ela
 * dissesse. `null` = a linha não declarou nada, que não é o mesmo que `false`.
 */
export function runtimeTocadoDaLinha(linha: LinhaDeRodadaLida): boolean | null {
  if (!linha.metadata) return null;
  try {
    const bruto = JSON.parse(linha.metadata) as { runtimeTouched?: unknown };
    return typeof bruto?.runtimeTouched === "boolean" ? bruto.runtimeTouched : null;
  } catch {
    return null;
  }
}
