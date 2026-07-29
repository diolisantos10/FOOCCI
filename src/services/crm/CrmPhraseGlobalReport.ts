/**
 * CrmPhraseGlobalReport — a conversão por frase, olhando a rede inteira.
 *
 * O detector de campeã já acha a melhor frase DE UMA CAMPANHA. Isso ensina o
 * agente daquele restaurante. Mas há uma pergunta que só aparece de cima:
 *
 *   existe frase que funciona em TODO LUGAR?
 *
 * Uma frase que converte bem num restaurante pode ser sorte, ou pode ser o
 * público daquele bairro. A mesma frase convertendo acima da média em cinco
 * casas diferentes é outra coisa — é padrão, e padrão dá para copiar. É esse o
 * repertório que vale renovar primeiro.
 *
 * A junção é possível porque o `variantKey` é impressão digital do TEXTO
 * (generateMessageFingerprint): a mesma frase em duas casas cai na mesma chave
 * sozinha, sem ninguém cadastrar nada.
 *
 * PRIVACIDADE: agrega só template e contagem. A frase é texto de campanha, não
 * conteúdo de cliente — nenhum nome, telefone ou pedido entra aqui. E o corte
 * mínimo de restaurantes tem efeito colateral bom: uma frase usada por uma casa
 * só nunca aparece no relatório global, então ninguém lê a estratégia do vizinho
 * pelo painel.
 *
 * READ-ONLY: não escreve, não envia, não promove frase nenhuma.
 */

import { prisma } from "@/lib/prisma";
import { CHAVE_DO_AGENTE } from "./CrmPilotObservability";

const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

/** Envios mínimos para a taxa de uma frase ser levada a sério. */
export const MIN_ENVIOS_GLOBAL = 50;

/** Em quantas casas distintas a frase precisa ter rodado para virar padrão. */
export const MIN_RESTAURANTES = 2;

/** Quanto acima da média da rede a frase precisa converter para ser destaque. */
export const LIFT_DE_DESTAQUE = 1.3;

/** Teto de execuções lidas por varredura — o relatório não pode virar peso. */
const TETO_DE_LEITURA = 50_000;

export interface FraseGlobal {
  variantKey: string;
  /** O texto, quando ainda existe alguma execução que o carregue. */
  texto: string | null;
  envios: number;
  conversoes: number;
  taxa: number;
  /** Em quantos restaurantes distintos essa frase rodou. */
  restaurantes: number;
  /** Quantas vezes acima da média da rede. 1.8 = 80% acima. */
  liftVsRede: number;
  /** true quando bate os cortes de amostra, alcance e lift. */
  destaque: boolean;
  /** true quando é a mensagem composta pelo agente, não uma frase de template. */
  doAgente: boolean;
}

export interface RelatorioGlobalDeFrases {
  ok: boolean;
  /** Média de conversão da rede — a régua contra a qual todas são medidas. */
  taxaDaRede: number;
  enviosTotais: number;
  conversoesTotais: number;
  frasesMedidas: number;
  /** As que passaram nos cortes, da melhor para a pior. */
  destaques: FraseGlobal[];
  /** Todas as frases com amostra suficiente, ordenadas por taxa. */
  frases: FraseGlobal[];
  leitura: string;
  /** true quando a varredura bateu no teto e o retrato está parcial. */
  truncado: boolean;
  runtimeTouched: false;
}

interface Acumulado {
  envios: number;
  conversoes: number;
  restaurantes: Set<string>;
  texto: string | null;
}

/**
 * Agrega as execuções por frase. Puro: recebe as linhas já lidas, então dá para
 * testar a regra sem banco — que é onde os erros de contagem se escondem.
 */
export function agregarFrases(
  linhas: Array<{ variantKey: string | null; restaurantId: string | null; converted: boolean; messageText: string | null }>,
  truncado = false,
): RelatorioGlobalDeFrases {
  const porChave = new Map<string, Acumulado>();
  let enviosTotais = 0;
  let conversoesTotais = 0;

  for (const l of linhas) {
    const chave = l.variantKey?.trim();
    if (!chave) continue;                       // sem chave não há o que agregar
    enviosTotais++;
    if (l.converted) conversoesTotais++;

    const atual = porChave.get(chave) ?? { envios: 0, conversoes: 0, restaurantes: new Set<string>(), texto: null };
    atual.envios++;
    if (l.converted) atual.conversoes++;
    if (l.restaurantId) atual.restaurantes.add(l.restaurantId);
    // O texto guardado é o da mensagem já personalizada; serve para reconhecer a
    // frase, não para copiar ao pé da letra. Fica o primeiro visto, por estabilidade.
    if (!atual.texto && l.messageText?.trim()) atual.texto = l.messageText.trim().slice(0, 400);
    porChave.set(chave, atual);
  }

  const taxaDaRede = enviosTotais > 0 ? conversoesTotais / enviosTotais : 0;

  const frases: FraseGlobal[] = [...porChave.entries()]
    .filter(([, a]) => a.envios >= MIN_ENVIOS_GLOBAL)
    .map(([variantKey, a]) => {
      const taxa = a.envios > 0 ? a.conversoes / a.envios : 0;
      const liftVsRede = taxaDaRede > 0 ? taxa / taxaDaRede : 0;
      const doAgente = variantKey === CHAVE_DO_AGENTE;
      return {
        variantKey,
        texto: a.texto,
        envios: a.envios,
        conversoes: a.conversoes,
        taxa: Number(taxa.toFixed(4)),
        restaurantes: a.restaurantes.size,
        liftVsRede: Number(liftVsRede.toFixed(2)),
        // A mensagem do agente é única por cliente: agrupá-la como "uma frase"
        // mede o AGENTE, não um template. Ela aparece no relatório, mas nunca
        // como padrão a copiar — não existe texto para copiar.
        destaque: !doAgente && a.restaurantes.size >= MIN_RESTAURANTES && liftVsRede >= LIFT_DE_DESTAQUE,
        doAgente,
      };
    })
    .sort((a, b) => b.taxa - a.taxa);

  const destaques = frases.filter((f) => f.destaque);

  const leitura = enviosTotais === 0
    ? "Nenhum envio medido ainda — o relatório global só existe depois que as campanhas rodarem."
    : destaques.length === 0
      ? `Média da rede em ${(taxaDaRede * 100).toFixed(2)}%. Nenhuma frase se destacou em ${MIN_RESTAURANTES}+ casas ainda — ` +
        "sem padrão comprovado, não há o que copiar."
      : `Média da rede em ${(taxaDaRede * 100).toFixed(2)}%. ${destaques.length} frase(s) convertem acima disso em ` +
        `${MIN_RESTAURANTES}+ casas — são as que valem copiar primeiro.`;

  return {
    ok: true,
    taxaDaRede: Number(taxaDaRede.toFixed(4)),
    enviosTotais,
    conversoesTotais,
    frasesMedidas: frases.length,
    destaques,
    frases,
    leitura,
    truncado,
    runtimeTouched: false,
  };
}

/**
 * O relatório global lido do banco.
 *
 * Só admin chama isto: a leitura cruza restaurantes de propósito, então não
 * pode existir caminho de tenant até aqui.
 */
export async function relatorioGlobalDeFrases(opts: { desde?: Date; restaurantIds?: string[] } = {}): Promise<RelatorioGlobalDeFrases> {
  const linhas = await prisma.campaignExecution.findMany({
    where: {
      status: { in: SENT_STATUSES as unknown as never },
      variantKey: { not: null },
      ...(opts.desde ? { createdAt: { gte: opts.desde } } : {}),
      ...(opts.restaurantIds?.length ? { restaurantId: { in: opts.restaurantIds } } : {}),
    },
    select: { variantKey: true, restaurantId: true, converted: true, messageText: true },
    orderBy: { createdAt: "desc" },
    take: TETO_DE_LEITURA,
  });

  return agregarFrases(linhas, linhas.length >= TETO_DE_LEITURA);
}
