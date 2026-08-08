"use client";

/**
 * O cartão de agente da grade.
 *
 * Ordem dos elementos fixada pela doutrina 20 (§Aba 1) e pela maquete aprovada
 * pelo CEO: estado, nome, slug, área, função, A IA EM QUE ELE RODA, no ar
 * desde, e até três medidas.
 *
 * O cartão inteiro é clicável por link esticado (`absolute inset-0`), e não por
 * `onClick` no `<article>`: assim a ficha abre em nova aba com ctrl+clique, o
 * teclado alcança, o leitor de tela anuncia um link — e o `<details>` do motivo
 * continua clicável porque vive numa camada acima.
 */

import Link from "next/link";
import type { CartaoAgente } from "@/services/agents/salaDosAgentes.types";
import { formatarData } from "./_dados";
import {
  EtiquetaArea,
  MotivosNaoMedido,
  PontoEstado,
  SeloEssencial,
  ValorMedida,
  cx,
} from "./_ui";

export function CartaoDeAgente({ agente }: { agente: CartaoAgente }) {
  const desde = formatarData(agente.noArDesde);
  const metricas = agente.metricas.slice(0, 3);

  return (
    <article
      className={cx(
        "group relative flex flex-col gap-2.5 rounded-2xl border bg-paper p-4 transition-colors",
        "hover:border-brand-200 hover:bg-brand-50",
        agente.essencial ? "border-brand-200/70" : "border-line2",
      )}
    >
      <Link
        href={`/admin/sala-dos-agentes/${agente.slug}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <span className="sr-only">Ver a ficha de {agente.nome}</span>
      </Link>

      {/* Estado · nome · slug */}
      <div className="flex items-start gap-2.5">
        <PontoEstado estado={agente.estado} className="mt-[7px]" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-[-.01em] text-ink">{agente.nome}</p>
          <p className="truncate font-mono text-[11.5px] text-muted">{agente.slug}</p>
        </div>
      </div>

      {/* Área · selo de Essencial */}
      <div className="flex flex-wrap items-center gap-1.5">
        <EtiquetaArea>{agente.area}</EtiquetaArea>
        {agente.essencial && <SeloEssencial />}
      </div>

      {/* Função, em linguagem de dono.
          Altura mínima de três linhas: sem ela, a caixa da IA e o rodapé de
          medidas nascem em alturas diferentes em cada coluna da grade, e a
          fileira inteira fica desalinhada — o defeito é da GRADE, não do
          cartão, e só aparece com dois cartões lado a lado. */}
      <p className="min-h-[61px] text-[12.5px] leading-relaxed text-ink2">{agente.funcao}</p>

      {/* A IA em que ele roda — na cara do cartão, por ordem do CEO */}
      <MotorDoCartao motor={agente.motor} />

      {/* No ar desde · a porta da ficha */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* O rótulo NÃO some quando a data falta. Nada neste sistema registra
            a data de criação de agente, então este campo vem vazio em todos os
            cartões — e um espaço em branco sem explicação seria pior do que a
            ausência: a pessoa procuraria o defeito na tela. Mesma família do
            "não medido" das métricas. */}
        <p className="text-[11.5px] text-muted">
          No ar desde{" "}
          {desde ? (
            desde
          ) : (
            <em
              className="italic"
              title="Nada no sistema registra a data de criação de um agente. Não é o mesmo que ele ser novo."
            >
              não registrado
            </em>
          )}
        </p>
        <span className="text-[11.5px] font-semibold text-brand-700 group-hover:underline">
          Ver ficha →
        </span>
      </div>

      {/* Até três medidas — e os três estados de cada uma */}
      {metricas.length > 0 && (
        <div className="mt-auto border-t border-line pt-2.5">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {metricas.map((m) => (
              <div key={m.rotulo}>
                <div className="flex min-h-[19px] items-end leading-tight">
                  <ValorMedida medida={m.medida} />
                </div>
                <div className="text-[10px] uppercase tracking-[.06em] text-muted">{m.rotulo}</div>
              </div>
            ))}
          </div>
          <MotivosNaoMedido metricas={metricas} className="mt-2" />
        </div>
      )}
    </article>
  );
}

/**
 * Em qual IA o agente roda.
 *
 * `naoAplica` não é um vazio: é uma resposta. Quem constrói o produto roda na
 * sessão do Diretor, e um seletor de modelo aqui seria controle que mente.
 */
export function MotorDoCartao({ motor }: { motor: CartaoAgente["motor"] }) {
  if (motor.tipo === "naoAplica") {
    // A explicação é FRASE, não identificador: ela quebra em linha em vez de
    // ser cortada com reticências. Um `truncate` aqui custou rolagem
    // horizontal na grade inteira a 375px — texto `nowrap` vira largura
    // mínima da coluna, e a coluna arrasta todos os cartões junto.
    return (
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-line2 bg-canvas px-2.5 py-2">
        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-line2" aria-hidden="true" />
        <span className="min-w-0 text-[12px] italic leading-snug text-muted">
          {motor.explicacao}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-2.5 py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
      <span className="truncate text-[12px] font-semibold text-ink">{motor.provedor}</span>
      <span className="truncate font-mono text-[11px] text-muted">{motor.modelo}</span>
    </div>
  );
}
