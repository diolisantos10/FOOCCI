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
  /** CRITICAL = infra que, ausente, é incidente real. OPTIONAL = integração que
   *  pode legitimamente não estar configurada (não derruba a saúde geral). */
  tier: "CRITICAL" | "OPTIONAL";
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

  const mk = (key: string, label: string, env: string, tier: "CRITICAL" | "OPTIONAL"): SignalCheck => ({
    key, label, ok: present(env), detail: present(env) ? "configurada" : "ausente", tier,
  });
  const config: SignalCheck[] = [
    mk("openaiKey", "IA (OpenAI)", "OPENAI_API_KEY", "CRITICAL"),
    mk("databaseUrl", "Banco (DATABASE_URL)", "DATABASE_URL", "CRITICAL"),
    mk("encryptionKey", "Criptografia", "ENCRYPTION_KEY", "CRITICAL"),
    mk("nextauthSecret", "Sessão (NextAuth)", "NEXTAUTH_SECRET", "CRITICAL"),
    // Integração opcional: pode não estar configurada por escolha do restaurante —
    // ausência NÃO é incidente e não pode sequestrar o diagnóstico.
    mk("mpWebhookSecret", "Webhook de pagamento", "MP_WEBHOOK_SECRET", "OPTIONAL"),
  ];

  const criticalMissing = config.filter((c) => c.tier === "CRITICAL" && !c.ok).map((c) => c.label);
  const optionalMissing = config.filter((c) => c.tier === "OPTIONAL" && !c.ok).map((c) => c.label);
  // Saúde geral só olha infra CRÍTICA (banco + segredos essenciais).
  const healthy = dbOk && criticalMissing.length === 0;
  const summary = healthy
    ? `Sinais que consigo ver: banco respondendo e infra crítica presente. Sem incidente aparente${optionalMissing.length ? ` (integração opcional não configurada: ${optionalMissing.join(", ")} — informativo, não é falha)` : ""}.`
    : [
        !dbOk ? `Banco: ${dbDetail}.` : null,
        criticalMissing.length ? `Infra crítica ausente: ${criticalMissing.join(", ")}.` : null,
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
  const cfg = snap.config
    .map((c) => `• ${c.label} [${c.tier === "OPTIONAL" ? "opcional" : "crítico"}]: ${c.ok ? "ok" : "AUSENTE"}`)
    .join("\n");
  return [
    "━━━ SINAIS READ-ONLY DO SISTEMA AGORA (contexto de fundo) ━━━",
    `Banco de dados: ${snap.db.ok ? "respondendo" : `INACESSÍVEL (${snap.db.detail})`}`,
    cfg,
    `Leitura geral: ${snap.summary}`,
    "NOTA: um item [opcional] AUSENTE é informativo — NÃO é incidente e NÃO explica",
    "um relato sobre outro assunto. Só cite um sinal se ele tiver relação com o relato.",
    "━━━",
  ].join("\n");
}
