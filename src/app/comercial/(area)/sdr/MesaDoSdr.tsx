"use client";

/**
 * A MESA DO SDR — as colunas 2, 3 e 4 do desenho 12.
 *
 * ── O QUE ESTE ARQUIVO ACRESCENTOU, E POR QUE ELE PODE EXISTIR ──────────────
 *
 * A Central SDR nasceu só com a coluna 1 (a fila) e um resumo do período. O
 * desenho do CEO tem quatro colunas: a fila, a LISTA de conversas, A CONVERSA e
 * o COPILOTO. As três que faltavam entram aqui.
 *
 * Elas puderam entrar porque **a casa já tem as três de verdade**, e cada uma
 * continua sendo servida pela rota que já era dona dela:
 *
 *   · a lista  → `/api/admin/sala-de-vendas/sdr` (o recorte dos estágios do SDR)
 *   · o fio    → `/api/admin/sala-de-vendas/conversa?leadId=…`
 *   · a leitura→ `/api/admin/sala-de-vendas/copiloto?leadId=…`
 *
 * ⚠️ **Nenhuma regra foi reimplementada aqui.** Quem decide se esta pessoa pode
 * ler este lead continua sendo `podeVerOLead`, no servidor, a cada pedido. Uma
 * segunda cópia dessa regra dentro desta tela seria uma segunda chance de errar
 * a permissão — e a bolha da conversa é reusada de `_conversa/Fio.tsx`, que já
 * é a peça única das outras telas.
 *
 * ── ⛔ O QUE NÃO ENTROU, E NÃO É ESQUECIMENTO ───────────────────────────────
 *
 * O desenho tem, embaixo da conversa, uma caixa de digitar com **Enviar** e
 * quatro botões: *Pedir contato do responsável · Explicar motivo do contato ·
 * Agendar reunião · Registrar no CRM*. **Nenhum deles entra nesta tela.**
 *
 * Não é porque a casa não saiba enviar — ela sabe, e a mesa de
 * `/comercial/conversas` é onde isso mora, com a janela de 24h, o aviso de
 * silêncio e a trava de opt-out ao redor. É justamente por isso: duplicar o
 * envio aqui significaria duplicar essas três travas, e uma cópia de trava é
 * uma trava que um dia diverge da outra. O caminho de envio é um só, e esta
 * tela leva até ele pelo nome.
 *
 * Os quatro botões, além disso, são atos que **não existem** hoje: não há rota
 * que peça contato do responsável, que explique motivo, que agende reunião nem
 * que registre no CRM a partir de um clique. Regra 3 de `00-MOLDURA-COMUM.md`:
 * ato que não existe não vira botão. Eles estão escritos na tela como ausência,
 * com o motivo, em vez de desenhados mortos.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MensagemNaTela } from "@/services/salaDeVendas/conversa";
import { ROTAS } from "@/lib/sala/rotas";
import { useCopiloto } from "../conversas/_copiloto";
import { Bolha, AvisoDaJanela } from "../_conversa/Fio";
import { hora } from "../conversas/_dados";
import { Caixa, NaoMedido, Pilula, Secao, cx, type Tom } from "../_pecas/Pecas";
import type { ConversaDoSdr } from "@/services/salaDeVendas/telas/conversasDoSdr";
import { ITENS_DO_PAINEL } from "@/services/salaDeVendas/painelDoVendedor";

/**
 * Os catorze itens da ficha, que é sobre o que o checklist fala. O número vem
 * do serviço e não é digitado aqui: um "14" escrito à mão viraria mentira no
 * dia em que a ficha ganhasse o décimo quinto item.
 */
const ITENS_TOTAIS = ITENS_DO_PAINEL.length;

/** O tom da pílula de estágio — a régua de cor do desenho. */
const TOM_DO_ESTAGIO: Record<string, Tom> = {
  NOVO: "azul",
  DISPONIVEL_PARA_PROSPECCAO: "cinza",
  PRIMEIRO_CONTATO: "ambar",
  RESPONDEU: "verde",
  EM_QUALIFICACAO: "roxo",
};

/** O canal como gente diz. `fonte` é enum do banco e não serve de rótulo. */
const ROTULO_DO_CANAL: Record<string, string> = {
  FORMULARIO_DEMONSTRACAO: "Site",
  PLANILHA: "Planilha",
  META_ADS: "Meta Ads",
  WHATSAPP: "WhatsApp",
  CADASTRO_MANUAL: "Manual",
};

// ─────────────────────────────────────────────────────────────────────────────
// COLUNA 2 — A LISTA DE CONVERSAS
// ─────────────────────────────────────────────────────────────────────────────

export function ListaDeConversas({
  itens,
  total,
  selecionado,
  aoSelecionar,
}: {
  itens: ConversaDoSdr[];
  total: number;
  selecionado: string | null;
  aoSelecionar: (leadId: string) => void;
}) {
  const [termo, setTermo] = useState("");

  const t = termo.trim().toLowerCase();
  const achados = t
    ? itens.filter(
        (c) =>
          c.titulo.toLowerCase().includes(t) ||
          (c.subtitulo ?? "").toLowerCase().includes(t) ||
          (c.previa ?? "").toLowerCase().includes(t),
      )
    : itens;

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-paper">
      <div className="border-b border-line p-3">
        <h2 className="text-[12.5px] font-semibold text-ink">
          Conversas SDR{" "}
          <span className="font-normal text-muted">({total})</span>
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">
          Quem está no começo do funil: novo, abordado, respondeu ou qualificando.
          Do qualificado em diante a conversa é venda, e mora em Conversas.
        </p>
        {/* Esta busca filtra a lista que já está na tela — e o texto diz isso.
            Ela não procura no banco inteiro, e prometer isso seria mentira. */}
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Filtrar esta lista…"
          aria-label="Filtrar a lista de conversas do SDR"
          className="mt-2 w-full rounded-full border border-line bg-canvas px-3 py-1.5 text-[12px] text-ink outline-none placeholder:text-muted focus:border-brand-400"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {itens.length === 0 ? (
          <p className="px-2.5 py-4 text-[12px] leading-relaxed text-muted">
            Nenhuma conversa nos estágios do SDR agora. Isto é contagem, não
            falha: não há lead em NOVO, abordado, respondeu ou qualificando.
          </p>
        ) : achados.length === 0 ? (
          <p className="px-2.5 py-4 text-[12px] leading-relaxed text-muted">
            Nenhuma conversa desta lista casa com “{termo}”.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {achados.map((c) => {
              const ativa = c.leadId === selecionado;
              return (
                <li key={c.leadId}>
                  <button
                    type="button"
                    onClick={() => aoSelecionar(c.leadId)}
                    aria-current={ativa ? "true" : undefined}
                    className={cx(
                      "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                      ativa ? "bg-brand-50" : "hover:bg-canvas",
                    )}
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-chip text-[11.5px] font-semibold text-ink2">
                      {c.iniciais}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-ink">
                          {c.titulo}
                        </span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-muted">
                          {c.ultimaMensagemEm ? hora(c.ultimaMensagemEm) : "—"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                        {c.previa ?? "sem mensagem ainda"}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <Pilula tom="cinza">
                          {ROTULO_DO_CANAL[c.canal] ?? c.canal.toLowerCase()}
                        </Pilula>
                        <Pilula tom={TOM_DO_ESTAGIO[c.estagio] ?? "cinza"}>
                          {c.rotuloDoEstagio}
                        </Pilula>
                        {c.emGatekeeper ? <Pilula tom="ambar">Gatekeeper</Pilula> : null}
                        {c.naoLidas > 0 ? (
                          <span className="ml-auto grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                            {c.naoLidas}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUNA 3 — A CONVERSA
// ─────────────────────────────────────────────────────────────────────────────

interface DadosDaConversa {
  lead: { id: string; nome: string; restaurante: string | null; optOutAt: string | null };
  mensagens: MensagemNaTela[];
  janela: { aberta: boolean; motivo?: string };
}

export function AConversa({ leadId, titulo }: { leadId: string | null; titulo: string | null }) {
  const [estado, setEstado] = useState<
    | { fase: "vazio" }
    | { fase: "carregando" }
    | { fase: "pronto"; dados: DadosDaConversa }
    | { fase: "semAcesso" }
    | { fase: "erro"; detalhe: string | null }
  >({ fase: "vazio" });

  useEffect(() => {
    if (!leadId) {
      setEstado({ fase: "vazio" });
      return;
    }
    let vivo = true;
    setEstado({ fase: "carregando" });
    (async () => {
      try {
        const r = await fetch(
          `/api/admin/sala-de-vendas/conversa?leadId=${encodeURIComponent(leadId)}`,
          { cache: "no-store" },
        );
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }
        const j = (await r.json()) as { ok: boolean; data?: DadosDaConversa; error?: string };
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
  }, [leadId]);

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-paper">
      <div className="border-b border-line p-3">
        <h2 className="truncate text-[12.5px] font-semibold text-ink">
          {titulo ?? "A conversa"}
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">
          O fio real desta conversa, como ele está registrado.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {estado.fase === "vazio" && (
          <p className="py-6 text-center text-[12px] leading-relaxed text-muted">
            Escolha uma conversa na lista ao lado.
          </p>
        )}
        {estado.fase === "carregando" && (
          <p className="py-6 text-center text-[12px] text-muted">Lendo a conversa…</p>
        )}
        {estado.fase === "semAcesso" && (
          <p className="py-6 text-center text-[12px] leading-relaxed text-muted">
            Esta conversa não é alcançável pelo seu acesso. Quem decide isso é o
            servidor, a cada pedido — e não esta tela.
          </p>
        )}
        {estado.fase === "erro" && (
          <p className="py-6 text-center text-[12px] leading-relaxed text-red-700">
            Não deu para ler a conversa{estado.detalhe ? `: ${estado.detalhe}` : "."}
          </p>
        )}
        {estado.fase === "pronto" && (
          <>
            <AvisoDaJanela janela={estado.dados.janela} />
            {estado.dados.mensagens.length === 0 ? (
              <p className="py-6 text-center text-[12px] leading-relaxed text-muted">
                Nenhuma mensagem registrada com esta pessoa ainda. É conversa que
                não começou — não é mensagem perdida.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {estado.dados.mensagens.map((m) => (
                  <Bolha key={m.id} m={m} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── A AUSÊNCIA ESCRITA, no lugar da caixa de envio e dos quatro botões ──
          Ver o cabeçalho deste arquivo: o envio existe, e mora em Conversas,
          com as travas ao redor. Os quatro botões do desenho são atos que não
          existem em rota nenhuma. */}
      <div className="border-t border-line p-3">
        <p className="text-[11.5px] leading-snug text-muted">
          <strong className="text-ink2">Esta tela não envia mensagem.</strong> O
          envio existe na casa, com a janela de 24h, o aviso de silêncio e a trava
          de opt-out ao redor — e mora em{" "}
          <Link href={ROTAS.conversas} className="font-semibold text-brand-600 underline">
            Conversas
          </Link>
          . Repetir a caixa de envio aqui repetiria essas três travas, e trava
          copiada é trava que um dia diverge.
        </p>
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
          Os quatro botões do desenho — pedir contato do responsável, explicar o
          motivo, agendar reunião e registrar no CRM — <strong>não existem como
          ato</strong> em nenhuma rota hoje. Ficam escritos aqui em vez de
          desenhados: botão que não faz nada ensina a operação a contar com o que
          não há.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUNA 4 — O COPILOTO SDR
// ─────────────────────────────────────────────────────────────────────────────

export function CopilotoDaConversa({ leadId }: { leadId: string | null }) {
  const { estado, pedirLeitura } = useCopiloto(leadId);

  if (!leadId) {
    return (
      <Secao titulo="Copiloto SDR">
        <Caixa>Escolha uma conversa para o copiloto ler.</Caixa>
      </Secao>
    );
  }

  return (
    <Secao titulo="Copiloto SDR">
      {estado.fase === "carregando" && (
        <Caixa>Lendo o contexto desta conversa…</Caixa>
      )}
      {estado.fase === "semAcesso" && (
        <Caixa>Esta conversa não é alcançável pelo seu acesso.</Caixa>
      )}
      {estado.fase === "erro" && (
        <Caixa>Não deu para ler o contexto{estado.detalhe ? `: ${estado.detalhe}` : "."}</Caixa>
      )}

      {estado.fase === "pronto" && (
        <div className="flex flex-col gap-2">
          {/* ── Resumo da situação ─────────────────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-paper p-3">
            <h3 className="text-[12px] font-semibold text-ink">Resumo da situação</h3>
            {estado.dados.leitura ? (
              <p className="mt-1 text-[12px] leading-relaxed text-ink2">
                {estado.dados.leitura.resumo}
              </p>
            ) : estado.dados.painel.resumoDaIA ? (
              <p className="mt-1 text-[12px] leading-relaxed text-ink2">
                {estado.dados.painel.resumoDaIA}
              </p>
            ) : (
              <div className="mt-1">
                <NaoMedido motivo="nenhuma leitura de IA foi pedida para esta conversa, e não houve handoff que deixasse resumo escrito" />
              </div>
            )}
          </div>

          {/* ── Tipo de gatekeeper detectado ───────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-paper p-3">
            <h3 className="text-[12px] font-semibold text-ink">
              Tipo de gatekeeper detectado
            </h3>
            <div className="mt-1">
              <NaoMedido motivo="o classificador de porteiro grava o tipo em Contato, e o painel desta conversa ainda não lê esse campo — a contagem por tipo, no agregado, está na seção “Porteiros por tipo” desta mesma tela" />
            </div>
          </div>

          {/* ── Decisor encontrado, com grau de confiança ──────────────────── */}
          <div className="rounded-2xl border border-line bg-paper p-3">
            <h3 className="text-[12px] font-semibold text-ink">Decisor encontrado</h3>
            {estado.dados.painel.decisor ? (
              <>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-semibold text-ink">
                    {estado.dados.painel.decisor.nome}
                  </span>
                  <Pilula
                    tom={
                      estado.dados.painel.decisor.confianca === "ALTA"
                        ? "verde"
                        : estado.dados.painel.decisor.confianca === "BAIXA"
                          ? "cinza"
                          : "ambar"
                    }
                  >
                    {estado.dados.painel.decisor.confianca.toLowerCase()} confiança
                  </Pilula>
                </p>
                <p className="text-[11.5px] text-muted">
                  {estado.dados.painel.decisor.cargo ?? "cargo não informado"}
                </p>
                {estado.dados.painel.decisor.comoFoiDescoberto ? (
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">
                    {estado.dados.painel.decisor.comoFoiDescoberto}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="mt-1">
                <NaoMedido motivo="nenhum contato desta empresa está marcado como decisor — é a fila de trabalho do SDR, não um erro da tela" />
              </div>
            )}
          </div>

          {/* ── Próxima melhor ação ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-paper p-3">
            <h3 className="text-[12px] font-semibold text-ink">Próxima melhor ação</h3>
            {estado.dados.leitura?.proximaAcao ? (
              <p className="mt-1 text-[12px] leading-relaxed text-ink2">
                {estado.dados.leitura.proximaAcao}
              </p>
            ) : estado.dados.painel.proximaAcao?.nota ? (
              <p className="mt-1 text-[12px] leading-relaxed text-ink2">
                {estado.dados.painel.proximaAcao.nota}
              </p>
            ) : (
              <div className="mt-1">
                <NaoMedido motivo="nenhuma próxima ação registrada e nenhuma leitura de IA pedida para esta conversa" />
              </div>
            )}
          </div>

          {/* ── Respostas sugeridas ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-paper p-3">
            <h3 className="text-[12px] font-semibold text-ink">Respostas sugeridas</h3>
            {estado.dados.leitura && estado.dados.leitura.sugestoes.length > 0 ? (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {estado.dados.leitura.sugestoes.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-line bg-canvas px-2.5 py-2 text-[11.5px] leading-snug text-ink2"
                  >
                    {s.texto}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">
                  A leitura da IA é uma chamada paga, e por isso não sai sozinha ao
                  abrir a conversa.
                </p>
                <button
                  type="button"
                  onClick={pedirLeitura}
                  disabled={estado.lendo}
                  className="mt-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] font-semibold text-brand-600 transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:text-muted"
                >
                  {estado.lendo ? "Lendo…" : "Pedir a leitura da IA"}
                </button>
              </>
            )}
            {/* O desenho tem um ícone de COPIAR em cada sugestão. Ele não entra:
                a sugestão serve para ser colada na caixa de envio, e a caixa de
                envio não está nesta tela. */}
          </div>

          {/* ── Checklist da descoberta ────────────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-paper p-3">
            <h3 className="text-[12px] font-semibold text-ink">
              Checklist da descoberta{" "}
              <span className="font-normal text-muted">
                {ITENS_TOTAIS - estado.dados.painel.ausentes.length}/{ITENS_TOTAIS}
              </span>
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              O que já se sabe desta empresa, e o que ninguém perguntou ainda.
            </p>
            {estado.dados.painel.ausentes.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-emerald-700">
                Nada em branco: os {ITENS_TOTAIS} itens da ficha estão preenchidos.
              </p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1">
                {estado.dados.painel.ausentes.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-[11.5px] text-ink2">
                    <span
                      className="mt-[3px] h-3 w-3 shrink-0 rounded-[4px] border border-line2"
                      aria-hidden="true"
                    />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Secao>
  );
}
