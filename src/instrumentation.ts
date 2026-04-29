/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Node.js server process starts.
 * Starts the AutoSimulatorScheduler background job.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { AutoSimulatorScheduler } = await import(
      "./services/ai/AutoSimulatorScheduler"
    );
    AutoSimulatorScheduler.start();
  }
}
