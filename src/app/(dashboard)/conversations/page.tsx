import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { ConversationStatus } from "@prisma/client";

export const metadata = { title: "Conversas" };

const STATUS_LABELS: Record<ConversationStatus, string> = {
  OPEN: "Aberta",
  BOT: "Bot",
  HUMAN: "Atendimento",
  RESOLVED: "Resolvida",
};

const STATUS_COLORS: Record<ConversationStatus, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  BOT: "bg-purple-100 text-purple-700",
  HUMAN: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-gray-100 text-gray-600",
};

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string; page?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const restaurantId = session.user.restaurantId;
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const limit = 25;
  const skip = (page - 1) * limit;
  const search = searchParams.search?.trim();
  const statusFilter = searchParams.status as ConversationStatus | undefined;

  const validStatus =
    statusFilter && Object.values(ConversationStatus).includes(statusFilter)
      ? statusFilter
      : undefined;

  const where = {
    restaurantId,
    ...(validStatus && { status: validStatus }),
    ...(search && {
      customer: {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
        ],
      },
    }),
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        customer: { select: { name: true, phone: true } },
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { content: true, direction: true, type: true },
        },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <TopBar title="Conversas WhatsApp" />
      <div className="p-6">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {[
              { label: "Todas", value: "" },
              { label: "Abertas", value: "OPEN" },
              { label: "Atendimento", value: "HUMAN" },
              { label: "Resolvidas", value: "RESOLVED" },
            ].map((f) => (
              <Link
                key={f.value}
                href={`?status=${f.value}${search ? `&search=${search}` : ""}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  (validStatus ?? "") === f.value
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>

          <form method="GET" className="ml-auto">
            {validStatus && (
              <input type="hidden" name="status" value={validStatus} />
            )}
            <input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nome ou telefone…"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </form>
        </div>

        <p className="mb-3 text-sm text-gray-500">
          {total} conversa{total !== 1 ? "s" : ""}
        </p>

        {/* List */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {conversations.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-400">
              Nenhuma conversa encontrada.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {conversations.map((conv) => {
                const lastMsg = conv.messages[0];
                const preview = lastMsg
                  ? lastMsg.type !== "TEXT"
                    ? `[${lastMsg.type.toLowerCase()}]`
                    : lastMsg.content.slice(0, 80)
                  : "Sem mensagens";

                return (
                  <li key={conv.id}>
                    <Link
                      href={`/dashboard/conversations/${conv.id}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50"
                    >
                      {/* Avatar placeholder */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                        {conv.customer.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {conv.customer.name}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {conv.unreadCount > 0 && (
                              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-bold text-white">
                                {conv.unreadCount}
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[conv.status]}`}
                            >
                              {STATUS_LABELS[conv.status]}
                            </span>
                          </div>
                        </div>

                        <p className="mt-0.5 truncate text-xs text-gray-500">{conv.customer.phone}</p>
                        <p className="mt-0.5 truncate text-sm text-gray-600">{preview}</p>
                      </div>

                      {/* Time */}
                      {conv.lastMessageAt && (
                        <time className="shrink-0 text-xs text-gray-400">
                          {new Date(conv.lastMessageAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?page=${page - 1}${validStatus ? `&status=${validStatus}` : ""}${search ? `&search=${search}` : ""}`}
                  className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
                >
                  ← Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`?page=${page + 1}${validStatus ? `&status=${validStatus}` : ""}${search ? `&search=${search}` : ""}`}
                  className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
