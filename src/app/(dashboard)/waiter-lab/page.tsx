/**
 * /waiter-lab — Internal Waiter AI test lab.
 *
 * Auth: protected by (dashboard) layout (NextAuth session required).
 * Env:  disabled in production unless WAITER_LAB_ENABLED=true.
 *
 * Renders the real ordering UI in an iframe alongside a debug panel
 * that fires V2 events directly to /api/pedido/[slug] and validates
 * the response contract without touching the production customer UI.
 */

import WaiterLabClient from "./WaiterLabClient";

export const dynamic = "force-dynamic";

export default function WaiterLabPage() {
  const isProduction = process.env.NODE_ENV === "production";
  const labEnabled = process.env.WAITER_LAB_ENABLED === "true";

  if (isProduction && !labEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl font-bold text-gray-800">Waiter Lab — Desabilitado</p>
        <p className="max-w-md text-gray-500">
          O Waiter Lab está desabilitado em produção. Para habilitar em staging,
          configure <code className="rounded bg-gray-100 px-1 py-0.5 text-sm">WAITER_LAB_ENABLED=true</code> nas
          variáveis de ambiente.
        </p>
      </div>
    );
  }

  const defaultSlug = process.env.TEST_SLUG ?? "pizzaria-demo";

  return <WaiterLabClient defaultSlug={defaultSlug} />;
}
