"use client";

/**
 * A TELA DA FOOCCI UNIVERSITY — ver o que está valendo, e ligar/desligar.
 *
 * ── A ORDEM DA TELA É A ORDEM DA PERGUNTA ───────────────────────────────────
 *
 *   1. O que está valendo AGORA — antes de qualquer botão. Inclusive quando a
 *      resposta é "nada", que é o estado do dia em que esta tela nasceu.
 *   2. O que essa versão ENSINA — em português, agrupado por assunto. Nunca o
 *      JSON cru: quem lê esta tela não lê código.
 *   3. As versões que existem, com situação, data e quem publicou.
 *
 * ── ⛔ A TRAVA NÃO AFROUXA AQUI ─────────────────────────────────────────────
 *
 * Nada nesta tela publica sozinho. Todo botão de publicar passa por uma
 * confirmação explícita e chama a MESMA rota de sempre
 * (`/api/admin/sala-de-vendas/supervisora/academia`, POST `acao: "publicar"`),
 * que por sua vez chama `publicarVersaoDaAcademia`. Esta tela não conhece o
 * banco: ela é onde a pessoa exerce a decisão, não um segundo caminho que a
 * dispensa.
 *
 * ── REVERTER É O MESMO BOTÃO ────────────────────────────────────────────────
 *
 * Não existe "reverter" separado, e isso não é falta: publicar e reverter são
 * literalmente a mesma operação — apontar o ponteiro para um id que já existe
 * (ver o comentário em `academiaInterruptor.ts`). Voltar para a versão anterior
 * é publicar a versão anterior. O texto do botão muda conforme o caso para que
 * a pessoa leia o que vai acontecer, não o nome interno da operação.
 *
 * ── O QUE A TELA NÃO INVENTA ────────────────────────────────────────────────
 *
 * Campo vazio vira frase dizendo que FALTA, com o motivo. Nenhum número é
 * estimado, nenhuma data é deduzida. Se a rota não mandou, a tela diz que não
 * veio.
 */

import { useCallback, useEffect, useState } from "react";

const ROTA_VERSOES = "/api/admin/sala-de-vendas/supervisora/academia";
const ROTA_CONTEUDO = `${ROTA_VERSOES}/conteudo`;

type Situacao = "RASCUNHO" | "EM_TESTE" | "PUBLICADA" | "APOSENTADA";

/** O nome do estado como gente diz — não como o banco grava. */
const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  RASCUNHO: "Rascunho",
  EM_TESTE: "Em teste",
  PUBLICADA: "Publicada",
  APOSENTADA: "Aposentada",
};

const EXPLICACAO_DA_SITUACAO: Record<Situacao, string> = {
  RASCUNHO: "Escrita e guardada, mas nenhum agente recebeu este conteúdo.",
  EM_TESTE: "Em conferência interna. Ainda não vale para conversa com cliente.",
  PUBLICADA: "Já foi publicada em algum momento.",
  APOSENTADA: "Foi substituída por outra versão.",
};

type Categoria =
  | "REGRA_OBRIGATORIA"
  | "COMPORTAMENTO_PROIBIDO"
  | "EXEMPLO"
  | "SINAL_DE_RISCO"
  | "CRITERIO_VEREDITO"
  | "ORIENTACAO_DE_ETAPA";

/**
 * A ordem aqui é a ordem em que a tela desenha os blocos, e ela é uma decisão:
 * primeiro o que o agente TEM de fazer, depois o que ele NÃO pode, e só então
 * os apoios (exemplo, risco, critério, etapa). Alfabética ensinaria a ordem do
 * dicionário, que não é a ordem da venda.
 */
const CATEGORIAS: ReadonlyArray<{ chave: Categoria; titulo: string; subtitulo: string }> = [
  {
    chave: "REGRA_OBRIGATORIA",
    titulo: "O que o agente tem de fazer",
    subtitulo: "As regras que ele segue em toda conversa.",
  },
  {
    chave: "COMPORTAMENTO_PROIBIDO",
    titulo: "O que o agente não pode fazer",
    subtitulo: "O que está proibido dizer ou prometer.",
  },
  {
    chave: "EXEMPLO",
    titulo: "Exemplos de antes e depois",
    subtitulo: "Uma frase ruim e a mesma frase corrigida.",
  },
  {
    chave: "SINAL_DE_RISCO",
    titulo: "Sinais de risco",
    subtitulo: "O que acende a luz amarela numa conversa.",
  },
  {
    chave: "CRITERIO_VEREDITO",
    titulo: "Como a Supervisora julga",
    subtitulo: "O que faz uma mensagem passar, ser corrigida ou ser retida.",
  },
  {
    chave: "ORIENTACAO_DE_ETAPA",
    titulo: "Orientação por etapa da venda",
    subtitulo: "O que fazer em cada momento do funil.",
  },
];

const ROTULO_DA_ETAPA: Record<string, string> = {
  PROSPECCAO: "Prospecção",
  QUALIFICACAO: "Qualificação",
  DEMONSTRACAO: "Demonstração",
  OBJECAO: "Objeção",
  FECHAMENTO: "Fechamento",
  GERAL: "Geral",
};

interface VersaoNaLista {
  id: string;
  numero: number;
  situacao: Situacao;
  notaDaVersao: string | null;
  totalDeItens: number;
  publicadaEm: string | null;
  publicadaPor: { id: string; nome: string } | null;
  criadaEm: string;
}

interface Item {
  id: string;
  categoria: Categoria;
  etapa: string | null;
  titulo: string;
  conteudo: string;
  ruim: string | null;
  corrigido: string | null;
  tags: string[];
  fonteUrl: string | null;
  fonteData: string | null;
}

interface Conteudo {
  versao: {
    id: string;
    numero: number;
    situacao: Situacao;
    notaDaVersao: string | null;
    publicadaEm: string | null;
    criadaEm: string;
    publicadaPor: { id: string; nome: string } | null;
  } | null;
  itens: Item[];
}

function fmtData(iso: string | null): string {
  if (!iso) return "sem data registrada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sem data registrada";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// ═══════════════════════════════════════════════════════════════════════════
// AS PEÇAS
// ═══════════════════════════════════════════════════════════════════════════

function Secao({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-paper p-4 sm:p-5">
      <h2 className="text-[14px] font-semibold text-ink">{titulo}</h2>
      {subtitulo && <p className="mt-0.5 text-[12.5px] text-muted">{subtitulo}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * ⭐ O ESTADO VAZIO É A TELA MAIS IMPORTANTE DESTE ARQUIVO.
 *
 * No dia em que esta tela nasceu, "nenhuma versão publicada" era a resposta
 * certa — e uma faixa em branco teria deixado o CEO concluir que a Academia
 * estava ligada. Ele precisa ler, em uma frase, que os agentes ainda NÃO
 * receberam este conhecimento, e o que fazer a respeito.
 */
function OQueEstaValendo({
  ativa,
  temAlgumaVersao,
}: {
  ativa: VersaoNaLista | null;
  temAlgumaVersao: boolean;
}) {
  if (!ativa) {
    return (
      <Secao titulo="O que está valendo agora">
        <p className="text-[13.5px] font-semibold text-ink">
          Nenhuma versão publicada — os agentes ainda não receberam este conhecimento.
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted">
          A Academia está construída e guardada, mas desligada: enquanto nenhuma versão for
          publicada, os agentes conversam com os clientes exatamente como conversavam antes.
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {temAlgumaVersao
            ? "Abaixo, em “As versões”, escolha uma versão e publique para ligar."
            : "E não há nenhuma versão guardada ainda — não há o que publicar por enquanto."}
        </p>
      </Secao>
    );
  }

  return (
    <Secao titulo="O que está valendo agora">
      <p className="text-[13.5px] font-semibold text-ink">
        Versão {ativa.numero} está ativa — é este conhecimento que os agentes usam nas conversas.
      </p>
      <p className="mt-1.5 text-[12.5px] text-muted">
        Publicada em {fmtData(ativa.publicadaEm)}
        {ativa.publicadaPor ? ` por ${ativa.publicadaPor.nome}` : " — não ficou registrado quem publicou"}.
      </p>
      <p className="mt-1 text-[12.5px] text-muted">
        {ativa.totalDeItens} orientações no total.
      </p>
      {ativa.notaDaVersao && (
        <p className="mt-1 text-[12.5px] text-ink2">Nota desta versão: {ativa.notaDaVersao}</p>
      )}
    </Secao>
  );
}

function BlocoDeItem({ item }: { item: Item }) {
  return (
    <li className="rounded-lg border border-line p-3">
      <p className="text-[13px] font-semibold text-ink">{item.titulo}</p>
      {item.etapa && (
        <p className="mt-0.5 text-[11.5px] text-muted">
          Etapa: {ROTULO_DA_ETAPA[item.etapa] ?? item.etapa}
        </p>
      )}
      <p className="mt-1.5 whitespace-pre-line text-[12.5px] text-ink2">{item.conteudo}</p>

      {(item.ruim || item.corrigido) && (
        <div className="mt-2 space-y-1.5 rounded-lg bg-canvas p-2.5">
          <p className="text-[12.5px] text-muted">
            <span className="font-semibold text-ink">Como não dizer: </span>
            {item.ruim ?? "o exemplo ruim não foi registrado nesta versão"}
          </p>
          <p className="text-[12.5px] text-ink2">
            <span className="font-semibold text-ink">Como dizer: </span>
            {item.corrigido ?? "a frase corrigida não foi registrada nesta versão"}
          </p>
        </div>
      )}

      {item.fonteUrl && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          De onde veio:{" "}
          <a href={item.fonteUrl} target="_blank" rel="noreferrer" className="underline">
            {item.fonteUrl}
          </a>
          {item.fonteData ? ` · ${item.fonteData}` : ""}
        </p>
      )}
    </li>
  );
}

function OQueEnsina({
  conteudo,
  carregando,
  erro,
  onRetry,
  rotuloDaVersao,
}: {
  conteudo: Conteudo | null;
  carregando: boolean;
  erro: string | null;
  onRetry: () => void;
  rotuloDaVersao: string;
}) {
  if (carregando) {
    return (
      <Secao titulo="O que a Academia ensina">
        <p className="text-[12.5px] text-muted">Carregando…</p>
      </Secao>
    );
  }

  if (erro) {
    return (
      <Secao titulo="O que a Academia ensina">
        <p className="text-[12.5px] text-ink">Não foi possível ler o conteúdo desta versão.</p>
        <p className="mt-1 text-[12px] text-muted">{erro}</p>
        <button
          onClick={onRetry}
          className="mt-2.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
        >
          Tentar de novo
        </button>
      </Secao>
    );
  }

  if (!conteudo || !conteudo.versao) {
    return (
      <Secao titulo="O que a Academia ensina">
        <p className="text-[12.5px] text-muted">
          Nenhuma versão selecionada — escolha uma em “As versões”, abaixo, para ler o conteúdo.
        </p>
      </Secao>
    );
  }

  if (conteudo.itens.length === 0) {
    return (
      <Secao titulo="O que a Academia ensina" subtitulo={rotuloDaVersao}>
        <p className="text-[12.5px] text-muted">
          Esta versão está registrada, mas não tem nenhuma orientação guardada dentro dela.
          Publicá-la não mudaria nada no que os agentes falam.
        </p>
      </Secao>
    );
  }

  return (
    <Secao titulo="O que a Academia ensina" subtitulo={rotuloDaVersao}>
      <div className="space-y-5">
        {CATEGORIAS.map((c) => {
          const itens = conteudo.itens.filter((i) => i.categoria === c.chave);
          if (itens.length === 0) return null;
          return (
            <div key={c.chave}>
              <p className="text-[13px] font-semibold text-ink">
                {c.titulo} ({itens.length})
              </p>
              <p className="text-[12px] text-muted">{c.subtitulo}</p>
              <ul className="mt-2 space-y-2">
                {itens.map((i) => (
                  <BlocoDeItem key={i.id} item={i} />
                ))}
              </ul>
            </div>
          );
        })}

        {/*
          ⚠️ Uma categoria que a tela não conhece não pode sumir em silêncio: se
          o banco ganhar um tipo novo de conteúdo, o CEO tem de ver que existe
          algo ali que esta tela ainda não sabe desenhar — e não uma lista curta
          que parece completa.
        */}
        {(() => {
          const conhecidas = new Set(CATEGORIAS.map((c) => c.chave));
          const fora = conteudo.itens.filter((i) => !conhecidas.has(i.categoria));
          if (fora.length === 0) return null;
          return (
            <p className="text-[12.5px] text-muted">
              Esta versão tem mais {fora.length} orientação(ões) de um tipo que esta tela ainda não
              sabe apresentar. Elas contam para o total e valem para os agentes.
            </p>
          );
        })()}
      </div>
    </Secao>
  );
}

function LinhaDaVersao({
  versao,
  ehAtiva,
  ehSelecionada,
  ocupado,
  podePublicar,
  temAtiva,
  onSelecionar,
  onPublicar,
}: {
  versao: VersaoNaLista;
  ehAtiva: boolean;
  ehSelecionada: boolean;
  ocupado: boolean;
  podePublicar: boolean;
  temAtiva: boolean;
  onSelecionar: (id: string) => void;
  onPublicar: (versao: VersaoNaLista) => void;
}) {
  // Publicar e reverter são a mesma operação; o texto muda para a pessoa ler o
  // que vai acontecer, e não o nome interno do mecanismo.
  const rotuloDoBotao = temAtiva ? "Trocar para esta versão" : "Publicar esta versão";

  return (
    <li
      className={`rounded-lg border p-3 ${ehSelecionada ? "border-ink" : "border-line"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button onClick={() => onSelecionar(versao.id)} className="min-w-0 text-left">
          <p className="text-[13px] font-semibold text-ink">
            Versão {versao.numero} · {ROTULO_DA_SITUACAO[versao.situacao] ?? versao.situacao}
            {ehAtiva && <span className="ml-1.5 font-semibold text-ink">· ATIVA AGORA</span>}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {ehAtiva
              ? "É o que os agentes usam neste momento."
              : EXPLICACAO_DA_SITUACAO[versao.situacao] ?? "Situação não reconhecida."}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {versao.totalDeItens} orientações · criada em {fmtData(versao.criadaEm)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {versao.publicadaEm
              ? `Publicada em ${fmtData(versao.publicadaEm)}${
                  versao.publicadaPor
                    ? ` por ${versao.publicadaPor.nome}`
                    : " — não ficou registrado quem publicou"
                }`
              : "Nunca foi publicada."}
          </p>
          {versao.notaDaVersao && (
            <p className="mt-0.5 text-[11.5px] text-ink2">{versao.notaDaVersao}</p>
          )}
          <p className="mt-1 text-[11.5px] text-muted underline">
            {ehSelecionada ? "Conteúdo mostrado acima" : "Ver o conteúdo desta versão"}
          </p>
        </button>

        {!ehAtiva && podePublicar && (
          <button
            disabled={ocupado}
            onClick={() => onPublicar(versao)}
            className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {rotuloDoBotao}
          </button>
        )}
      </div>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A TELA
// ═══════════════════════════════════════════════════════════════════════════

type Fase = "carregando" | "pronto" | "semAcesso" | "erro";

export function UniversityClient() {
  const [fase, setFase] = useState<Fase>("carregando");
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const [versoes, setVersoes] = useState<VersaoNaLista[]>([]);
  const [versaoAtivaId, setVersaoAtivaId] = useState<string | null>(null);
  // Quem lê nem sempre é quem decide — o auditor enxerga e não publica. Começa
  // em `false` para que um formato de resposta inesperado esconda o botão, e
  // nunca ofereça uma porta que a rota vai fechar na cara de quem clicar.
  const [podePublicar, setPodePublicar] = useState(false);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);

  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [carregandoConteudo, setCarregandoConteudo] = useState(false);
  const [erroConteudo, setErroConteudo] = useState<string | null>(null);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  // ── A lista de versões decide se a tela existe ──────────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(ROTA_VERSOES, { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          if (vivo) setFase("semAcesso");
          return;
        }
        if (!res.ok) {
          if (vivo) {
            setErroDetalhe(`A leitura das versões respondeu ${res.status}.`);
            setFase("erro");
          }
          return;
        }
        const corpo = (await res.json()) as {
          data?: { versaoAtivaId: string | null; versoes: VersaoNaLista[]; podePublicar?: boolean };
        };
        if (!corpo?.data) {
          if (vivo) {
            setErroDetalhe("A resposta veio em um formato inesperado.");
            setFase("erro");
          }
          return;
        }
        if (!vivo) return;
        setVersoes(corpo.data.versoes);
        setVersaoAtivaId(corpo.data.versaoAtivaId);
        setPodePublicar(corpo.data.podePublicar === true);
        // Abre mostrando o que está valendo. Se nada está valendo, abre na
        // versão mais recente — que é a candidata natural a ser publicada.
        setSelecionadaId(corpo.data.versaoAtivaId ?? corpo.data.versoes[0]?.id ?? null);
        setFase("pronto");
      } catch (e) {
        if (vivo) {
          setErroDetalhe(e instanceof Error ? e.message : "Falha de rede.");
          setFase("erro");
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  // ── O conteúdo da versão escolhida, em chamada própria ──────────────────
  useEffect(() => {
    if (fase !== "pronto" || !selecionadaId) {
      setConteudo(null);
      return;
    }
    let vivo = true;
    setCarregandoConteudo(true);
    setErroConteudo(null);
    (async () => {
      try {
        const res = await fetch(`${ROTA_CONTEUDO}?versaoId=${encodeURIComponent(selecionadaId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (vivo) setErroConteudo(`A leitura do conteúdo respondeu ${res.status}.`);
          return;
        }
        const corpo = (await res.json()) as { data?: Conteudo };
        if (!corpo?.data) {
          if (vivo) setErroConteudo("A resposta veio em um formato inesperado.");
          return;
        }
        if (vivo) setConteudo(corpo.data);
      } catch (e) {
        if (vivo) setErroConteudo(e instanceof Error ? e.message : "Falha de rede.");
      } finally {
        if (vivo) setCarregandoConteudo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [fase, selecionadaId, tentativa]);

  /**
   * ⛔ A CONFIRMAÇÃO NÃO É ENFEITE.
   *
   * Publicar muda o que os agentes falam com cliente de verdade a partir do
   * próximo turno de conversa. O texto diz exatamente isso, nomeia a versão e,
   * quando há uma ativa, diz qual sai de cena — para que a pessoa confirme o
   * que vai acontecer, e não um "tem certeza?" genérico.
   */
  const publicar = useCallback(
    async (versao: VersaoNaLista) => {
      const ativa = versoes.find((v) => v.id === versaoAtivaId) ?? null;
      const linhas = [
        `Publicar a versão ${versao.numero} da Foocci University?`,
        "",
        ativa
          ? `Hoje está valendo a versão ${ativa.numero}. Ela sai de cena e a versão ${versao.numero} entra no lugar.`
          : "Hoje nenhuma versão está valendo. A partir de agora os agentes passam a usar este conhecimento.",
        "",
        "Isto muda o que os agentes falam com cliente de verdade, a partir da próxima mensagem.",
      ];
      if (!window.confirm(linhas.join("\n"))) return;

      setOcupado(true);
      setAviso(null);
      try {
        const res = await fetch(ROTA_VERSOES, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "publicar", versaoId: versao.id }),
        });
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          setAviso(json?.error ?? `A publicação foi recusada (${res.status}).`);
          return;
        }
        setAviso(`Versão ${versao.numero} publicada. É ela que vale agora.`);
        recarregar();
      } catch (e) {
        setAviso(e instanceof Error ? e.message : "Falha de rede.");
      } finally {
        setOcupado(false);
      }
    },
    [versoes, versaoAtivaId, recarregar],
  );

  if (fase === "carregando") {
    return <div className="p-6 text-[13px] text-muted">Carregando…</div>;
  }

  if (fase === "semAcesso") {
    return (
      <div className="p-6 text-[13px] text-muted">Sua conta não alcança a Foocci University.</div>
    );
  }

  if (fase === "erro") {
    return (
      <div className="p-6">
        <p className="text-[13px] text-ink">Não foi possível ler a Foocci University.</p>
        {erroDetalhe && <p className="mt-1 text-[12.5px] text-muted">{erroDetalhe}</p>}
        <button
          onClick={recarregar}
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const ativa = versoes.find((v) => v.id === versaoAtivaId) ?? null;
  const selecionada = versoes.find((v) => v.id === selecionadaId) ?? null;
  const rotuloDaVersao = selecionada
    ? `Versão ${selecionada.numero}${selecionada.id === versaoAtivaId ? " — a que está valendo" : " — não está valendo hoje"}`
    : "";

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-[16px] font-semibold text-ink">Foocci University</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">
          O que os agentes aprenderam sobre vender o Foocci — e quem liga esse conhecimento.
        </p>
      </header>

      {aviso && (
        <p
          style={{ wordBreak: "break-word" }}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] text-ink"
        >
          {aviso}
        </p>
      )}

      <OQueEstaValendo ativa={ativa} temAlgumaVersao={versoes.length > 0} />

      <OQueEnsina
        conteudo={conteudo}
        carregando={carregandoConteudo}
        erro={erroConteudo}
        onRetry={recarregar}
        rotuloDaVersao={rotuloDaVersao}
      />

      <Secao
        titulo="As versões"
        subtitulo="Toque em uma versão para ler o conteúdo dela acima."
      >
        {versoes.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            Nenhuma versão guardada ainda. Enquanto não houver uma, não há o que publicar.
          </p>
        ) : (
          <ul className="space-y-2">
            {versoes.map((v) => (
              <LinhaDaVersao
                key={v.id}
                versao={v}
                ehAtiva={v.id === versaoAtivaId}
                ehSelecionada={v.id === selecionadaId}
                ocupado={ocupado}
                podePublicar={podePublicar}
                temAtiva={Boolean(versaoAtivaId)}
                onSelecionar={setSelecionadaId}
                onPublicar={publicar}
              />
            ))}
          </ul>
        )}
        {!podePublicar && versoes.length > 0 && (
          <p className="mt-3 text-[12px] text-muted">
            Sua conta enxerga a Academia, mas não publica versão. Publicar é decisão de gestão.
          </p>
        )}
        <p className="mt-3 text-[11.5px] text-muted">
          Publicar é sempre um ato de gente: nenhuma rotina automática liga ou troca a versão
          sozinha. Voltar para uma versão anterior é publicá-la de novo — pelo mesmo botão.
        </p>
      </Secao>
    </div>
  );
}
