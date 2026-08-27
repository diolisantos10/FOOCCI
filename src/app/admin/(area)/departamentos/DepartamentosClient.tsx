"use client";

/**
 * A tela de Departamentos e Agentes.
 *
 * ── O QUE ESTA TELA NÃO FAZ, E POR QUÊ ──
 *
 * Não tem botão de ativar, editar ou criar. Nenhum agente está ligado, e um
 * botão que não liga nada é controle que mente — o pior defeito desta casa não é
 * feiura, é o controle que finge. Quando o gate de ativação existir, o botão
 * nasce junto com ele.
 *
 * ── O QUE ELA DIZ QUANDO NÃO SABE ──
 *
 * Cargo sem ocupante aparece como **vago**, em itálico, não como um nome
 * inventado nem como espaço em branco. Vago é informação: significa que o cargo
 * existe e ninguém responde por ele hoje.
 */

import { useMemo } from "react";
import {
  usePainelDeDepartamentos,
  modoLegivel,
  ROTA_PAINEL,
} from "./_dados";
import type {
  AgenteNaTela,
  DepartamentoNaTela,
  PainelDeDepartamentos,
} from "@/services/organizacao/painelDeDepartamentos";

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}

export function DepartamentosClient() {
  const { estado, recarregar } = usePainelDeDepartamentos();

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header>
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">
            Departamentos e Agentes
          </h1>
          <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
            A estrutura oficial da Foocci: seis departamentos, um Agente Gerente em cada um, e o que
            cada agente pode e não pode fazer.
          </p>
        </header>

        {estado.fase === "carregando" && (
          <p className="mt-8 text-[13px] text-muted">Carregando…</p>
        )}

        {estado.fase === "semAcesso" && <SemAcesso />}

        {estado.fase === "erro" && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-5">
            <h3 className="text-[14.5px] font-semibold text-red-800">
              Não consegui carregar a estrutura
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-red-700">
              {estado.detalhe ?? `A rota ${ROTA_PAINEL} não respondeu.`}
            </p>
            <button
              type="button"
              onClick={recarregar}
              className="mt-3 rounded-xl border border-red-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-red-800 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {estado.fase === "pronto" && <Conteudo painel={estado.painel} />}
      </div>
    </div>
  );
}

function SemAcesso() {
  return (
    <div className="mt-6 rounded-2xl border border-line2 bg-paper px-5 py-6">
      <h3 className="text-[15px] font-semibold text-ink">Esta área pede login próprio</h3>
      <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
        A estrutura da empresa não abre com a senha compartilhada do admin. Ela exige uma
        identidade — porque todo agente tem um responsável, e responsável sem nome não responde por
        nada.
      </p>
      <p className="mt-3 text-[13px] text-muted">Para criar o primeiro acesso:</p>
      <pre className="mt-1.5 overflow-x-auto rounded-xl bg-canvas px-3.5 py-2.5 text-[12.5px] text-ink2">
        npx tsx scripts/criar-usuario-interno.ts --email seu@email --nome &quot;Seu Nome&quot;
        --papel MASTER_CEO --cargo ceo
      </pre>
    </div>
  );
}

function Conteudo({ painel }: { painel: PainelDeDepartamentos }) {
  const totais = useMemo(() => {
    const d = painel.departamentos;
    return {
      departamentos: d.length,
      agentes: d.reduce((s, x) => s + x.indicadores.agentes, 0),
      jaOperam: d.reduce((s, x) => s + x.indicadores.jaOperam, 0),
      ligados: d.reduce((s, x) => s + x.indicadores.ligados, 0),
      semGerente: d.filter((x) => !x.gerente).length,
    };
  }, [painel]);

  return (
    <>
      <section className="mt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Direção</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {painel.direcao.map((p) => (
            <div
              key={p.cargo}
              className="rounded-xl border border-line2 bg-paper px-3.5 py-2 text-[13px]"
            >
              <span className="font-semibold text-ink">{p.titulo}</span>
              {p.ocupante ? (
                <span className="text-muted"> · {p.ocupante}</span>
              ) : (
                <em className="text-muted"> · vago</em>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 rounded-2xl border border-line2 bg-paper px-4 py-3 text-[13px]">
        <Resumo rotulo="Departamentos" valor={totais.departamentos} />
        <Resumo rotulo="Agentes" valor={totais.agentes} />
        <Resumo rotulo="Já operam" valor={totais.jaOperam} />
        <Resumo
          rotulo="Ligados"
          valor={totais.ligados}
          nota={totais.ligados === 0 ? "nenhum agente foi ativado" : undefined}
        />
        {totais.semGerente > 0 && (
          <Resumo rotulo="Sem gerente" valor={totais.semGerente} alerta />
        )}
      </div>

      {/* ── ⚠️ ZERO NÃO É A MESMA COISA QUE VAZIO ──────────────────────────
          O CEO abriu esta tela e disse: *"esse link me leva pra essa sala aí,
          não tem nada pra fazer. Não estou entendendo."*

          Ele estava vendo `Departamentos: 0 · Agentes: 0` e mais nada. Quatro
          zeros numa tela em branco parecem defeito — e não são: a estrutura da
          empresa nunca foi criada no banco de produção.

          A diferença entre "está quebrado" e "está vazio" é a frase abaixo. Sem
          ela, quem chega investiga um defeito que não existe; com ela, sabe que
          está olhando uma gaveta que ninguém encheu ainda. */}
      {painel.departamentos.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-line2 bg-paper px-5 py-6">
          <h2 className="text-[15px] font-semibold text-ink">
            A estrutura ainda não foi montada
          </h2>
          <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
            Os zeros acima não são erro:{" "}
            <strong className="text-ink2">nenhum departamento foi criado</strong> no
            sistema ainda. Esta tela mostra o organograma da Foocci — quem responde
            por cada área — e ele existe hoje só no documento, não no banco.
          </p>
          <p className="mt-2 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
            Nada depende disto para funcionar. O atendimento comercial roda pela
            área própria dele, com login próprio, e não passa por aqui.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {painel.departamentos.map((d) => (
            <Card key={d.slug} departamento={d} />
          ))}
        </div>
      )}

      {painel.aposentados.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer list-none text-[12.5px] font-medium text-muted hover:text-ink2">
            {painel.aposentados.length} departamento(s) da estrutura anterior, desativados
          </summary>
          <ul className="mt-2 space-y-1 pl-1 text-[12.5px] text-muted">
            {painel.aposentados.map((a) => (
              <li key={a.nome}>
                <span className="text-ink2">{a.nome}</span> — {a.missao}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Resumo({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string;
  valor: number;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div>
      <span className="text-muted">{rotulo}: </span>
      <span className={cx("font-semibold", alerta ? "text-amber-700" : "text-ink")}>{valor}</span>
      {nota && <span className="text-muted"> — {nota}</span>}
    </div>
  );
}

function Card({ departamento: d }: { departamento: DepartamentoNaTela }) {
  const i = d.indicadores;

  return (
    <section className="rounded-2xl border border-line2 bg-paper">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[12px] text-muted">{d.numero}</span>
          <h3 className="text-[15px] font-semibold text-ink">{d.nome}</h3>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{d.missao}</p>
        <p className="mt-2 text-[12px] text-muted">
          {i.agentes} agentes · {i.ia} IA · {i.humano} pessoa · {i.hibrido} híbrido
          {i.jaOperam > 0 && ` · ${i.jaOperam} já operam`}
        </p>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          <span className="text-muted">
            Fila: <span className="font-medium text-ink2">{i.backlogAberto}</span>
          </span>
          <Saude saude={d.saude} />
          <Comando comando={d.comando} />
        </div>
      </header>

      <div className="px-4 py-3">
        {d.gerente ? (
          <Linha agente={d.gerente} destaque />
        ) : (
          <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            Sem Agente Gerente. Todo departamento precisa de um — sem ele, o trabalho não é cobrado
            de ninguém.
          </p>
        )}

        <ul className="mt-2 divide-y divide-line">
          {d.agentes.map((a) => (
            <Linha key={a.slug} agente={a} />
          ))}
        </ul>

        {d.controla.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink2 hover:text-ink">
              O que este departamento controla ({d.controla.length})
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12px] leading-relaxed text-muted">
              {d.controla.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {d.escalaQuando && (
              <>
                <p className="mt-2 text-[12px] font-medium text-ink2">Devolve para cima quando:</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{d.escalaQuando}</p>
              </>
            )}
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * A saúde do departamento.
 *
 * `semAuditoria` tem texto próprio de propósito: um departamento que nunca foi
 * auditado e um auditado-e-limpo são os dois zero, e só um é boa notícia.
 * Mostrar "0 falhas" nos dois casos seria a mentira mais cara desta tela.
 */
function Saude({ saude }: { saude: DepartamentoNaTela["saude"] }) {
  if (saude.leitura === "semAuditoria") {
    return (
      <span className="text-muted">
        Qualidade: <em className="not-italic text-muted">nunca auditado</em>
      </span>
    );
  }
  if (saude.leitura === "limpo") {
    return (
      <span className="text-muted">
        Qualidade: <span className="font-medium text-ink2">sem falha aberta</span>
      </span>
    );
  }
  return (
    <span className={saude.leitura === "bloqueado" ? "text-red-700" : "text-amber-700"}>
      Qualidade:{" "}
      <span className="font-medium">
        {saude.abertas} aberta(s)
        {saude.bloqueantes > 0 && `, ${saude.bloqueantes} bloqueante(s)`}
      </span>
    </span>
  );
}

/**
 * Quantas ordens pularam o Agente Gerente em 30 dias.
 *
 * A promessa do documento 01: "a regra vira número, e o número aparece". Um pulo
 * é exceção; um terço das ordens pulando é uma estrutura que não está
 * funcionando — e aí a conversa é sobre a estrutura, não sobre a regra.
 *
 * Sem delegação nenhuma NÃO é saudável: é ausência de dado.
 */
function Comando({ comando }: { comando: DepartamentoNaTela["comando"] }) {
  if (comando.leitura === "semDados") {
    return (
      <span className="text-muted">
        Comando: <em className="not-italic text-muted">nenhuma ordem registrada</em>
      </span>
    );
  }
  const pct = Math.round((comando.proporcao ?? 0) * 100);
  return (
    <span className={comando.leitura === "atencao" ? "text-amber-700" : "text-muted"}>
      Comando:{" "}
      <span className="font-medium">
        {comando.pularamOGerente} de {comando.total} pularam o gerente ({pct}%)
      </span>
    </span>
  );
}

function Linha({ agente: a, destaque }: { agente: AgenteNaTela; destaque?: boolean }) {
  const conteudo = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {a.catalogNumber && (
          <span className="font-mono text-[11.5px] text-muted">{a.catalogNumber}</span>
        )}
        <span className={cx("text-[13.5px]", destaque ? "font-semibold text-ink" : "text-ink2")}>
          {a.nome}
        </span>
        <span
          className={cx(
            "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
            a.modo === "AI" ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink2",
          )}
        >
          {modoLegivel(a.modo)}
        </span>
        {a.populacao === "PRODUTO" && (
          <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
            já opera no produto
          </span>
        )}
        {!a.isRuntimeEnabled && <span className="text-[11px] text-muted">não ligado</span>}
      </div>

      <p className="mt-0.5 text-[12px] text-muted">
        {a.responsavel ? (
          <>
            Responde a: {a.responsavel.titulo}
            {a.responsavel.ocupante ? ` — ${a.responsavel.ocupante}` : <em> — vago</em>}
          </>
        ) : (
          <strong className="text-amber-700">Sem responsável</strong>
        )}
      </p>

      {a.naoPode.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer list-none text-[12px] font-medium text-ink2 hover:text-ink">
            O que NÃO pode fazer ({a.naoPode.length})
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] leading-relaxed text-muted">
            {a.naoPode.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {a.escalaQuando.length > 0 && (
            <>
              <p className="mt-1.5 text-[12px] font-medium text-ink2">Devolve para gente quando:</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[12px] leading-relaxed text-muted">
                {a.escalaQuando.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </>
  );

  return destaque ? (
    <div className="rounded-xl border border-line2 bg-canvas px-3 py-2">{conteudo}</div>
  ) : (
    <li className="py-2">{conteudo}</li>
  );
}
