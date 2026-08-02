/**
 * /admin/leads — every demo request that came from the public site.
 *
 * THIS IS THE VAULT. The notification e-mail is an alert that can fail; this list
 * is read straight from the database and cannot. If a lead ever "did not arrive",
 * it is here — check the aviso column to see why the e-mail did not go out.
 *
 * Server component: the admin area is gated by the admin cookie in its own layout,
 * so reading with Prisma directly here is safe and avoids an extra round trip.
 */

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contatos do site" };

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

/** Digits only, so the wa.me link works regardless of how the visitor typed it. */
function waLink(whatsapp: string): string | null {
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

export default async function AdminLeadsPage() {
  const leads = await prisma.siteLead.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const semAviso = leads.filter((l) => l.notifiedAt === null).length;

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Contatos do site</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pedidos de demonstração vindos de <code className="rounded bg-gray-100 px-1">/site/demonstracao</code>.
          Esta lista é a fonte da verdade — o e-mail é só o aviso.
        </p>
      </header>

      {semAviso > 0 && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{semAviso}</strong>{" "}
          {semAviso === 1 ? "contato chegou" : "contatos chegaram"} sem aviso por e-mail.
          Eles estão salvos — veja o motivo na coluna <em>Aviso</em>.
        </div>
      )}

      {leads.length === 0 ? (
        /* Empty state — DESIGN.md §6.1 */
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <p className="text-base font-medium text-gray-700">Nenhum contato ainda.</p>
          <p className="mt-1 text-sm text-gray-500">
            Quando alguém pedir uma demonstração pelo site, aparece aqui na hora.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Quando</th>
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">WhatsApp</th>
                <th className="px-4 py-3 font-semibold">Restaurante</th>
                <th className="px-4 py-3 font-semibold">Cidade</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Desafio</th>
                <th className="px-4 py-3 font-semibold">Aviso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l) => {
                const wa = waLink(l.whatsapp);
                return (
                  <tr key={l.id} className="align-top hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDate(l.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{l.nome}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-orange-600 hover:underline"
                        >
                          {l.whatsapp}
                        </a>
                      ) : (
                        <span className="text-gray-700">{l.whatsapp}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{l.restaurante ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{l.cidade ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{l.tipo ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{l.desafio ?? "—"}</td>
                    <td className="px-4 py-3">
                      {l.notifiedAt ? (
                        <span className="text-green-700">enviado</span>
                      ) : (
                        /* Guardrail 6: the alert carries its own evidence. */
                        <span className="text-amber-700" title={l.notifyError ?? undefined}>
                          {l.notifyError ?? "não enviado"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
