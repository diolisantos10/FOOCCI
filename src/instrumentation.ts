/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Node.js server process starts.
 * Starts background schedulers: AutoSimulatorScheduler, CartRecoveryScheduler
 * and ScheduledCampaignScheduler.
 * Also auto-syncs Evolution webhook URLs so WhatsApp recovers automatically
 * after every deploy without manual intervention.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { AutoSimulatorScheduler } = await import(
      "./services/ai/AutoSimulatorScheduler"
    );
    AutoSimulatorScheduler.start();

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

