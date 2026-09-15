/**
 * Comercial → Atendimento.
 *
 * A tela de quatro áreas do item 5 do comando. É onde o SDR passa o dia.
 *
 * ⭐ `?leadId=` abre um lead direto. É a porta que faltava: os cartões das
 * Filas e do Funil apontam para cá com o lead na mão, em vez de mostrarem um
 * lead que não se pode abrir. A justificativa inteira está no bloco de
 * `leadInicial`, em `AtendimentoClient`.
 *
 * Busca e ordenação ficam na URL. Além de permitir recarregar a tela sem perder
 * o recorte, isso deixa o filtro funcionar em qualquer fila/etapa usando a mesma
 * fonte de dados da Sala — sem criar uma segunda lista paralela no navegador.
 */

import { Suspense } from "react";
import { AtendimentoClient } from "./AtendimentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atendimento · Sala de Vendas" };

const ORDENS = ["recentes", "antigas", "nome-az", "nome-za", "prioridade"] as const;
type Ordem = (typeof ORDENS)[number];

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor ?? "").trim();
}

export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{
    leadId?: string | string[];
    busca?: string | string[];
    ordem?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const leadInicial = primeiro(sp.leadId) || null;
  const busca = primeiro(sp.busca);
  const ordemBruta = primeiro(sp.ordem) as Ordem;
  const ordem: Ordem = ORDENS.includes(ordemBruta) ? ordemBruta : "recentes";
  const filtrando = Boolean(busca) || ordem !== "recentes";

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden bg-canvas">
      <div className="shrink-0 border-b border-line bg-paper px-3 py-2">
        <form action="/comercial/conversas" method="GET" className="flex flex-wrap items-center gap-2">
          <label className="min-w-[210px] flex-1 lg:max-w-sm">
            <span className="sr-only">Buscar restaurante ou contato</span>
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Buscar restaurante ou contato…"
              autoComplete="off"
              className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-400"
            />
          </label>

          <label>
            <span className="sr-only">Ordenar conversas</span>
            <select
              name="ordem"
              defaultValue={ordem}
              className="rounded-xl border border-line2 bg-paper px-3 py-2 text-[13px] font-medium text-ink outline-none transition-colors focus:border-brand-400"
            >
              <option value="recentes">Mais recentes</option>
              <option value="antigas">Mais antigas</option>
              <option value="nome-az">Nome A–Z</option>
              <option value="nome-za">Nome Z–A</option>
              <option value="prioridade">Prioridade da fila</option>
            </select>
          </label>

          <button
            type="submit"
            className="rounded-xl bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Aplicar
          </button>

          {filtrando && (
            <a
              href="/comercial/conversas"
              className="rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              Limpar
            </a>
          )}

          <span className="hidden text-[11.5px] text-muted xl:inline">
            Busca por nome, restaurante ou cidade na fila atual.
          </span>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden [&>div]:!h-full">
        <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
          <AtendimentoClient leadInicial={leadInicial} />
        </Suspense>
      </div>
    </div>
  );
}
