/**
 * A TRAVA DE REPETIÇÃO — o mesmo lead não recebe a mesma abordagem duas vezes.
 *
 * ── O QUE FOI MEDIDO, 17/09/2026 ────────────────────────────────────────────
 *
 * Numa amostra de 200 conversas reais do banco de produção, **21 conversas
 * receberam a MESMA mensagem nossa, repetida**. BUON GUSTO Pizzeria e Dory's
 * Marmitaria receberam o mesmo texto **16 vezes cada**, várias no mesmo dia
 * (14:26, 14:35, 15:02, 18:21, 18:43, 20:13, 21:03…).
 *
 * ── A CAUSA, e ela é de desenho, não de descuido ────────────────────────────
 *
 * O caminho de saída inteiro decide "pode falar com esta pessoa?" LENDO o
 * estado do lead e só DEPOIS escrevendo:
 *
 *   · `abordar.ts` conta as saídas do lead (`leadMensagem.count`, trava 1) e só
 *     grava a linha nova dezenas de linhas — e vários `await` — adiante
 *     (`registrarSaida`, trava 3);
 *   · `selecao.ts` monta a fila lendo `tentativas`/`lastContactedAt` de cada
 *     candidato ANTES de a rodada começar a enviar;
 *   · `entrega.ts` é idempotente por `mensagemId`, e só por ele: duas linhas
 *     PENDENTES com o mesmo texto são duas entregas legítimas aos olhos dele.
 *
 * Ler-e-depois-escrever é o `if` antes do `await`. Duas rodadas simultâneas —
 * dois crons que se sobrepõem, um clique repetido, duas instâncias do app —
 * **leem as duas o mesmo zero** e enviam as duas. Nenhuma trava do sistema é
 * atômica, e nenhuma pergunta "este conteúdo já saiu para este número?":
 * varrido o `src` inteiro, essa pergunta não existia em lugar nenhum.
 *
 * ── O QUE ESTE ARQUIVO FAZ ──────────────────────────────────────────────────
 *
 * Uma reserva no BANCO, com `@@unique`, feita ANTES de a mensagem bater na
 * Meta. Não é um `if`: é o Postgres recusando a segunda gravação. Duas rodadas
 * simultâneas disputam a mesma linha e **uma só ganha**.
 *
 * Duas perguntas, duas travas, porque são defeitos diferentes:
 *
 *   1. **Conteúdo** — `unique(telefoneDigits, impressao)`. O mesmo texto nunca
 *      vai duas vezes para o mesmo número, nem daqui a um ano.
 *   2. **Ritmo** — uma linha por número com `ultimoEnvioEm`, avançada por
 *      `updateMany` condicional (comparar-e-trocar). Independentemente do
 *      conteúdo, há um intervalo mínimo entre duas ABORDAGENS nossas.
 *
 * ── ⚠️ É FAIL-CLOSED ────────────────────────────────────────────────────────
 *
 * Telefone ilegível, texto vazio, erro do banco — qualquer dúvida **recusa**.
 * Na dúvida não envia: mandar de novo é o defeito que esta trava existe para
 * impedir.
 *
 * ── ⚠️ O QUE ELA **NÃO** BLOQUEIA, e como a distinção é feita ───────────────
 *
 * Ela é contra **repetição de abordagem**, nunca contra conversa. A distinção
 * não é adivinhada pelo texto: é DECLARADA por quem chama, no parâmetro
 * `natureza`, que **não tem valor padrão** — exatamente como `quemMandou` em
 * `entrega.ts`. Um chamador novo não compila sem dizer o que está mandando.
 *
 *   · `"abordagem"` — a casa falando primeiro (template de prospecção, rodada,
 *     retentativa, cadência fria). **Passa pela trava.**
 *   · `"conversa"` — resposta dentro de uma conversa viva: o TA respondendo
 *     quem escreveu, o humano que assumiu, o navegador de menu. **Não passa** —
 *     e não pode passar: duas perguntas iguais do cliente merecem a mesma
 *     resposta, e o intervalo mínimo mataria o atendimento.
 *
 * Follow-up de cadência PLANEJADO é `"abordagem"` e continua saindo: ele muda
 * de texto (impressão diferente) e acontece dias depois (fora do intervalo).
 * O que ele não consegue mais é sair duas vezes igual, no mesmo dia.
 */

import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * Quem está falando: a casa começando, ou a casa respondendo.
 *
 * Sem valor padrão em lugar nenhum, de propósito — ver o cabeçalho.
 */
export type NaturezaDaFala = "abordagem" | "conversa";

/**
 * O intervalo mínimo entre duas ABORDAGENS nossas para o mesmo número.
 *
 * **20 horas**, e o número tem razão. O desenho da casa já diz que entre a
 * abertura e o lembrete há 48h de descanso (`LeadContactSafety.REGRA`), mas
 * esse descanso é lido do estado do lead — que é justamente o que falha quando
 * há dois leads para o mesmo telefone ou duas rodadas correndo juntas. Aqui o
 * intervalo é contado pelo NÚMERO, no banco, e serve como piso de última
 * instância.
 *
 * Por que não 48h iguais: um piso menor que a regra de negócio não afrouxa nada
 * (a regra de 48h continua valendo acima), e deixa espaço para uma cadência
 * legítima de dois toques em dias seguidos sem que esta trava precise ser
 * afrouxada por alguém com pressa. Por que não 1h: 1h não teria impedido nada
 * do que foi medido — as repetições de BUON GUSTO estão a 9 minutos, 27
 * minutos e 3 horas umas das outras, e 20h cobre o dia inteiro.
 *
 * Configurável por `FOOCCI_INTERVALO_MINIMO_ABORDAGEM_HORAS`, e **só para mais**:
 * valor menor que o padrão é ignorado. A única trava que afrouxa por
 * configuração é a que não protege ninguém.
 */
export const INTERVALO_MINIMO_HORAS_PADRAO = 20;

export function intervaloMinimoEmHoras(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = Number((env.FOOCCI_INTERVALO_MINIMO_ABORDAGEM_HORAS ?? "").trim());
  if (!Number.isFinite(bruto) || bruto <= 0) return INTERVALO_MINIMO_HORAS_PADRAO;
  return Math.max(INTERVALO_MINIMO_HORAS_PADRAO, bruto);
}

/** Só os dígitos. É o que identifica a PESSOA, e não a linha do banco. */
export function digitosDoTelefone(telefone: string | null | undefined): string {
  return (telefone ?? "").replace(/\D/g, "");
}

/**
 * A impressão digital do conteúdo.
 *
 * Normaliza espaço e caixa antes de resumir: o mesmo texto com um espaço a mais
 * é o mesmo texto para quem recebe, e seria uma impressão diferente para quem
 * compara byte a byte. Template entra como `nome|parâmetros`, porque é isso que
 * a pessoa lê — dois envios do mesmo modelo com os mesmos parâmetros são a
 * mesma mensagem, ainda que a linha do banco seja outra.
 */
export function impressaoDoConteudo(conteudo: string): string {
  const normalizado = conteudo.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(normalizado).digest("hex");
}

export type MotivoDaRecusa =
  /** Sem telefone legível — não dá para saber se já mandamos. Fail-closed. */
  | "semTelefone"
  /** Sem conteúdo para impressão digital. Fail-closed. */
  | "semConteudo"
  /** Este texto EXATO já foi para este número. */
  | "conteudoJaEnviado"
  /** Outra abordagem saiu para este número há menos que o intervalo mínimo. */
  | "intervaloMinimo"
  /** O banco não respondeu. Na dúvida, não envia. */
  | "bancoIndisponivel";

export type ResultadoDaTrava =
  | { liberado: true }
  | { liberado: false; motivo: MotivoDaRecusa; detalhe: string };

export interface PedidoDeReserva {
  /** O telefone de destino, no formato que for. */
  telefone: string | null | undefined;
  /** O conteúdo que vai sair — texto livre, ou `nome|params` do template. */
  conteudo: string;
  /** Declarado por quem chama. Sem padrão: ver o cabeçalho. */
  natureza: NaturezaDaFala;
  /** Para o registro da recusa. Opcional porque a trava é do NÚMERO. */
  leadId?: string | null;
  /** De onde veio a tentativa, para o registro ficar investigável. */
  origem: string;
  agora?: Date;
  /** Só para teste. Em produção vem do ambiente. */
  intervaloHoras?: number;
}

/**
 * Reserva o direito de mandar ISTO para ESTE número, agora.
 *
 * **Nunca lança.** Erro vira recusa — que é o lado seguro.
 *
 * ⚠️ A ordem das duas travas importa. O ritmo vem primeiro porque ele é um
 * comparar-e-trocar: ele é o que dois processos simultâneos disputam. Se o
 * conteúdo viesse primeiro, dois textos DIFERENTES no mesmo instante passariam
 * os dois pela trava de conteúdo e chegariam juntos ao ritmo — e aí só a
 * atomicidade do ritmo os separaria, um passo depois de já terem reservado.
 */
/**
 * DEVOLVE a reserva quando a entrega NÃO aconteceu.
 *
 * ── ⚠️ MEDIDO EM PRODUÇÃO, 18/09/2026 ───────────────────────────────────────
 *
 * A reserva é feita ANTES do envio, de propósito: é ela que impede duas rodadas
 * simultâneas de mandarem a mesma coisa. Mas quando a Meta recusa, a reserva
 * ficava de pé assim mesmo — e o número passava 20 horas bloqueado por uma
 * mensagem que **ninguém leu**.
 *
 * Aconteceu com os três leads pagos: os três receberam `META_131042`, nenhum
 * viu nada, e o sistema recusou a segunda tentativa dizendo "já falei com essa
 * pessoa". É o mesmo defeito que o freio entre lotes tinha de manhã, no mesmo
 * dia: **contar tentativa como se fosse entrega.**
 *
 * O que a trava protege é a paciência de quem recebe. Mensagem que não chegou
 * não gastou paciência nenhuma.
 *
 * ⚠️ Devolver a reserva é seguro **porque o envio já terminou** — a corrida que
 * a reserva impede acontece entre a decisão e a entrega, e nesse ponto ela já
 * passou. Chamar isto em qualquer outro momento reabriria a corrida.
 */
export async function devolverReserva(
  db: Cliente,
  pedido: { telefone: string | null | undefined; conteudo: string; natureza: NaturezaDaFala },
): Promise<void> {
  if (pedido.natureza === "conversa") return;

  const digitos = digitosDoTelefone(pedido.telefone);
  const conteudo = (pedido.conteudo ?? "").trim();
  if (digitos.length < 10 || !conteudo) return;

  const impressao = impressaoDoConteudo(conteudo);

  try {
    // O conteúdo volta a ser inédito para este número.
    await db.travaDeAbordagemEnviada.deleteMany({ where: { telefoneDigits: digitos, impressao } });
    // E o relógio do ritmo volta ao que era: como nada saiu, não há do que
    // descansar. A linha some inteira — ela nasce de novo no próximo envio.
    await db.travaDeAbordagemRitmo.deleteMany({ where: { telefoneDigits: digitos } });
  } catch (e) {
    // Falhar aqui é ruim, mas não é motivo para derrubar o fluxo: o pior caso
    // é o número ficar bloqueado 20h, que é o comportamento de antes.
    console.error("[travaDeRepeticao] não consegui devolver a reserva:", e);
  }
}

export async function reservarEnvio(
  db: Cliente,
  pedido: PedidoDeReserva,
): Promise<ResultadoDaTrava> {
  // Conversa viva não é abordagem. Passa sem tocar no banco — e é a única
  // saída livre deste arquivo.
  if (pedido.natureza === "conversa") return { liberado: true };

  const agora = pedido.agora ?? new Date();
  const digitos = digitosDoTelefone(pedido.telefone);

  if (digitos.length < 10) {
    return {
      liberado: false,
      motivo: "semTelefone",
      detalhe: `telefone ilegível (${digitos.length} dígitos) — sem número não dá para saber se já mandamos`,
    };
  }

  const conteudo = (pedido.conteudo ?? "").trim();
  if (!conteudo) {
    return { liberado: false, motivo: "semConteudo", detalhe: "nada a comparar: conteúdo vazio" };
  }

  const impressao = impressaoDoConteudo(conteudo);
  const horas = pedido.intervaloHoras ?? intervaloMinimoEmHoras();
  const limite = new Date(agora.getTime() - horas * 3_600_000);

  try {
    // ── Trava 1: o RITMO, por comparar-e-trocar ──────────────────────────
    //
    // `updateMany` com a condição no `where` é uma operação só no Postgres:
    // duas rodadas simultâneas disputam a MESMA linha e exatamente uma recebe
    // `count: 1`. É a diferença entre isto e um `findFirst` seguido de
    // `update`, que é o defeito que esta trava existe para corrigir.
    const avancou = await db.travaDeAbordagemRitmo.updateMany({
      where: { telefoneDigits: digitos, ultimoEnvioEm: { lt: limite } },
      data: { ultimoEnvioEm: agora },
    });

    if (avancou.count === 0) {
      // Ou nunca houve abordagem para este número (linha ainda não existe), ou
      // houve há pouco. `create` responde qual: se a linha já existe, o
      // `@@id` recusa e a resposta é "houve há pouco".
      try {
        await db.travaDeAbordagemRitmo.create({
          data: { telefoneDigits: digitos, ultimoEnvioEm: agora },
        });
      } catch {
        const recusa = {
          liberado: false as const,
          motivo: "intervaloMinimo" as const,
          detalhe:
            `outra abordagem saiu para ${mascarar(digitos)} há menos de ${horas}h — ` +
            "o intervalo mínimo entre duas abordagens nossas não foi cumprido",
        };
        await registrarRecusa(db, pedido, { digitos, impressao, agora, ...recusa });
        return recusa;
      }
    }

    // ── Trava 2: o CONTEÚDO, por unique ──────────────────────────────────
    //
    // Passar da trava do ritmo não autoriza repetir o texto. Aqui não há
    // leitura nenhuma antes: a gravação É a pergunta, e o `@@unique` é quem
    // responde.
    try {
      await db.travaDeAbordagemEnviada.create({
        data: {
          telefoneDigits: digitos,
          impressao,
          leadId: pedido.leadId ?? null,
          origem: pedido.origem,
          criadoEm: agora,
        },
      });
    } catch {
      const recusa = {
        liberado: false as const,
        motivo: "conteudoJaEnviado" as const,
        detalhe:
          `este MESMO conteúdo já foi enviado para ${mascarar(digitos)} — ` +
          "o mesmo lead não recebe a mesma mensagem duas vezes",
      };
      await registrarRecusa(db, pedido, { digitos, impressao, agora, ...recusa });
      return recusa;
    }

    return { liberado: true };
  } catch (e) {
    // ⛔ O banco falhou. Isso NÃO é permissão: é ignorância, e ignorância aqui
    // custa uma mensagem repetida no telefone de um estranho.
    const recusa = {
      liberado: false as const,
      motivo: "bancoIndisponivel" as const,
      detalhe: `a trava não conseguiu consultar o banco: ${e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido"}`,
    };
    await registrarRecusa(db, pedido, { digitos, impressao, agora, ...recusa });
    return recusa;
  }
}

/** Telefone nunca sai inteiro no log. Os quatro últimos bastam para reconhecer. */
function mascarar(digitos: string): string {
  return `…${digitos.slice(-4)}`;
}

/**
 * ⭐ A RECUSA FICA ESCRITA, e é por isso que ela não vira silêncio.
 *
 * Sem este registro a trava seria invisível: mensagem que não sai e ninguém
 * sabe por quê é exatamente o defeito que ela veio consertar, com o sinal
 * trocado. A linha grava o número, a impressão, o motivo e de onde veio a
 * tentativa — e o `console.error` leva o mesmo caso concreto para quem só tem
 * o log.
 *
 * ⚠️ **Nunca derruba a recusa.** Perder o registro é ruim; deixar a mensagem
 * sair porque o registro falhou seria o defeito de volta.
 */
async function registrarRecusa(
  db: Cliente,
  pedido: PedidoDeReserva,
  d: { digitos: string; impressao: string; agora: Date; motivo: MotivoDaRecusa; detalhe: string },
): Promise<void> {
  console.error("[trava-de-repeticao] envio RECUSADO", {
    telefone: mascarar(d.digitos),
    leadId: pedido.leadId ?? null,
    origem: pedido.origem,
    motivo: d.motivo,
    detalhe: d.detalhe,
  });

  try {
    await db.travaDeAbordagemRecusa.create({
      data: {
        telefoneDigits: d.digitos,
        impressao: d.impressao,
        leadId: pedido.leadId ?? null,
        origem: pedido.origem,
        motivo: d.motivo,
        detalhe: d.detalhe.slice(0, 1000),
        criadoEm: d.agora,
      },
    });
  } catch (e) {
    console.error("[trava-de-repeticao] não consegui gravar a recusa", e);
  }
}
