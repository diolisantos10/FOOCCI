"use client";

/**
 * A MESA DE TRABALHO DA QUALIFICAÇÃO — a tabela larga do desenho 06.
 *
 * ── POR QUE ELA É UM ARQUIVO PRÓPRIO ────────────────────────────────────────
 *
 * Ela é a única parte desta tela que ESCREVE: o seletor de Stage de cada linha
 * move o lead de etapa de verdade. Separá-la do painel deixa a fronteira
 * visível — o resto de `QualificacaoClient` continua sendo leitura pura, e
 * quem for auditar "onde esta tela escreve" tem um arquivo só para ler.
 *
 * ── ⚠️ O ERRO DO DESENHO, E O QUE FIZEMOS ───────────────────────────────────
 *
 * A imagem tem **duas colunas seguidas chamadas "Stage"**: a primeira traz o
 * número do score (92, 78, 75…) e a segunda o seletor de etapa. É erro do
 * desenho, e replicá-lo ensinaria a casa a chamar score de stage. Aqui a
 * primeira chama-se **Score** e ficou fundida com a pílula de temperatura ao
 * lado dela, que é o que o próprio desenho já desenhava junto.
 *
 * ── ⛔ E O QUE ELA NÃO INVENTA ──────────────────────────────────────────────
 *
 * Valor Potencial e Probabilidade de Compra moram na `Oportunidade` da jornada
 * comercial. Lead sem negócio aberto não tem os dois — e a célula escreve isso,
 * com o motivo. Nunca R$ 0,00, nunca 0%: zero ali diria "estimamos e não vale
 * nada", que é uma afirmação que ninguém fez.
 */

import { useState } from "react";
import Link from "next/link";
import type {
  LinhaDaMesa,
  MesaDeTrabalho,
} from "@/services/salaDeVendas/telas/qualificacao";
import { Celula, Linha, Pilula, Tabela, cx, type Tom } from "../_pecas/Pecas";
import { tintaDe } from "./tintaDaTemperatura";

/** As etapas que o seletor da linha oferece. Vêm do enum, não de texto solto. */
export const ETAPAS_DA_MESA = [
  "NOVO",
  "DISPONIVEL_PARA_PROSPECCAO",
  "PRIMEIRO_CONTATO",
  "RESPONDEU",
  "EM_QUALIFICACAO",
  "QUALIFICADO",
  "DEMO_AGENDADA",
  "DEMO_REALIZADA",
  "PROPOSTA_ENVIADA",
  "EM_NEGOCIACAO",
] as const;

/**
 * ⛔ GANHO, PERDIDO e NUTRICAO NÃO entram neste seletor, e isso é trava.
 *
 * PERDIDO exige motivo estruturado e GANHO é desfecho — os dois passam pela
 * tela do funil, que pede o que falta. Oferecê-los aqui faria o seletor recusar
 * em silêncio, e recusa em silêncio ensina a operação a achar que salvou.
 */
export const ETAPAS_FORA_DA_MESA = ["GANHO", "PERDIDO", "NUTRICAO"] as const;

export function rotuloDaEtapa(e: string): string {
  return e.charAt(0) + e.slice(1).toLowerCase().replace(/_/g, " ");
}

/** O tom da urgência do desenho: Alta vermelha, Média âmbar, Baixa verde. */
export function tomDaUrgencia(u: string): Tom {
  const t = u.trim().toLowerCase();
  if (t.startsWith("alta") || t.startsWith("urgente") || t.startsWith("imediat")) return "vermelho";
  if (t.startsWith("média") || t.startsWith("media")) return "ambar";
  if (t.startsWith("baixa")) return "verde";
  // Texto que ninguém previu não pega cor emprestada: cor é afirmação.
  return "cinza";
}

export function emReaisDeCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Uma célula que pode estar vazia — e, quando está, diz por quê. */
function Falta({ motivo }: { motivo: string }) {
  return (
    <span className="block max-w-[26ch] text-[11.5px] italic leading-snug text-muted">
      {motivo}
    </span>
  );
}

function ou(valor: string | null, motivo: string) {
  return valor ? <span className="block max-w-[26ch] leading-snug">{valor}</span> : <Falta motivo={motivo} />;
}

// ─────────────────────────────────────────────────────────────────────────────

export function LinhaDoLead({
  l,
  aoMover,
  salvando,
  recusa,
}: {
  l: LinhaDaMesa;
  aoMover: (leadId: string, para: string) => void;
  salvando: boolean;
  recusa: string | null;
}) {
  const t = tintaDe(l.temperatura ?? "");
  const foraDaMesa = (ETAPAS_FORA_DA_MESA as readonly string[]).includes(l.stage);

  return (
    <Linha>
      <Celula forte>
        <Link href={`/comercial/lead/${l.id}`} className="block max-w-[22ch] hover:underline">
          {l.nome}
        </Link>
        <span className="block max-w-[22ch] truncate text-[11.5px] font-normal text-muted">
          {l.empresa ?? "empresa não informada"}
        </span>
      </Celula>

      <Celula>
        <span className="block leading-snug">{rotuloDaEtapa(l.origem)}</span>
        {l.origemDetalhe && (
          <span className="block max-w-[20ch] truncate text-[11px] text-muted">{l.origemDetalhe}</span>
        )}
      </Celula>

      <Celula>{ou(l.produto, "produto não perguntado")}</Celula>
      <Celula>{ou(l.necessidade, "dor não registrada")}</Celula>

      <Celula>
        {l.urgencia ? (
          <Pilula tom={tomDaUrgencia(l.urgencia)}>{l.urgencia}</Pilula>
        ) : (
          <Falta motivo="não perguntado" />
        )}
      </Celula>

      <Celula>{ou(l.faixaDeOrcamento, "orçamento não perguntado — de propósito, cedo demais queima a conversa")}</Celula>

      <Celula>
        {l.objecoes.length > 0 ? (
          <ul className="max-w-[24ch] space-y-0.5">
            {l.objecoes.map((o, i) => (
              <li key={`${l.id}-ob-${i}`} className="leading-snug">
                {o}
              </li>
            ))}
          </ul>
        ) : (
          <Falta motivo="nenhuma registrada — não é ausência de objeção" />
        )}
      </Celula>

      <Celula numero>
        {l.valorPotencialCents === null ? (
          <Falta motivo={l.porqueSemOportunidade ?? "ninguém estimou"} />
        ) : (
          emReaisDeCentavos(l.valorPotencialCents)
        )}
      </Celula>

      <Celula numero>
        {l.probabilidade === null ? (
          <Falta motivo={l.porqueSemOportunidade ?? "não estimada"} />
        ) : (
          `${l.probabilidade}%`
        )}
      </Celula>

      {/* ⚠️ A coluna que o desenho chamou de "Stage" por engano. Aqui é Score:
          a pílula de temperatura e o número, juntos, como a imagem os desenha. */}
      <Celula>
        {l.temperatura ? (
          <span className="flex items-center gap-1.5">
            <Pilula tom={t.tom}>{l.temperaturaNoDesenho ?? l.temperatura.replace(/_/g, " ")}</Pilula>
            <span className="tabular-nums text-[13px] font-semibold text-ink">
              {l.score === null ? "—" : l.score}
            </span>
          </span>
        ) : (
          <Falta motivo="ninguém pontuou — não é FRIO" />
        )}
      </Celula>

      <Celula>
        {foraDaMesa ? (
          <>
            <span className="block text-[12px] text-ink2">{rotuloDaEtapa(l.stage)}</span>
            <Falta motivo="desfecho: muda pela tela do funil, que pede o motivo" />
          </>
        ) : (
          <select
            value={l.stage}
            disabled={salvando}
            onChange={(e) => aoMover(l.id, e.target.value)}
            aria-label={`Etapa de ${l.nome}`}
            className={cx(
              "w-full min-w-[13ch] rounded-lg border border-line bg-paper px-2 py-1 text-[12px] text-ink outline-none focus:border-brand-400",
              salvando && "opacity-50",
            )}
          >
            {ETAPAS_DA_MESA.map((e) => (
              <option key={e} value={e}>
                {rotuloDaEtapa(e)}
              </option>
            ))}
          </select>
        )}
        {recusa && (
          <span className="mt-1 block max-w-[22ch] text-[11px] leading-snug text-red-600">
            {recusa}
          </span>
        )}
      </Celula>
    </Linha>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Os nomes das colunas, na ordem do desenho — e com o "Stage" duplo corrigido. */
export const COLUNAS_DA_MESA = [
  "Nome / Empresa",
  "Origem",
  "Produto",
  "Necessidade",
  "Urgência",
  "Orçamento",
  "Objeções",
  "Valor Potencial",
  "Prob. de Compra",
  "Score",
  "Stage",
];

export function MesaDeLeads({
  mesa,
  aoMover,
  salvandoId,
  recusas,
  aoPaginar,
}: {
  mesa: MesaDeTrabalho;
  aoMover: (leadId: string, para: string) => void;
  salvandoId: string | null;
  recusas: Record<string, string>;
  aoPaginar: (pagina: number) => void;
}) {
  const primeiro = mesa.total === 0 ? 0 : (mesa.pagina - 1) * mesa.porPagina + 1;
  const ultimo = Math.min(mesa.pagina * mesa.porPagina, mesa.total);

  return (
    <div>
      <div className="[&_table]:min-w-[1180px]">
        <Tabela colunas={COLUNAS_DA_MESA}>
          {mesa.linhas.map((l) => (
            <LinhaDoLead
              key={l.id}
              l={l}
              aoMover={aoMover}
              salvando={salvandoId === l.id}
              recusa={recusas[l.id] ?? null}
            />
          ))}
        </Tabela>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">
          Mostrando {primeiro}–{ultimo} de {mesa.total} lead(s) em aberto
        </p>
        <div className="flex items-center gap-1.5">
          <BotaoDePagina
            rotulo="Página anterior"
            texto="‹"
            desativado={mesa.pagina <= 1}
            aoClicar={() => aoPaginar(mesa.pagina - 1)}
          />
          <span className="px-1.5 text-[12px] tabular-nums text-ink2">
            {mesa.pagina} de {mesa.paginas}
          </span>
          <BotaoDePagina
            rotulo="Próxima página"
            texto="›"
            desativado={mesa.pagina >= mesa.paginas}
            aoClicar={() => aoPaginar(mesa.pagina + 1)}
          />
        </div>
      </div>
    </div>
  );
}

function BotaoDePagina({
  rotulo,
  texto,
  desativado,
  aoClicar,
}: {
  rotulo: string;
  texto: string;
  desativado: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={desativado}
      onClick={aoClicar}
      className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-paper text-[13px] text-ink2 transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
    >
      {texto}
    </button>
  );
}

/** Estado desta tabela, para quem for guardar o filtro. */
export type EstadoDosFiltros = {
  busca: string;
  origem: string;
  produto: string;
  temperatura: string;
  stage: string;
  pagina: number;
};

export const FILTROS_VAZIOS: EstadoDosFiltros = {
  busca: "",
  origem: "",
  produto: "",
  temperatura: "",
  stage: "",
  pagina: 1,
};
