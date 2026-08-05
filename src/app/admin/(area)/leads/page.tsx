/**
 * /admin/leads — every demo request that came from the public site.
 *
 * THIS IS THE VAULT. The notification e-mail is an alert that can fail; this list
 * is read straight from the database and cannot. If a lead ever "did not arrive",
 * it is here — check the aviso column to see why the e-mail did not go out.
 *
 * A coluna CÓDIGO é o que fecha o ciclo novo: o formulário leva a pessoa ao
 * WhatsApp com uma mensagem que termina em `#A7K2M`. Quando esse "oi" chegar, é
 * aqui que se descobre quem falou e o que ela já tinha contado. Sem número de
 * vendas configurado a coluna fica preenchida do mesmo jeito — o código nasce na
 * gravação do lead, não no redirecionamento.
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
        {/*
          O shell do admin é ESCURO (`bg-gray-950`), e este título vinha em
          `text-gray-900` desde que a página nasceu: preto sobre quase-preto,
          ilegível em produção. O corpo da página continua em cartão claro — o que
          funciona sobre o escuro —, mas o que encosta direto no fundo precisa ser
          claro. `text-paper` é o branco dos tokens.
        */}
        <h1 className="text-2xl font-semibold text-paper">Contatos do site</h1>
        <p className="mt-1 text-sm text-muted">
          Pedidos de demonstração vindos de <code className="rounded bg-canvas px-1">/site/demonstracao</code>.
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
        <div className="rounded-xl border border-dashed border-line2 bg-paper px-6 py-14 text-center">
          <p className="text-base font-semibold text-ink2">Nenhum contato ainda.</p>
          <p className="mt-1 text-sm text-muted">
            Quando alguém pedir uma demonstração pelo site, aparece aqui na hora.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="min-w-full text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Quando</th>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">WhatsApp</th>
                <th className="px-4 py-3 font-semibold">Restaurante</th>
                <th className="px-4 py-3 font-semibold">Cidade</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Desafio</th>
                <th className="px-4 py-3 font-semibold">Aviso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map((l) => {
                const wa = waLink(l.whatsapp);
                return (
                  <tr key={l.id} className="align-top hover:bg-canvas">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(l.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {l.codigo ? (
                        <span className="rounded-lg bg-brand-50 px-2 py-1 font-semibold tabular-nums text-brand-700">
                          #{l.codigo}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink">{l.nome}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-brand-600 hover:underline"
                        >
                          {l.whatsapp}
                        </a>
                      ) : (
                        <span className="text-ink2">{l.whatsapp}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink2">{l.restaurante ?? "—"}</td>
                    <td className="px-4 py-3 text-ink2">{l.cidade ?? "—"}</td>
                    <td className="px-4 py-3 text-ink2">{l.tipo ?? "—"}</td>
                    <td className="px-4 py-3 text-ink2">{l.desafio ?? "—"}</td>
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
