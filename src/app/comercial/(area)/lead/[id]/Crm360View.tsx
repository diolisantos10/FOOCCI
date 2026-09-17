/**
 * O CRM 360 DO LEAD, desenhado — tela 04 do desenho do CEO.
 *
 * Mesma doutrina da Central: componente PURO, sem `"use client"` e sem `fetch`.
 * Recebe a ficha já lida por `crm360.lerFichaDoLead` e devolve markup — que é o
 * que permite ao teste medir o HTML que o vendedor recebe, com dado saído do
 * serviço de verdade.
 *
 * ── O QUE ESTA TELA MOSTRA QUE NENHUMA OUTRA MOSTRAVA ───────────────────────
 *
 * A empresa, o decisor e o gatekeeper. Eles estavam gravados desde a
 * reestruturação e não apareciam em lugar nenhum. A ficha da conversa mostra a
 * PESSOA; esta mostra a pessoa, a casa dela, quem manda lá dentro e quem é só o
 * porteiro.
 *
 * ── ⛔ O QUE ELA NÃO FAZ ────────────────────────────────────────────────────
 *
 * Não envia mensagem, não move estágio, não cria proposta. É ficha. Os dois
 * únicos links saem para telas que já existem: a conversa e as filas.
 *
 * ── "NÃO MEDIDO" É UMA RESPOSTA, ZERO NÃO É ─────────────────────────────────
 *
 * `naoMedido()` existe para não haver neste arquivo um único `?? 0` nem um
 * `|| "—"` mudo. Score nulo vira "ninguém pontuou"; unidades nulas viram "não
 * apurado"; `deliveryProprio` tem TRÊS leituras (sim, não, não apurado) e as
 * três estão escritas, porque `false` e `null` significam coisas diferentes e
 * só uma delas manda alguém ir apurar.
 */

import Link from "next/link";
import type {
  ContatoDaFicha,
  FichaDoLead,
  OportunidadeDaFicha,
} from "@/services/salaDeVendas/crm360";

const ROTULO_DO_GATEKEEPER: Record<string, string> = {
  BOT_DE_PEDIDOS: "Bot de pedidos",
  RECEPCIONISTA: "Recepcionista",
  ATENDENTE: "Atendente",
  SAC: "SAC",
  CAIXA: "Caixa",
  FORMULARIO: "Formulário",
  WHATSAPP_GERAL: "WhatsApp geral",
  CENTRAL_TELEFONICA: "Central telefônica",
  OUTRO: "Outro",
};

const ROTULO_DA_OPORTUNIDADE: Record<string, string> = {
  DESCOBERTA: "Descoberta",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  GANHA: "Ganha",
  PERDIDA: "Perdida",
};

/** Centavos viram "R$ 249,00". Nunca chamada com `null` — quem chama decide antes. */
export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** A frase de um dado ausente. Sempre com o MOTIVO, nunca só um traço. */
export function naoMedido(motivo: string): string {
  return `não medido — ${motivo}`;
}

/** As três leituras de um booleano que pode ser nulo. */
export function simNaoOuNaoApurado(v: boolean | null): string {
  if (v === null) return naoMedido("ninguém apurou");
  return v ? "sim" : "não";
}

// ─────────────────────────────────────────────────────────────────────────────

function Campo(props: { rotulo: string; valor: string; medido?: boolean }) {
  const ausente = props.medido === false;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
        {props.rotulo}
      </p>
      <p className={`mt-0.5 break-words text-[12.5px] ${ausente ? "text-muted" : "text-ink"}`}>
        {props.valor}
      </p>
    </div>
  );
}

function Bloco(props: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-4">
      <h2 className="text-[13px] font-semibold tracking-[-.01em] text-ink">{props.titulo}</h2>
      {props.nota && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{props.nota}</p>}
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line2 bg-canvas px-3 py-3 text-[12.5px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

function CartaoDoContato({ c }: { c: ContatoDaFicha }) {
  return (
    <li className="rounded-xl border border-line2 bg-canvas p-3">
      <p className="text-[13px] font-semibold text-ink">
        {c.nome}
        {c.ehDecisor && (
          <span className="ml-1.5 rounded-md bg-brand-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
            decisor
          </span>
        )}
        {c.ehGatekeeper && (
          <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-900">
            gatekeeper{c.tipoDeGatekeeper ? `: ${ROTULO_DO_GATEKEEPER[c.tipoDeGatekeeper] ?? c.tipoDeGatekeeper}` : ""}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {c.cargo ?? naoMedido("cargo não informado")}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Campo rotulo="Canal" valor={c.canal ?? naoMedido("sem canal")} medido={Boolean(c.canal)} />
        <Campo
          rotulo="Telefone"
          valor={c.telefone ?? naoMedido("sem telefone")}
          medido={Boolean(c.telefone)}
        />
        <Campo rotulo="Confiança" valor={c.confianca} />
        <Campo
          rotulo="Como se soube"
          valor={c.comoFoiDescoberto ?? naoMedido("origem não registrada")}
          medido={Boolean(c.comoFoiDescoberto)}
        />
      </div>
    </li>
  );
}

function CartaoDaOportunidade({ o }: { o: OportunidadeDaFicha }) {
  return (
    <li className="rounded-xl border border-line2 bg-canvas p-3">
      <p className="text-[13px] font-semibold text-ink">
        {ROTULO_DA_OPORTUNIDADE[o.estagio] ?? o.estagio}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Campo
          rotulo="Valor potencial"
          valor={
            o.valorPotencialCents === null
              ? naoMedido("ninguém estimou")
              : reais(o.valorPotencialCents)
          }
          medido={o.valorPotencialCents !== null}
        />
        <Campo
          rotulo="Probabilidade"
          valor={o.probabilidade === null ? naoMedido("não estimada") : `${o.probabilidade}%`}
          medido={o.probabilidade !== null}
        />
        <Campo
          rotulo="Produto de interesse"
          valor={o.produtoDeInteresse ?? naoMedido("não registrado")}
          medido={Boolean(o.produtoDeInteresse)}
        />
        <Campo
          rotulo="Dor identificada"
          valor={o.dorIdentificada ?? naoMedido("não registrada")}
          medido={Boolean(o.dorIdentificada)}
        />
      </div>
      {o.objecoes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {o.objecoes.map((ob, i) => (
            <li
              key={`${o.id}-ob-${i}`}
              className="rounded-lg bg-amber-50 px-2 py-1 text-[12px] leading-relaxed text-amber-900"
            >
              {ob}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OS TRÊS ESTADOS
// ─────────────────────────────────────────────────────────────────────────────

export function FichaCarregando() {
  return <p className="p-6 text-[13px] text-muted">Carregando a ficha…</p>;
}

export function FichaNaoEncontrada() {
  return (
    <div className="p-6">
      <p className="text-[13px] font-semibold text-ink">Lead não encontrado.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
        Ou ele não existe, ou não está ao seu alcance. As duas respostas são a
        mesma de propósito: distinguir uma da outra entregaria o tamanho da base a
        quem estivesse testando ids.
      </p>
      <Link
        href="/comercial/conversas"
        className="mt-3 inline-block rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
      >
        Voltar para as conversas
      </Link>
    </div>
  );
}

export function FichaComErro({ detalhe }: { detalhe: string | null }) {
  return (
    <div className="p-6">
      <p className="text-[13px] font-semibold text-ink">A ficha não pôde ser lida.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
        Nada é mostrado enquanto a leitura falhar — ficha meio carregada é pior
        que ficha nenhuma, porque parece completa.
      </p>
      {detalhe && <p className="mt-2 text-[11.5px] text-muted">Detalhe técnico: {detalhe}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function Crm360View({ f }: { f: FichaDoLead }) {
  const p = f.pessoa;
  const e = f.empresa;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-[-.02em] text-ink">{p.nome}</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {[p.restaurante, p.cidade, p.tipo].filter(Boolean).join(" · ") ||
              naoMedido("restaurante e cidade não informados")}
          </p>
        </div>
        <Link
          href={`/comercial/conversas?leadId=${p.leadId}`}
          className="shrink-0 rounded-xl bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600"
        >
          Abrir conversa
        </Link>
      </header>

      {p.optOutEm && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-amber-900">
          Este contato pediu silêncio em {p.optOutEm.slice(0, 10)}. Não abordar.
        </p>
      )}

      {/* ── A PESSOA ────────────────────────────────────────────────────── */}
      <Bloco titulo="O contato">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo rotulo="WhatsApp" valor={p.whatsapp} />
          <Campo
            rotulo="E-mail"
            valor={p.email ?? naoMedido("não informado")}
            medido={Boolean(p.email)}
          />
          <Campo rotulo="Etapa do funil" valor={p.stage} />
          <Campo
            rotulo="Score"
            valor={p.score === null ? naoMedido("ninguém pontuou") : String(p.score)}
            medido={p.score !== null}
          />
          <Campo
            rotulo="Temperatura"
            valor={p.temperatura ?? naoMedido("não classificada")}
            medido={Boolean(p.temperatura)}
          />
          <Campo rotulo="Atendido por" valor={p.atendidoPor} />
          <Campo
            rotulo="Origem"
            valor={p.origem ?? naoMedido("não registrada")}
            medido={Boolean(p.origem)}
          />
          <Campo
            rotulo="Consentimento"
            valor={p.consentimentoEm ? p.consentimentoEm.slice(0, 10) : naoMedido("sem prova de opt-in")}
            medido={Boolean(p.consentimentoEm)}
          />
          <Campo
            rotulo="Próxima ação"
            valor={
              p.proximaAcaoEm
                ? `${p.proximaAcaoEm.slice(0, 10)}${p.proximaAcaoNota ? ` — ${p.proximaAcaoNota}` : ""}`
                : naoMedido("nenhuma agendada")
            }
            medido={Boolean(p.proximaAcaoEm)}
          />
        </div>
      </Bloco>

      {/* ── A EMPRESA ───────────────────────────────────────────────────── */}
      <Bloco
        titulo="A empresa"
        nota="A casa do contato, do jeito que a jornada comercial a conhece."
      >
        {!e ? (
          <Vazio>
            Este lead ainda não foi ligado a uma empresa da jornada. Sem empresa
            não há ICP, nem decisor, nem gatekeeper — e é isso que está faltando,
            não um zero.
          </Vazio>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo rotulo="Nome" valor={e.nome} />
            <Campo
              rotulo="Categoria"
              valor={e.categoria ?? naoMedido("não classificada")}
              medido={Boolean(e.categoria)}
            />
            <Campo
              rotulo="Onde fica"
              valor={[e.bairro, e.cidade, e.estado].filter(Boolean).join(", ") || naoMedido("endereço não apurado")}
              medido={Boolean(e.cidade ?? e.estado ?? e.bairro)}
            />
            <Campo rotulo="Estágio" valor={e.estagio} />
            <Campo
              rotulo="ICP"
              valor={e.scoreIcp === null ? naoMedido("ninguém mediu o ICP") : String(e.scoreIcp)}
              medido={e.scoreIcp !== null}
            />
            <Campo
              rotulo="Prioridade"
              valor={e.prioridade ?? naoMedido("não priorizada")}
              medido={Boolean(e.prioridade)}
            />
            <Campo
              rotulo="Unidades"
              valor={
                e.numeroDeUnidades === null ? naoMedido("não apurado") : String(e.numeroDeUnidades)
              }
              medido={e.numeroDeUnidades !== null}
            />
            <Campo rotulo="Delivery próprio" valor={simNaoOuNaoApurado(e.deliveryProprio)} medido={e.deliveryProprio !== null} />
            <Campo rotulo="Cardápio próprio" valor={simNaoOuNaoApurado(e.cardapioProprio)} medido={e.cardapioProprio !== null} />
            <Campo
              rotulo="Marketplaces"
              valor={
                e.marketplaces.length > 0
                  ? e.marketplaces.join(", ")
                  : e.apuradoMarketplaceEm
                    ? "apurado: nenhum"
                    : naoMedido("nunca apurado")
              }
              medido={e.marketplaces.length > 0 || Boolean(e.apuradoMarketplaceEm)}
            />
            <Campo
              rotulo="Sistema atual"
              valor={e.sistemaIdentificado ?? naoMedido("não identificado")}
              medido={Boolean(e.sistemaIdentificado)}
            />
            <Campo
              rotulo="Ticket estimado"
              valor={
                e.ticketEstimadoCents === null
                  ? naoMedido("não estimado")
                  : reais(e.ticketEstimadoCents)
              }
              medido={e.ticketEstimadoCents !== null}
            />
            <Campo rotulo="Descoberta por" valor={e.fonteDaDescoberta} />
          </div>
        )}
      </Bloco>

      {/* ── DECISOR E GATEKEEPER ────────────────────────────────────────── */}
      <Bloco
        titulo="Quem manda, e quem é o porteiro"
        nota="Gatekeeper não é o cliente: é o caminho até ele."
      >
        {f.contatos.length === 0 ? (
          <Vazio>
            Nenhum contato registrado nesta empresa. Isto não diz que não há
            decisor — diz que ninguém o encontrou ainda.
          </Vazio>
        ) : (
          <>
            {!f.decisor && (
              <p className="mb-2 text-[12px] leading-relaxed text-muted">
                Decisor ainda não encontrado. Os contatos abaixo são o que se sabe
                até aqui.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {f.contatos.map((c) => (
                <CartaoDoContato key={c.id} c={c} />
              ))}
            </ul>
          </>
        )}
      </Bloco>

      {/* ── A OPORTUNIDADE ──────────────────────────────────────────────── */}
      <Bloco titulo="Oportunidade" nota="O negócio em si — separado da etapa da conversa.">
        {f.oportunidades.length === 0 ? (
          <Vazio>Nenhuma oportunidade aberta para este lead.</Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {f.oportunidades.map((o) => (
              <CartaoDaOportunidade key={o.id} o={o} />
            ))}
          </ul>
        )}
      </Bloco>

      {/* ── PROPOSTAS ───────────────────────────────────────────────────── */}
      <Bloco titulo="Propostas">
        {f.propostas.length === 0 ? (
          <Vazio>Nenhuma proposta emitida.</Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {f.propostas.map((pr) => (
              <li
                key={pr.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-line2 bg-canvas px-3 py-2.5"
              >
                <span>
                  <span className="text-[13px] font-semibold text-ink">
                    {pr.plano ?? naoMedido("plano não registrado")}
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {pr.situacao}
                    {pr.vencida ? " · validade vencida" : ""}
                  </span>
                </span>
                <span className="text-[12.5px] text-ink2">
                  {pr.valorMensalCent === null
                    ? naoMedido("sem valor")
                    : `${reais(pr.valorMensalCent)}/mês`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      {/* ── FOLLOW-UP ───────────────────────────────────────────────────── */}
      <Bloco titulo="Estado de follow-up" nota="O estado E o porquê — número sem explicação ninguém contesta.">
        {!f.followUp ? (
          <Vazio>Não classificado.</Vazio>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-ink">{f.followUp.classificacao.estado}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
              {f.followUp.classificacao.porque}
            </p>
            <p className="mt-1 text-[11.5px] text-muted">
              regra: {f.followUp.classificacao.regra}
            </p>
          </>
        )}
      </Bloco>

      {/* ── LINHA DO TEMPO ──────────────────────────────────────────────── */}
      <Bloco titulo="Linha do tempo" nota="O que aconteceu, do mais recente para o mais antigo.">
        {f.linhaDoTempo.length === 0 ? (
          <Vazio>Nada registrado além das mensagens, que ficam na conversa.</Vazio>
        ) : (
          <ol className="flex flex-col">
            {f.linhaDoTempo.map((ev) => (
              <li key={ev.id} className="border-l-2 border-line2 py-1.5 pl-3">
                <p className="text-[12.5px] leading-snug text-ink">{ev.titulo}</p>
                {ev.nota && <p className="text-[12px] leading-snug text-ink2">{ev.nota}</p>}
                <p className="text-[11px] text-muted">
                  {ev.quando.slice(0, 16).replace("T", " ")} · {ev.autor}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Bloco>
    </div>
  );
}
