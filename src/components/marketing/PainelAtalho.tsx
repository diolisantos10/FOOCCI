/**
 * Atalho visível para o painel — só aparece para quem TEM sessão ativa.
 *
 * Existe por causa do conserto de 23/08/2026: a raiz (`foocci.com.br`) deixou de
 * teleportar usuário logado para `/dashboard` e passou a servir sempre o site
 * comercial. Para não piorar a vida de quem opera a loja todo dia, o caminho para
 * o painel continua a um clique — mas explícito, escolhido pela pessoa.
 *
 * Server component de propósito: a sessão é lida no servidor, então o link nunca
 * "pisca" para o visitante anônimo, e nenhum dado de sessão vai para o cliente.
 * Se a leitura da sessão falhar, trata-se como anônimo — a vitrine nunca quebra
 * por causa de um atalho.
 */

import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PainelAtalho() {
  let authed = false;
  try {
    authed = (await getServerSession(authOptions)) !== null;
  } catch {
    authed = false;
  }

  if (!authed) return null;

  return (
    <div className="border-b border-line bg-[#FAFAF8]">
      <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-5 py-2 text-sm lg:px-8">
        <span className="text-ink2">Você está conectado.</span>
        <Link
          href="/dashboard"
          className="rounded-lg bg-brand-500 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
