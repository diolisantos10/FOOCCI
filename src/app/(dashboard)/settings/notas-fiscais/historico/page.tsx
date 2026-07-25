import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, type FiscalDocumentStatus } from "@prisma/client";

export const metadata = { title: "Histórico de Notas Fiscais" };

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Pendente", cls: "bg-amber-100 text-amber-800" },
  PROCESSANDO: { label: "Processando", cls: "bg-blue-100 text-blue-700" },
  AUTORIZADA: { label: "Autorizada", cls: "bg-green-100 text-green-700" },
  REJEITADA: { label: "Rejeitada", cls: "bg-red-100 text-red-700" },
  CONTINGENCIA: { label: "Contingência", cls: "bg-amber-100 text-amber-800" },
  ERRO: { label: "Erro", cls: "bg-red-100 text-red-700" },
  CANCELADA: { label: "Cancelada", cls: "bg-line2 text-muted" },
};

const FILTERS = ["TODAS", "AUTORIZADA", "PROCESSANDO", "REJEITADA", "PENDENTE", "CANCELADA"] as const;

export default async function NotasFiscaisHistoricoPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const status = (searchParams.status ?? "TODAS").toUpperCase();
  const where: Prisma.FiscalDocumentWhereInput = { restaurantId: session.user.restaurantId };
  if (status !== "TODAS" && status in STATUS) {
    where.status = status as FiscalDocumentStatus;
  }

  const docs = await prisma.fiscalDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      order: { select: { id: true, orderNumber: true, customer: { select: { name: true } } } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Histórico de notas fiscais</h1>
          <p className="text-sm text-muted">Últimas 200 notas emitidas por esta loja.</p>
        </div>
        <Link href="/settings/notas-fiscais" className="text-sm text-brand-600 hover:underline">
          ← Configurações
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f;
          return (
            <Link
              key={f}
              href={f === "TODAS" ? "/settings/notas-fiscais/historico" : `/settings/notas-fiscais/historico?status=${f}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active ? "bg-brand-600 text-white" : "border border-line2 bg-paper text-ink2 hover:bg-[#FAFAF8]"
              }`}
            >
              {f === "TODAS" ? "Todas" : STATUS[f]?.label ?? f}
            </Link>
          );
        })}
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-10 text-center">
          <p className="text-sm text-muted">Nenhuma nota por aqui ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-paper shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Nº / Série</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const st = STATUS[d.status] ?? { label: d.status, cls: "bg-line2 text-ink2" };
                return (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      {d.numero ? `${d.numero} / ${d.serie ?? "—"}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      {(d.status === "REJEITADA" || d.status === "ERRO") && (d.rejeicaoMotivo || d.lastError) && (
                        <p className="mt-1 max-w-[220px] truncate text-xs text-red-600" title={d.rejeicaoMotivo ?? d.lastError ?? ""}>
                          {d.rejeicaoMotivo ?? d.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink2">
                      {d.order?.orderNumber ? `#${d.order.orderNumber}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink2">{d.order?.customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink2">
                      {d.valorTotal != null ? `R$ ${Number(d.valorTotal).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{new Date(d.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {d.danfceUrl && (
                          <a href={d.danfceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">
                            DANFCE
                          </a>
                        )}
                        {d.order?.id && (
                          <Link href={`/orders/${d.order.id}`} className="text-xs text-brand-600 hover:underline">
                            Pedido
                          </Link>
                        )}
                      </div>
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
