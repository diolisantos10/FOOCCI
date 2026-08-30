/**
 * ⭐⭐ QUEM PERGUNTA — o crachá de ORIGEM do despacho, e a trava que impede o
 * conector de se passar pelo Diretor quando o agente real não está cadastrado.
 *
 * ─── O DEFEITO QUE ESTE ARQUIVO FECHA (medido em produção, 30/08/2026) ──────
 *
 * O conector mandava `de: "diretor"`. Não por descuido: está escrito, por
 * extenso, no arquivo que fazia isso (`salaDeVendas/ta/consultarGerente.ts`):
 *
 *   *"`de` é uma lista fechada de dois papéis, e o agente comercial não está
 *    nela. (…) o despacho sai em nome do Diretor da Foocci, e a origem
 *    verdadeira (o TA) vai escrita na PERGUNTA e no CASO."*
 *
 * A intenção era honesta e o efeito era um beco sem saída, medido pelo CEO:
 *
 *   1. o despacho abre 201 com `de: diretor`;
 *   2. o gerente destinatário não tem alçada declarada sobre uma decisão
 *      COMERCIAL, então o núcleo escala por `alcada_nao_declarada`;
 *   3. a escalada sobe para `dioli.foocci.direcao.diretor` — **que é quem abriu
 *      a consulta**;
 *   4. o gatilho do Postgres barra: *"quem perguntou nao assina a propria
 *      resposta"*.
 *
 * Três papéis (quem pergunta, quem decide, quem recebe a escalada) colapsados
 * numa identidade só. O circuito não tinha como fechar.
 *
 * ─── ⭐ E A PREMISSA ESTAVA DESATUALIZADA: O TA EXISTE ─────────────────────
 *
 * O comentário acima dizia que o agente comercial "não está na lista". **Está.**
 * Medido no diretório corporativo consolidado, e não suposto:
 *
 *   dioli.foocci.vendas.sdr-ia-ta   ← "Agente SDR IA — TA", ficha 1.5
 *      superior: dioli.foocci.vendas.gerente-comercial
 *      fonte: 02-DEPARTAMENTOS-E-AGENTES.md, sha256 803d4b7bf861…
 *
 * O consolidador do diretório lê o MESMO markdown que está nesta árvore, e a
 * impressão digital dele bate byte a byte com o arquivo em disco. O TA não
 * precisava ser cadastrado: precisava ser **usado**.
 *
 * ─── ⛔ POR QUE A TRAVA É CÓDIGO, E NÃO UM COMENTÁRIO ──────────────────────
 *
 * Guardrail 4 desta casa: *prompt é aviso; código é trava.* A regra do CEO é
 * absoluta — *"se o agente não existir no organograma, a operação deve entrar em
 * fila de correção, nunca assumir uma identidade superior"* — e uma regra dessas
 * não sobrevive como comentário: o próximo a mexer com pressa põe de volta o
 * `?? DIRETOR` que "faz a escalada voltar a passar".
 *
 * Então aqui não existe caminho de código que devolva o Diretor quando a origem
 * não resolve. `resolverOrigem` devolve `ok: false` com motivo **próprio**
 * (`origemNaoCadastrada`), e quem chama não tem alternativa: ou tem crachá, ou
 * não despacha. A prova por mutação está em `origem.test.ts` — tirar o TA do
 * diretório deixa o teste vermelho, e nenhum caminho cai para o Diretor.
 */

/** Um crachá do diretório CORPORATIVO (o do núcleo), não do organograma interno. */
export interface CrachaCorporativo {
  /** A chave local, que é o que viaja no campo `de`/`para` do despacho. */
  chave: string;
  /** O endereço de quatro segmentos: empresa.produto.departamento.agente. */
  endereco: string;
  /** O cargo, como o catálogo o aprovou. */
  cargo: string;
  /** A quem ele responde. `null` só para quem não responde a ninguém. */
  superior: string | null;
  /**
   * ⚠️ De onde este crachá foi LIDO. Nunca "escrito aqui": cada linha abaixo
   * existe porque uma fonte a declara, e a fonte fica citada para a próxima
   * pessoa poder conferir sem acreditar em mim.
   */
  fonte: string;
}

/** O catálogo de fichas da Foocci — a fonte de onde o diretório sai. */
export const DOC_DAS_FICHAS =
  "docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md";

/** O organograma canônico — a fonte dos cargos de direção. */
export const DOC_DO_ORGANOGRAMA = "src/services/organizacao/departamentosCanonicos.ts";

/**
 * ⭐ OS CRACHÁS DA FOOCCI NO DIRETÓRIO CORPORATIVO — os que este conector usa.
 *
 * ⚠️ Esta lista **não cria ninguém**. Cada linha é a leitura de uma ficha que já
 * existe, com o número dela citado — e a chave é a que o consolidador do
 * diretório deriva do nome (`slug` menos o prefixo `agente-`), não uma escolha
 * deste arquivo.
 *
 * ⚠️ E ela é DELIBERADAMENTE curta: são os crachás que participam deste
 * circuito, não o diretório inteiro. Copiar as 34 fichas para cá criaria a
 * segunda cópia do catálogo — que é o defeito-mãe desta casa.
 */
export const DIRETORIO_DO_FOOCCI: readonly CrachaCorporativo[] = [
  {
    chave: "sdr-ia-ta",
    endereco: "dioli.foocci.vendas.sdr-ia-ta",
    cargo: "Agente SDR IA — TA",
    superior: "dioli.foocci.vendas.gerente-comercial",
    fonte: `${DOC_DAS_FICHAS} — ficha 1.5`,
  },
  {
    chave: "gerente-comercial",
    endereco: "dioli.foocci.vendas.gerente-comercial",
    cargo: "Agente Gerente Comercial",
    superior: "dioli.foocci.direcao.diretor",
    fonte: `${DOC_DAS_FICHAS} — ficha 1.1`,
  },
  {
    chave: "diretor",
    endereco: "dioli.foocci.direcao.diretor",
    cargo: "Diretor da Foocci",
    superior: "dioli.control-room.diretoria.diretor-geral",
    fonte: DOC_DO_ORGANOGRAMA,
  },
];

/**
 * ⭐ QUEM PERGUNTA: o TA da Sala de Vendas.
 *
 * É o agente que de fato atende o lead, que de fato leu a mensagem e que de fato
 * não pode decidir sozinho. A ficha 1.5 o descreve como *"a identidade pública
 * da IA comercial: é o TA que o lead vê"*, e a lista de `Escala quando:` dela é
 * exatamente o gatilho que traz o caso até aqui.
 */
export const ORIGEM_DO_CONECTOR = "sdr-ia-ta" as const;

/**
 * ⭐ QUEM DECIDE: o Agente Gerente Comercial.
 *
 * ⚠️ Mudou de `gerente-de-produto-e-ia` para cá, e a razão é a causa medida do
 * beco sem saída — não estética. O núcleo escalava por `alcada_nao_declarada`
 * porque o Gerente de Produto e IA **não tem alçada sobre decisão comercial**:
 * a ficha 3.1 governa backlog e rollout de agente. Quem governa política
 * comercial está escrito na ficha 1.1, com todas as letras: *"Único que altera
 * política comercial"*, e escala *"quando o desconto pedido passa da alçada da
 * tabela"*.
 *
 * E ele é, pela própria fonte, o superior declarado do TA. Endereçar a consulta
 * ao gerente do agente que pergunta não é hierarquia inventada: é a que a ficha
 * 1.5 já declara.
 */
export const DECISOR_DO_CONECTOR = "gerente-comercial" as const;

/**
 * ⛔ O MOTIVO PRÓPRIO da fila de correção.
 *
 * ⚠️ Ele é **distinto** de "núcleo fora do ar" de propósito, e essa distinção é
 * a metade útil da trava: as duas falhas mandam o caso para a mesma fila humana,
 * mas pedem coisas opostas de quem a pega. `portaInalcancavel` espera —
 * a rede volta sozinha. `origemNaoCadastrada` **nunca** se resolve sozinha:
 * alguém tem de cadastrar um crachá. Uma fila que não separa as duas deixa a
 * segunda esperando para sempre por uma rede que já estava boa.
 */
export const MOTIVO_ORIGEM_NAO_CADASTRADA = "origemNaoCadastrada" as const;

/**
 * ⭐ O código com que o NÚCLEO recusa um remetente que ele não conhece.
 *
 * Medido, literal, em 30/08/2026: `{"codigo":"remetente_desconhecido",…}`. Ele
 * é traduzido para o motivo próprio acima — porque do ponto de vista da fila é
 * exatamente o mesmo problema, visto do outro lado do fio.
 */
export const CODIGO_DO_NUCLEO_PARA_ORIGEM_DESCONHECIDA = "remetente_desconhecido" as const;

export type ResolucaoDaOrigem =
  | { ok: true; cracha: CrachaCorporativo }
  | { ok: false; motivo: typeof MOTIVO_ORIGEM_NAO_CADASTRADA; detalhe: string };

/** Busca uma chave no diretório. `null` quando não há — nunca um vizinho. */
export function crachaPorChave(
  chave: string,
  diretorio: readonly CrachaCorporativo[] = DIRETORIO_DO_FOOCCI,
): CrachaCorporativo | null {
  return diretorio.find((c) => c.chave === chave) ?? null;
}

/**
 * ⭐⭐ A TRAVA. Resolve o crachá de origem — ou recusa, com motivo próprio.
 *
 * ⛔ **Não existe `?? DIRETOR` aqui, e não pode passar a existir.** Este é o
 * ponto exato em que a ordem do CEO vira mecanismo: *"nunca assumir uma
 * identidade superior"*. Quem chamar isto e não tiver crachá não tem um plano B
 * — tem uma fila de correção.
 */
export function resolverOrigem(
  chave: string = ORIGEM_DO_CONECTOR,
  diretorio: readonly CrachaCorporativo[] = DIRETORIO_DO_FOOCCI,
): ResolucaoDaOrigem {
  const cracha = crachaPorChave(chave, diretorio);
  if (cracha === null) {
    return {
      ok: false,
      motivo: MOTIVO_ORIGEM_NAO_CADASTRADA,
      detalhe:
        `o agente de origem "${chave}" NÃO tem crachá no diretório corporativo da Foocci, então nenhum ` +
        "despacho saiu. ⛔ O conector não assume a identidade do Diretor para conseguir passar: quem " +
        "pergunta tem de ser quem perguntou. O caso vai para a fila de correção com este motivo, e ele " +
        "não se resolve sozinho — alguém precisa cadastrar o crachá na fonte do organograma " +
        `(${DOC_DAS_FICHAS}) e recarregar o diretório.`,
    };
  }
  return { ok: true, cracha };
}

export type ConferenciaDeIdentidades =
  | { ok: true; de: string; para: string; escalada: string | null }
  | { ok: false; motivo: string };

/**
 * ⭐ A SEGUNDA METADE DA ORDEM: *"quem pergunta, quem decide e quem recebe o
 * retorno devem ser identidades diferentes e rastreáveis"*.
 *
 * ⚠️ Isto não é redundante com a trava de cima. A origem pode existir e o
 * circuito continuar fechado em si mesmo — foi literalmente o que aconteceu:
 * `de` e a escalada eram o mesmo crachá, e o gatilho do banco foi o único a
 * perceber, **em produção**. Aqui a colisão é pega antes de sair da máquina.
 */
export function conferirIdentidades(
  chaveDeOrigem: string = ORIGEM_DO_CONECTOR,
  chaveDoDecisor: string = DECISOR_DO_CONECTOR,
  diretorio: readonly CrachaCorporativo[] = DIRETORIO_DO_FOOCCI,
): ConferenciaDeIdentidades {
  const origem = crachaPorChave(chaveDeOrigem, diretorio);
  const decisor = crachaPorChave(chaveDoDecisor, diretorio);
  if (origem === null) {
    return { ok: false, motivo: `a origem "${chaveDeOrigem}" não tem crachá no diretório` };
  }
  if (decisor === null) {
    return { ok: false, motivo: `o decisor "${chaveDoDecisor}" não tem crachá no diretório` };
  }
  if (origem.endereco === decisor.endereco) {
    return {
      ok: false,
      motivo:
        `quem pergunta e quem decide são o MESMO crachá (${origem.endereco}). Uma consulta assim não tem ` +
        "como ser respondida: o gatilho do núcleo barra quem tenta assinar a própria resposta.",
    };
  }
  // ⛔ E o terceiro papel: para quem o decisor escala. Se a escalada volta para
  // quem perguntou, o circuito é o beco sem saída de 30/08/2026 outra vez.
  if (decisor.superior !== null && decisor.superior === origem.endereco) {
    return {
      ok: false,
      motivo:
        `a escalada do decisor volta para quem perguntou (${origem.endereco}). É exatamente o beco sem ` +
        "saída medido em produção: quem abriu a consulta seria quem assina a resposta dela.",
    };
  }
  return { ok: true, de: origem.endereco, para: decisor.endereco, escalada: decisor.superior };
}
