/**
 * O DIA CIVIL DA EMPRESA — o eixo de tudo que o financeiro conta.
 *
 * MÓDULO PURO: nenhum import de prisma, de rede ou de env. Ele existe sozinho
 * porque a pergunta do CEO é uma pergunta de DIA — *"quanto gastamos ontem, e
 * quanto estamos gastando hoje"* —, e "ontem" é uma palavra que depende de fuso.
 *
 * ── ⚠️ POR QUE NÃO SE CORTA O DIA PELO UTC ──────────────────────────────────
 *
 * `AIInteractionLog.createdAt` é gravado em UTC. São Paulo está três horas
 * atrás. Uma chamada de IA às 22h de uma terça em São Paulo tem `createdAt` de
 * quarta em UTC — e um corte por UTC jogaria o gasto da noite de terça na conta
 * de quarta.
 *
 * O estrago não é teórico: das 21h à meia-noite é justamente quando o
 * atendimento por IA trabalha mais. Todo fim de noite migraria para o dia
 * seguinte, e a conta de "ontem" chegaria ao CEO faltando o pico. Ninguém veria
 * erro nenhum: os números fecham, só estão no dia errado.
 *
 * ── O QUE É UM "DIA" AQUI ────────────────────────────────────────────────────
 *
 * A string `YYYY-MM-DD` do dia civil em São Paulo. É texto de propósito: ela
 * atravessa a rota, entra na tela e vira chave de mapa sem nunca passar por um
 * `Date`, que é onde o fuso volta a se perder.
 */

/** O fuso da empresa. Uma constante, e não um parâmetro: a Foocci é brasileira. */
export const FUSO_DA_EMPRESA = "America/Sao_Paulo";

/**
 * `en-CA` devolve exatamente `YYYY-MM-DD`, que é o formato que ordena como
 * texto. Trocar por `pt-BR` daria `28/08/2026`, que ordena errado em qualquer
 * comparação de string e transformaria a lista de dias numa bagunça silenciosa.
 */
const FORMATADOR = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_DA_EMPRESA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** O dia civil em São Paulo de um instante qualquer. */
export function diaEmSaoPaulo(instante: Date): string {
  return FORMATADOR.format(instante);
}

const FORMA_DE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O texto é um dia de calendário de verdade?
 *
 * Confere a FORMA e a EXISTÊNCIA. `2026-02-31` tem a forma certa e não existe —
 * aceitá-lo criaria uma janela que nenhum dado pode preencher, e a tela diria
 * "sem uso" para um dia que nunca houve.
 */
export function ehDiaValido(dia: unknown): dia is string {
  if (typeof dia !== "string" || !FORMA_DE_DIA.test(dia)) return false;

  const [ano, mes, d] = dia.split("-").map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, d));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === d
  );
}

/**
 * O instante UTC da meia-noite UTC de um dia, deslocado em N dias.
 *
 * ⚠️ Isto NÃO é a meia-noite de São Paulo, e não precisa ser. Ele serve para
 * montar a janela de consulta ao banco, e essa janela é folgada de propósito
 * (ver `janelaDeConsulta`). Calcular a meia-noite exata do fuso exigiria fixar
 * o deslocamento `-03:00` no código — e deslocamento fixo é a suposição que
 * quebra sozinha no dia em que o país mexer no horário de verão de novo.
 */
export function meiaNoiteUtc(dia: string, deslocamentoEmDias = 0): Date {
  const [ano, mes, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(ano, mes - 1, d + deslocamentoEmDias));
}

/**
 * A janela de consulta ao banco para uma faixa de dias de São Paulo.
 *
 * ── POR QUE ELA SOBRA UM DIA DE CADA LADO ───────────────────────────────────
 *
 * A faixa pedida é em dias de São Paulo; o `createdAt` do banco é UTC. Em vez de
 * traduzir a fronteira — que obriga a saber o deslocamento do fuso em cada
 * instante —, a consulta pega um dia a mais em cada ponta e o **balde** decide.
 *
 * Sobra é barata: um dia de linhas a mais lidas. Falta é cara e invisível: o
 * gasto das primeiras ou últimas horas some da conta sem erro nenhum aparecer.
 */
export function janelaDeConsulta(de: string, ate: string): { gte: Date; lt: Date } {
  return { gte: meiaNoiteUtc(de, -1), lt: meiaNoiteUtc(ate, 2) };
}

/**
 * O teto de dias de uma consulta só.
 *
 * ⚠️ Não é capricho: a faixa vem da rota, e uma faixa de dez anos leria a tabela
 * inteira de interações de IA dentro de uma requisição HTTP. O corte cai aqui,
 * onde é uma recusa nomeada, e não no tempo limite do servidor, onde vira uma
 * tela que "não carrega".
 */
export const MAXIMO_DE_DIAS = 366;

/**
 * Todos os dias da faixa, do mais antigo ao mais novo, INCLUSIVE as duas pontas.
 *
 * ── ⚠️ ESTA FUNÇÃO É A QUE IMPEDE O DIA DE SUMIR ────────────────────────────
 *
 * O gasto por dia NÃO é montado a partir do que o banco devolveu: é montado a
 * partir desta lista, e cada dia sem linha nenhuma vira um balde `NO_USAGE`.
 *
 * Se a lista viesse do banco, um dia sem uso simplesmente não apareceria na
 * tela — e "não apareceu" é lido por qualquer pessoa como "não gastou". São
 * coisas diferentes, e é a diferença inteira que este financeiro existe para
 * preservar.
 */
export function diasDaFaixa(de: string, ate: string): string[] {
  if (!ehDiaValido(de) || !ehDiaValido(ate)) {
    throw new RangeError(`Faixa de dias inválida: "${de}" a "${ate}" (esperado YYYY-MM-DD).`);
  }
  if (de > ate) {
    // Faixa invertida é erro de quem chamou, não um estado do dado. Devolver
    // lista vazia faria a tela dizer "sem uso" para uma pergunta que ninguém
    // chegou a fazer — inventar um fato a partir de um bug.
    throw new RangeError(`Faixa invertida: "${de}" vem depois de "${ate}".`);
  }

  const dias: string[] = [];
  for (let d = meiaNoiteUtc(de); diaUtc(d) <= ate; d = new Date(d.getTime() + 86_400_000)) {
    dias.push(diaUtc(d));
    if (dias.length > MAXIMO_DE_DIAS) {
      throw new RangeError(
        `Faixa de ${de} a ${ate} passa de ${MAXIMO_DE_DIAS} dias. Peça um período menor.`,
      );
    }
  }
  return dias;
}

/** O dia de um instante lido em UTC. Só para caminhar na lista acima. */
function diaUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A faixa dos últimos `quantos` dias, terminando HOJE em São Paulo.
 *
 * `quantos: 30` devolve 30 dias contando com o de hoje — é o que "últimos 30
 * dias" quer dizer para quem pergunta, e não 31.
 */
export function ultimosDias(agora: Date, quantos: number): { de: string; ate: string } {
  const hoje = diaEmSaoPaulo(agora);
  // ⚠️ A subtração é de DIAS DE CALENDÁRIO sobre o dia já resolvido no fuso, e
  // não de 30 × 86.400.000 ms sobre o instante. Subtrair milissegundos de um
  // instante perto da meia-noite pode cair no dia anterior quando o fuso muda de
  // deslocamento — o começo da faixa andaria um dia sem ninguém perceber.
  return { de: meiaNoiteUtc(hoje, -(quantos - 1)).toISOString().slice(0, 10), ate: hoje };
}

/** O dia anterior a um dia. */
export function diaAnterior(dia: string): string {
  return meiaNoiteUtc(dia, -1).toISOString().slice(0, 10);
}

/** `2026-08-29` → `29/08/2026`, que é como o CEO lê uma data. */
export function diaEmPortugues(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}
