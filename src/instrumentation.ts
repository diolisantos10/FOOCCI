/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Node.js server process starts.
 * Starts background schedulers: CartRecoveryScheduler e ScheduledCampaignScheduler.
 * Also auto-syncs Evolution webhook URLs so WhatsApp recovers automatically
 * after every deploy without manual intervention.
 *
 * Faxina: o AutoSimulatorScheduler (tick de 60s) foi DESLIGADO — gravava
 * telemetria que nenhum produto lê (painel em rota não-navegável). O serviço e
 * a rota /ai-simulator permanecem no código, só não rodam no boot.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { CartRecoveryScheduler } = await import(
      "./services/order/CartRecoveryScheduler"
    );
    CartRecoveryScheduler.start();

    const { ScheduledCampaignScheduler } = await import(
      "./services/crm/ScheduledCampaignScheduler"
    );
    ScheduledCampaignScheduler.start();

    // A rodada das 9h da prospecção, dentro do processo. O cron do GitHub
    // continua como reserva; a reserva atômica no banco impede execução dupla.
    const { AgendadorDaProspeccao } = await import(
      "./services/salaDeVendas/prospeccao/agendador"
    );
    AgendadorDaProspeccao.start();

    // ⭐ A VARREDURA QUE ENCHE A FILA, às 7h — ANTES da rodada das 9h.
    //
    // Sem ela a rodada das 9h rodava todo dia útil e concluía `abordados: 0,
    // parouPor: 'filaAcabou'`: a máquina de abordagem ligada, e ninguém para
    // abordar. Fábrica sem matéria-prima não é fábrica.
    const { AgendadorDaDescoberta } = await import(
      "./services/salaDeVendas/prospeccao/hunter/agendador"
    );
    AgendadorDaDescoberta.start();

    // A Supervisora em INTERVENTION precisa agir mesmo quando nenhuma mensagem
    // está saindo. O próprio interruptor faz os outros modos custarem quase zero.
    const { AgendadorDaSupervisora } = await import(
      "./services/salaDeVendas/supervisora/agendador"
    );
    AgendadorDaSupervisora.start();

    // ⭐ COFRE (04/10/2026): o Foocci pede o próprio pareamento à Control Room
    // no boot — gera o segredo se ainda não existir, guarda cifrado e manda só
    // o hash. Idempotente (pedido novo substitui o pendente). Só em produção;
    // nunca derruba o boot e nunca escreve o segredo em log.
    if (process.env.NODE_ENV === "production" && process.env.RAILWAY_ENVIRONMENT_NAME === "production") {
      // Se a porta ainda não existir (a Control Room sobe a dela em paralelo),
      // tenta de novo a cada 6 h até o pedido ser aceito — sem laço apertado.
      const pedir = async (): Promise<boolean> => {
        const { solicitarPareamento } = await import("./services/cofre/pareamento");
        const r = await solicitarPareamento();
        console.info("[cofre] pareamento", r.ok ? `pedido: ${r.status}` : `não pedido: ${r.motivo}`);
        return r.ok;
      };
      pedir()
        .then((ok) => {
          if (ok) return;
          const t = setInterval(() => {
            pedir().then((foi) => { if (foi) clearInterval(t); }).catch(() => {});
          }, 6 * 60 * 60 * 1000);
          t.unref?.();
        })
        .catch((e) => console.warn("[cofre] pareamento não rodou", e instanceof Error ? e.message : String(e)));
    }

    // Antes daqui saía um re-registro do webhook da Evolution a cada deploy. A
    // Evolution foi eliminada em 04/08/2026 e a Meta NÃO precisa disso: o webhook
    // é registrado uma vez no aplicativo e não é marcado como falho por downtime.
  }
}
