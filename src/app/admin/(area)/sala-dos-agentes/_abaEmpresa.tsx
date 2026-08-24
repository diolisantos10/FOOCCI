"use client";

/**
 * Aba 3 — A empresa.
 *
 * As duas primeiras abas respondem "quem trabalha NO PRODUTO". Esta responde
 * "quem trabalha NA FOOCCI": os 9 departamentos, as pessoas e os agentes de cada
 * um, com dono e com limite escrito.
 *
 * ── POR QUE ELA TEM BUSCA PRÓPRIA ──
 *
 * As duas primeiras abas leem `/api/admin/sala-dos-agentes`. Esta lê outra rota,
 * com outro portão (sessão interna, ADR-003). Pendurá-la na mesma busca faria
 * uma falha na Sala apagar a empresa da tela — e vice-versa. São dois assuntos;
 * quando um cai, o outro continua de pé.
 *
 * ── O QUE ESTA TELA NÃO FAZ ──
 *
 * Não tem botão de ativar, nem de editar. Nenhuma ficha está ligada, e um botão
 * que não liga nada é controle que mente. Quando a Fase 7 trouxer o gate de
 * ativação, o botão nasce junto com ele.
 */

import { useMemo } from "react";
import {
  useFichasDaEmpresa,
  porDepartamento,
  modoLegivel,
  type FichaNaTela,
} from "./_fichas";
import { Carregando, Erro, Nota, TituloSecao, Vazio, cx } from "./_ui";

export function AbaEmpresa() {
  const { estado, recarregar } = useFichasDaEmpresa();

  if (estado.fase === "carregando") return <Carregando />;
  if (estado.fase === "semAcesso") return <SemAcesso />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} onTentarDeNovo={recarregar} />;

  if (estado.fichas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma ficha da empresa cadastrada"
        descricao="O catálogo aprovado existe, mas ainda não foi semeado neste banco. Rode `npx tsx scripts/seed-fichas.ts` para trazer os 9 departamentos e suas fichas."
      />
    );
  }

  return <Conteudo fichas={estado.fichas} />;
}

/**
 * O 401 esperado.
 *
 * Enquanto ninguém tiver login interno, a rota nega para todo mundo — inclusive
 * para o proprietário. Vermelho de erro aqui seria mentira: a porta está
 * funcionando. O que a tela deve é dizer como abrir.
 */
function SemAcesso() {
  return (
    <div className="mt-5 rounded-2xl border border-line2 bg-paper px-5 py-6">
      <h3 className="text-[15px] font-semibold text-ink">Esta área pede login próprio</h3>
      <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
        As fichas da empresa não abrem com a senha compartilhada do admin. Elas exigem uma
        identidade — porque toda ficha tem dono, e dono sem nome não responde por nada.
      </p>
      <p className="mt-3 text-[13px] text-muted">Para criar o primeiro acesso:</p>
      <pre className="mt-1.5 overflow-x-auto rounded-xl bg-canvas px-3.5 py-2.5 text-[12.5px] text-ink2">
        npx tsx scripts/criar-usuario-interno.ts --email seu@email --nome &quot;Seu Nome&quot;
        --papel CEO --cargo ceo
      </pre>
    </div>
  );
}

function Conteudo({ fichas }: { fichas: FichaNaTela[] }) {
  const grupos = useMemo(() => porDepartamento(fichas), [fichas]);

  const vagos = fichas.filter((f) => f.dono && !f.dono.ocupante).length;
  const semDono = fichas.filter((f) => !f.dono).length;
  const ligadas = fichas.filter((f) => f.isRuntimeEnabled).length;

  return (
    <div className="mt-5">
      <Nota marca={ligadas === 0 ? "Nada ligado" : "Atenção"}>
        {ligadas === 0 ? (
          <>
            <strong>Nenhuma destas fichas está ligada.</strong> As {fichas.length} existem como
            catálogo aprovado: dizem o que cada função pode, o que não pode e quando devolve a
            decisão para gente. Ligar cada uma é decisão sua, uma por uma.
          </>
        ) : (
          <>
            <strong>
              {ligadas} de {fichas.length} estão com runtime ligado.
            </strong>
          </>
        )}
        {vagos > 0 && (
          <>
            {" "}
            {vagos === fichas.length
              ? "Todos os cargos donos estão vagos"
              : `${vagos} têm cargo dono vago`}
            {" "}— o cargo existe, ninguém o ocupa. É informação, não defeito.
          </>
        )}
        {semDono > 0 && (
          <>
            {" "}
            <strong>{semDono} ficha(s) sem cargo dono.</strong> Isso é defeito: rode o seed da
            organização.
          </>
        )}
      </Nota>

      {grupos.map((g) => (
        <section key={g.numero ?? "orfas"} className="mt-6">
          <TituloSecao
            titulo={g.numero ? `${g.numero} · ${g.nome}` : g.nome}
            sub={resumoDoGrupo(g.fichas)}
          />
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line2 bg-paper">
            {g.fichas.map((f) => (
              <LinhaDaFicha key={f.slug} ficha={f} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function resumoDoGrupo(fichas: FichaNaTela[]): string {
  const ia = fichas.filter((f) => f.executionMode === "AI").length;
  const pessoa = fichas.filter((f) => f.executionMode === "HUMAN").length;
  const hibrido = fichas.filter((f) => f.executionMode === "HYBRID").length;

  const partes = [
    ia > 0 && `${ia} de IA`,
    pessoa > 0 && `${pessoa} de pessoa`,
    hibrido > 0 && `${hibrido} de IA com pessoa no comando`,
  ].filter(Boolean);

  return `${fichas.length} ficha${fichas.length === 1 ? "" : "s"} — ${partes.join(", ")}.`;
}

function LinhaDaFicha({ ficha }: { ficha: FichaNaTela }) {
  const dono = ficha.dono;

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {ficha.catalogNumber && (
          <span className="font-mono text-[12px] text-muted">{ficha.catalogNumber}</span>
        )}
        <span className="text-[14.5px] font-semibold text-ink">{ficha.nome}</span>
        <span
          className={cx(
            "rounded-full px-2 py-0.5 text-[11.5px] font-medium",
            ficha.executionMode === "AI"
              ? "bg-brand-50 text-brand-700"
              : ficha.executionMode === "HUMAN"
                ? "bg-canvas text-ink2"
                : "bg-canvas text-ink2",
          )}
        >
          {modoLegivel(ficha.executionMode)}
        </span>
        {!ficha.isRuntimeEnabled && (
          <span className="text-[11.5px] text-muted">não ligada</span>
        )}
      </div>

      <p className="mt-1 text-[12.5px] text-muted">
        {dono ? (
          <>
            Dono: {dono.titulo}
            {dono.ocupante ? (
              <> — {dono.ocupante}</>
            ) : (
              <em className="not-italic text-muted"> — vago</em>
            )}
          </>
        ) : (
          <strong className="text-ink2">Sem cargo dono</strong>
        )}
      </p>

      {ficha.naoPode.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100">
            O que esta ficha NÃO pode fazer ({ficha.naoPode.length})
          </summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted">
            {ficha.naoPode.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {ficha.escalaQuando.length > 0 && (
            <>
              <p className="mt-2 text-[12.5px] font-medium text-ink2">Devolve para gente quando:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted">
                {ficha.escalaQuando.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </li>
  );
}
