/**
 * A PORTA DE ENVIO DA CAMPANHA — uma interface, e a implementação real.
 *
 * ── POR QUE UMA INTERFACE, E NÃO A CHAMADA DIRETA ───────────────────────────
 *
 * O motor da campanha (`executar.ts`) precisa ser provável de ponta a ponta:
 * 750 candidatos entram, e é preciso mostrar quantos saem, quantos são barrados
 * e por qual regra. Fazer isso chamando `abordarLead` de verdade exigiria
 * levantar a Meta, os modelos aprovados e a conta da WABA num teste — e um
 * teste que precisa da Meta ou não roda, ou vira mock que sempre passa.
 *
 * Com a porta explícita, o TESTE usa uma porta que aplica a **trava de
 * repetição de verdade** contra um banco falso, e a PRODUÇÃO usa esta aqui, que
 * delega aos dois caminhos reais da casa. Os dois passam pelo mesmo motor.
 *
 * ── ⛔ NENHUMA PORTA PODE PULAR A TRAVA ─────────────────────────────────────
 *
 * `aplicaTravaDeRepeticao` é um campo obrigatório e só o valor `true` é aceito
 * pelo motor. Uma porta futura que não passe pela trava não compila — e se
 * mentir no campo, mente por escrito, com autor. É aviso reforçado por tipo, e
 * a trava de verdade continua sendo o `@@unique` no banco, dentro dos dois
 * caminhos abaixo.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { abordarLead } from "../abordar";
import { registrarSaida } from "../conversa";
import { entregarMensagem } from "../entrega";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type ResultadoDoEnvio =
  | { enviado: true; mensagemId: string }
  | { enviado: false; motivo: string; detalhe: string };

export interface PortaDeEnvio {
  /** ⛔ Só `true` é aceito pelo motor. Ver o cabeçalho. */
  aplicaTravaDeRepeticao: true;
  /** Fora da janela de 24h: um dos modelos aprovados pela Meta. */
  porTemplate(leadId: string): Promise<ResultadoDoEnvio>;
  /** Dentro da janela de 24h: texto livre, já aprovado pela rubrica. */
  naJanela(leadId: string, texto: string): Promise<ResultadoDoEnvio>;
}

/**
 * A porta REAL.
 *
 * ── O TEMPLATE ──────────────────────────────────────────────────────────────
 * `abordarLead` é o caminho que a casa já usa, com TODAS as travas dela: o
 * portão do lead (escolhido pela origem), o freio de ritmo e o teto do dia, a
 * Supervisora avaliando a adequação do template, e a trava de repetição antes
 * de bater na Meta. A campanha não reimplementa nenhuma, e não afrouxa nenhuma.
 *
 * ── A JANELA ────────────────────────────────────────────────────────────────
 * `registrarSaida` + `entregarMensagem`, que é o único caminho por onde passa
 * toda fala livre da casa — e por onde passam a Supervisora e a trava.
 *
 * ⚠️ `autor: "SISTEMA"` de propósito, e não "IA": em `entrega.naturezaDaFala`,
 * `SISTEMA` é **abordagem**, e abordagem PASSA pela trava de repetição. Marcar
 * como IA faria a fala ser tratada como conversa viva e pular a trava. A
 * campanha é a casa falando primeiro; ela passa pela trava, sempre.
 */
export function portaDeEnvioReal(db: Cliente, autorUserId: string): PortaDeEnvio {
  return {
    aplicaTravaDeRepeticao: true,

    async porTemplate(leadId) {
      const r = await abordarLead(db, { leadId, autor: "SISTEMA", autorUserId });
      if (r.abordou) return { enviado: true, mensagemId: r.mensagemId };
      return { enviado: false, motivo: r.motivo, detalhe: r.detalhe };
    },

    async naJanela(leadId, texto) {
      const gravada = await registrarSaida(db, {
        leadId,
        texto,
        autor: "SISTEMA",
        autorUserId,
        tipo: "TEXTO",
      });
      if (!gravada.ok) {
        return { enviado: false, motivo: "naoConseguiuGravar", detalhe: gravada.causa };
      }

      const entrega = await entregarMensagem(db, gravada.mensagemId, "maquina");
      if (entrega.entregue) return { enviado: true, mensagemId: entrega.mensagemId };
      return { enviado: false, motivo: entrega.motivo, detalhe: entrega.detalhe };
    },
  };
}
