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

    // Re-register Evolution webhook after every deploy so WhatsApp never goes
    // silent due to Evolution marking the endpoint as failed during downtime.
    const { syncAllEvolutionWebhooks } = await import(
      "./services/evolution/EvolutionWebhookStartupSync"
    );
    void syncAllEvolutionWebhooks();
  }
}

