/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Node.js server process starts.
 * Starts background schedulers: AutoSimulatorScheduler, CartRecoveryScheduler
 * and ScheduledCampaignScheduler.
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
  }
}
