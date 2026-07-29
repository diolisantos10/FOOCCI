/**
 * PlanoDeMidia — o calendário que só existe depois da sondagem fechada.
 *
 * O plano que originou tudo isto tinha três defeitos, e os três são impedidos
 * aqui por construção:
 *
 *   1. NÃO TINHA DATA. Era uma lista de ideias chamada de planejamento. Aqui
 *      cada linha nasce com dia e dia da semana, calculados a partir da data de
 *      início respondida pelo cliente. Sem data de início legível, não sai plano.
 *
 *   2. PROMETIA MATERIAL QUE NINGUÉM SABIA SE EXISTIA. Aqui cada linha carrega
 *      quem traz o insumo, e o gerador nem roda enquanto algum serviço estiver
 *      sem origem definida — a trava é a própria `podePropor`.
 *
 *   3. ESCONDIA O QUE NÃO SE SABIA. Aqui o que o cliente ainda não respondeu vai
 *      impresso no rodapé, com a pergunta original. Pendência declarada é
 *      profissional; pendência omitida é o que quebra na terceira semana.
 *
 * Determinístico: sem IA, sem banco, sem rede. O texto das peças é trabalho da
 * Oficina, depois. Isto aqui é o esqueleto — quando, o quê, e de quem vem.
 */

import {
  avaliarSondagem,
  CATALOGO_DE_SERVICOS,
  type EstadoDaSondagem,
  type OrigemDoInsumo,
} from "../oficina/Sondagem";

// ─────────────────────────────────────────────────────────────────────────────
//  Datas
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function valida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Lê uma data do que o cliente respondeu.
 *
 * Aceita ISO, dd/mm, dd/mm/aaaa e "dia 5 de agosto". NÃO tenta adivinhar
 * "semana que vem" nem "assim que possível": data presumida é exatamente o tipo
 * de invenção que produz calendário furado. Sem data legível, devolve null e o
 * plano trava pedindo o dia exato.
 *
 * Sem ano, assume o ano corrente; se isso jogaria a data mais de 30 dias para
 * trás, entende que o cliente falava do ano que vem.
 */
export function lerData(texto: string, hoje: Date = new Date()): string | null {
  const t = normalizar(texto).trim();
  const anoAtual = hoje.getUTCFullYear();

  const resolver = (dia: number, mes: number, ano?: number): string | null => {
    if (ano !== undefined) return valida(ano, mes, dia) ? iso(ano, mes, dia) : null;
    if (!valida(anoAtual, mes, dia)) return null;
    const candidata = new Date(Date.UTC(anoAtual, mes - 1, dia));
    const limite = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    return candidata < limite && valida(anoAtual + 1, mes, dia)
      ? iso(anoAtual + 1, mes, dia)
      : iso(anoAtual, mes, dia);
  };

  const isoMatch = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (isoMatch?.[1] && isoMatch[2] && isoMatch[3]) {
    return resolver(Number(isoMatch[3]), Number(isoMatch[2]), Number(isoMatch[1]));
  }

  const barra = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/.exec(t);
  if (barra?.[1] && barra[2]) {
    const anoCru = barra[3];
    const ano = anoCru === undefined
      ? undefined
      : anoCru.length === 2 ? 2000 + Number(anoCru) : Number(anoCru);
    return resolver(Number(barra[1]), Number(barra[2]), ano);
  }

  const extenso = /(\d{1,2})\s*(?:de\s+)?([a-z]+)(?:\s*(?:de\s+)?(\d{4}))?/.exec(t);
  if (extenso?.[1] && extenso[2]) {
    const mes = MESES.findIndex((m) => extenso[2]?.startsWith(m.slice(0, 3)));
    if (mes >= 0) {
      const anoCru = extenso[3];
      return resolver(Number(extenso[1]), mes + 1, anoCru ? Number(anoCru) : undefined);
    }
  }

  return null;
}

function somarDias(isoData: string, dias: number): string {
  const [a, m, d] = isoData.split("-").map(Number);
  const base = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + dias);
  return iso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

function diaDaSemana(isoData: string): string {
  const [a, m, d] = isoData.split("-").map(Number);
  const dt = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1));
  return DIAS_DA_SEMANA[dt.getUTCDay()] ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ritmo de cada serviço
// ─────────────────────────────────────────────────────────────────────────────

type Ritmo = "semanal" | "mensal" | "continuo";

/**
 * Serviços contínuos não viram linha de calendário — legenda acompanha a peça,
 * tráfego e comunidade rodam todo dia, relatório fecha o ciclo. Colocá-los no
 * calendário como se fossem posts é o que faz plano parecer cheio e entregar
 * pouco.
 */
const RITMO: Record<string, Ritmo> = {
  story: "semanal",
  reels: "mensal",
  carrossel: "mensal",
  post_foto: "mensal",
  arte_grafica: "mensal",
  legenda: "continuo",
  trafego: "continuo",
  comunidade: "continuo",
  relatorio: "continuo",
};

/** O primeiro número inteiro da resposta. "2x por semana" → 2. */
function lerQuantidade(valor: string | undefined): number | null {
  if (!valor) return null;
  const m = /\d+/.exec(valor);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  O plano
// ─────────────────────────────────────────────────────────────────────────────

export interface LinhaDoPlano {
  data: string;
  diaDaSemana: string;
  servico: string;
  nome: string;
  /** Frase pronta de quem entrega o material desta linha. */
  quemTrazOMaterial: string;
  /** true quando a linha depende de material que o cliente precisa mandar. */
  dependeDoCliente: boolean;
}

export interface LinhaContinua {
  servico: string;
  nome: string;
  quemTrazOMaterial: string;
  observacao: string;
}

export interface PendenciaDeclarada {
  chave: string;
  pergunta: string;
  porque: string;
}

export interface Plano {
  liberado: boolean;
  motivo: string;
  inicio: string | null;
  fim: string | null;
  linhas: LinhaDoPlano[];
  continuos: LinhaContinua[];
  /** O que o cliente ainda não respondeu — vai impresso, não escondido. */
  pendenciasDeclaradas: PendenciaDeclarada[];
  avisos: string[];
}

export interface PedidoDePlano {
  estado: EstadoDaSondagem;
  /** Data de início em ISO. Sem isto, é lida da resposta `data_inicio`. */
  inicioEm?: string;
  /** Quantas semanas o plano cobre. Padrão 4. */
  semanas?: number;
  /** Hoje, para resolver data sem ano. Injetável para o teste ser estável. */
  hoje?: Date;
}

function frasePorOrigem(origem: OrigemDoInsumo | null, insumo: string): string {
  if (origem === "cliente") return `o cliente entrega o ${insumo}`;
  if (origem === "agencia") return `a agência produz o ${insumo}`;
  if (origem === "misto")   return `${insumo}: parte o cliente entrega, parte a agência produz`;
  return `NÃO DEFINIDO — ninguém sabe de onde vem o ${insumo}`;
}

/**
 * Monta o plano. Só roda com a sondagem fechada — a trava é `podePropor`, e ela
 * vem da mesma regra que a entrevista usa. Não existe caminho que produza plano
 * sem passar por ela.
 */
export function gerarPlano(pedido: PedidoDePlano): Plano {
  const avaliacao = avaliarSondagem(pedido.estado);

  const vazio = (motivo: string): Plano => ({
    liberado: false, motivo, inicio: null, fim: null,
    linhas: [], continuos: [],
    pendenciasDeclaradas: avaliacao.aguardandoCliente.map((p) => ({ chave: p.chave, pergunta: p.pergunta, porque: p.porque })),
    avisos: [],
  });

  if (!avaliacao.podePropor) return vazio(avaliacao.motivo);

  // A data. Explícita ganha; senão sai da resposta do cliente.
  const respostaDeInicio = pedido.estado.ficha?.data_inicio;
  const inicio = pedido.inicioEm?.trim()
    ? lerData(pedido.inicioEm, pedido.hoje)
    : typeof respostaDeInicio === "string" ? lerData(respostaDeInicio, pedido.hoje) : null;

  if (!inicio) {
    return vazio(
      typeof respostaDeInicio === "string" && respostaDeInicio.trim()
        ? `A data de início respondida ("${respostaDeInicio.trim()}") não é uma data. Confirme o dia exato antes de montar o calendário.`
        : "Falta a data de início. Sem ela não existe calendário, existe lista.",
    );
  }

  const semanas = Math.max(1, Math.min(pedido.semanas ?? 4, 26));
  const dias    = semanas * 7;
  const fim     = somarDias(inicio, dias - 1);

  const linhas: LinhaDoPlano[] = [];
  const continuos: LinhaContinua[] = [];

  for (const sa of avaliacao.servicos) {
    const cat    = CATALOGO_DE_SERVICOS.find((s) => s.chave === sa.chave);
    const insumo = cat?.insumo ?? "material";
    const frase  = frasePorOrigem(sa.origemDoInsumo, insumo);
    const ritmo  = RITMO[sa.chave] ?? "mensal";

    if (ritmo === "continuo") {
      continuos.push({
        servico: sa.chave, nome: sa.nome, quemTrazOMaterial: frase,
        observacao: "roda ao longo de todo o período, não vira linha de calendário",
      });
      continue;
    }

    const contratado = (pedido.estado.servicos ?? []).find((s) => s.chave === sa.chave);
    const porCiclo   = lerQuantidade(contratado?.definicoes?.quantidade);
    if (porCiclo === null) continue;   // sem quantidade não dá para distribuir

    const total = ritmo === "semanal"
      ? porCiclo * semanas
      : Math.max(1, Math.round((porCiclo * semanas) / 4));

    for (let i = 0; i < total; i++) {
      // Meio do intervalo em vez das bordas: evita empilhar tudo no dia 1.
      const offset = Math.floor(((i + 0.5) * dias) / total);
      const data = somarDias(inicio, Math.min(offset, dias - 1));
      linhas.push({
        data, diaDaSemana: diaDaSemana(data),
        servico: sa.chave, nome: sa.nome,
        quemTrazOMaterial: frase,
        dependeDoCliente: sa.origemDoInsumo === "cliente" || sa.origemDoInsumo === "misto",
      });
    }
  }

  linhas.sort((a, b) => (a.data === b.data ? a.nome.localeCompare(b.nome) : a.data.localeCompare(b.data)));

  const doCliente = linhas.filter((l) => l.dependeDoCliente).length;
  const avisos: string[] = [];
  if (doCliente > 0) {
    avisos.push(
      `${doCliente} de ${linhas.length} peça(s) dependem de material que o cliente entrega. ` +
      "Combine o prazo de envio — sem material, o calendário para.",
    );
  }
  const semQuantidade = avaliacao.servicos.filter(
    (s) => (RITMO[s.chave] ?? "mensal") !== "continuo" && !linhas.some((l) => l.servico === s.chave),
  );
  for (const s of semQuantidade) {
    avisos.push(`${s.nome} foi contratado mas não entrou no calendário: falta a quantidade.`);
  }
  if (avaliacao.aguardandoCliente.length > 0) {
    avisos.push(
      `${avaliacao.aguardandoCliente.length} pergunta(s) seguem sem resposta do cliente. ` +
      "Estão declaradas no rodapé — não presuma nenhuma delas.",
    );
  }

  return {
    liberado: true,
    motivo: avaliacao.motivo,
    inicio, fim, linhas, continuos,
    pendenciasDeclaradas: avaliacao.aguardandoCliente.map((p) => ({ chave: p.chave, pergunta: p.pergunta, porque: p.porque })),
    avisos,
  };
}

/**
 * O plano em texto, pronto para colar na proposta.
 *
 * O rodapé com as pendências é obrigatório e vem sempre — é ele que impede a
 * proposta de parecer mais fechada do que é.
 */
export function renderizarPlano(plano: Plano): string {
  if (!plano.liberado) return `PLANO NÃO LIBERADO\n${plano.motivo}`;

  const linhas: string[] = [`CALENDÁRIO — ${plano.inicio} a ${plano.fim}`, ""];

  let dataCorrente = "";
  for (const l of plano.linhas) {
    if (l.data !== dataCorrente) {
      dataCorrente = l.data;
      linhas.push(`${l.data} (${l.diaDaSemana})`);
    }
    linhas.push(`  - ${l.nome} — ${l.quemTrazOMaterial}`);
  }

  if (plano.continuos.length > 0) {
    linhas.push("", "AO LONGO DE TODO O PERÍODO:");
    for (const c of plano.continuos) linhas.push(`  - ${c.nome} — ${c.quemTrazOMaterial}`);
  }

  if (plano.pendenciasDeclaradas.length > 0) {
    linhas.push("", "AINDA AGUARDANDO SUA RESPOSTA:");
    for (const p of plano.pendenciasDeclaradas) linhas.push(`  - ${p.pergunta}`);
  }

  if (plano.avisos.length > 0) {
    linhas.push("", "ATENÇÃO:");
    for (const a of plano.avisos) linhas.push(`  - ${a}`);
  }

  return linhas.join("\n");
}
