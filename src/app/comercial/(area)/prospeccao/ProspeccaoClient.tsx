"use client";

/**
 * A PROSPECÇÃO — a tela onde a casa decide falar com estranhos.
 *
 * ── ⛔ A OPERAÇÃO POR LOTES FOI REMOVIDA EM 11/09/2026 ───────────────────────
 *
 * Ordem explícita do CEO: *"nenhuma importação pode depender de liberação
 * manual"* e *"lote não pode aparecer como etapa operacional nem impedir
 * envio."* Esta tela não tem mais seção "Lotes", nem botão "Liberar", nem
 * botão "Pausar" por lista. O que existia ali virou histórico — a aba
 * Importações continua contando de qual arquivo cada contato veio.
 *
 * A operação correta, de hoje em diante: **planilha entra → contatos vão
 * direto para a Base fria → o sistema seleciona até o teto de elegíveis → a
 * rodada automática (ou "Rodar agora") aborda.** Nenhum clique de liberação
 * no meio do caminho.
 *
 * ── O QUE ESTA TELA MOSTRA, E POR QUE NESTA ORDEM ───────────────────────────
 *
 * 1. Receber/enriquecer contatos — a porta de entrada, sempre no topo.
 * 2. O interruptor geral, com o limite e o saldo disponível ao lado — quem
 *    abre esta tela precisa saber, em um segundo, se a casa está abordando
 *    gente agora, e conseguir parar sem procurar o botão.
 * 3. O resumo da Base fria — quantos contatos existem, quantos PENDENTES
 *    (ainda não passaram pelas travas de opt-out/histórico/canal — ver
 *    P0.3), e a ficha de cada um (colunas principais + detalhe expansível).
 4. O disparo manual — só o botão "Rodar agora", com confirmação. O painel
 *    "Fila automática" (capacidade da próxima rodada, prévia dos 50, última
 *    rodada) SAIU por ordem do CEO em 19/09/2026; os tetos que ele mostrava
 *    continuam valendo no código, porque eles não eram painel, eram trava.
 * 5. A gaveta dos barrados — por que cada contato foi recusado, motivo a
 *    motivo, e as duas ações de limpeza (arquivar os definitivos, apagar quem
 *    não tem WhatsApp nem e-mail). Substituiu a "Conferência da Base fria",
 *    que mostrava sete números e nenhum motivo. Ver `gavetaDosBarrados.ts`.
 *
 * ── ⚠️ NADA AQUI ENVIA MENSAGEM SOZINHO ─────────────────────────────────────
 *
 * Esta tela seleciona e mostra. A entrega continua atrás de
 * `FOOCCI_SDR_SEND_ENABLED`, no ambiente, e é do dono. "Rodar agora" chama a
 * MESMA rodada que o agendador das 9h chama — não é um caminho novo — e só
 * dispara depois de confirmação explícita (ordem do CEO, 11/09/2026: um
 * clique não pode abordar até 2.000 contatos por acidente).
 */

import { useCallback, useEffect, useState } from "react";
import { ReceberLista } from "./ReceberLista";
import { EnriquecerModal } from "./EnriquecerModal";

const ROTA = "/api/admin/sala-de-vendas/prospeccao";

interface Fila {
  liberados: unknown[];
  barrados: unknown[];
  motivoDaFilaVazia: string | null;
  usadosHoje: number;
  tetoDoDia: number;
  /** Conversas iniciadas nas últimas 24h corridas — a conta da Meta. */
  usadosNaJanela: number;
  /** O que a Meta ainda deixa mandar agora. É este que limita a fila. */
  saldoDaJanela: number;
}

interface Interruptor {
  outboundLigado: boolean;
  limiteDiario: number;
  horasEntreAbordagens: number;
  pausadoEm: string | null;
  motivo: string | null;
  /** Quando a rodada das 9h (ou um "Rodar agora") rodou pela última vez. */
  ultimaRodadaAutomaticaEm: string | null;
  ultimaRodadaAutomaticaPor: string | null;
}

interface ResumoDaBase {
  total: number;
  pendentes: number;
}

interface Dados {
  fila: Fila;
  base: ResumoDaBase;
  interruptor: Interruptor;
  canalPronto: boolean;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; dados: Dados }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

/** Uma linha da Base fria — as colunas principais + tudo que o detalhe expansível mostra. */
interface ContatoDaBase {
  id: string;
  nome: string | null;
  whatsapp: string;
  empresa: string | null;
  cidade: string | null;
  estado: string | null;
  tipo: string | null;
  situacao: string;
  entrouEm: string;
  leadId: string | null;
  cargo: string | null;
  telefoneSecundario: string | null;
  email: string | null;
  bairro: string | null;
  endereco: string | null;
  cep: string | null;
  cnpj: string | null;
  instagram: string | null;
  site: string | null;
  googleMapsUrl: string | null;
  numeroDeUnidades: number | null;
  canaisAtuais: string[];
  observacoes: string | null;
  tags: string[];
  proveniencia: string | null;
  responsavel: string | null;
  arquivo: string | null;
  canalDeObtencao: string | null;
  motivoDeBloqueio: string | null;
}

interface ResultadoDaRodada {
  abordados: number;
  pulados: number;
  parouPor: "filaAcabou" | "tetoDaRodada" | "freio" | "falha" | "preVoo";
  falha: { itemId: string | null; motivo: string; detalhe: string } | null;
}

/**
 * ⭐ A GAVETA DOS BARRADOS — espelha `RaioXDaGaveta` (`gavetaDosBarrados.ts`),
 * servida por `?recorte=gaveta` (`route.ts`). Não reimplementa regra nenhuma:
 * quem classifica o motivo é o mesmo portão que a rodada usa.
 */
interface MotivoNaGaveta {
  motivo: string;
  rotulo: string;
  quantidade: number;
  /** `true` quando o bloqueio se resolve sozinho com o tempo (horário, descanso, canal). */
  passaSozinho: boolean;
  terminal: boolean;
}

interface Gaveta {
  pendentes: number;
  avaliados: number;
  liberados: number;
  barrados: number;
  varreuTudo: boolean;
  porMotivo: MotivoNaGaveta[];
  semWhatsappNemEmail: number;
  protegidosPorOptOut: number;
}

/** Linhas de detalhe que só aparecem quando a pessoa expande o contato. */
function LinhaDeDetalhe({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <p className="text-[12px] text-muted">
      <span className="text-ink">{rotulo}:</span> {valor}
    </p>
  );
}

function FichaDoContato({ c }: { c: ContatoDaBase }) {
  const [aberto, setAberto] = useState(false);
  const endereco = [c.endereco, c.bairro, c.cep].filter(Boolean).join(", ");

  return (
    <li className="rounded-xl border border-line bg-paper p-3">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">
            {c.empresa ?? "Sem empresa"} · {c.nome ?? "Sem responsável"}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {c.whatsapp}
            {c.cidade ? ` · ${c.cidade}${c.estado ? `/${c.estado}` : ""}` : ""}
            {c.tipo ? ` · ${c.tipo}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-[12px] text-muted">{aberto ? "recolher ▲" : "detalhes ▼"}</span>
      </button>

      {aberto && (
        <div className="mt-2.5 space-y-1 border-t border-line pt-2.5">
          <LinhaDeDetalhe rotulo="Cargo" valor={c.cargo} />
          <LinhaDeDetalhe rotulo="Telefone secundário" valor={c.telefoneSecundario} />
          <LinhaDeDetalhe rotulo="E-mail" valor={c.email} />
          <LinhaDeDetalhe rotulo="Endereço" valor={endereco || null} />
          <LinhaDeDetalhe rotulo="CNPJ" valor={c.cnpj} />
          <LinhaDeDetalhe rotulo="Instagram" valor={c.instagram} />
          <LinhaDeDetalhe rotulo="Site" valor={c.site} />
          <LinhaDeDetalhe rotulo="Google Maps" valor={c.googleMapsUrl} />
          <LinhaDeDetalhe
            rotulo="Unidades"
            valor={c.numeroDeUnidades !== null ? String(c.numeroDeUnidades) : null}
          />
          <LinhaDeDetalhe
            rotulo="Canais atuais"
            valor={c.canaisAtuais.length ? c.canaisAtuais.join(", ") : null}
          />
          <LinhaDeDetalhe rotulo="Observações" valor={c.observacoes} />
          <LinhaDeDetalhe rotulo="Tags" valor={c.tags.length ? c.tags.join(", ") : null} />
          <LinhaDeDetalhe rotulo="Procedência" valor={c.proveniencia} />
          <LinhaDeDetalhe rotulo="Canal de obtenção" valor={c.canalDeObtencao} />
          <LinhaDeDetalhe rotulo="Arquivo" valor={c.arquivo} />
          <LinhaDeDetalhe
            rotulo="Entrou em"
            valor={new Date(c.entrouEm).toLocaleDateString("pt-BR")}
          />
          <LinhaDeDetalhe rotulo="Situação" valor={c.situacao} />
          <LinhaDeDetalhe rotulo="Motivo de bloqueio" valor={c.motivoDeBloqueio} />
        </div>
      )}
    </li>
  );
}

/**
 * ⭐ A GAVETA DOS BARRADOS — por que cada contato foi recusado, e quanto lixo dá para apagar.
 *
 * ── POR QUE ELA SUBSTITUIU A "CONFERÊNCIA DA BASE FRIA" ─────────────────────
 *
 * A conferência respondia "quantos elegíveis eu tenho" com sete números e uma
 * amostra de 50 linhas — e no dia em que a amostra veio "0 prontos · 50
 * barrados" ela não dizia POR QUÊ, que era a única pergunta que importava.
 * Ordem do CEO, 19/09/2026: *"esses cinquenta precisam ir para alguma gaveta
 * para ser detectado. Por que foi barrado?"*
 *
 * Esta seção responde isso: uma linha por motivo, com a contagem ao lado.
 *
 * ── ⛔ E AS DUAS AÇÕES QUE ESCREVEM ─────────────────────────────────────────
 *
 * "Arquivar" só mexe nos motivos terminais — opt-out, sem telefone, telefone
 * improvável, teto de tentativas. Horário e canal desligado NUNCA arquivam:
 * fariam a base sumir às 8h da manhã. "Apagar" pede confirmação com o número
 * na frente, e quem pediu silêncio nunca entra na conta. As duas regras moram
 * em `gavetaDosBarrados.ts` — aqui é só o botão.
 */
function GavetaDosBarrados() {
  const [estado, setEstado] = useState<
    | { fase: "ociosa" }
    | { fase: "carregando" }
    | { fase: "pronta"; dados: Gaveta }
    | { fase: "erro"; detalhe: string }
  >({ fase: "ociosa" });
  const [recado, setRecado] = useState<string | null>(null);

  const abrirGaveta = useCallback(async () => {
    setEstado({ fase: "carregando" });
    setRecado(null);
    try {
      const res = await fetch(`${ROTA}?recorte=gaveta`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { data?: Gaveta; error?: string } | null;
      if (!res.ok || !json?.data) {
        setEstado({ fase: "erro", detalhe: json?.error ?? `Não consegui abrir a gaveta (${res.status}).` });
        return;
      }
      setEstado({ fase: "pronta", dados: json.data });
    } catch (e) {
      setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : "Falha de rede." });
    }
  }, []);

  const acao = useCallback(
    async (corpo: Record<string, unknown>) => {
      const res = await fetch(ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = (await res.json().catch(() => null)) as { data?: any; error?: string } | null;
      if (!res.ok) {
        setRecado(json?.error ?? `A ação foi recusada (${res.status}).`);
        return null;
      }
      return json?.data ?? null;
    },
    [],
  );

  const arquivar = useCallback(async () => {
    const d = await acao({ acao: "arquivarBarrados" });
    if (d) {
      setRecado(`${d.arquivados} contato(s) foram para a gaveta, com o motivo registrado.`);
      abrirGaveta();
    }
  }, [acao, abrirGaveta]);

  /**
   * ⛔ DOIS PASSOS, SEMPRE. O primeiro CONTA (o servidor não apaga sem
   * `confirmar`), o segundo apaga — e o número que aparece na confirmação veio
   * do servidor, não de uma estimativa da tela.
   */
  const apagar = useCallback(async () => {
    setRecado(null);
    const previa = await acao({ acao: "descartarInuteis" });
    if (!previa) return;
    if (previa.apagaveis === 0) {
      setRecado(
        `Nada a apagar: ${previa.candidatos} sem WhatsApp nem e-mail, e ${previa.protegidosPorOptOut} deles são protegidos por terem pedido silêncio.`,
      );
      return;
    }
    const ok = window.confirm(
      `Vou apagar ${previa.apagaveis} contato(s) sem WhatsApp válido e sem e-mail, de uma base de ${previa.antes}. ` +
        `${previa.protegidosPorOptOut} que pediram para não receber mais NÃO serão apagados. Isto não tem volta. Confirmar?`,
    );
    if (!ok) return;
    const feito = await acao({ acao: "descartarInuteis", confirmar: true });
    if (feito) {
      setRecado(`Apagados ${feito.apagados}. A base foi de ${feito.antes} para ${feito.depois} contatos.`);
      abrirGaveta();
    }
  }, [acao, abrirGaveta]);

  return (
    <section className="rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Gaveta dos barrados</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Quem a fila recusou, e <strong className="text-ink">por quê</strong>, motivo a motivo.{" "}
            Abrir a gaveta <strong className="text-ink">só lê</strong>: não apaga, não envia, não consome contato.
          </p>
        </div>
        <button
          disabled={estado.fase === "carregando"}
          onClick={abrirGaveta}
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          {estado.fase === "carregando" ? "Abrindo…" : "Abrir a gaveta"}
        </button>
      </div>

      {recado && (
        <p className="mt-3 rounded-lg border border-line px-3 py-2 text-[12.5px] text-ink">{recado}</p>
      )}

      {estado.fase === "erro" && (
        <p className="mt-3 rounded-lg border border-line px-3 py-2 text-[12.5px] text-ink">
          {estado.detalhe}
        </p>
      )}

      {estado.fase === "pronta" && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <p className="text-[12.5px] text-muted">
            <span className="font-semibold text-ink">{estado.dados.avaliados}</span> contatos
            examinados de <span className="font-semibold text-ink">{estado.dados.pendentes}</span>{" "}
            pendentes ·{" "}
            <span className="font-semibold text-ink">{estado.dados.liberados}</span> passariam ·{" "}
            <span className="font-semibold text-ink">{estado.dados.barrados}</span> barrados
            {estado.dados.varreuTudo ? "" : " (varredura parcial)"}
          </p>

          <ul className="space-y-1">
            {estado.dados.porMotivo.map((m) => (
              <li key={m.motivo} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="truncate text-ink">
                  {m.rotulo}
                  {m.passaSozinho && (
                    <span className="text-muted"> · passa sozinho com o tempo</span>
                  )}
                </span>
                <span className="font-semibold tabular-nums text-ink">{m.quantidade}</span>
              </li>
            ))}
            {estado.dados.porMotivo.length === 0 && (
              <li className="text-[12.5px] text-muted">Nenhum barrado entre os examinados.</li>
            )}
          </ul>

          <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[12.5px]">
            <p className="text-ink">
              <span className="font-semibold">{estado.dados.semWhatsappNemEmail}</span> sem WhatsApp
              válido e sem e-mail — não há como falar com essas pessoas.
            </p>
            {estado.dados.protegidosPorOptOut > 0 && (
              <p className="mt-0.5 text-muted">
                Destes, {estado.dados.protegidosPorOptOut} pediram para não receber mais e{" "}
                <strong className="text-ink">nunca são apagados</strong>: apagar o registro faria a
                gente abordá-los de novo na próxima lista.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={arquivar}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas"
            >
              Arquivar os barrados definitivos
            </button>
            <button
              onClick={apagar}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas"
            >
              Apagar quem não tem WhatsApp nem e-mail…
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProspeccaoClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [modalEnriquecerAberto, setModalEnriquecerAberto] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Quantas abordagens por dia. Vazio até a tela ler o que está no banco. */
  const [teto, setTeto] = useState<string>("");
  const [contatos, setContatos] = useState<ContatoDaBase[] | null>(null);
  const [resultadoRodada, setResultadoRodada] = useState<ResultadoDaRodada | null>(null);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(ROTA, { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          if (vivo) setEstado({ fase: "semAcesso" });
          return;
        }
        if (!res.ok) {
          if (vivo) setEstado({ fase: "erro", detalhe: `${ROTA} respondeu ${res.status}` });
          return;
        }
        const corpo = (await res.json()) as { data?: Dados };
        if (!corpo?.data) {
          if (vivo) setEstado({ fase: "erro", detalhe: "resposta em formato inesperado" });
          return;
        }
        if (vivo) setEstado({ fase: "pronto", dados: corpo.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  // ── O RESUMO DA BASE FRIA — as 10 fichas mais recentes ──────────────────
  //
  // Uma consulta separada, e não parte do GET principal: a lista de contatos
  // (com endereço, CNPJ, Instagram…) é bem mais pesada que a fila e o
  // interruptor, e a tela principal não deveria esperar por ela para mostrar
  // o freio — que é a informação mais urgente.
  useEffect(() => {
    if (estado.fase !== "pronto") return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`${ROTA}?recorte=base&porPagina=10`, { cache: "no-store" });
        if (!res.ok) return;
        const corpo = (await res.json()) as { data?: { linhas?: ContatoDaBase[] } };
        if (vivo) setContatos(corpo.data?.linhas ?? []);
      } catch {
        // O resumo é um extra; falhar aqui não pode derrubar a tela inteira.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [estado.fase, tentativa]);

  const agir = useCallback(
    async (corpo: Record<string, unknown>) => {
      setOcupado(true);
      setAviso(null);
      try {
        const res = await fetch(ROTA, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        const json = (await res.json().catch(() => null)) as
          | { error?: string; data?: unknown }
          | null;
        if (!res.ok) {
          // A recusa do servidor aparece com as palavras dele. Traduzir aqui
          // faria a tela inventar um motivo que o servidor não deu.
          setAviso(json?.error ?? `A ação foi recusada (${res.status}).`);
          return null;
        }
        recarregar();
        return json?.data ?? null;
      } catch (e) {
        setAviso(e instanceof Error ? e.message : "Falha de rede.");
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [recarregar],
  );

  /**
   * ⭐ P0.2 — "Rodar agora" precisa de confirmação DELIBERADA, não um clique
   * acidental que aborda até 2.000 contatos de uma vez.
   *
   * `capacidade` é o mesmo cálculo de `cabeNoTeto` em `selecao.ts`
   * (`min(pendentes, saldo diário, saldo da janela da Meta)`) — não
   * `fila.liberados.length`, que é só a prévia dos 50 primeiros (ver P0.3) e
   * subestimaria a confirmação numa fila maior que 50.
   */
  const dispararRodada = useCallback(
    async (capacidade: number) => {
      const mensagem =
        capacidade > 0
          ? `Esta ação poderá abordar até ${capacidade} contato${capacidade === 1 ? "" : "s"} agora. Confirmar?`
          : "Esta ação poderá abordar até 0 contatos agora — nada será enviado. Confirmar mesmo assim?";
      if (!window.confirm(mensagem)) return;

      setResultadoRodada(null);
      const dados = await agir({ acao: "rodada" });
      if (dados) setResultadoRodada(dados as ResultadoDaRodada);
    },
    [agir],
  );

  if (estado.fase === "carregando") {
    return <div className="p-6 text-[13px] text-muted">Carregando…</div>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <div className="p-6 text-[13px] text-muted">
        Sua conta não alcança a prospecção.
      </div>
    );
  }

  if (estado.fase === "erro") {
    return (
      <div className="p-6">
        <p className="text-[13px] text-ink">Não foi possível ler a prospecção.</p>
        {estado.detalhe && <p className="mt-1 text-[12.5px] text-muted">{estado.detalhe}</p>}
        <button
          onClick={recarregar}
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { fila, base, interruptor, canalPronto } = estado.dados;
  const pausada = Boolean(interruptor.pausadoEm);
  const ligada = interruptor.outboundLigado && !pausada;

  // ⭐ P0.2/P0.3 — a capacidade REAL da próxima rodada, não a prévia de 50.
  // O mesmo `min(pendentes, saldo diário, saldo da janela)` que
  // `montarFilaDeProspeccao` usa como `cabeNoTeto` em `selecao.ts`.
  const capacidadeDaRodada = Math.max(
    0,
    Math.min(base.pendentes, fila.tetoDoDia - fila.usadosHoje, fila.saldoDaJanela),
  );
  const rodadaDesabilitada = ocupado || !ligada || !canalPronto || capacidadeDaRodada <= 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {aviso && (
        <p className="rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] text-ink">
          {aviso}
        </p>
      )}

      {/* ── 1. RECEBER / ENRIQUECER CONTATOS ─────────────────────────────── */}
      <ReceberLista aoImportar={recarregar} />

      <section className="rounded-xl border border-line bg-paper p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Enriquecer dados</h2>
          <button
            onClick={() => setModalEnriquecerAberto(true)}
            className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas"
          >
            Enriquecer dados de uma lista existente
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          Preenche só os campos vazios de contatos que já estão na Base fria — nunca cria contato novo, nunca sobrescreve o que já existe.
        </p>
      </section>

      {/* ── 2. O INTERRUPTOR GERAL, COM LIMITE E SALDO ───────────────────── */}
      <section className="rounded-xl border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              {ligada ? "Prospecção LIGADA" : pausada ? "Prospecção PAUSADA" : "Prospecção desligada"}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {fila.usadosHoje} de {fila.tetoDoDia} abordagens hoje
              {interruptor.motivo ? ` · ${interruptor.motivo}` : ""}
            </p>
            {/*
              ⭐ O NÚMERO QUE MANDA, e ele não é o de cima.
              A Meta conta conversas iniciadas numa janela CORRIDA de 24 horas —
              não numa cota que zera à meia-noite. Mostrar só "abordagens hoje"
              faria a tela dizer "0 de 2.000" à 00h05 com 1.500 conversas ainda
              pesando de ontem. Os dois aparecem, e o saldo vem em destaque.
            */}
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink2">
              Saldo da Meta agora: <span className="tabular-nums">{fila.saldoDaJanela}</span>{" "}
              conversas
              <span className="font-normal text-muted">
                {" "}
                · {fila.usadosNaJanela} iniciadas nas últimas 24h
              </span>
            </p>
          </div>

          <div className="flex gap-2">
            {ligada ? (
              <button
                disabled={ocupado}
                onClick={() => agir({ acao: "interruptor", pausar: true, motivo: "pausa manual" })}
                className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper disabled:opacity-50"
              >
                Pausar agora
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {/* O teto vem ANTES do botão, e não numa tela de configuração
                    escondida: ligar sem dizer quantos é o gesto que produz uma
                    prospecção ligada que não aborda ninguém. */}
                <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <span>Máx./dia</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={teto}
                    onChange={(e) => setTeto(e.target.value)}
                    placeholder={String(interruptor.limiteDiario || "")}
                    className="w-16 rounded-lg border border-line bg-canvas px-2 py-1 text-[13px] text-ink"
                  />
                </label>
                <button
                  disabled={ocupado}
                  onClick={() =>
                    agir({
                      acao: "interruptor",
                      ligado: true,
                      ...(teto.trim() !== "" ? { limiteDiario: Number(teto) } : {}),
                    })
                  }
                  className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink disabled:opacity-50"
                >
                  Ligar prospecção
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dizer que o canal está desligado é obrigação, não detalhe: sem isto a
            fila apareceria cheia de barrados e ninguém saberia por quê. */}
        {!canalPronto && (
          <p className="mt-3 rounded-lg border border-line px-3 py-2 text-[12.5px] text-muted">
            O canal de envio está desligado. A fila continua sendo calculada e
            <strong className="text-ink"> nenhuma mensagem sai</strong> — é o
            estado certo para conferir a lista antes da estreia.
          </p>
        )}
      </section>

      {/* ── 3. RESUMO DA BASE FRIA ────────────────────────────────────────── */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink">Base fria</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          <span className="font-semibold text-ink">{base.total}</span> contatos no total ·{" "}
          <span className="font-semibold text-ink">{base.pendentes}</span> pendentes
        </p>
        {/* ⭐ P0.3 — "pendentes" não é "elegíveis": opt-out, histórico e canal
            ainda podem barrar alguns na hora da rodada. Quem quiser o número
            depois desses filtros lê "Fila automática", logo abaixo — e mesmo
            ali só os 50 primeiros são avaliados, como a seção já avisa. */}
        <p className="mt-0.5 text-[12px] text-muted">
          &ldquo;Pendentes&rdquo; ainda não passou pelas travas de opt-out, histórico e canal — não é o
          número de quem será de fato abordado.
        </p>

        <ul className="mt-3 space-y-2">
          {(contatos ?? []).map((c) => (
            <FichaDoContato key={c.id} c={c} />
          ))}
          {contatos !== null && contatos.length === 0 && (
            <li className="text-[12.5px] text-muted">
              Nenhum contato ainda. A lista entra pela porta de importação acima.
            </li>
          )}
          {contatos === null && <li className="text-[12.5px] text-muted">Carregando a Base fria…</li>}
        </ul>
      </section>

      {/* ── 4. O DISPARO MANUAL — o que sobrou da "Fila automática" ──────── */}
      {/*
          ⛔ O PAINEL SAIU; O MECANISMO FICOU. Ordem do CEO, 19/09/2026: *"eu
          não vejo necessidade nenhuma dessas telas… tudo que está na base fria
          está disponível para os nossos agentes abordarem."* Saíram da tela a
          capacidade da próxima rodada, a prévia dos 50 e a última rodada.

          ⚠️ O QUE **NÃO** SAIU, E POR QUÊ: o teto por rodada, o limite diário e
          a janela de 24h da Meta continuam valendo em `selecao.ts` e no freio
          de ritmo — eles protegem o número de WhatsApp de ser banido, e não
          eram painel, eram trava.

          ⚠️ E O BOTÃO FICOU DE PROPÓSITO: "Rodar agora" é o ÚNICO jeito de
          disparar uma rodada fora do agendador das 9h. Tirá-lo junto com o
          painel deixaria a casa sem interruptor até a manhã seguinte. */}
      <section className="rounded-xl border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Disparar uma rodada agora</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              Fora da rodada automática das 9h. Os tetos de segurança (limite diário e a
              janela de 24h da Meta) continuam valendo — eles protegem o número de ser banido.
            </p>
            {!ligada && (
              <p className="mt-1 text-[12px] text-muted">Desligado: a prospecção precisa estar ligada.</p>
            )}
            {ligada && !canalPronto && (
              <p className="mt-1 text-[12px] text-muted">Desligado: o canal de envio não está pronto.</p>
            )}
            {ligada && canalPronto && capacidadeDaRodada <= 0 && (
              <p className="mt-1 text-[12px] text-muted">Desligado: sem saldo disponível agora.</p>
            )}
          </div>

          <button
            disabled={rodadaDesabilitada}
            onClick={() => dispararRodada(capacidadeDaRodada)}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            Rodar agora
          </button>
        </div>

        {resultadoRodada && (
          <p className="mt-3 rounded-lg border border-line px-3 py-2 text-[12.5px] text-ink">
            {resultadoRodada.abordados} abordados, {resultadoRodada.pulados} pulados — parou por{" "}
            {resultadoRodada.parouPor}
            {resultadoRodada.falha ? `: ${resultadoRodada.falha.detalhe}` : ""}
          </p>
        )}
      </section>

      {/* ── 5. A GAVETA DOS BARRADOS — no lugar da conferência ───────────── */}
      <GavetaDosBarrados />

      <EnriquecerModal
        aberto={modalEnriquecerAberto}
        onFechar={() => setModalEnriquecerAberto(false)}
      />
    </div>
  );
}
