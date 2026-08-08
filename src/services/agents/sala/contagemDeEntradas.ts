/**
 * contagemDeEntradas — quanto um agente de DESENVOLVIMENTO trabalhou.
 *
 * MÓDULO PURO: recebe o texto do markdown, não conhece `fs` nem `prisma`.
 *
 * ── A medida, e por que ela já existe ─────────────────────────────────────────
 * Doutrina 20 do kit: quem constrói o produto não se mede em token — token diz
 * quanto o agente FALOU, não quanto ele ENTREGOU. A medida certa já está no
 * repositório desde sempre: a entrada assinada em `docs/agents/<slug>/oficina.md`
 * e a entrada promovida em `docs/agents/<slug>/vitrine.md`. Nada de
 * instrumentação nova.
 *
 * ── A ARMADILHA QUE ESTE ARQUIVO EXISTE PARA NÃO CAIR ─────────────────────────
 * O formato das entradas NÃO é uniforme neste repositório. Medido em 07/08/2026,
 * arquivo por arquivo:
 *
 *   • 10 dos 11 arquivos de oficina usam cabeçalho de nível 2:
 *       `## 2026-08-04 · Extração total da Evolution`   (docs/agents/canais)
 *       `## 04/08 — Checkout self-service`              (docs/agents/operacao)
 *   • `docs/agents/garcom/oficina.md` NÃO usa cabeçalho nenhum: são blocos
 *     separados por regra horizontal, começando com a data em negrito:
 *       `2026-08-03 — **sushi-cazza: número reconhecido sem nome…**`
 *
 * Contar `^## ` cegamente devolveria **0 para o garcom** — o agente com 7 blocos
 * registrados e sete incidentes resolvidos. Zero ali seria exatamente a mentira
 * que esta tela existe para não contar.
 *
 * Por isso a contagem reconhece DOIS formatos nomeados e, quando não reconhece
 * nenhum, **não devolve número**: devolve `desconhecido` com a primeira linha de
 * conteúdo como evidência, para virar `naoMedido` na tela. Guardrail 1: ausência
 * de informação não é informação.
 */

/**
 * - `cabecalho`    → entradas são seções `## …` (o formato da maioria)
 * - `datado`       → entradas são blocos separados por `---` iniciados por data
 * - `vazio`        → o arquivo existe e não tem nenhuma linha de conteúdo. É a
 *                    ÚNICA situação em que zero é um fato provado.
 * - `desconhecido` → tem conteúdo e não casa com nenhum formato conhecido.
 *                    NUNCA vira número.
 */
export type FormatoDeEntrada = "cabecalho" | "datado" | "vazio" | "desconhecido";

export interface ContagemDeEntradas {
  readonly formato: FormatoDeEntrada;
  /** Só tem significado quando `formato` é `cabecalho` ou `datado`. */
  readonly entradas: number;
  /** `YYYY-MM-DD` da entrada mais recente cuja data foi legível. */
  readonly ultimaData: string | null;
  /** Todas as datas legíveis, para contar quantas caem numa janela. */
  readonly datas: readonly string[];
  /** Quantas entradas não tinham data legível — a recência é parcial. */
  readonly entradasSemData: number;
  readonly linhasDeConteudo: number;
  /** Primeira linha de conteúdo, quando o formato não foi reconhecido. */
  readonly amostraNaoReconhecida: string | null;
}

const CERCA = /^(```|~~~)/;
const REGRA_HORIZONTAL = /^(-{3,}|\*{3,}|_{3,})$/;
const CABECALHO_2 = /^##\s+\S/;
const TITULO_1 = /^#\s+\S/;

/**
 * Remove as cercas de código e o que está dentro delas.
 *
 * Sem isto, um `---` ou um `## ` dentro de um bloco de exemplo (e há vários nas
 * oficinas: saída de simulador, trecho de YAML, diff) partiria uma entrada em
 * duas e inflaria a contagem. Número inflado é tão mentiroso quanto zero.
 */
function linhasForaDeCodigo(texto: string): string[] {
  const fora: string[] = [];
  let dentro = false;
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (CERCA.test(linha)) {
      dentro = !dentro;
      continue;
    }
    if (dentro) continue;
    fora.push(linha);
  }
  return fora;
}

/** Linha que conta como "este arquivo tem conteúdo" — sem título, citação nem régua. */
function ehConteudo(linha: string): boolean {
  if (linha === "") return false;
  if (REGRA_HORIZONTAL.test(linha)) return false;
  if (linha.startsWith(">")) return false;
  if (TITULO_1.test(linha)) return false;
  return true;
}

/**
 * Data no INÍCIO do texto da entrada. Deliberadamente ancorada: uma data no meio
 * da frase (`"o Instagram mudo desde 23/07"`) não é a data da entrada, e usá-la
 * faria a recência apontar para o mês errado.
 *
 * Formatos aceitos, ambos presentes no repositório:
 *   `2026-08-05 — …`  ·  `04/08 — …`  ·  `04/08/2026 — …`
 *
 * `agora` entra por parâmetro (nunca `new Date()` aqui dentro) para o teste ser
 * determinístico.
 */
export function dataDaEntrada(texto: string, agora: Date): string | null {
  const t = texto
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(\*\*|__)/, "")
    .trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return normalizar(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(t);
  if (!br) return null;

  const dia = Number(br[1]);
  const mes = Number(br[2]);
  if (br[3]) {
    const bruto = Number(br[3]);
    const ano = bruto < 100 ? 2000 + bruto : bruto;
    return normalizar(ano, mes, dia);
  }

  // Sem ano: o ano corrente, a menos que isso jogue a data no futuro — aí é o
  // ano anterior. Assumir o ano corrente cegamente faria "28/12" virar futuro em
  // janeiro, e um agente parado há um ano apareceria como recém-ativo.
  const candidato = normalizar(agora.getUTCFullYear(), mes, dia);
  if (!candidato) return null;
  if (candidato > iso8601(agora)) return normalizar(agora.getUTCFullYear() - 1, mes, dia);
  return candidato;
}

function normalizar(ano: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2999) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null; // 31/02
  return iso8601(d);
}

function iso8601(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Dias inteiros entre a data da entrada e `agora`. Negativo vira 0. */
export function diasDesde(dataIso: string, agora: Date): number {
  const alvo = Date.parse(`${dataIso}T00:00:00.000Z`);
  if (!Number.isFinite(alvo)) return 0;
  const inicioDeHoje = Date.parse(`${iso8601(agora)}T00:00:00.000Z`);
  return Math.max(0, Math.round((inicioDeHoje - alvo) / 86_400_000));
}

export function contarEntradas(texto: string, agora: Date): ContagemDeEntradas {
  const linhas = linhasForaDeCodigo(texto);
  const linhasDeConteudo = linhas.filter(ehConteudo).length;

  // ── Formato 1: cabeçalhos de nível 2 ────────────────────────────────────────
  const cabecalhos = linhas.filter((l) => CABECALHO_2.test(l));
  if (cabecalhos.length > 0) {
    return comDatas("cabecalho", cabecalhos, linhasDeConteudo, agora);
  }

  // ── Formato 2: blocos separados por régua, iniciados por data ───────────────
  const blocos: string[][] = [[]];
  for (const l of linhas) {
    if (REGRA_HORIZONTAL.test(l)) {
      blocos.push([]);
      continue;
    }
    blocos[blocos.length - 1]!.push(l);
  }
  const datadas: string[] = [];
  for (const bloco of blocos) {
    const primeira = bloco.find((l) => l !== "" && !l.startsWith(">") && !TITULO_1.test(l));
    if (primeira && dataDaEntrada(primeira, agora)) datadas.push(primeira);
  }
  if (datadas.length > 0) {
    return comDatas("datado", datadas, linhasDeConteudo, agora);
  }

  // ── Não reconhecido ─────────────────────────────────────────────────────────
  if (linhasDeConteudo === 0) {
    return {
      formato: "vazio",
      entradas: 0,
      ultimaData: null,
      datas: [],
      entradasSemData: 0,
      linhasDeConteudo: 0,
      amostraNaoReconhecida: null,
    };
  }
  return {
    formato: "desconhecido",
    entradas: 0,
    ultimaData: null,
    datas: [],
    entradasSemData: 0,
    linhasDeConteudo,
    amostraNaoReconhecida: linhas.find(ehConteudo)?.slice(0, 120) ?? null,
  };
}

function comDatas(
  formato: "cabecalho" | "datado",
  cabecalhos: readonly string[],
  linhasDeConteudo: number,
  agora: Date,
): ContagemDeEntradas {
  const datas: string[] = [];
  let ultimaData: string | null = null;
  let semData = 0;
  for (const c of cabecalhos) {
    const d = dataDaEntrada(c, agora);
    if (!d) {
      semData += 1;
      continue;
    }
    datas.push(d);
    if (!ultimaData || d > ultimaData) ultimaData = d;
  }
  return {
    formato,
    entradas: cabecalhos.length,
    ultimaData,
    datas,
    entradasSemData: semData,
    linhasDeConteudo,
    amostraNaoReconhecida: null,
  };
}
