/**
 * A CENTRAL DE ATENDIMENTO, desenhada — tela 03 do desenho do CEO.
 *
 * ── POR QUE ESTE ARQUIVO NÃO TEM `"use client"` NEM `fetch` ─────────────────
 *
 * É um componente PURO: recebe a Central já montada e devolve markup. Não vai
 * ao banco, não guarda estado, não envia nada. Isso não é gosto — é o que
 * permite que o teste renderize esta tela de verdade, com dados que saíram do
 * serviço, e meça o HTML que o usuário recebe. Um componente que busca o próprio
 * dado só se testa por dublê da busca, e aí a régua mede o dublê.
 *
 * Quem vai ao banco é `page.tsx`, no servidor, com a sessão na mão.
 *
 * ── A ORDEM DA TELA É A DECISÃO MAIS IMPORTANTE DELA ────────────────────────
 *
 * Copiada, de propósito, da doutrina que o painel do gerente já fixou: começa
 * pelo que exige ação AGORA — quem está esperando, sem responsável, com SLA
 * estourado — e só depois mostra a distribuição do time e a fila do SDR.
 *
 * ── E ONDE NÃO HÁ DADO, ESTÁ ESCRITO ────────────────────────────────────────
 *
 * `Espera` e a espera de cada lead são uniões com `medido: false`. A tela é
 * obrigada a escrever a frase em vez do número. Não existe neste arquivo um
 * `?? 0` que transforme "não sei" em "zero".
 */

import Link from "next/link";
import type {
  CentralDeAtendimento,
  EsperaDoLead,
  LeadEsperando,
} from "@/services/salaDeVendas/centralDeAtendimento";

/** O rótulo humano de cada situação de atendimento. */
const ROTULO_DE_QUEM_ATENDE = {
  IA: "IA",
  HUMANO: "Humano",
  AGUARDANDO_HUMANO: "Aguardando humano",
  NINGUEM: "Sem responsável",
} as const;

const ROTULO_DO_ESTADO: Record<string, string> = {
  DISPONIVEL: "Disponível",
  OCUPADO: "Ocupado",
  PAUSADO: "Pausado",
  OFFLINE: "Offline",
};

/** Minutos viram "3 h 20" em vez de "200". Ninguém lê fila em minutos puros. */
export function duracaoHumana(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A frase da espera de um lead — número quando medido, motivo quando não. */
export function frasesDaEspera(e: EsperaDoLead): string {
  return e.medido ? duracaoHumana(e.minutos) : "não medido — sem mensagem registrada";
}

// ─────────────────────────────────────────────────────────────────────────────

function Cartao(props: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        props.alerta ? "border-amber-200 bg-amber-50/60" : "border-line bg-paper"
      }`}
    >
      <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {props.rotulo}
      </p>
      <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-.02em] text-ink">
        {props.valor}
      </p>
      {props.detalhe && <p className="mt-1 text-[11.5px] leading-snug text-muted">{props.detalhe}</p>}
    </div>
  );
}

function Secao(props: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-[13px] font-semibold tracking-[-.01em] text-ink">{props.titulo}</h2>
      {props.nota && <p className="mt-0.5 text-[11.5px] text-muted">{props.nota}</p>}
      <div className="mt-2">{props.children}</div>
    </section>
  );
}

function LinhaDaEspera({ l }: { l: LeadEsperando }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={`/comercial/conversas?leadId=${l.leadId}`}
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2.5 transition-colors hover:bg-canvas"
      >
        <span className="min-w-0">
          <span className="text-[13px] font-semibold text-ink">{l.nome}</span>
          {l.prioritario && (
            <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-900">
              prioritário
            </span>
          )}
          <span className="block text-[11.5px] text-muted">
            {[l.restaurante, l.cidade].filter(Boolean).join(" · ") || "sem restaurante informado"}
          </span>
        </span>
        <span
          className={`shrink-0 text-[12.5px] font-semibold ${
            l.espera.medido ? "text-ink2" : "text-muted"
          }`}
        >
          {frasesDaEspera(l.espera)}
        </span>
      </Link>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OS TRÊS ESTADOS QUE TODA TELA PRECISA TER
// ─────────────────────────────────────────────────────────────────────────────

export function CentralCarregando() {
  return <p className="p-6 text-[13px] text-muted">Carregando a central…</p>;
}

export function CentralComErro({ detalhe }: { detalhe: string | null }) {
  return (
    <div className="p-6">
      <p className="text-[13px] font-semibold text-ink">A central não pôde ser montada.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
        Nenhum número é mostrado enquanto não houver medição — um painel que
        estampa zero quando a consulta falhou mente com cara de calmaria.
      </p>
      {detalhe && <p className="mt-2 text-[11.5px] text-muted">Detalhe técnico: {detalhe}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function CentralDeAtendimentoView({ c }: { c: CentralDeAtendimento }) {
  const totalAtendendo =
    c.quemAtende.ia + c.quemAtende.humano + c.quemAtende.aguardandoHumano + c.quemAtende.ninguem;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-[17px] font-semibold tracking-[-.02em] text-ink">
          Central de atendimento
        </h1>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          A visão de cima das conversas. Para atender, abra a conversa — esta tela
          só lê.
        </p>
      </header>

      {/* ── O AGORA ─────────────────────────────────────────────────────── */}
      <Secao titulo="O que exige ação agora">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <Cartao
            rotulo="Esperando gente"
            valor={String(c.filas.aguardandoHumano)}
            detalhe={
              c.espera.medido
                ? `maior espera: ${duracaoHumana(c.espera.maiorEsperaMin)} · ${c.espera.handoffsAbertos} passagem(ns) aberta(s)`
                : "nenhuma passagem aberta — não há espera para medir"
            }
            alerta={c.filas.aguardandoHumano > 0}
          />
          <Cartao
            rotulo="Sem responsável"
            valor={String(c.filas.semResponsavel)}
            alerta={c.filas.semResponsavel > 0}
          />
          <Cartao
            rotulo="SLA estourado"
            valor={String(c.filas.slaEstourado)}
            alerta={c.filas.slaEstourado > 0}
          />
          <Cartao
            rotulo="Follow-up vencido"
            valor={String(c.filas.followUpVencido)}
            alerta={c.filas.followUpVencido > 0}
          />
          <Cartao rotulo="Sem próxima ação" valor={String(c.filas.semProximaAcao)} />
          <Cartao
            rotulo="Entraram em 24 h"
            valor={String(c.filas.entrandoAgora)}
            detalhe="chegaram nas últimas 24 horas"
          />
        </div>
      </Secao>

      {/* ── QUEM ESPERA HÁ MAIS TEMPO ───────────────────────────────────── */}
      <Secao
        titulo="Quem está esperando há mais tempo"
        nota="Do mais antigo para o mais novo. O relógio é a última mensagem do lead."
      >
        {c.esperandoHaMaisTempo.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line2 bg-canvas px-3 py-4 text-[12.5px] text-muted">
            Ninguém aguardando atendimento humano neste momento.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-paper">
            {c.esperandoHaMaisTempo.map((l) => (
              <LinhaDaEspera key={l.leadId} l={l} />
            ))}
          </ul>
        )}
      </Secao>

      {/* ── IA OU GENTE ─────────────────────────────────────────────────── */}
      <Secao titulo="Quem está atendendo" nota="Conversas vivas, por quem responde hoje.">
        {totalAtendendo === 0 ? (
          <p className="rounded-2xl border border-dashed border-line2 bg-canvas px-3 py-4 text-[12.5px] text-muted">
            Nenhuma conversa viva na base.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Cartao rotulo={ROTULO_DE_QUEM_ATENDE.IA} valor={String(c.quemAtende.ia)} />
            <Cartao rotulo={ROTULO_DE_QUEM_ATENDE.HUMANO} valor={String(c.quemAtende.humano)} />
            <Cartao
              rotulo={ROTULO_DE_QUEM_ATENDE.AGUARDANDO_HUMANO}
              valor={String(c.quemAtende.aguardandoHumano)}
              alerta={c.quemAtende.aguardandoHumano > 0}
            />
            <Cartao rotulo={ROTULO_DE_QUEM_ATENDE.NINGUEM} valor={String(c.quemAtende.ninguem)} />
          </div>
        )}
      </Secao>

      {/* ── A CARGA DO TIME ─────────────────────────────────────────────── */}
      <Secao titulo="Carga por atendente">
        {c.time.semCadastro ? (
          <p className="rounded-2xl border border-dashed border-line2 bg-canvas px-3 py-4 text-[12.5px] leading-relaxed text-muted">
            Não medido: ninguém registrou disponibilidade. Isto{" "}
            <strong className="font-semibold text-ink2">não</strong> quer dizer que o
            time está offline — quer dizer que não há cadastro para ler.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-paper">
            {c.time.sdrs.map((s) => (
              <li
                key={s.userId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="text-[13px] font-semibold text-ink">{s.nome}</span>
                  <span className="block text-[11.5px] text-muted">
                    {ROTULO_DO_ESTADO[s.estado] ?? s.estado}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] text-ink2">
                  {s.carga} de {s.capacidade}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* ── A FILA DO SDR ───────────────────────────────────────────────── */}
      <Secao
        titulo="Fila do SDR"
        nota="Empresas da prospecção por estado. Baldes zerados continuam à vista — some é que confunde."
      >
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {c.filaDoSdr.map((f) => (
            <li key={f.estado} className="rounded-2xl border border-line bg-paper p-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                {f.rotulo}
              </p>
              <p className="mt-1 text-[19px] font-semibold leading-none text-ink">{f.total}</p>
            </li>
          ))}
        </ul>
      </Secao>

      <p className="mt-6 text-[11px] text-muted">
        Medido em {new Date(c.agora).toISOString().replace("T", " ").slice(0, 16)} UTC.
      </p>
    </div>
  );
}
