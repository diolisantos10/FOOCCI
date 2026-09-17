"use client";

/**
 * A CENTRAL SDR / GATEKEEPER.
 *
 * ── A PERGUNTA DA TELA ──────────────────────────────────────────────────────
 *
 * "Quantas conversas bateram num porteiro, de que tipo era, quantos decisores
 * nós capturamos, de quem já sabemos o nome e ainda não o telefone, e como está
 * a fila do SDR por estado."
 *
 * ── O QUE NÃO ESTÁ AQUI, E É DE PROPÓSITO ───────────────────────────────────
 *
 * O desenho original tem a caixa de conversa, o copiloto e os botões de enviar.
 * Nada disso entra: esta frente é SÓ LEITURA, e não abre caminho novo de envio
 * de WhatsApp. Uma tela que mostra um botão "Enviar" que não envia é pior que a
 * tela sem o botão — ela ensina a operação a contar com algo que não existe.
 *
 * ── E O PONTO MAIS IMPORTANTE ───────────────────────────────────────────────
 *
 * Na base de hoje, a classificação de porteiro e a captura de decisor moram em
 * `Contato`, que pende de `Empresa`, e a maioria dos leads antigos não tem
 * empresa. O raio-X devolve `medido: false` com motivo — e esta tela mostra o
 * MOTIVO, grande, no lugar onde estaria o número. Os nove baldes de tipo
 * continuam desenhados, vazios e explicados: sumir com eles faria parecer que
 * o produto não classifica porteiro, quando ele classifica e a base é que não
 * alcança.
 */

import { useEffect, useState } from "react";
import {
  Aviso,
  Cabecalho,
  Caixa,
  Carregando,
  Erro,
  Grade,
  NaoMedido,
  Numero,
  SemAcesso,
  Secao,
  cx,
  type Fase,
  type Medida,
} from "../_pecas/Pecas";

type Taxa =
  | { medido: true; valor: number; base: number }
  | { medido: false; motivo: "amostraPequena"; base: number }
  | { medido: false; motivo: "semDados" };

export interface PistaDeDecisor {
  empresaId: string | null;
  empresa: string | null;
  nome: string;
  cargo: string | null;
  canal: string | null;
  telefone: string | null;
  temTelefone: boolean;
  confianca: string;
  comoFoiDescoberto: string | null;
}

export interface DadosDoSdr {
  periodo: { de: string; ate: string; agora: string };
  fila: Array<{ estado: string; rotulo: string; total: number }>;
  tiposDeGatekeeper: Array<{ tipo: string; rotulo: string; humano: boolean }>;
  gatekeepers: Medida<{
    classificados: number;
    porTipo: Array<{ tipo: string; quantos: number }>;
    naoClassificados: {
      total: number;
      anterioresAoModulo: number;
      posterioresAoModuloSemSinal: number;
      observacao: string;
    };
  }>;
  decisores: Medida<{ comTelefone: number; semTelefone: number; pistasSemTelefone: PistaDeDecisor[] }>;
  abordagem: Medida<{ abordados: number; responderam: number; nuncaResponderam: number; taxaDeResposta: Taxa }>;
  reabordagem: Medida<{ total: number; pagina: number; porPagina: number; criterio: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AS SEÇÕES
// ─────────────────────────────────────────────────────────────────────────────

export function SecaoFilaDoSdr({ dados }: { dados: DadosDoSdr }) {
  return (
    <Secao
      titulo="Fila e pipeline do SDR"
      descricao="Empresas por estado, agora. Todos os baldes aparecem, inclusive os zerados — balde que some quando zera é balde que ninguém investiga."
    >
      {dados.fila.length === 0 ? (
        <Caixa>
          Nenhuma empresa cadastrada fora de &quot;descartada&quot;. A fila do SDR
          é construída a partir de <code>Empresa</code>: sem empresa, não há fila —
          e isso é cadastro faltando, não operação parada.
        </Caixa>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {dados.fila.map((f) => (
            <li
              key={f.estado}
              className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-paper px-3 py-2"
            >
              <span className="text-[13px] text-ink2">{f.rotulo}</span>
              <span className="text-[16px] font-semibold tabular-nums text-ink">{f.total}</span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

export function SecaoNumerosDoSdr({ dados }: { dados: DadosDoSdr }) {
  const a = dados.abordagem;
  const d = dados.decisores;
  const g = dados.gatekeepers;
  return (
    <Secao titulo="O período em números" descricao="Tudo vem do raio-X das conversas, sobre a janela selecionada.">
      <Grade>
        <Numero
          rotulo="Abordados"
          valor={a.medido ? a.valor.abordados : null}
          motivo={a.medido ? undefined : a.motivo}
        />
        <Numero
          rotulo="Responderam"
          valor={a.medido ? a.valor.responderam : null}
          motivo={a.medido ? undefined : a.motivo}
          rodape={
            a.medido && a.valor.taxaDeResposta.medido
              ? `${Math.round(a.valor.taxaDeResposta.valor * 100)}% dos abordados`
              : a.medido
                ? "taxa não medida: amostra pequena demais"
                : undefined
          }
        />
        <Numero
          rotulo="Caíram em porteiro"
          valor={g.medido ? g.valor.classificados : null}
          motivo={g.medido ? undefined : g.motivo}
        />
        <Numero
          rotulo="Decisores capturados"
          valor={d.medido ? d.valor.comTelefone + d.valor.semTelefone : null}
          motivo={d.medido ? undefined : d.motivo}
          rodape={
            d.medido ? `${d.valor.comTelefone} com telefone · ${d.valor.semTelefone} sem` : undefined
          }
        />
        <Numero
          rotulo="Fila de reabordagem"
          valor={dados.reabordagem.medido ? dados.reabordagem.valor.total : null}
          motivo={dados.reabordagem.medido ? undefined : dados.reabordagem.motivo}
          rodape={dados.reabordagem.medido ? dados.reabordagem.valor.criterio : undefined}
        />
      </Grade>
    </Secao>
  );
}

export function SecaoTiposDeGatekeeper({ dados }: { dados: DadosDoSdr }) {
  const g = dados.gatekeepers;
  const porTipo = g.medido ? new Map(g.valor.porTipo.map((p) => [p.tipo, p.quantos])) : null;

  return (
    <Secao
      titulo="Porteiros por tipo"
      descricao="Os nove tipos que o classificador conhece. Dá para insistir com gente; não dá para insistir com um menu."
    >
      {!g.medido && (
        <Aviso>
          <strong>Isto não é zero porteiro. É porteiro não medido — e o motivo é este:</strong>
          <br />
          <span className="mt-1 inline-block">{g.motivo}</span>
          <br />
          <span className="mt-2 inline-block">
            Os nove baldes continuam desenhados abaixo, vazios de propósito. Apagá-los
            faria parecer que o produto não classifica porteiro; ele classifica, e o
            que falta é o vínculo <code className="rounded bg-amber-100 px-1">Empresa</code> →{" "}
            <code className="rounded bg-amber-100 px-1">Contato</code> na maior parte dos
            leads antigos. Enquanto esse vínculo não existir, esta contagem não tem
            resposta — e um zero no lugar dela seria uma afirmação que ninguém apurou.
          </span>
        </Aviso>
      )}

      <ul className="flex flex-col gap-1.5">
        {dados.tiposDeGatekeeper.map((t) => {
          const quantos = porTipo?.get(t.tipo);
          return (
            <li
              key={t.tipo}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl border border-line bg-paper px-3 py-2"
            >
              <span className="text-[13px] text-ink2">{t.rotulo}</span>
              <span
                className={cx(
                  "rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.04em]",
                  t.humano ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600",
                )}
              >
                {t.humano ? "dá para insistir" : "máquina"}
              </span>
              <span className="text-[15px] font-semibold tabular-nums text-ink">
                {quantos === undefined ? (
                  <span className="text-[12px] font-normal italic text-muted">não medido</span>
                ) : (
                  quantos
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {g.medido && (
        <Caixa>
          <strong className="text-ink">{g.valor.naoClassificados.total}</strong> conversas
          sem carimbo de porteiro — {g.valor.naoClassificados.anterioresAoModulo} anteriores
          ao módulo (não podiam ter sido classificadas) e{" "}
          {g.valor.naoClassificados.posterioresAoModuloSemSinal} posteriores sem sinal no
          texto. {g.valor.naoClassificados.observacao}
        </Caixa>
      )}
    </Secao>
  );
}

export function SecaoPistasSemTelefone({ dados }: { dados: DadosDoSdr }) {
  const d = dados.decisores;
  return (
    <Secao
      titulo="Decisores sem telefone"
      descricao="Sabemos o nome e ainda não o número. É a fila de trabalho mais barata que existe: o difícil (descobrir quem decide) já foi feito."
    >
      {!d.medido ? (
        <Caixa>
          <NaoMedido motivo={d.motivo} />
        </Caixa>
      ) : d.valor.pistasSemTelefone.length === 0 ? (
        <Caixa>
          Nenhum decisor identificado está sem telefone nesta janela. Medido:{" "}
          {d.valor.comTelefone} decisores com número, {d.valor.semTelefone} sem.
        </Caixa>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {d.valor.pistasSemTelefone.map((p, i) => (
            <li key={`${p.empresaId ?? "sem-empresa"}-${p.nome}-${i}`} className="rounded-2xl border border-line bg-paper p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[13.5px] font-semibold text-ink">{p.nome}</span>
                <span className="text-[11.5px] uppercase tracking-[.04em] text-muted">
                  confiança {p.confianca.toLowerCase()}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink2">
                {p.cargo ?? "cargo não informado"}
                {p.empresa ? ` · ${p.empresa}` : ""}
                {p.canal ? ` · canal: ${p.canal}` : ""}
              </p>
              {p.comoFoiDescoberto ? (
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{p.comoFoiDescoberto}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A TELA
// ─────────────────────────────────────────────────────────────────────────────

export function SdrClient() {
  const [estado, setEstado] = useState<Fase<DadosDoSdr>>({ fase: "carregando" });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/sdr", { cache: "no-store" });
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }
        const j = (await r.json()) as { ok: boolean; data?: DadosDoSdr; error?: string };
        if (!vivo) return;
        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }
        setEstado({ fase: "pronto", dados: j.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Cabecalho
        titulo="Central SDR / Gatekeeper"
        subtitulo="Atravessar o porteiro e chegar em quem decide. Só leitura: esta tela não envia mensagem nem agenda abordagem."
      />

      {estado.fase === "carregando" && <Carregando texto="Lendo a fila do SDR e o raio-X das conversas…" />}
      {estado.fase === "semAcesso" && <SemAcesso />}
      {estado.fase === "erro" && <Erro detalhe={estado.detalhe} />}

      {estado.fase === "pronto" && (
        <>
          <SecaoNumerosDoSdr dados={estado.dados} />
          <SecaoFilaDoSdr dados={estado.dados} />
          <SecaoTiposDeGatekeeper dados={estado.dados} />
          <SecaoPistasSemTelefone dados={estado.dados} />
        </>
      )}
    </div>
  );
}
