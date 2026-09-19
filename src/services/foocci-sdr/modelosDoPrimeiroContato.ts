/**
 * ⭐ ESTÁGIO 1 — OS TRÊS MODELOS DO PRIMEIRO CONTATO, E SÓ ELES.
 *
 * ── DECISÃO DO CEO, 18/09/2026 ──────────────────────────────────────────────
 *
 * *"Esses são para abordagem e reabordagem de FRIO, porque tudo vai cair em
 * automação. O SDR pega o número do responsável por comercial do restaurante, e
 * aí usa os OUTROS templates para abordar os responsáveis."*
 *
 * São **dois estágios, e dois jogos de texto**:
 *
 *   ESTÁGIO 1 — o número frio. Objetivo: atravessar o porteiro e achar quem
 *   decide. Os três abaixo, curtos DE PROPÓSITO. Não vendem, e não devem
 *   vender: o destino esperado do número frio de restaurante é bot de pedidos,
 *   recepção ou SAC.
 *
 *   ESTÁGIO 2 — o responsável comercial, em conversa NOVA. Objetivo: apresentar
 *   o Foocci. Usa os OUTROS modelos aprovados, e este arquivo não mexe neles.
 *
 * ── ⛔ O QUE ISTO TIRA DO AR ────────────────────────────────────────────────
 *
 * Até aqui, o primeiro contato sorteava entre **todos** os modelos com "Pode
 * enviar" ligado — inclusive o panfleto de nove linhas, com emoji e quatro check
 * verdes, que foi para 750 contatos e capturou zero decisores. A partir daqui o
 * sorteio do primeiro contato é fechado nestes três nomes: nenhum outro modelo
 * entra, mesmo com o toggle ligado.
 *
 * ⚠️ O texto do panfleto **não mora neste repositório** — ele é um modelo
 * aprovado na Meta, e o que o disparava era o toggle "Pode enviar" na página do
 * app. Por isso a troca é feita aqui, no POOL, e não apagando texto nenhum:
 * retrofit, não demolição. Desligar o toggle continua sendo o ato certo na
 * tela, e este arquivo garante que, ligado ou não, ele não sai mais no primeiro
 * contato.
 *
 * ── ⛔ FAIL-CLOSED ──────────────────────────────────────────────────────────
 *
 * Se nenhum dos três estiver aprovado e liberado, a resposta é `null` — e
 * `abordarLead` recusa a abordagem. Nunca há queda para "qualquer modelo".
 * Cair no modelo errado é exatamente o defeito que isto veio consertar.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { modelosLiberadosParaEnvio, escolherAleatorio, type ModeloLiberadoParaEnvio } from "./modelosLiberados";
import {
  MODELOS_DO_LEAD_DE_FORMULARIO,
  MODELO_DE_FORMULARIO_QUE_PERGUNTA_O_RESTAURANTE,
} from "@/services/sales/leadFormularioTemplates";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * Os três, pelo nome exato. Conferidos na tela da Meta: `pt_BR · MARKETING ·
 * aprovado · Pode enviar`.
 *
 *   foocci_contato_inicial_01 — "Olá! Tudo bem? Este contato é do {{1}}, certo?"
 *   foocci_contato_inicial_02 — "Olá! Tudo bem? Falo com o {{1}} por aqui?"
 *   foocci_contato_inicial_03 — "Olá! Tudo bem?"
 *
 * ⚠️ O CORPO não é copiado para cá como verdade: a fonte continua sendo o
 * espelho da Meta (`modelos_de_vendas`), e é de lá que `abordarLead` renderiza.
 * Texto colado em código envelhece no dia em que alguém aprova outra versão.
 * Aqui ficam os NOMES, que são a chave.
 */
export const MODELOS_DO_PRIMEIRO_CONTATO = [
  "foocci_contato_inicial_01",
  "foocci_contato_inicial_02",
  "foocci_contato_inicial_03",
] as const;

/** O único que não pede variável nenhuma — ver `escolherModeloDoPrimeiroContato`. */
export const MODELO_SEM_VARIAVEL = "foocci_contato_inicial_03";

export type MotivoDaEscolha =
  | "podePreencherAVariavel"
  | "semDadoParaAVariavel"
  | "nenhumModeloDoPrimeiroContatoLiberado";

export type EscolhaDoPrimeiroContato =
  | { ok: true; modelo: ModeloLiberadoParaEnvio; motivo: MotivoDaEscolha }
  | { ok: false; motivo: MotivoDaEscolha; detalhe: string };

/**
 * ⭐ O CRITÉRIO DE ESCOLHA ENTRE OS TRÊS, em uma frase: **quem tem `{{1}}` só
 * entra quando existe dado para pôr lá.**
 *
 *   · COM dado para a variável (o nome da casa, ou o nome de quem atende, na
 *     ordem que `saudacaoDoLead` já define) → sorteia entre `_01` e `_02`. Os
 *     dois perguntam a mesma coisa de dois jeitos, e o sorteio existe para o
 *     número não mandar sempre a mesma frase.
 *   · SEM esse dado → `_03`, o único sem variável. E isto não é caso de canto:
 *     a base tem contatos sem o nome da casa, e para eles os outros dois seriam
 *     recusados pela Meta contato a contato — queimando a lista para aprender o
 *     que uma consulta responde antes de começar.
 *
 * ⚠️ Quem decide se há dado NÃO é este arquivo: é `saudacaoDoLead`, em
 * `abordar.ts`, que já é a definição da casa para "o que vai em {{1}}". Uma
 * segunda definição aqui seria a fonte de um lead preenchido de um jeito no
 * envio e julgado de outro na escolha.
 *
 * ⚠️ E o grupo "sem variável" é lido do espelho da Meta (`variaveis === 0`),
 * não do nome: se um dia o `_03` passar a pedir variável, ele sai sozinho do
 * grupo, sem ninguém precisar lembrar de mudar este arquivo.
 */
/**
 * ⭐ A ORDEM DA FILA DE TENTATIVAS — ordem do CEO, 18/09/2026:
 * *"porque se uma não dá certo, a gente tenta as outras."*
 *
 * O primeiro da fila é o MESMO que o sorteio sempre escolheu (`escolherAleatorio`,
 * uma chamada de `random`, comportamento idêntico ao de antes). O que muda é que
 * agora existe um SEGUNDO e um TERCEIRO atrás dele, na ordem do pool.
 *
 * ⚠️ `reserva` entra DEPOIS de `preferidos`, nunca misturada: os grupos não se
 * misturam, e a reserva só é alcançada quando os preferidos acabaram.
 */
function filaDeTentativas<T>(
  preferidos: readonly T[],
  reserva: readonly T[],
  random: () => number,
): T[] {
  const base = preferidos.length ? preferidos : reserva;
  const extras = preferidos.length ? reserva : [];
  const primeiro = escolherAleatorio(base, random);
  if (!primeiro) return [...extras];
  return [primeiro, ...base.filter((m) => m !== primeiro), ...extras];
}

export type CandidatosDoPrimeiroContato =
  | { ok: true; modelos: ModeloLiberadoParaEnvio[]; motivo: MotivoDaEscolha }
  | { ok: false; motivo: MotivoDaEscolha; detalhe: string };

/**
 * A FILA do estágio 1 — todos os modelos elegíveis, em ordem de tentativa.
 *
 * ⛔ A trava de grupo continua inteira: sem dado para `{{1}}`, os modelos com
 * variável **não entram na fila** — nem como último recurso. Já perdemos ~10%
 * dos disparos com variável vazia; uma fila que "tenta o `_01` mesmo assim" é
 * essa perda de volta, com outro nome.
 */
export async function candidatosDoPrimeiroContato(
  db: Cliente,
  p: { podePreencherAVariavel: boolean },
  random: () => number = Math.random,
): Promise<CandidatosDoPrimeiroContato> {
  const liberados = await modelosLiberadosParaEnvio(db);
  const doPrimeiroContato = liberados.filter((m) =>
    (MODELOS_DO_PRIMEIRO_CONTATO as readonly string[]).includes(m.nome),
  );

  if (doPrimeiroContato.length === 0) {
    return {
      ok: false,
      motivo: "nenhumModeloDoPrimeiroContatoLiberado",
      detalhe:
        "nenhum dos três modelos de primeiro contato está APPROVED e com 'Pode enviar' ligado. " +
        "A abordagem NÃO cai para outro modelo: o sorteio do primeiro contato é fechado nestes três.",
    };
  }

  const semVariavel = doPrimeiroContato.filter((m) => m.variaveis === 0);
  const comVariavel = doPrimeiroContato.filter((m) => m.variaveis > 0);

  if (!p.podePreencherAVariavel) {
    // ⛔ Só os sem variável. `comVariavel` nem entra como reserva.
    const fila = filaDeTentativas(semVariavel, [], random);
    if (fila.length === 0) {
      return {
        ok: false,
        motivo: "semDadoParaAVariavel",
        detalhe:
          `este contato não tem nome de restaurante, e nenhum modelo sem variável (${MODELO_SEM_VARIAVEL}) ` +
          "está liberado. Não se inventa o nome da casa para preencher {{1}}.",
      };
    }
    return { ok: true, modelos: fila, motivo: "semDadoParaAVariavel" };
  }

  const fila = filaDeTentativas(comVariavel, semVariavel, random);
  if (fila.length === 0) {
    return {
      ok: false,
      motivo: "nenhumModeloDoPrimeiroContatoLiberado",
      detalhe: "os três modelos de primeiro contato existem, mas nenhum ficou elegível para este contato.",
    };
  }
  return { ok: true, modelos: fila, motivo: "podePreencherAVariavel" };
}

export async function escolherModeloDoPrimeiroContato(
  db: Cliente,
  p: { podePreencherAVariavel: boolean },
  random: () => number = Math.random,
): Promise<EscolhaDoPrimeiroContato> {
  const fila = await candidatosDoPrimeiroContato(db, p, random);
  if (!fila.ok) return fila;
  return { ok: true, modelo: fila.modelos[0]!, motivo: fila.motivo };
}

/**
 * ESTÁGIO 1 ou ESTÁGIO 2 — e a distinção é a ORIGEM do contato.
 *
 * ── CORREÇÃO DE DOUTRINA, 18/09/2026 (D-0E1) ────────────────────────────────
 *
 * A primeira versão desta função devolvia `true` para qualquer origem que não
 * fosse `INDICACAO`, com o argumento de que o texto frio é "o mais contido" e
 * portanto o lado seguro da dúvida. **Estava errado, e o CEO corrigiu:**
 *
 *   *"Clientes que estão vindo da campanha do Facebook, do Instagram, ou que
 *   deixam formulário, já são leads, porque eles estão deixando o próprio
 *   contato. A lista fria não é lead."*
 *
 * Quem deixou o próprio contato PEDIU para ser chamado. Mandar a essa pessoa
 * "Olá! Tudo bem? Este contato é do {{1}}, certo?" é tratar como estranho quem
 * levantou a mão. O texto frio existe para atravessar bot de restaurante; o
 * lead de formulário não tem bot, tem uma pessoa esperando resposta.
 *
 * Então a lista é de INCLUSÃO, e curta: só as duas portas por onde NÓS fomos
 * atrás de um número que nunca falou com a gente.
 *
 * ⚠️ `INDICACAO` fica de fora de propósito: ela é o ESTÁGIO 2 — a conversa que
 * a casa abre depois de capturar o decisor.
 * ⚠️ Origem desconhecida também fica de fora: ela não vira abordagem fria "por
 * ser o texto mais contido". Para o pool de modelos ela mantém o
 * comportamento que já existia; para a CAMPANHA ela vira revisão, e quem faz
 * isso é `reabordagem/rota.ts`.
 */
export const FONTES_DO_NUMERO_FRIO = ["LISTA_PROSPECCAO", "IMPORTACAO"] as const;

export function ehPrimeiroContatoFrio(fonte: string | null | undefined): boolean {
  const f = (fonte ?? "").trim().toUpperCase();
  return (FONTES_DO_NUMERO_FRIO as readonly string[]).includes(f);
}

/**
 * ⭐ ESTÁGIO 1-B — QUEM PREENCHEU FORMULÁRIO, 18/09/2026.
 *
 * *"Essa abordagem aqui é para quem é frio. Você não precisa se preocupar com os
 * três primeiros leads, porque eles entraram através do sistema da Meta, o que
 * nos dá total autorização de a gente poder falar com eles."* — CEO
 *
 * A lista é de INCLUSÃO e explícita: são as portas por onde a PESSOA deixou o
 * próprio contato pedindo para ser chamada. Para elas existe texto próprio
 * (`foocci_lead_formulario_*`), morno, que reconhece o pedido.
 *
 * ⚠️ Autorização a casa tem; janela de 24h NÃO — a janela abre quando a pessoa
 * escreve. Por isso ainda é modelo aprovado, só que o morno.
 *
 * ⚠️ Origem desconhecida fica de fora das DUAS listas, de propósito: ela não
 * vira fria "por ser o texto mais contido" nem morna "por via das dúvidas".
 */
export const FONTES_DO_LEAD_DE_FORMULARIO = [
  "CAMPANHA_PAGA",
  "FACEBOOK",
  "INSTAGRAM",
  "FORMULARIO_DEMONSTRACAO",
  "AGENDAMENTO",
] as const;

export function ehLeadDeFormulario(fonte: string | null | undefined): boolean {
  const f = (fonte ?? "").trim().toUpperCase();
  return (FONTES_DO_LEAD_DE_FORMULARIO as readonly string[]).includes(f);
}

/**
 * ⛔ O CRITÉRIO, em uma frase: **quando a casa NÃO sabe o nome do restaurante,
 * sai o texto que PERGUNTA o nome do restaurante.**
 *
 * ⚠️ Nenhum dos três cita o nome da casa — os textos são do CEO e só usam
 * `{{1}}` (o nome da pessoa). Então a escolha não pode mais ser feita pela
 * contagem de variáveis, como no estágio 1: é pelo NOME do modelo, porque o que
 * distingue o `_03` é a PERGUNTA que ele faz, não o seu contrato com a Meta.
 *
 * Mesmo fail-closed de `escolherModeloDoPrimeiroContato`: sem modelo elegível
 * liberado, `ok: false` — nunca queda para "qualquer modelo", que é exatamente
 * como o lead de formulário receberia texto frio.
 */
export type MotivoDaEscolhaDeFormulario =
  | "jaSabeORestaurante"
  | "vaiPerguntarORestaurante"
  | "nenhumModeloDeFormularioLiberado";

export type EscolhaDoLeadDeFormulario =
  | { ok: true; modelo: ModeloLiberadoParaEnvio; motivo: MotivoDaEscolhaDeFormulario }
  | { ok: false; motivo: MotivoDaEscolhaDeFormulario; detalhe: string };

/**
 * ⛔ NÃO EXISTE RESERVA FRIA PARA O LEAD DE FORMULÁRIO — e a ausência é a trava.
 *
 * Em 18/09/2026 entrou aqui uma "reserva neutra": na falta de modelo morno
 * liberado, saía o `foocci_contato_inicial_03` ("Olá! Tudo bem?"), do jogo do
 * NÚMERO FRIO. A intenção era não deixar lead quente esperando a fila de
 * análise da Meta. O efeito era o defeito que este arquivo inteiro existe para
 * impedir: quem preencheu um formulário NOSSO recebendo o texto de abordagem a
 * desconhecido — porque "neutro" é julgamento nosso sobre o texto, não sobre o
 * que a pessoa lê depois de ter deixado nome e telefone pedindo contato.
 *
 * A régua voltou a ser fail-closed: **sem modelo de formulário liberado, não
 * sai nada**, e o motivo fica escrito e legível no raio-x. Lead não abordado
 * hoje se aborda amanhã; lead abordado como estranho não se desabordar — e o
 * custo do erro não é só o lead, é a conta na Meta.
 *
 * O caminho certo para o lead quente que não pode esperar é o modelo morno
 * aprovado (ou a conversa dentro da janela de 24h), não um empréstimo do jogo
 * frio.
 */

export type CandidatosDoLeadDeFormulario =
  | { ok: true; modelos: ModeloLiberadoParaEnvio[]; motivo: MotivoDaEscolhaDeFormulario }
  | { ok: false; motivo: MotivoDaEscolhaDeFormulario; detalhe: string };

/**
 * A FILA do estágio 1-B — os `foocci_lead_formulario_*`, em ordem de tentativa,
 * com a reserva neutra no fim.
 *
 * ⛔ A trava que não afrouxa: `foocci_contato_inicial_01/02` **nunca** entram
 * nesta fila, em nenhuma posição. Quem levantou a mão não recebe "este contato
 * é do {{1}}, certo?" — nem na primeira tentativa, nem na última. A única ponte
 * entre os grupos é o `_03`, que é neutro, e é ela e só ela.
 */
export async function candidatosDoLeadDeFormulario(
  db: Cliente,
  p: { jaSabeORestaurante: boolean },
  random: () => number = Math.random,
): Promise<CandidatosDoLeadDeFormulario> {
  const liberados = await modelosLiberadosParaEnvio(db);
  const doFormulario = liberados.filter((m) =>
    (MODELOS_DO_LEAD_DE_FORMULARIO as readonly string[]).includes(m.nome),
  );

  if (doFormulario.length === 0) {
    return {
      ok: false,
      motivo: "nenhumModeloDeFormularioLiberado",
      detalhe:
        "NADA FOI ENVIADO, de propósito: nenhum dos modelos de lead de formulário " +
        `(${MODELOS_DO_LEAD_DE_FORMULARIO.join(", ")}) está APPROVED na Meta com ` +
        "'Pode enviar' ligado. Este lead preencheu um formulário nosso, e a abordagem " +
        "NÃO cai para os textos do número frio — nem para o mais curto deles. " +
        "Para destravar: aprovar/liberar um modelo de formulário na Meta.",
    };
  }

  const perguntaORestaurante = doFormulario.filter(
    (m) => m.nome === MODELO_DE_FORMULARIO_QUE_PERGUNTA_O_RESTAURANTE,
  );
  const jaQualificam = doFormulario.filter(
    (m) => m.nome !== MODELO_DE_FORMULARIO_QUE_PERGUNTA_O_RESTAURANTE,
  );

  const preferidos = p.jaSabeORestaurante ? jaQualificam : perguntaORestaurante;
  const reserva = p.jaSabeORestaurante ? perguntaORestaurante : jaQualificam;
  // ⛔ A fila é fechada nos modelos de formulário: nada do jogo frio a fecha.
  const fila = filaDeTentativas(preferidos, reserva, random);
  if (fila.length === 0) {
    return {
      ok: false,
      motivo: "nenhumModeloDeFormularioLiberado",
      detalhe: "os modelos de formulário existem, mas nenhum ficou elegível para este lead.",
    };
  }
  return {
    ok: true,
    modelos: fila,
    motivo: p.jaSabeORestaurante ? "jaSabeORestaurante" : "vaiPerguntarORestaurante",
  };
}

export async function escolherModeloDoLeadDeFormulario(
  db: Cliente,
  p: { jaSabeORestaurante: boolean },
  random: () => number = Math.random,
): Promise<EscolhaDoLeadDeFormulario> {
  const fila = await candidatosDoLeadDeFormulario(db, p, random);
  if (!fila.ok) return fila;
  return { ok: true, modelo: fila.modelos[0]!, motivo: fila.motivo };
}
