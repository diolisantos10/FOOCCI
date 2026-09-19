/**
 * A PONTE — o pedaço que faltava entre "temos o contato" e "a mensagem saiu".
 *
 * ── O BURACO, LEVANTADO EM 07/09/2026 ───────────────────────────────────────
 *
 * A máquina de prospecção da casa está inteira: importação de lote, base legal
 * obrigatória, portão de abordagem fria, teto diário, interruptor, tela. E era
 * **toda de leitura**. Nada nela alcançava o envio. Uma casa que sabe dizer
 * quem abordar e não sabe abordar.
 *
 * Este arquivo é o único caminho por onde uma abordagem sai. Um só, de
 * propósito: dois caminhos para falar com estranho é como se perde a conta do
 * que a empresa disse a quem.
 *
 * ── AS CINCO TRAVAS, NESTA ORDEM E POR ESTE MOTIVO ─────────────────────────
 *
 *   1. **O portão do lead** — fala do DESTINATÁRIO: pediu silêncio? tem
 *      telefone? o consentimento ainda vale? já tentamos demais?
 *   2. **O freio de ritmo** — fala de NÓS: quantas já saíram nesta hora e neste
 *      dia. Vem depois do portão porque recusar por ritmo alguém que nem podia
 *      ser abordado esconderia o motivo verdadeiro.
 *   3. **Gravar antes de enviar** — o pior caso vira uma linha PENDENTE
 *      visível, e não um cliente que recebeu sem o sistema saber.
 *   4. **A Supervisora** (desde 12/09/2026) — uma SEGUNDA opinião, agora com a
 *      linha PENDENTE já existindo, sobre se ESTE É O MOMENTO de mandar o
 *      template a ESTE lead (frequência, repetição, opt-out). Ela nunca
 *      reescreve o template — só libera ou barra. Ver
 *      `supervisora/adequacaoDoTemplate.ts`; em OFF/SHADOW nunca impede.
 *   5. **A entrega** — e o resultado dela é registrado na própria linha, com o
 *      motivo por escrito quando a Meta recusa.
 *
 * ── ⚠️ O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────
 *
 * **Não percorre lista.** Ele aborda UM lead. Quem varre uma lista chamando
 * isto em laço é outro arquivo, e é lá que mora a decisão de quantos por vez —
 * com o freio dizendo não muito antes de a lista acabar.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { registrarSaida, confirmarEnvio, registrarFalhaDeEnvio } from "./conversa";
import { conferirRitmo } from "./freioDeRitmo";
import {
  avaliarContatoDeLead,
  avaliarAbordagemDeProspeccao,
  recusaDeProspeccao,
  recusaDeSilencio,
  pediuSilencio,
  REGRA,
  type LeadSafetyDecision,
  type LeadBlockReason,
} from "@/services/foocci-sdr/LeadContactSafety";
import { contarAbordagensDeHoje } from "./prospeccao/selecao";
import { parametrosDoEnvioAgora } from "@/services/foocci-sdr/modelosDaMeta";
import { escolherModeloLiberado, modelosLiberadosParaEnvio } from "@/services/foocci-sdr/modelosLiberados";
import {
  ehPrimeiroContatoFrio,
  ehLeadDeFormulario,
  candidatosDoLeadDeFormulario,
  candidatosDoPrimeiroContato,
} from "@/services/foocci-sdr/modelosDoPrimeiroContato";
import {
  classificarErroDaMeta,
  type FamiliaDeErroDaMeta,
} from "@/services/foocci-sdr/familiasDeErroDaMeta";
import type { ModeloLiberadoParaEnvio } from "@/services/foocci-sdr/modelosLiberados";
import {
  canalDeVendasPronto,
  enviarModeloDeVendas,
  type ModeloDeAbordagem,
} from "@/services/foocci-sdr/FoocciSalesChannel";
import { avaliarAdequacaoDoTemplate, type HistoricoDeAbordagens } from "./supervisora/adequacaoDoTemplate";
import { reservarEnvio } from "./travaDeRepeticao";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type ResultadoDaAbordagem =
  | { abordou: true; mensagemId: string }
  | {
      abordou: false;
      motivo:
        | "leadNaoExiste"
        /** O portão do lead recusou. `detalhe` traz o motivo declarado por ele. */
        | "portaoRecusou"
        /** O modelo exige uma variável que este contato não tem. Linha ruim da lista, não defeito do canal. */
        | "semDadoParaOModelo"
        /** Teto de abordagens da hora ou do dia. Não é falha — é o freio. */
        | "ritmo"
        | "naoConseguiuGravar"
        | "aMetaRecusou"
        /** A Supervisora avaliou o momento/frequência desta abordagem e
         *  impediu o envio (GUARD/INTERVENTION). Ver
         *  `supervisora/adequacaoDoTemplate.ts` — o texto do template NUNCA é
         *  alterado por ela; só liberado ou barrado. Em SHADOW/OFF este
         *  motivo nunca acontece. */
        | "supervisoraRecusou"
        /**
         * ⛔ A trava de repetição recusou: este conteúdo já saiu para este
         * número, ou outra abordagem saiu há menos que o intervalo mínimo.
         * Não é defeito do canal — é o portão do CONTEÚDO fazendo o trabalho.
         */
        | "travaDeRepeticao"
        /**
         * ⛔ Pediram um modelo pelo NOME (`modeloForcado`) e ele não está
         * APPROVED na Meta com "Pode enviar" ligado. Fail-closed de propósito:
         * forçar modelo é escolher O TEXTO, nunca pular a aprovação dele.
         */
        | "modeloNaoLiberado";
      detalhe: string;
      /**
       * ⭐ A FAMÍLIA DO ERRO DA META — só existe quando `motivo` é
       * `aMetaRecusou`, e existe para uma pergunta só: **quem chama pode
       * tentar OUTRO MODELO?**
       *
       * Antes de 19/09/2026 o chamador de fora (`abordarAgora`) só recebia o
       * `motivo` e a string de `detalhe`, e decidia por lista de EXCLUSÃO:
       * "aMetaRecusou não está na lista do que encerra, então tenta o
       * próximo". Isso transformou uma chamada que a Meta ACEITOU — e que o
       * `fetch` perdeu no caminho, sem código de erro — em uma segunda
       * mensagem para a mesma pessoa. Foi o que o lead Jones Sartori recebeu
       * quatro vezes.
       *
       * Com a família por escrito, a régua de `familiasDeErroDaMeta.ts` vale
       * IGUAL dentro e fora desta função: só `doModelo` desce a fila.
       * `desconhecido` (e é onde cai a chamada perdida) PARA.
       */
      familiaDoErroDaMeta?: FamiliaDeErroDaMeta;
    };

/**
 * O modelo configurado para abordagem.
 *
 * Mantido para conferências/rotinas legadas. O envio real não usa mais este
 * valor: ele sorteia somente entre modelos APPROVED marcados como "Pode enviar".
 */
export function modeloConfigurado(env: NodeJS.ProcessEnv = process.env): {
  nome: string;
  idioma: string;
} {
  return {
    nome: (env.FOOCCI_SDR_MODELO_ABORDAGEM ?? "").trim(),
    idioma: (env.FOOCCI_SDR_MODELO_IDIOMA ?? "pt_BR").trim(),
  };
}

/**
 * O primeiro nome, para `{{1}}`.
 *
 * ⚠️ Função separada e exportada de propósito. Quando o texto exato do modelo
 * chegar da Meta, é AQUI que a ordem e a quantidade das variáveis mudam — e o
 * teste que guarda isso não precisa saber de banco nem de envio.
 *
 * Nome vazio vira `null`, e não string vazia: `enviarModeloDeVendas` recusa
 * variável vazia, e é melhor não mandar do que mandar "Olá , tudo bem?".
 */
export function primeiroNome(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim();
  if (!limpo) return null;

  // Lead cujo "nome" é o próprio telefone não vira saudação. Chamar alguém de
  // "5511" é pior que não chamar pelo nome.
  if (/^[\d\s()+-]+$/.test(limpo)) return null;

  return limpo.split(/\s+/)[0] ?? null;
}

/**
 * ⭐ A SAUDAÇÃO DO MODELO — e por que ela não é `primeiroNome` para todo mundo.
 *
 * ── O DEFEITO QUE ISTO EVITA, medido no arquivo de 4.880 contatos ───────────
 *
 * A lista de prospecção é de ESTABELECIMENTOS, não de pessoas. A coluna "Nome"
 * traz `.it Pizza`, `100% Espetos`, `Bar do Zé`. Cortar no primeiro espaço, que
 * é o certo para gente, produz:
 *
 *     "Olá .it"        "Olá 100%"        "Olá Bar"
 *
 * Isso é pior que não saudar: parece defeito, porque é. E a lista tem 4.880.
 *
 * ── COMO A DECISÃO É TOMADA SEM ADIVINHAR ───────────────────────────────────
 *
 * Não por heurística de texto ("parece nome de empresa?"), que erraria em
 * "Marina Gambarini Restaurante" e em "Zé". Pela PROVENIÊNCIA, que o dado já
 * carrega: `fonte = LISTA_PROSPECCAO` é uma lista de negócios; um lead do
 * formulário do site é uma pessoa que digitou o próprio nome.
 *
 * O guarda contra telefone-como-nome continua valendo nos dois casos.
 */
export function saudacaoDoLead(lead: {
  nome: string | null;
  restaurante: string | null;
  fonte: string | null;
}): string | null {
  if (lead.fonte === "LISTA_PROSPECCAO") {
    // O estabelecimento inteiro. `restaurante` primeiro porque é o campo
    // dedicado; `nome` cobre a lista cuja coluna se chamava "Nome" e trazia o
    // estabelecimento — que é exatamente o arquivo de São Paulo.
    const bruto = (lead.restaurante ?? lead.nome ?? "").trim();
    if (!bruto) return null;
    if (/^[\d\s()+-]+$/.test(bruto)) return null;
    return bruto;
  }

  return primeiroNome(lead.nome);
}

/**
 * O texto que vai gravado na conversa junto com o modelo.
 *
 * A linha da conversa precisa dizer alguma coisa legível: uma bolha vazia na
 * tela do vendedor é pior que uma bolha que diz qual modelo saiu.
 */
export function resumoDoModelo(modelo: ModeloDeAbordagem): string {
  const vars = modelo.parametros.length ? ` (${modelo.parametros.join(" · ")})` : "";
  return `[modelo: ${modelo.nome}]${vars}`;
}

/**
 * Renderiza palavra por palavra o corpo aprovado que a Meta enviará.
 * O nome técnico do modelo continua em `templateNome`; `texto` é reservado ao
 * conteúdo humano que apareceu no WhatsApp.
 */
export function renderizarCorpoDoModelo(
  corpo: string,
  parametros: string[],
): { ok: true; texto: string } | { ok: false; falta: string } {
  const texto = corpo.replace(/\{\{(\d+)\}\}/g, (marcador, numero: string) => {
    const valor = parametros[Number(numero) - 1];
    return valor == null || valor.trim() === "" ? marcador : valor;
  });

  const pendente = texto.match(/\{\{\d+\}\}/)?.[0];
  if (pendente) return { ok: false, falta: `não foi possível renderizar ${pendente} do modelo aprovado` };
  return { ok: true, texto };
}

interface LeadParaAbordar {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  optOutAt: Date | null;
  consentAt: Date | null;
  createdAt: Date;
  lastContactedAt: Date | null;
  restaurante: string | null;
  fonte: string | null;
  cidade: string | null;
}

/**
 * O `select` de `LeadParaAbordar` — UM SÓ, para quem grava e para quem só
 * confere.
 *
 * ⛔ Nasceu do defeito de 11/09/2026: `cidade` faltava neste `select` dentro de
 * `abordarLead`, e nenhum teste percebeu porque o duplo de banco ignorava o
 * argumento. Uma segunda cópia deste objeto em `diagnosticarAbordagem` seria a
 * MESMA classe de defeito com um nome novo — o diagnóstico aprovaria um
 * contato que o envio real recusaria, ou vice-versa, por um campo que os dois
 * `select`s pararam de concordar sobre. Por isso é uma constante, uma vez.
 */
const SELECT_LEAD_PARA_ABORDAR = {
  id: true,
  nome: true,
  whatsapp: true,
  optOutAt: true,
  consentAt: true,
  createdAt: true,
  lastContactedAt: true,
  restaurante: true,
  fonte: true,
  cidade: true,
} as const;

/**
 * A fonte que diz que este lead veio de uma lista fria. Uma constante porque a
 * string aparece em três arquivos e um erro de digitação aqui manda o lead para
 * o portão errado — em silêncio, e para o lado permissivo se fosse ao contrário.
 */
export const FONTE_DE_LISTA = "LISTA_PROSPECCAO";

/**
 * ⭐⭐ QUAL PORTÃO ESTE LEAD ATRAVESSA — decisão do Diretor Geral, 08/09/2026.
 *
 * ── O DEFEITO QUE ISTO CONSERTA, medido na primeira rodada real ─────────────
 *
 * A fila consultava `avaliarAbordagemDeProspeccao` (o **frio**) e o envio
 * consultava `avaliarContatoDeLead` (o **morno**). Dez itens saíam liberados da
 * fila e os dez eram barrados no envio — `portaoRecusou: 10`, com o token ainda
 * por cima.
 *
 * Os dois portões respondem perguntas diferentes **de propósito**:
 *
 *   · frio  — *"quem mandou abordar declarou por que temos este contato?"*
 *   · morno — *"esta pessoa entregou os dados, e há quanto tempo?"*
 *
 * Perguntar a segunda a quem nunca preencheu formulário nenhum não é rigor: é a
 * pergunta errada. E ela vinha sendo respondida com uma mentira — ver a trava 2
 * em `abordarLead`.
 *
 * ── ⚠️ ORIGEM DESCONHECIDA CAI NO MAIS RESTRITIVO ──────────────────────────
 *
 * `fonte` nula, vazia ou qualquer valor que não seja `LISTA_PROSPECCAO` vai para
 * o **morno**. A escolha é deliberada e é a única segura: se um dia alguém criar
 * uma fonte nova e esquecer de classificá-la, o erro tem de ser *"não falamos
 * com quem podíamos"*, nunca *"falamos com quem não podíamos"*.
 *
 * ── E O QUE NÃO MUDA EM NENHUM DOS DOIS ─────────────────────────────────────
 *
 * Silêncio pedido (opt-out) é a regra 1 dos dois portões, terminal e
 * inviolável. O **teto do dia** também vale igual, e vale por fora: ele é a
 * trava 2 de `abordarLead` (`conferirRitmo`), que roda depois do portão,
 * qualquer que tenha sido o portão.
 */
type PortaoDoLead =
  | { portao: "morno" }
  | { portao: "frio"; baseLegal: string; prospeccaoLiberada: boolean; descansoHoras: number }
  | { portao: "recusado"; decisao: LeadSafetyDecision };

export async function escolherPortaoDoLead(
  db: Cliente,
  lead: { id: string; fonte: string | null; optOutAt: Date | null },
  agora: Date,
): Promise<PortaoDoLead> {
  /**
   * ⚠️ O SILÊNCIO PEDIDO VEM ANTES DE TUDO — inclusive antes de saber qual é o
   * portão. Achado da revisão adversarial do `qualidade`, 08/09/2026.
   *
   * A primeira versão desta função devolvia recusas próprias (lote pausado,
   * lote inexistente) ANTES de qualquer portão rodar. Consequência medida: um
   * lead que pediu silêncio, num lote pausado, era barrado com
   * `PROSPECCAO_DESLIGADA` em vez de `LEAD_OPT_OUT`.
   *
   * O bloqueio acontecia — mas o motivo mentia, e é o motivo que as camadas de
   * cima classificam (`bloqueioPassaSozinho`, `reagirA`) e que a pessoa lê na
   * tela. Alguém liberaria o lote achando que resolveu.
   *
   * `LeadContactSafety.ts` escreve a regra que isso violava: *"o motivo
   * devolvido é sempre o primeiro que se aplica — e é por isso que 'ela pediu
   * para parar' nunca é encoberto por 'está fora do horário'"*. Nem por "o lote
   * está pausado".
   */
  if (pediuSilencio(lead.optOutAt)) {
    return {
      portao: "recusado",
      decisao: recusaDeSilencio(),
    };
  }

  if (lead.fonte !== FONTE_DE_LISTA) return { portao: "morno" };

  // O lote é quem declara a base legal. Sem ele, não há o que declarar.
  const item = await db.itemDeProspeccao.findFirst({
    where: { leadId: lead.id },
    orderBy: { criadoEm: "desc" },
    select: { lote: { select: { situacao: true, proveniencia: true } } },
  });

  if (!item) {
    return {
      portao: "recusado",
      decisao: recusaDeProspeccao(
        "PROSPECCAO_SEM_BASE_LEGAL",
        "O lead diz vir de lista, e não há lote que o autorize — sem isso não se aborda ninguém.",
      ),
    };
  }
  // ⚠️ NÃO checa mais `item.lote.situacao` — ordem de 11/09/2026: a operação
  // por lotes foi removida, e lote pausado deixou de impedir envio. A ÚNICA
  // coisa que o lote continua fornecendo aqui é a `proveniencia`, que é a base
  // legal declarada (checada logo acima: sem lote não há o que declarar).

  const config = await db.prospeccaoConfig.findUnique({ where: { id: "singleton" } });

  /**
   * ⭐ O TETO DO DIA DA PROSPECÇÃO, lido AQUI e não só na fila.
   *
   * Achado da revisão adversarial: o doc de `prospeccaoLiberada` promete *"e
   * ainda cabe no teto do dia?"*, e a primeira versão desta função não
   * respondia essa parte. Quem entra pelo botão "Abordar" do painel **não passa
   * pela fila** — então o teto que o dono configurou (hoje, dez por dia) não
   * valia para ele.
   *
   * A contagem é **a mesma função da fila**, importada, e não uma segunda
   * escrita aqui. O cabeçalho dela diz por quê: *"o teto só é teto se todo
   * mundo ler do mesmo lugar"*. Duas contagens do mesmo teto é como se manda o
   * dobro sem ninguém perceber.
   */
  const ligada = Boolean(config?.outboundLigado) && !config?.pausadoEm;
  const tetoDoDia = config?.limiteDiario ?? 0;
  const usadosHoje = ligada ? await contarAbordagensDeHoje(db, agora) : 0;

  return {
    portao: "frio",
    baseLegal: item.lote.proveniencia ?? "",
    // Sem configuração a resposta é "desligada", nunca "sem limite" — a mesma
    // leitura da fila, e a inversão oposta ("0 = sem limite") é a que esvazia
    // uma lista de 4.000 num dia.
    prospeccaoLiberada: ligada && usadosHoje < tetoDoDia,
    // ── O CONFIGURÁVEL SÓ APERTA, NUNCA AFROUXA ── idêntico à fila, e de
    // propósito: se as duas leituras divergirem, a que manda é a que vier por
    // último — e seria esta, no caminho que fala com estranhos.
    descansoHoras: Math.max(REGRA.descansoHoras, config?.horasEntreAbordagens ?? REGRA.descansoHoras),
  };
}

/**
 * ⭐ A DECISÃO DO PORTÃO, JÁ COM A AVALIAÇÃO — reaproveitada por quem ENVIA
 * (`abordarLead`) e por quem só DIAGNOSTICA (`diagnosticarAbordagem`).
 *
 * Escolhe o portão (`escolherPortaoDoLead`) e chama a função de avaliação
 * correta para ele — a MESMA escolha, os MESMOS parâmetros, nos dois
 * caminhos. Extraída em 11/09/2026 porque copiar este bloco para o
 * diagnóstico seria a segunda definição de "o portão aprova este lead?" —
 * exatamente o anti-padrão que este arquivo nomeia noutros lugares: duas
 * cópias da mesma decisão divergem, e a que diverge é sempre a que ninguém
 * lembra de atualizar.
 */
async function avaliarPortaoDoLead(
  db: Cliente,
  lead: LeadParaAbordar,
  agora: Date,
): Promise<LeadSafetyDecision> {
  // Quantas vezes a Foocci já falou com esta pessoa. Contado de verdade — e por
  // isso `historicoConhecido: true` logo abaixo pode ser afirmado. Chutar zero
  // aqui e declarar o histórico como conhecido seria mentir para o portão.
  const tentativas = await db.leadMensagem.count({
    where: { leadId: lead.id, direcao: "SAIDA" },
  });

  const escolha = await escolherPortaoDoLead(db, lead, agora);

  return escolha.portao === "recusado"
    ? escolha.decisao
    : escolha.portao === "frio"
      ? avaliarAbordagemDeProspeccao({
          telefone: lead.whatsapp,
          optOutAt: lead.optOutAt,
          tentativas,
          ultimoContatoEm: lead.lastContactedAt,
          historicoConhecido: true,
          canalPronto: canalDeVendasPronto(),
          prospeccaoLiberada: escolha.prospeccaoLiberada,
          baseLegalDeclarada: escolha.baseLegal,
          descansoHoras: escolha.descansoHoras,
          agora,
        })
      : avaliarContatoDeLead({
          telefone: lead.whatsapp,
          optOutAt: lead.optOutAt,
          /**
           * ⚠️ SEM `?? lead.createdAt`, e a remoção é o coração desta mudança.
           *
           * Esta linha era `lead.consentAt ?? lead.createdAt`, com um
           * comentário dizendo que `createdAt` "é o instante do formulário".
           * **Para um lead que veio de formulário, é.** Para um lead que a
           * própria casa acabou de materializar de uma lista fria, `createdAt`
           * é o instante em que **NÓS** criamos a ficha — e o portão o lia
           * como consentimento fresquíssimo, liberando por zero dias de idade.
           *
           * Era exatamente a mentira que o portão frio foi construído para
           * não contar: *"registraria como consentimento da pessoa um ato da
           * empresa"*. Ela entrava aqui, calada, pela porta dos fundos.
           *
           * Agora `consentAt` nulo é `CONSENTIMENTO_DESCONHECIDO` — bloqueio,
           * não presunção. É mais restritivo de propósito: lead sem registro
           * de quando entregou os dados **não** é abordado por este portão.
           */
          consentimentoEm: lead.consentAt,
          tentativas,
          ultimoContatoEm: lead.lastContactedAt,
          historicoConhecido: true,
          canalPronto: canalDeVendasPronto(),
          agora,
        });
}

/**
 * Aborda UM lead com o modelo aprovado.
 *
 * `autorUserId` é obrigatório e não tem padrão: toda mensagem que sai em nome
 * da empresa tem um responsável, e "o sistema mandou" não é resposta para o dia
 * em que alguém perguntar quem falou com aquela pessoa.
 */
export async function abordarLead(
  db: Cliente,
  params: {
    leadId: string;
    /**
     * Quem responde por esta mensagem.
     *
     * ⚠️ Sem padrão, de propósito — a mesma razão que `entrega.ts` dá para
     * `quemMandou`: um padrão faria a chamada nova herdar "pessoa" por omissão,
     * e a declaração voltaria a depender de quem escreve o código lembrar dela.
     *
     * `SISTEMA` é a rodada automática. Ela **não** é anônima: o responsável
     * continua sendo uma pessoa — quem liberou o lote —, e é esse id que vem em
     * `autorUserId`. A promessa do cabeçalho original está mantida.
     */
    autor: "HUMANO" | "SISTEMA";
    autorUserId: string;
    agora?: Date;
    /**
     * ⭐ O MODELO ESCOLHIDO À MÃO — 18/09/2026, porta `abordar-agora`.
     *
     * Ausente (o padrão, e o de toda chamada que já existia): nada muda, o pool
     * sorteia como sempre. Presente: este nome, e só ele — se não estiver
     * APPROVED com "Pode enviar", a resposta é `modeloNaoLiberado`, NUNCA um
     * sorteio de consolação. Cair em outro modelo por não achar o pedido é
     * exatamente o defeito que o pool fechado do primeiro contato consertou.
     *
     * ⚠️ Forçar o modelo escolhe o TEXTO. Não pula o portão, nem o freio, nem a
     * Supervisora, nem a trava de repetição, nem a montagem de variáveis —
     * modelo cujo `{{n}}` não tem fonte continua sendo `semDadoParaOModelo`.
     */
    modeloForcado?: string;
    /**
     * ⛔ "TENTA DE NOVO NESTE LEAD" — e a lista do que isto ignora é FECHADA.
     *
     * Ignora EXATAMENTE dois motivos do portão, os dois que dizem "já falamos
     * com esta pessoa": `TETO_DE_TENTATIVAS` e `DESCANSO_ATIVO`. Nada mais.
     *
     * Continuam barrando, com esta chave ligada e com ela desligada:
     * `LEAD_OPT_OUT` (lei, não configuração), `LEAD_SEM_TELEFONE`,
     * `LEAD_TELEFONE_INVALIDO`, `CANAL_INDISPONIVEL`, os dois do
     * consentimento, `HISTORICO_DESCONHECIDO`, `FORA_DA_JANELA`,
     * `PROSPECCAO_SEM_BASE_LEGAL` e `PROSPECCAO_DESLIGADA` — além do freio de
     * ritmo, da Supervisora e da trava de repetição, que rodam depois e não
     * sabem desta chave.
     *
     * A lista é de INCLUSÃO, e por isso motivo novo que apareça amanhã em
     * `LeadBlockReason` nasce BARRANDO. Uma lista de exclusão faria o
     * contrário — e o lado errado da dúvida aqui é falar com quem não podia.
     */
    ignorarJaContatado?: boolean;
  },
): Promise<ResultadoDaAbordagem> {
  const agora = params.agora ?? new Date();

  // ⛔ CORREÇÃO, 11/09/2026 — `cidade` faltava neste `select`. `montarParametros`
  // sempre recebia `lead.cidade === undefined`, e todo modelo cuja {{2}} pede
  // cidade recusava TODO contato como `semDadoParaOModelo`, mesmo para quem
  // tinha cidade cadastrada — a coluna existia no banco e nunca chegava aqui.
  const lead = (await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: SELECT_LEAD_PARA_ABORDAR,
  })) as LeadParaAbordar | null;

  if (!lead) {
    return { abordou: false, motivo: "leadNaoExiste", detalhe: params.leadId };
  }

  // ── Trava 1: o portão do lead, ESCOLHIDO PELA ORIGEM ───────────────────
  const decisaoDoPortao = await avaliarPortaoDoLead(db, lead, agora);
  const decisao = perdoarJaContatado(decisaoDoPortao, params.ignorarJaContatado === true);

  if (!decisao.sendable) {
    return {
      abordou: false,
      motivo: "portaoRecusou",
      detalhe: `${decisao.reason ?? "sem motivo"}: ${decisao.detail ?? ""}`.trim(),
    };
  }

  // ── Trava 2: o freio de ritmo ──────────────────────────────────────────
  //
  // ⭐ O TETO DO DIA VALE NOS DOIS PORTÕES, e é por isso que ele mora AQUI e não
  // dentro de nenhum deles: qualquer que tenha sido o portão, a mensagem ainda
  // passa por este freio antes de sair. Colocá-lo dentro dos portões criaria
  // duas contagens do mesmo teto — e duas contagens do mesmo teto é como se
  // manda o dobro sem ninguém perceber.
  const ritmo = await conferirRitmo(db, agora);
  if (!ritmo.pode) {
    return { abordou: false, motivo: "ritmo", detalhe: ritmo.detalhe };
  }

  // ⭐⭐ DOIS ESTÁGIOS, DOIS JOGOS DE TEXTO — decisão do CEO, 18/09/2026.
  //
  // ESTÁGIO 1 (número frio): só os três `foocci_contato_inicial_*`. São curtos
  // de propósito — o destino esperado de um número frio de restaurante é bot de
  // pedidos, recepção ou SAC, e estes textos existem para atravessar o porteiro
  // sem queimar o número, NÃO para vender.
  //
  // ⛔ É aqui que o panfleto de nove linhas sai do caminho de abordagem: o
  // sorteio do primeiro contato deixa de correr sobre TODOS os modelos com
  // "Pode enviar" ligado e passa a correr só sobre os três. Nenhum texto foi
  // apagado do repositório — o panfleto nunca morou aqui, ele é um modelo
  // aprovado na Meta, e o que o disparava era o toggle da página do app.
  //
  // ESTÁGIO 2 (o responsável comercial, em conversa NOVA aberta depois da
  // captura do decisor — `fonte = INDICACAO`): continua sorteando entre os
  // outros modelos liberados, que são os que apresentam o Foocci de verdade.
  // Nada muda para ele.
  // ⭐⭐ A FILA DE MODELOS — ordem do CEO, 18/09/2026:
  // *"porque se uma não dá certo, a gente tenta as outras."*
  //
  // Antes daqui, a abordagem escolhia UM modelo; se a Meta recusasse, a
  // mensagem morria e o lead ficava sem nada. Agora cada estágio devolve uma
  // FILA, e o laço abaixo desce por ela.
  //
  // ⛔ Os grupos não se misturam dentro da fila — essa trava mora nos próprios
  // `candidatos*` e não foi afrouxada: lead de formulário nunca alcança
  // `foocci_contato_inicial_01/02`, nem na última posição.
  let candidatos: ModeloLiberadoParaEnvio[];
  if (params.modeloForcado) {
    // ⛔ FILA DE UM. Modelo forçado fecha a fila no nome pedido — quem chama a
    // porta de "abordar agora" já declarou a ordem que quer, e sortear outro no
    // lugar seria desobedecer em silêncio. A fonte continua sendo o espelho da
    // Meta, a mesma de todos os outros ramos: forçado não é inventado.
    const liberados = await modelosLiberadosParaEnvio(db);
    const achado = liberados.find((m) => m.nome === params.modeloForcado);
    if (!achado) {
      return {
        abordou: false,
        motivo: "modeloNaoLiberado",
        detalhe:
          `o modelo "${params.modeloForcado}" não está APPROVED na Meta com "Pode enviar" ligado. ` +
          "Nenhum outro foi sorteado no lugar dele.",
      };
    }
    candidatos = [achado];
  } else if (ehPrimeiroContatoFrio(lead.fonte)) {
    const fila = await candidatosDoPrimeiroContato(db, {
      // A pergunta é sobre o DADO, não sobre o modelo — e quem responde o que
      // vai em `{{1}}` já é `saudacaoDoLead`. Sem ela, o modelo com variável
      // nem entra na fila: ~10% dos disparos já se perderam com variável vazia.
      podePreencherAVariavel: Boolean(saudacaoDoLead(lead)),
    });
    if (!fila.ok) {
      return { abordou: false, motivo: "semDadoParaOModelo", detalhe: fila.detalhe };
    }
    candidatos = fila.modelos;
  } else if (ehLeadDeFormulario(lead.fonte)) {
    // ⭐ ESTÁGIO 1-B — quem preencheu formulário/campanha PEDIU o contato.
    const fila = await candidatosDoLeadDeFormulario(db, {
      jaSabeORestaurante: Boolean((lead.restaurante ?? "").trim()),
    });
    if (!fila.ok) {
      return { abordou: false, motivo: "semDadoParaOModelo", detalhe: fila.detalhe };
    }
    candidatos = fila.modelos;
  } else {
    const um = await escolherModeloLiberado(db);
    candidatos = um ? [um] : [];
  }

  if (candidatos.length === 0) {
    return {
      abordou: false,
      motivo: "semDadoParaOModelo",
      detalhe: "nenhum modelo aprovado está marcado como Pode enviar; nada foi enviado",
    };
  }

  // ⚠️ CONTADO ANTES de qualquer `registrarSaida`, e é essencial que seja: a
  // linha PENDENTE desta MESMA abordagem ainda não existe neste ponto. Contar
  // DEPOIS de gravar faria a abordagem se contar como "a última abordagem",
  // sempre "0.0h atrás". Fica FORA do laço pelo mesmo motivo: a segunda volta
  // não pode enxergar a linha que a primeira acabou de gravar.
  const historico = await historicoDeAbordagens(db, lead.id, lead.optOutAt);

  // ⭐ O DIÁRIO DA FILA — qual modelo foi tentado, em que ordem, e por que cada
  // um caiu. Não só o último erro: sem a lista inteira, amanhã ninguém consegue
  // dizer se o problema era o TEXTO ou a CONTA, que é exatamente a pergunta que
  // custou o dia 18/09/2026.
  const tentativas: string[] = [];
  /** Quantas de fato bateram na Meta — as puladas por falta de fonte não contam. */
  let bateramNaMeta = 0;
  const anotar = (nome: string, porque: string) =>
    tentativas.push(`${tentativas.length + 1}) ${nome}: ${porque}`);
  const diario = () => `modelos tentados — ${tentativas.join(" | ")}`;

  for (const [posicao, modeloPersistido] of candidatos.entries()) {
    // ⛔ SÓ ENTRA NA TENTATIVA O MODELO CUJAS VARIÁVEIS TÊM FONTE. Modelo sem
    // dado para `{{1}}` não vira disparo com variável vazia: ele é pulado, e a
    // fila segue para o próximo. Isto não é falha de envio — nada bateu na Meta.
    const montagem = montarParametros(modeloPersistido.variaveis, {
      ...lead,
      proveniencia: await provenienciaDoLead(db, lead),
    });
    if (!montagem.ok) {
      anotar(modeloPersistido.nome, `nem tentado — sem fonte para a variável: ${montagem.falta}`);
      continue;
    }

    const modelo: ModeloDeAbordagem = {
      nome: modeloPersistido.nome,
      idioma: modeloPersistido.idioma,
      parametros: montagem.parametros,
    };

    const textoIntegral = renderizarCorpoDoModelo(modeloPersistido.corpo, modelo.parametros);
    if (!textoIntegral.ok) {
      anotar(modeloPersistido.nome, `nem tentado — corpo não renderizou: ${textoIntegral.falta}`);
      continue;
    }

    // ── Trava 3: gravar antes de enviar ────────────────────────────────────
    const gravada = await registrarSaida(db, {
      leadId: lead.id,
      texto: textoIntegral.texto,
      autor: params.autor,
      autorUserId: params.autorUserId,
      tipo: "TEMPLATE",
      templateNome: modelo.nome || null,
      agora,
    });

    if (!gravada.ok) {
      // ⛔ Falha NOSSA, de banco — não é caso de tentar outro modelo: o próximo
      // bateria na mesma parede, e cada volta grava mais uma linha.
      const porque = gravada.causa === "naoGravou" ? `naoGravou: ${gravada.detalhe}` : gravada.causa;
      return { abordou: false, motivo: "naoConseguiuGravar", detalhe: porque };
    }

    // ── ⭐ A SUPERVISORA ────────────────────────────────────────────────────
    const revisaoDoTemplate = await avaliarAdequacaoDoTemplate(db, {
      mensagemId: gravada.mensagemId,
      leadId: lead.id,
      autor: params.autor,
      autorUserId: params.autorUserId,
      historico,
      agora,
    });

    if (!revisaoDoTemplate.prosseguir) {
      // ⛔ NUNCA `registrarFalhaDeEnvio`: FALHOU é vocabulário da Meta, não de
      // uma decisão de qualidade. E NUNCA tentar outro modelo: a Supervisora
      // falou do MOMENTO desta abordagem, não do texto — trocar de texto seria
      // contornar o veredito dela.
      return {
        abordou: false,
        motivo: "supervisoraRecusou",
        detalhe: revisaoDoTemplate.motivoDeRetencao ?? "retido pela Supervisora",
      };
    }

    // ── ⛔ TRAVA 3.5: A TRAVA DE REPETIÇÃO ─────────────────────────────────
    const reserva = await reservarEnvio(db, {
      telefone: lead.whatsapp,
      conteudo: textoIntegral.texto,
      natureza: "abordagem",
      leadId: lead.id,
      origem: "abordar.ts",
      // Da segunda volta em diante é a MESMA abordagem tentando outro texto —
      // a anterior não chegou a ninguém. O ritmo já foi reservado na primeira
      // volta; a trava de CONTEÚDO continua valendo em todas.
      retentativaDaMesmaAbordagem: posicao > 0 && bateramNaMeta > 0,
      agora,
    });

    if (!reserva.liberado) {
      // ⛔ Para, e não desce a fila: a trava falou do NÚMERO (já saiu isto, ou
      // saiu algo há pouco), não do texto. Descer a fila aqui seria mandar
      // outra mensagem ao mesmo número no intervalo que a trava acabou de
      // proibir — a repetição de volta com outro texto.
      return { abordou: false, motivo: "travaDeRepeticao", detalhe: reserva.detalhe };
    }

    // ── Trava 4: a entrega ─────────────────────────────────────────────────
    const envio = await enviarModeloDeVendas(decisao, lead.whatsapp ?? "", modelo);

    // ⛔⛔ ACEITAÇÃO COM `wamid` **É** SUCESSO — E A FILA ENCERRA AQUI.
    //
    // A Meta aceita a chamada, devolve o `wamid` e a mensagem fica PENDENTE; o
    // `failed`, quando vem, vem DEPOIS, por webhook. Esperar o `delivered`
    // para chamar de sucesso seria esperar o que esta função não tem como
    // esperar — e o preço de errar aqui já foi pago: outro modelo sai para
    // quem acabou de receber o primeiro.
    if (envio.ok) {
      await confirmarEnvio(db, {
        mensagemId: gravada.mensagemId,
        waMessageId: envio.providerMessageId ?? `local:${gravada.mensagemId}`,
      });
      return { abordou: true, mensagemId: gravada.mensagemId };
    }

    // ⛔⛔ A DISTINÇÃO QUE EVITA QUEIMAR O NÚMERO. A tabela mora em
    // `familiasDeErroDaMeta.ts`; aqui só se obedece a ela.
    bateramNaMeta++;
    const erro = envio.error ?? "erro sem motivo";
    const classe = classificarErroDaMeta(envio.errorCode);
    anotar(
      modeloPersistido.nome,
      `${erro} [codigo=${classe.codigo ?? "sem codigo"} · familia=${classe.familia}] ${classe.explicacao}`,
    );

    // O diário INTEIRO vai para a linha, e não só o erro desta volta: é a linha
    // da mensagem que responde amanhã "era o texto ou era a conta?".
    await registrarFalhaDeEnvio(db, { mensagemId: gravada.mensagemId, erro: diario() });

    if (classe.familia !== "doModelo") {
      // ⛔ PARA. Nenhum outro modelo passa — foi a conta, o destinatário, o
      // limite ou a credencial. Repetir aqui só gasta tentativa e piora a
      // reputação do número. Desconhecido cai aqui também, de propósito.
      return {
        abordou: false,
        motivo: "aMetaRecusou",
        detalhe: `PAROU a fila (familia=${classe.familia}, não é o modelo que está errado) — ${diario()}`,
        familiaDoErroDaMeta: classe.familia,
      };
    }
  }

  // Fila esgotada. O motivo carrega a lista do que foi tentado — nunca só o
  // último erro.
  return {
    abordou: false,
    motivo: bateramNaMeta > 0 ? "aMetaRecusou" : "semDadoParaOModelo",
    detalhe: tentativas.length
      ? `acabaram os modelos elegíveis — ${diario()}`
      : "nenhum modelo elegível para este contato; nada foi enviado",
    // A fila só chega ao fim descendo por erro DO MODELO — qualquer outra
    // família teria dado `return` lá dentro. Declarar isso permite ao chamador
    // de fora seguir tentando os modelos DELE sem adivinhar pela string.
    ...(bateramNaMeta > 0 ? { familiaDoErroDaMeta: "doModelo" as const } : {}),
  };
}


/**
 * ⭐ OS DOIS ÚNICOS MOTIVOS QUE `ignorarJaContatado` PERDOA.
 *
 * Separada e exportada de propósito: a lista do que pode ser afrouxado é a
 * parte perigosa desta porta, e ela precisa de teste próprio, sem banco e sem
 * envio. Um `if` solto dentro de `abordarLead` seria a mesma regra sem nome e
 * sem régua.
 *
 * ⚠️ É uma lista de INCLUSÃO. Motivo novo em `LeadBlockReason` nasce barrando.
 */
export const MOTIVOS_DE_JA_CONTATADO: readonly LeadBlockReason[] = [
  "TETO_DE_TENTATIVAS",
  "DESCANSO_ATIVO",
];

export function perdoarJaContatado(
  decisao: LeadSafetyDecision,
  ignorarJaContatado: boolean,
): LeadSafetyDecision {
  if (decisao.sendable) return decisao;
  if (!ignorarJaContatado) return decisao;
  if (!decisao.reason || !MOTIVOS_DE_JA_CONTATADO.includes(decisao.reason)) return decisao;

  return {
    sendable: true,
    reason: null,
    detail: `liberado por ignorarJaContatado (o portão dizia ${decisao.reason}: ${decisao.detail})`,
  };
}

/**
 * Monta EXATAMENTE `quantas` variáveis para o modelo, ou diz o que falta.
 *
 * ── A ORDEM DAS VARIÁVEIS É O CONTRATO ─────────────────────────────────────
 *
 * `{{1}}` é a saudação (primeiro nome, ou o nome do restaurante quando não há
 * pessoa). `{{2}}`, quando o modelo aprovado pedir, é a cidade. Trocar as duas
 * de lugar manda o nome do restaurante onde deveria ir a cidade — e a Meta
 * aceita numa boa: quem vê o erro é o cliente.
 *
 * ⚠️ Não inventa conteúdo. Faltando dado para uma posição, a função RECUSA em
 * vez de preencher com espaço, traço ou "cliente" — texto inventado no meio de
 * uma abordagem é pior que abordagem nenhuma.
 */
/** O lead como `montarParametros` (e `camposDoModelo`) o enxergam. */
type LeadParaOsParametros = {
  nome: string | null;
  restaurante: string | null;
  fonte: string | null;
  cidade?: string | null;
  /** Texto declarado no lote: responde de onde obtivemos o contato. */
  proveniencia?: string | null;
};

/**
 * A lista ORDENADA de variáveis que a casa sabe preencher, com o valor de
 * CADA UMA — e não só da primeira que faltar.
 *
 * ⚠️ Extraída de `montarParametros` em 11/09/2026 para o diagnóstico
 * (`diagnosticarAbordagem`) poder dizer QUAIS campos faltam, não só o
 * primeiro. `montarParametros` continua parando no primeiro — é a regra de
 * envio, e não muda —, mas construir esta lista OUTRA VEZ ali seria a segunda
 * definição de "quais variáveis existem e em que ordem", exatamente o defeito
 * que este arquivo já nomeia para o portão. Uma função, dois usos.
 */
function camposDoModelo(lead: LeadParaOsParametros): Array<{ rotulo: string; valor: string | null }> {
  return [
    // Contrato lido do template APPROVED `abordagem_restaurante_fria` na Meta:
    // "Olá, {{1}} ... falando com o {{2}} porque encontramos ... em {{3}}".
    // A ordem é parte do texto aprovado e não pode ser inferida pela quantidade.
    {
      rotulo: "nome do contato",
      valor: saudacaoDoLead(lead),
    },
    { rotulo: "nome do restaurante", valor: (lead.restaurante ?? "").trim() || null },
    { rotulo: "procedência da lista", valor: (lead.proveniencia ?? "").trim() || null },
  ];
}

/**
 * O que a Supervisora (`supervisora/adequacaoDoTemplate.ts`) precisa saber
 * sobre as abordagens ANTERIORES a este lead — contado aqui, de propósito,
 * para a avaliação em si continuar pura e testável sem banco embutido (o
 * mesmo padrão de `camadaProfunda.ts` recebendo `reprovacoesRecentesDoAgente`
 * já contado).
 *
 * ⚠️ Conta só `tipo: "TEMPLATE"` — mensagem livre (se algum dia este lead
 * também conversar por outro caminho) não é uma "abordagem fria" e não deveria
 * contar para o teto de insistência da prospecção.
 */
async function historicoDeAbordagens(
  db: Cliente,
  leadId: string,
  optOutAt: Date | null,
): Promise<HistoricoDeAbordagens> {
  // ⚠️ `optOutAt` vem do MESMO `lead` que `abordarLead` já carregou (trava 1)
  // — não é lido de novo aqui. Duas leituras do mesmo campo, uma linha de
  // código depois da outra, é exatamente a segunda cópia que este arquivo
  // evita em outros lugares (ver `SELECT_LEAD_PARA_ABORDAR`).
  const [tentativasAnteriores, ultima] = await Promise.all([
    db.leadMensagem.count({ where: { leadId, direcao: "SAIDA", tipo: "TEMPLATE" } }),
    db.leadMensagem.findFirst({
      where: { leadId, direcao: "SAIDA", tipo: "TEMPLATE" },
      orderBy: { ocorreuEm: "desc" },
      select: { ocorreuEm: true },
    }),
  ]);

  return {
    tentativasAnteriores,
    ultimaAbordagemEm: ultima?.ocorreuEm ?? null,
    optOutAt,
  };
}

/** A procedência pertence ao lote que autorizou a abordagem, não ao lead. */
async function provenienciaDoLead(db: Cliente, lead: LeadParaAbordar): Promise<string | null> {
  if (lead.fonte !== FONTE_DE_LISTA) return null;
  const item = await db.itemDeProspeccao.findFirst({
    where: { leadId: lead.id },
    orderBy: { criadoEm: "desc" },
    select: { lote: { select: { proveniencia: true } } },
  });
  return (item?.lote.proveniencia ?? "").trim() || null;
}

export function montarParametros(
  quantas: number,
  lead: LeadParaOsParametros,
): { ok: true; parametros: string[] } | { ok: false; falta: string } {
  if (quantas <= 0) return { ok: true, parametros: [] };

  const disponiveis = camposDoModelo(lead);

  if (quantas > disponiveis.length) {
    return {
      ok: false,
      falta: `o modelo pede ${quantas} variáveis e o sistema só sabe preencher ${disponiveis.length}`,
    };
  }

  const parametros: string[] = [];
  for (let i = 0; i < quantas; i++) {
    const campo = disponiveis[i]!;
    if (!campo.valor) {
      return { ok: false, falta: `este contato não tem ${campo.rotulo} para a variável {{${i + 1}}}` };
    }
    parametros.push(campo.valor);
  }

  return { ok: true, parametros };
}

// ═══════════════════════════════════════════════════════════════════════════
// O DIAGNÓSTICO — o mesmo caminho de `abordarLead`, sem gravar nada.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐ POR QUE ESTE ARQUIVO TAMBÉM TEM UM DIAGNÓSTICO, E NÃO SÓ UM ENVIO.
 *
 * ── O INCIDENTE, 11/09/2026 ─────────────────────────────────────────────────
 *
 * Uma rodada real materializou 20 `SiteLead` e não criou UMA `LeadMensagem`,
 * nenhum `wamid` — e devolveu HTTP 200. `abordarDaFila.ts` explica o formato
 * do silêncio: `portaoRecusou` e `semDadoParaOModelo` são `"pula"`, sem teto,
 * e a rodada termina normal. O sintoma bate; a causa LITERAL, contra os 20
 * leads reais, só quem tiver `DATABASE_URL` de produção pode medir — ver
 * `scripts/diagnosticar-leads-travados.ts`.
 *
 * ── POR QUE ISTO NÃO CHAMA `abordarLead` COM UM INTERRUPTOR "SÓ SIMULA" ────
 *
 * Um parâmetro `simular: true` dentro de `abordarLead` faria o caminho real
 * de envio carregar um `if` que só existe para o diagnóstico — o oposto do
 * que este arquivo promete no cabeçalho: *"este arquivo é o único caminho por
 * onde uma abordagem sai"*. `diagnosticarAbordagem` fica FORA desse caminho,
 * de propósito, e chega ao mesmo veredito reusando `escolherPortaoDoLead`,
 * `avaliarPortaoDoLead` e `montarParametros` — nunca reimplementando a
 * pergunta que eles já respondem.
 *
 * `registrarSaida` e `enviarModeloDeVendas` nunca são chamados aqui. Nenhuma
 * linha é escrita, nenhuma rede é aberta.
 */
export type ResultadoDoDiagnostico =
  | { leadId: string; pronto: false; motivo: "leadNaoExiste"; detalhe: string }
  | {
      leadId: string;
      pronto: false;
      motivo: "portaoRecusou";
      /** O motivo exato que o portão declarou — `null` só quando ele mesmo não declarou nenhum. */
      razao: LeadBlockReason | null;
      detalhe: string;
    }
  | {
      leadId: string;
      pronto: false;
      motivo: "semDadoParaOModelo";
      /** Quantas variáveis o modelo aprovado exige agora — a mesma fonte que o envio usaria. */
      quantas: number;
      /** Os rótulos dos campos que faltam, dentre os `quantas` primeiros — pode ser mais de um. */
      camposFaltando: string[];
      detalhe: string;
    }
  | { leadId: string; pronto: true; quantas: number; parametros: string[] };

export async function diagnosticarAbordagem(
  db: Cliente,
  params: { leadId: string; agora?: Date },
): Promise<ResultadoDoDiagnostico> {
  const agora = params.agora ?? new Date();

  const lead = (await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: SELECT_LEAD_PARA_ABORDAR,
  })) as LeadParaAbordar | null;

  if (!lead) {
    return { leadId: params.leadId, pronto: false, motivo: "leadNaoExiste", detalhe: params.leadId };
  }

  const decisao = await avaliarPortaoDoLead(db, lead, agora);

  if (!decisao.sendable) {
    return {
      leadId: lead.id,
      pronto: false,
      motivo: "portaoRecusou",
      razao: decisao.reason,
      detalhe: `${decisao.reason ?? "sem motivo"}: ${decisao.detail ?? ""}`.trim(),
    };
  }

  // ⚠️ A MESMA FONTE que `abordarLead` usaria — nunca o ambiente sozinho, pela
  // mesma razão que o comentário de `parametrosDoEnvioAgora` já dá: pré-voo e
  // envio (e agora o diagnóstico) têm de concordar sobre quantas variáveis o
  // modelo aprovado pede, ou o veredito daqui mente sobre o que o envio faria.
  const quantas = await parametrosDoEnvioAgora(db);
  const leadComProveniencia = {
    ...lead,
    proveniencia: await provenienciaDoLead(db, lead),
  };
  const montagem = montarParametros(quantas, leadComProveniencia);

  if (!montagem.ok) {
    const camposFaltando = camposDoModelo(leadComProveniencia)
      .slice(0, quantas)
      .filter((c) => !c.valor)
      .map((c) => c.rotulo);

    return {
      leadId: lead.id,
      pronto: false,
      motivo: "semDadoParaOModelo",
      quantas,
      camposFaltando,
      detalhe: montagem.falta,
    };
  }

  return { leadId: lead.id, pronto: true, quantas, parametros: montagem.parametros };
}
