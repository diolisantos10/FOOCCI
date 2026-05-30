/**
 * Admin → Build OS — received commands (Priority 1.1, READ-ONLY).
 *
 * Server-rendered inside the admin-protected (area) layout. Lists Build OS
 * commands received from authorized WhatsApp operators. No editing, no sending,
 * no confirmation actions, no Claude/GitHub integration — pure visualization.
 */

import { getBuildCommandsForAdmin } from "@/services/buildos/BuildCommandService";
import { isBuildOsEnabled } from "@/services/buildos/BuildCommandRouter";
import type { AdminBuildCommandView } from "@/services/buildos/types";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-blue-50 text-blue-700",
  AWAITING_CONFIRMATION: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  FAILED: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 3)}•••${phone.slice(-4)}`;
}

export default async function AdminBuildPage() {
  let commands: AdminBuildCommandView[] = [];
  let loadError = false;
  try {
    commands = await getBuildCommandsForAdmin();
  } catch {
    loadError = true;
  }

  const enabled = isBuildOsEnabled();

  return (
    <div className="min-h-full space-y-6 bg-white px-8 py-6 text-gray-900">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Build OS · Prompt Relay</h1>
        <p className="text-sm text-gray-500">
          Comandos recebidos de operadores autorizados via WhatsApp. Somente leitura.
        </p>
      </header>

      {/* Feature-flag + scope notice */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p>
          Fase de <strong>captação de comandos</strong> (Priority 1.1). Esta área apenas{" "}
          <strong>registra e exibe</strong> comandos — não há geração de prompt por IA, nem conexão
          com Claude/GitHub, nem execução automática. Apenas telefones autorizados criam registros.
        </p>
        <p className="mt-2">
          Estado do recurso:{" "}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-green-500" : "bg-gray-400"}`} />
            BUILDOS_ENABLED {enabled ? "ON" : "OFF"}
          </span>{" "}
          {!enabled && (
            <span className="text-gray-400">
              — desligado: comandos do WhatsApp são ignorados até a flag ser ativada.
            </span>
          )}
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-red-600">Não foi possível carregar os comandos. Tente novamente.</p>
      ) : commands.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">Nenhum comando recebido ainda.</p>
          <p className="mt-1 text-xs text-gray-400">
            Comandos chegam quando um operador autorizado envia <code>/build</code>, <code>/cmd</code>{" "}
            ou <code>/prompt</code> no WhatsApp.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Operador</th>
                <th className="px-4 py-3 font-semibold">Comando</th>
                <th className="px-4 py-3 font-semibold">Projeto</th>
                <th className="px-4 py-3 font-semibold">Canal</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Recebido</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.shortId}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{c.senderName ?? "—"}</p>
                    <p className="font-mono text-xs text-gray-400">{maskPhone(c.senderPhone)}</p>
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <p className="text-gray-900">
                      <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                        {c.commandPrefix}
                      </span>
                      {c.commandText || <span className="text-gray-400">(vazio)</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.projectName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{c.sourceChannel}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(c.createdAt).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
