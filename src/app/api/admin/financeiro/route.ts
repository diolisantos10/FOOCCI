/**
 * /api/admin/financeiro
 *
 *   GET  → quanto a empresa gastou hoje, ontem e nos últimos 30 dias
 *   POST → lança um gasto que nenhuma API entrega (hospedagem, Meta, domínio…)
 *
 * É a porta do pedido do CEO em 29/08/2026: *"toda hora estamos gastando com
 * inteligência artificial, crédito, tudo precisa ser medido, a gente precisa
 * saber qual é o custo desses produtos todos os dias, que só está dando prejuízo
 * porque ainda não temos clientes, então a gente precisa contabilizar
 * absolutamente tudo que é gasto."*
 *
 * ── AS CAMADAS, NESTA ROTA ──────────────────────────────────────────────────
 *
 *   1. `guardarFinanceiro`     — você é o dono da casa? (protege o endereço)
 *   2. `problemaNoGastoManual` — o lançamento se sustenta?
 *   3. `lancarGastoManual`     — a gravação, que valida de novo
 *
 * ── ⚠️ QUEM ENTRA, E POR QUE A LISTA É TÃO CURTA ────────────────────────────
 *
 * Só `MASTER_CEO` e `DIRETOR_FOOCCI`. Não é hierarquia por hierarquia: esta tela
 * mostra o prejuízo da empresa inteira, mês a mês, numa fase em que a empresa
 * ainda não tem cliente. É o número mais sensível que existe aqui dentro, e ele
 * não é assunto de quem vende nem de quem audita conversa.
 *
 * Nem o SDR nem o gerente de departamento entram — nem para ler. Esconder o item
 * do menu não faria diferença nenhuma: quem digitar o endereço bate AQUI, e é
 * aqui que a porta fecha.
 *
 * ── ⚠️ O AUTOR VEM DA SESSÃO, NUNCA DO CORPO ────────────────────────────────
 *
 * `criadoPor` sai de `portao.sessao`. O corpo pode mandar `criadoPor`, `autor`,
 * `quem` — nada disso é lido. Um lançamento de gasto é a afirmação "a empresa
 * pagou isto", e ela precisa ter dono. Deixar o cliente escolher o nome é o
 * mesmo que não registrar nenhum.
 *
 * ── ⚠️ O QUE ESTA ROTA NÃO FAZ ──────────────────────────────────────────────
 *
 * Não converte dólar em real. O gasto de IA é cobrado em dólar pelos provedores
 * e sai daqui em dólar; o lançado à mão sai na moeda em que foi lançado. Não há
 * fonte de câmbio neste repositório, e fixar uma taxa produziria um total em
 * reais que não bate com fatura nenhuma — guardrail 1 aplicado a dinheiro.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarInterno, type SessaoInterna } from "@/lib/internal-auth";
import {
  diaAnterior,
  diaEmPortugues,
  diaEmSaoPaulo,
  ultimosDias,
} from "@/services/financeiro/dia";
import {
  fraseDoGasto,
  gastoDeIaPorAgente,
  gastoDeIaPorDia,
  type GastoDeIa,
} from "@/services/financeiro/gastoDiario";
import {
  CATEGORIAS_DE_GASTO,
  MOEDAS_DE_GASTO,
  explicarRecusaDoGasto,
  fraseDoGastoManual,
  lancarGastoManual,
  problemaNoGastoManual,
  somarGastosManuais,
  type SomaDeGastoManual,
} from "@/services/financeiro/gastoManual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quem enxerga a conta da empresa.
 *
 * Lista fechada, num lugar só: crescer o alcance passa a ser uma linha de código
 * revisável, e não o efeito colateral de alguém ganhar um papel novo.
 */
const PAPEIS_DO_FINANCEIRO = ["MASTER_CEO", "DIRETOR_FOOCCI"] as const;

/** Quantos dias a tela mostra por padrão. */
const JANELA_EM_DIAS = 30;

type Portao =
  | { ok: true; sessao: SessaoInterna }
  | { ok: false; resposta: NextResponse };

/**
 * O portão do financeiro.
 *
 * A negativa entra na trilha ANTES de a resposta sair. Uma tentativa de ler a
 * conta da empresa por quem não pode é exatamente o tipo de evento que só tem
 * valor se ficar registrado — descobrir depois que aconteceu, sem data e sem
 * nome, não serve para nada.
 */
async function guardarFinanceiro(req: NextRequest, acao: string): Promise<Portao> {
  const auth = autorizarInterno(req, { papeis: PAPEIS_DO_FINANCEIRO });

  if (!auth.ok) {
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: auth.sessao ? "INTERNAL_USER" : "ANONIMO",
          actorLabel: auth.sessao ? `${auth.sessao.nome} (${auth.sessao.userId})` : "anônimo",
          acao,
          recurso: "financeiro",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch {
      // Trilha indisponível não abre a porta: a negativa vale mesmo que o
      // registro dela falhe.
    }

    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: auth.motivo },
        { status: auth.status },
      ),
    };
  }

  return { ok: true, sessao: auth.sessao };
}

/**
 * O balde de IA, já com a frase pronta.
 *
 * ⚠️ A frase viaja junto com os números de propósito. Se a tela montasse o texto
 * a partir de `centavosUsd`, ela escreveria "US$ 0,00" para um dia `NO_USAGE` e
 * para um dia `UNPRICED` — os dois casos em que não existe número a escrever. A
 * frase nasce do ESTADO, no servidor, e chega pronta.
 */
function iaParaATela(g: GastoDeIa) {
  return { ...g, frase: fraseDoGasto(g) };
}

function manualParaATela(s: SomaDeGastoManual) {
  return { ...s, frase: fraseDoGastoManual(s) };
}

/**
 * Pega o balde de um dia dentro da janela — e estoura se ele não estiver lá.
 *
 * ⚠️ O ramo de erro é inalcançável hoje: `hoje`, `ontem` e a janela de 30 dias
 * saem todos do MESMO instante, então os dois dias estão sempre na lista.
 *
 * Ele existe porque a alternativa tentadora — cair no último dia da lista, ou
 * num balde zerado — seria mostrar ao CEO o número de OUTRO dia embaixo do
 * rótulo "hoje". Um cartão silenciosamente trocado é pior que uma tela que
 * quebra: ninguém confere um número que parece certo.
 */
function exigirDia<T extends { chave: string }>(lista: readonly T[], dia: string): T {
  const achado = lista.find((d) => d.chave === dia);
  if (!achado) {
    throw new Error(
      `O dia ${dia} não está na janela consultada — o financeiro se recusa a ` +
        "mostrar o número de outro dia no lugar dele.",
    );
  }
  return achado;
}

export async function GET(req: NextRequest) {
  const portao = await guardarFinanceiro(req, "ler_financeiro");
  if (!portao.ok) return portao.resposta;

  const agora = new Date();
  const hoje = diaEmSaoPaulo(agora);
  const ontem = diaAnterior(hoje);
  const janela = ultimosDias(agora, JANELA_EM_DIAS);

  // ── UMA CONSULTA POR ASSUNTO, NÃO TRÊS POR CARTÃO ───────────────────────
  //
  // "Hoje" e "ontem" NÃO são consultas próprias: eles são dois dias de dentro
  // da janela de 30, escolhidos da lista que já veio. Três consultas separadas
  // dariam três respostas que podem discordar entre si quando a virada do dia
  // cai no meio da requisição — e o cartão de hoje mostraria um número que a
  // linha de hoje na tabela contradiz.
  const [ia, porAgente, manual] = await Promise.all([
    gastoDeIaPorDia(prisma, janela),
    gastoDeIaPorAgente(prisma, janela),
    somarGastosManuais(prisma, janela),
  ]);

  const diaDeIa = (dia: string) => exigirDia(ia.dias, dia);
  const diaManual = (dia: string) => exigirDia(manual.dias, dia);

  return NextResponse.json({
    ok: true,
    data: {
      hoje,
      ontem,
      hojeEscrito: diaEmPortugues(hoje),
      ontemEscrito: diaEmPortugues(ontem),
      janela: { de: janela.de, ate: janela.ate, dias: JANELA_EM_DIAS },

      ia: {
        hoje: iaParaATela(diaDeIa(hoje)),
        ontem: iaParaATela(diaDeIa(ontem)),
        periodo: iaParaATela(ia.total),
        dias: ia.dias.map(iaParaATela),
        porAgente: porAgente.agentes.map(iaParaATela),
      },

      manual: {
        hoje: manualParaATela(diaManual(hoje)),
        ontem: manualParaATela(diaManual(ontem)),
        periodo: manualParaATela(manual.total),
        porCategoria: manual.categorias.map(manualParaATela),
        lancamentos: manual.lancamentos,
      },

      // As opções viajam pela rota que as VALIDA. Se a tela importasse
      // `CATEGORIAS_DE_GASTO` do serviço, a lista do seletor e a lista da
      // recusa seriam duas — e a divergência apareceria como "escolhi e não
      // funciona". Além disso, `gastoManual.ts` fala com o Prisma: importá-lo
      // levaria o serviço de gravação inteiro para dentro do navegador.
      formulario: {
        categorias: CATEGORIAS_DE_GASTO,
        moedas: MOEDAS_DE_GASTO,
        /** O maior dia que a competência pode ter. O futuro é recusado. */
        maximoDaCompetencia: hoje,
      },
    },
  });
}

interface CorpoDoLancamento {
  descricao?: unknown;
  categoria?: unknown;
  fornecedor?: unknown;
  valorCent?: unknown;
  moeda?: unknown;
  competencia?: unknown;
  pagoEm?: unknown;
  recorrente?: unknown;
}

export async function POST(req: NextRequest) {
  const portao = await guardarFinanceiro(req, "lancar_gasto_manual");
  if (!portao.ok) return portao.resposta;

  let corpo: CorpoDoLancamento;
  try {
    corpo = (await req.json()) as CorpoDoLancamento;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const agora = new Date();
  const pedido = {
    descricao: corpo.descricao,
    categoria: corpo.categoria,
    fornecedor: corpo.fornecedor,
    valorCent: corpo.valorCent,
    moeda: corpo.moeda,
    competencia: corpo.competencia,
    pagoEm: corpo.pagoEm,
    recorrente: corpo.recorrente,
    // ⚠️ Da SESSÃO. O corpo não escolhe quem lançou o gasto — nem quando manda
    // `criadoPor`, nem `autor`, nem `quem`. Nada disso é lido acima.
    criadoPor: `${portao.sessao.nome} (${portao.sessao.userId})`,
  };

  const problema = problemaNoGastoManual(pedido, diaEmSaoPaulo(agora));
  if (problema) {
    return NextResponse.json(
      { ok: false, error: explicarRecusaDoGasto(problema) },
      { status: 400 },
    );
  }

  const r = await lancarGastoManual(prisma, pedido, agora);
  if (!r.ok) {
    // Inalcançável enquanto a conferência acima usar a mesma função. O ramo
    // existe para o dia em que as duas divergirem: sem ele, esse dia chegaria
    // como um `undefined` na tela em vez de uma frase.
    return NextResponse.json(
      { ok: false, error: explicarRecusaDoGasto(r.recusa) },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, data: { gasto: r.gasto } });
}
