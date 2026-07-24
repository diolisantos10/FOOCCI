/**
 * SupportSystemProbe — coleta de sinais READ-ONLY do sistema para o Agente de
 * Suporte ancorar o diagnóstico. NUNCA muta nada. NUNCA expõe o VALOR de um
 * segredo — apenas se ele está presente (booleano).
 *
 * O que coleta hoje (Fase 0, dependência mínima):
 *   • conectividade do banco (SELECT 1),
 *   • presença (não o valor) das variáveis de ambiente críticas.
 *
 * Ganchos deixados para Fase 1 (status de Meta/Evolution/pagamento) exigem
 * contexto de tenant e chamadas externas — entram depois, atrás da mesma
 * disciplina read-only.
 */

import { prisma } from "@/lib/prisma";

export interface SignalCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface SystemSnapshot {
  takenAt: string;
  db: { ok: boolean; detail: string };
  /** Presença (booleano) de config crítica — nunca o valor. */
  config: SignalCheck[];
  /** Resumo em uma linha para o topo do prompt. */
  summary: string;
  /** true = nenhum sinal crítico caído (o que o probe consegue ver). */
  healthy: boolean;
}

/** Presença de env var, sem revelar o conteúdo. */
function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 && v !== "not-configured";
}

/** Roda o probe. `now` é injetável para testes. */
export async function probeSystem(now: Date = new Date()): Promise<SystemSnapshot> {
  let dbOk = false;
  let dbDetail = "sem checagem";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbDetail = "respondendo";
  } catch (err) {
    dbOk = false;
    dbDetail = err instanceof Error ? err.message.slice(0, 80) : "inacessível";
  }

  const config: SignalCheck[] = [
    { key: "openaiKey", label: "IA (OpenAI)", ok: present("OPENAI_API_KEY"), detail: present("OPENAI_API_KEY") ? "configurada" : "ausente" },
    { key: "databaseUrl", label: "Banco (DATABASE_URL)", ok: present("DATABASE_URL"), detail: present("DATABASE_URL") ? "configurada" : "ausente" },
    { key: "encryptionKey", label: "Criptografia", ok: present("ENCRYPTION_KEY"), detail: present("ENCRYPTION_KEY") ? "configurada" : "ausente" },
    { key: "nextauthSecret", label: "Sessão (NextAuth)", ok: present("NEXTAUTH_SECRET"), detail: present("NEXTAUTH_SECRET") ? "configurada" : "ausente" },
    { key: "mpWebhookSecret", label: "Webhook de pagamento", ok: present("MP_WEBHOOK_SECRET"), detail: present("MP_WEBHOOK_SECRET") ? "configurada" : "ausente" },
  ];

  const missing = config.filter((c) => !c.ok).map((c) => c.label);
  const healthy = dbOk && missing.length === 0;
  const summary = healthy
    ? "Sinais que consigo ver: banco respondendo e config crítica presente. Sem incidente aparente."
    : [
        !dbOk ? `Banco: ${dbDetail}.` : null,
        missing.length ? `Config ausente: ${missing.join(", ")}.` : null,
      ].filter(Boolean).join(" ");

  return {
    takenAt: now.toISOString(),
    db: { ok: dbOk, detail: dbDetail },
    config,
    summary,
    healthy,
  };
}

/** Bloco compacto dos sinais, para injetar no prompt do reasoner. */
export function buildProbeContext(snap: SystemSnapshot): string {
  const cfg = snap.config.map((c) => `• ${c.label}: ${c.ok ? "ok" : "AUSENTE"}`).join("\n");
  return [
    "━━━ SINAIS READ-ONLY DO SISTEMA AGORA ━━━",
    `Banco de dados: ${snap.db.ok ? "respondendo" : `INACESSÍVEL (${snap.db.detail})`}`,
    cfg,
    `Leitura geral: ${snap.summary}`,
    "━━━",
  ].join("\n");
}
