/**
 * MeasurementFreshnessAlarm — o alarme de que o MEDIDOR morreu.
 *
 * O CASO QUE ORIGINOU ESTE ARQUIVO (24/08/2026)
 * ---------------------------------------------
 * O cron de qualidade disparou todo dia por 10 dias e falhou todos os 10, com
 * HTTP 404 "Application not found" — o segredo `FOOCCI_BASE_URL` apontava para
 * um host morto. Ninguém soube. O painel continuou mostrando o último veredito
 * como se fosse o de hoje, e a auditoria mais recente tinha 248 horas.
 *
 * A URL era o sintoma. A DOENÇA é que um medidor pode morrer em silêncio: o
 * número velho continua na tela, com cara de número novo. É a irmã do uptime
 * travado em zero que esta mesma casa já consertou em /api/health — o valor
 * existia, parecia saudável, e não queria dizer nada.
 *
 * POR QUE O ALARME NÃO É OUTRO CRON
 * ---------------------------------
 * Cron que morre não avisa que morreu. Um vigia agendado morreria pelo mesmo
 * segredo, na mesma hora, pelo mesmo motivo — e o silêncio seria idêntico.
 *
 * Então o batimento aqui é PASSIVO: não se pergunta ao agendador se ele rodou,
 * lê-se o RASTRO que a execução deixa no banco. Se o cron morre, o carimbo para
 * de andar, e quem estiver olhando vê a idade crescer. A leitura acontece no
 * caminho que gente viva já percorre — /api/health e o painel de qualidade —,
 * nunca num horário marcado.
 *
 * A régua de idade é a MESMA da trava da escada (VERDICT_MAX_AGE_HOURS): o que
 * derruba um agente de degrau é exatamente o que acende o alarme. Duas réguas
 * diferentes para o mesmo fato dariam um painel verde com a escada caindo.
 */

import { getLatestRun } from "@/services/quality/persistence/QualityAuditStore";
import { VERDICT_MAX_AGE_HOURS } from "./LiveStageGuard";

/**
 * Um medidor vigiado.
 *
 * `ultimaMedicao` tem que ler o RASTRO da execução (uma linha que o efeito do
 * cron gravou), nunca o agendador. É essa escolha que faz o alarme sobreviver à
 * morte do agendador que ele vigia.
 */
export interface MedidorVigiado {
  id: string;
  nome: string;
  /** Workflow que aciona o medidor — a trilha para quem for consertar. */
  workflow: string;
  /** Idade máxima aceitável do rastro, em horas. */
  limiteHoras: number;
  ultimaMedicao: () => Promise<Date | null>;
}

export interface EstadoDoMedidor {
  id: string;
  nome: string;
  workflow: string;
  fresco: boolean;
  ultimaMedicao: string | null;
  idadeHoras: number | null;
  limiteHoras: number;
  motivo: string;
}

/**
 * O registro dos medidores com vigia REAL.
 *
 * Hoje há um: a auditoria de qualidade — justamente o medidor que a trava da
 * escada consome, então o silêncio dele derrubaria todos os agentes do degrau
 * alto. Os outros 16 crons agendados estão INVENTARIADOS no teste de classe
 * (medidoresVigiados.class.test.ts) como declarados-sem-vigia, com motivo
 * escrito: eles não têm rastro com carimbo de tempo que dê para ler de fora.
 *
 * O passo seguinte — que este arquivo NÃO finge já ter — é um batimento
 * universal: cada rota /api/cron/* registrando o próprio último sucesso numa
 * tabela de heartbeat. Aí todo cron vira vigiável sem adivinhação. Isso pede
 * migração de schema e decisão do CEO; até lá, o inventário no teste é o que
 * impede um cron novo de nascer invisível.
 */
export const MEDIDORES: MedidorVigiado[] = [
  {
    id: "quality-audit",
    nome: "Auditoria de qualidade (o veredito que a escada obedece)",
    workflow: ".github/workflows/quality-audit-cron.yml",
    // Mesma régua da trava: o que derruba de degrau é o que acende o alarme.
    limiteHoras: VERDICT_MAX_AGE_HOURS,
    ultimaMedicao: async () => {
      const run = await getLatestRun();
      return run?.finishedAt ?? null;
    },
  },
];

function avaliar(m: MedidorVigiado, medidoEm: Date | null, agora: Date): EstadoDoMedidor {
  const base = { id: m.id, nome: m.nome, workflow: m.workflow, limiteHoras: m.limiteHoras };

  if (!medidoEm || Number.isNaN(medidoEm.getTime())) {
    return {
      ...base,
      fresco: false,
      ultimaMedicao: null,
      idadeHoras: null,
      motivo: `MEDIDOR SEM RASTRO: "${m.nome}" nunca registrou execução legível. Nada está sendo medido — ver ${m.workflow}.`,
    };
  }

  const idadeHoras = (agora.getTime() - medidoEm.getTime()) / 3_600_000;
  const fresco = idadeHoras <= m.limiteHoras;

  return {
    ...base,
    fresco,
    ultimaMedicao: medidoEm.toISOString(),
    idadeHoras: Number(idadeHoras.toFixed(1)),
    motivo: fresco
      ? `medido há ${idadeHoras.toFixed(1)}h (limite ${m.limiteHoras}h)`
      : `MEDIDOR PARADO: "${m.nome}" não mede há ${idadeHoras.toFixed(1)}h (limite ${m.limiteHoras}h). ` +
        `O número na tela é velho e tem cara de novo — conferir ${m.workflow} e a resposta que ele recebeu (a MENSAGEM, não o status).`,
  };
}

/**
 * Estado de todos os medidores. NUNCA lança: um medidor que não pode ser lido é
 * reportado como parado, nunca omitido. Não conseguir medir o medidor é, ele
 * próprio, o alarme — ausência de informação não é informação.
 */
export async function avaliarMedidores(
  opts: { now?: Date; medidores?: MedidorVigiado[] } = {},
): Promise<EstadoDoMedidor[]> {
  const agora = opts.now ?? new Date();
  const lista = opts.medidores ?? MEDIDORES;

  return Promise.all(
    lista.map(async (m) => {
      try {
        return avaliar(m, await m.ultimaMedicao(), agora);
      } catch (err) {
        const detalhe = err instanceof Error ? err.message.slice(0, 120) : "erro";
        return {
          id: m.id,
          nome: m.nome,
          workflow: m.workflow,
          limiteHoras: m.limiteHoras,
          fresco: false,
          ultimaMedicao: null,
          idadeHoras: null,
          motivo: `MEDIDOR ILEGÍVEL: não deu para ler o rastro de "${m.nome}" (${detalhe}).`,
        };
      }
    }),
  );
}

/**
 * Resumo para o /api/health — público, então só o suficiente para gritar:
 * quais medidores estão de pé, sem números nem detalhe de dentro de casa.
 */
export async function resumoDeFrescorParaHealth(now?: Date): Promise<Record<string, boolean>> {
  const estados = await avaliarMedidores({ now });
  return Object.fromEntries(estados.map((e) => [e.id, e.fresco]));
}
