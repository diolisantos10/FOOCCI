/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Node.js server process starts.
 * Starts background schedulers: AutoSimulatorScheduler and CartRecoveryScheduler.
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
  }
}
