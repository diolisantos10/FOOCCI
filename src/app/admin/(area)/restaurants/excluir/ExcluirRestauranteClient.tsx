"use client";

/**
 * A TELA DOS QUATRO PASSOS. Ela conversa com duas rotas que JÁ EXISTIAM:
 *
 *   GET /api/admin/restaurants/inventario                    → passo 1
 *   GET /api/admin/restaurants/purga?slug=…                  → passo 2
 *   GET /api/admin/restaurants/purga?slug=…&formato=exportacao → passo 3
 *   POST /api/admin/restaurants/purga                        → passo 4
 *
 * Nenhuma rota nova foi inventada e nenhuma trava do serviço foi afrouxada. O que
 * esta tela acrescenta é a única coisa que faltava: um lugar onde a rede de
 * segurança (a exportação com dado pessoal) pode ser baixada sem virar o próprio
 * incidente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS DECISÕES DE INTERFACE QUE NÃO SÃO ESTÉTICA:
 *
 * 1. A AÇÃO PRIMÁRIA (laranja, `brand-500`) É **SIMULAR**. O botão que apaga é
 *    contorno vermelho e nunca compete com ela. Numa tela de caminho sem volta, a
 *    coisa mais fácil de fazer tem que ser a que não faz nada.
 *
 * 2. O BOTÃO DE APAGAR FICA HABILITADO e a validação acontece no clique, com a
 *    resposta em três lugares (resumo colado no botão, mensagem no campo, foco no
 *    primeiro pendente). Botão cinza é uma resposta que ninguém consegue ouvir —
 *    principalmente no celular, onde não existe hover. A trava de verdade é o
 *    servidor, sempre.
 *
 * 3. O BACKUP É CONFERIDO BYTE A BYTE ANTES DE LIBERAR O PASSO 4. O download vem
 *    como blob (não `res.json()`: uma base de milhares de clientes vira um grafo
 *    de objetos grande demais para o navegador de um celular), e o sha256 dos
 *    bytes recebidos é comparado com o que o servidor calculou sobre os bytes
 *    enviados. Sem essa conferência, um arquivo cortado no meio do caminho
 *    passaria por backup — e o `sha256` do banco bateria mesmo assim, porque ele
 *    mede outra coisa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, EmptyState, Pill, ConfirmDialog } from "@/components/ui";
import {
  conferirPedidoDeExclusao,
  ehProtegidoNaTela,
  type MotivoDeBloqueio,
  type Pendencia,
} from "./portoesDaTela";

// ── O que as rotas devolvem ───────────────────────────────────────────────────

interface LinhaDoInventario {
  slug: string;
  nome: string;
  ativo: boolean;
  demo: boolean;
  plano: string;
  criadoEm: string;
  ultimoPedidoEm: string | null;
  clientes: number;
  clientesComTelefone: number;
  clientesAlcancaveis: number;
  pedidos: number;
  pedidos90d: number;
  conversas: number;
  campanhas: number;
  categoriasCardapio: number;
  whatsapp: string;
  notasFiscais: number;
  assinaturas: number;
  assinaturasVivas: number;
  veredito: "VIVO" | "JA_VIVEU" | "NUNCA_VIVEU";
}

interface PlanoDePurga {
  slug: string;
  restaurantId: string;
  nome: string;
  protegido: boolean;
  passos: { ordem: number; tabela: string; linhas: number; semChaveEstrangeira: boolean }[];
  profundas: { tabela: string; linhas: number; via: string }[];
  sobra: { tabela: string; linhas: number; motivo: string }[];
  bloqueios: { motivo: MotivoDeBloqueio; detalhe: string }[];
  totalLinhas: number;
}

interface ResultadoDaPurga {
  slug: string;
  apagadoEm: string;
  linhasPorTabela: Record<string, number>;
  totalLinhas: number;
  sobraDetachada: Record<string, number>;
}

interface Backup {
  nomeDoArquivo: string;
  sha256: string;
  bytes: number;
  linhas: number;
  conferido: boolean;
}

// ── Miudezas ──────────────────────────────────────────────────────────────────

const num = new Intl.NumberFormat("pt-BR");

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const VEREDITO: Record<LinhaDoInventario["veredito"], { rotulo: string; tom: string }> = {
  VIVO: { rotulo: "Vivo", tom: "green" },
  JA_VIVEU: { rotulo: "Já viveu", tom: "amber" },
  NUNCA_VIVEU: { rotulo: "Nunca viveu", tom: "neutral" },
};

/** Traduz o motivo técnico do serviço para a frase que a pessoa precisa ler. */
const EM_PORTUGUES: Record<MotivoDeBloqueio, string> = {
  SLUG_PROTEGIDO:
    "Este restaurante está na lista dos protegidos. Nenhum caminho desta tela apaga os dois.",
  PURGA_DESLIGADA:
    "O interruptor da exclusão está desligado no servidor. Simular e baixar o backup funcionam; apagar, não.",
  NAO_ENCONTRADO: "Não existe restaurante com esse endereço.",
  CONFIRMACAO_NAO_CONFERE: "O endereço digitado não é idêntico ao do restaurante escolhido.",
  SEM_REDE: "Falta o código do backup. Baixe o arquivo no passo 3 antes de apagar.",
  REDE_DIVERGENTE:
    "O banco mudou depois que você baixou o backup — entrou dado novo neste restaurante. " +
    "O arquivo que você tem já não representa o que sumiria. Baixe o backup de novo e refaça o passo 4.",
  ASSINATURA_VIVA:
    "Existe assinatura em cobrança apontando para este restaurante. Apagar aqui NÃO cancela a " +
    "recorrência no Mercado Pago: o cartão continuaria sendo debitado. Cancele lá primeiro.",
  NOTA_FISCAL_NAO_RECONHECIDA:
    "Há nota fiscal emitida neste restaurante. Ela tem guarda legal e não sai em silêncio — " +
    "é preciso reconhecer a perda no passo 4.",
};

function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-line2 ${className}`} />;
}

function CopiarBtn({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1600);
        });
      }}
      className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
    >
      {copiado ? "✓ copiado" : rotulo}
    </button>
  );
}

/** Recado com tom. Um só componente para os quatro tons, para não haver drift. */
function Recado({
  tom,
  titulo,
  children,
}: {
  tom: "info" | "aviso" | "erro" | "ok";
  titulo: React.ReactNode;
  children?: React.ReactNode;
}) {
  const cores = {
    info: "border-blue-100 bg-blue-50 text-blue-700",
    aviso: "border-amber-100 bg-amber-50 text-amber-700",
    erro: "border-red-100 bg-red-50 text-red-600",
    ok: "border-green-100 bg-green-50 text-green-700",
  }[tom];
  const icone = { info: "ℹ", aviso: "⚠", erro: "⛔", ok: "✓" }[tom];
  return (
    <div className={`rounded-2xl border px-4 py-3 ${cores}`}>
      <div className="flex gap-2.5">
        <span aria-hidden className="mt-px shrink-0 text-[13px] leading-5">
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-snug">{titulo}</p>
          {children && <div className="mt-1 text-[13px] leading-relaxed opacity-90">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Passo que ainda não chegou a vez. Uma linha tracejada, não um cartão vazio de
 * 160px: três cartões grandes com ilustração empurravam o passo 1 — a única coisa
 * acionável da tela — para longe do polegar no celular.
 */
function Aguardando({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line2 px-4 py-3 text-[13px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

/** Um passo do caminho: número, título, descrição, corpo. */
function Passo({
  n,
  titulo,
  descricao,
  estado,
  children,
}: {
  n: number;
  titulo: string;
  descricao: React.ReactNode;
  estado: "feito" | "atual" | "espera";
  children: React.ReactNode;
}) {
  const selo =
    estado === "feito"
      ? "border-brand-500 bg-brand-500 text-white"
      : estado === "atual"
        ? "border-brand-500 bg-brand-50 text-brand-600"
        : "border-line2 bg-[#F4F4F2] text-muted";
  return (
    <section className="mt-5 first:mt-0">
      <div className="mb-3 flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12.5px] font-semibold ${selo}`}
        >
          {estado === "feito" ? "✓" : n}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug text-ink">
            <span className="text-muted">Passo {n} · </span>
            {titulo}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink2">{descricao}</p>
        </div>
      </div>
      <div className="sm:pl-10">{children}</div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  A TELA
// ═════════════════════════════════════════════════════════════════════════════

export function ExcluirRestauranteClient({
  interruptorLigado,
  protegidos,
}: {
  interruptorLigado: boolean;
  protegidos: string[];
}) {
  // ── passo 1
  const [inventario, setInventario] = useState<LinhaDoInventario[] | null>(null);
  const [erroInventario, setErroInventario] = useState("");
  const [carregandoInventario, setCarregandoInventario] = useState(true);
  const [slugAlvo, setSlugAlvo] = useState<string | null>(null);

  // ── passo 2
  const [plano, setPlano] = useState<PlanoDePurga | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [erroSimulacao, setErroSimulacao] = useState("");
  const [mostrarVazias, setMostrarVazias] = useState(false);

  // ── passo 3
  const [backup, setBackup] = useState<Backup | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [erroBackup, setErroBackup] = useState("");

  // ── passo 4
  const [slugDigitado, setSlugDigitado] = useState("");
  const [sha256Informado, setSha256Informado] = useState("");
  const [aceitoNF, setAceitoNF] = useState(false);
  const [pendenciasVisiveis, setPendenciasVisiveis] = useState<Pendencia[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroPurga, setErroPurga] = useState<{ motivo?: MotivoDeBloqueio; texto: string } | null>(null);
  const [resultado, setResultado] = useState<ResultadoDaPurga | null>(null);

  const refSlug = useRef<HTMLInputElement>(null);
  const refSha = useRef<HTMLInputElement>(null);
  const refPasso2 = useRef<HTMLDivElement>(null);
  const refResultado = useRef<HTMLDivElement>(null);

  const carregarInventario = useCallback(async () => {
    setCarregandoInventario(true);
    setErroInventario("");
    try {
      const r = await fetch("/api/admin/restaurants/inventario", { cache: "no-store" });
      if (r.status === 401 || r.status === 403) {
        setErroInventario("Sua sessão de admin expirou. Entre de novo e recarregue esta página.");
        return;
      }
      const d = (await r.json()) as { restaurantes?: LinhaDoInventario[]; error?: string };
      if (!r.ok) {
        setErroInventario(d.error ?? "O servidor não devolveu o inventário.");
        return;
      }
      setInventario(d.restaurantes ?? []);
    } catch {
      setErroInventario("Não deu para falar com o servidor. Confira a conexão e tente de novo.");
    } finally {
      setCarregandoInventario(false);
    }
  }, []);

  useEffect(() => {
    void carregarInventario();
  }, [carregarInventario]);

  const linhaAlvo = useMemo(
    () => inventario?.find((l) => l.slug === slugAlvo) ?? null,
    [inventario, slugAlvo],
  );

  /** Trocar de restaurante zera TUDO que veio depois. Nada de rede de um, corte de outro. */
  function escolher(slug: string) {
    if (ehProtegidoNaTela(slug, protegidos)) return;
    setSlugAlvo(slug);
    setPlano(null);
    setErroSimulacao("");
    setBackup(null);
    setErroBackup("");
    setSlugDigitado("");
    setSha256Informado("");
    setAceitoNF(false);
    setPendenciasVisiveis(null);
    setErroPurga(null);
    setResultado(null);
    requestAnimationFrame(() => refPasso2.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function simular() {
    if (!slugAlvo) return;
    setSimulando(true);
    setErroSimulacao("");
    setPlano(null);
    try {
      const r = await fetch(`/api/admin/restaurants/purga?slug=${encodeURIComponent(slugAlvo)}`, {
        cache: "no-store",
      });
      const d = (await r.json()) as PlanoDePurga & { error?: string; motivo?: MotivoDeBloqueio };
      if (!r.ok) {
        setErroSimulacao(
          d.motivo ? EM_PORTUGUES[d.motivo] : (d.error ?? "O servidor recusou a simulação."),
        );
        return;
      }
      setPlano(d);
    } catch {
      setErroSimulacao("Não deu para falar com o servidor. Tente de novo.");
    } finally {
      setSimulando(false);
    }
  }

  /**
   * O DOWNLOAD, COM CONFERÊNCIA DE INTEGRIDADE.
   *
   * `res.blob()` em vez de `res.json()`: uma base com milhares de clientes vira um
   * grafo de objetos que multiplica o consumo de memória do navegador por várias
   * vezes o tamanho do arquivo. Como blob, os bytes ficam onde o navegador quiser
   * (inclusive em disco) e a página não morre no celular.
   *
   * E como não parseamos o corpo, o sha256 vem por cabeçalho — junto com o hash
   * dos BYTES ENVIADOS, que é o que recalculamos aqui. Backup truncado não passa.
   */
  async function baixarBackup() {
    if (!slugAlvo) return;
    setBaixando(true);
    setErroBackup("");
    setBackup(null);
    try {
      const r = await fetch(
        `/api/admin/restaurants/purga?slug=${encodeURIComponent(slugAlvo)}&formato=exportacao`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        let motivo: MotivoDeBloqueio | undefined;
        let erro = `O servidor respondeu ${r.status}.`;
        try {
          const d = (await r.json()) as { error?: string; motivo?: MotivoDeBloqueio };
          motivo = d.motivo;
          erro = d.error ?? erro;
        } catch {
          /* corpo não-JSON: fica o status */
        }
        setErroBackup(motivo ? EM_PORTUGUES[motivo] : erro);
        return;
      }

      const bytes = await r.arrayBuffer();
      const shaBanco = r.headers.get("x-purga-sha256") ?? "";
      const shaArquivo = r.headers.get("x-purga-sha256-arquivo") ?? "";
      const linhas = Number(r.headers.get("x-purga-linhas") ?? 0);

      if (!shaBanco) {
        setErroBackup(
          "A resposta veio sem o código do backup. Não dá para seguir: sem ele, o passo 4 " +
            "não teria como provar que o banco não mudou. Tente de novo.",
        );
        return;
      }

      // A conferência byte a byte. `crypto.subtle` exige contexto seguro (https ou
      // localhost); onde ele não existe, a tela DIZ que não conferiu em vez de
      // fingir que conferiu — ausência de verificação não é verificação.
      let conferido = false;
      if (shaArquivo && globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
        const calculado = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (calculado !== shaArquivo) {
          setErroBackup(
            "O arquivo chegou incompleto ou corrompido — os bytes recebidos não batem com os " +
              "que o servidor enviou. NÃO use este arquivo como backup. Baixe de novo.",
          );
          return;
        }
        conferido = true;
      }

      const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
      const nomeDoArquivo = `backup-${slugAlvo}-${carimbo}.json`;
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeDoArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setBackup({ nomeDoArquivo, sha256: shaBanco, bytes: bytes.byteLength, linhas, conferido });
      setSha256Informado(shaBanco);
    } catch {
      setErroBackup(
        "O download falhou no meio do caminho. Em base grande isso pode ser o tempo de resposta — " +
          "tente de novo; nada foi apagado.",
      );
    } finally {
      setBaixando(false);
    }
  }

  const veredicto = useMemo(
    () =>
      conferirPedidoDeExclusao({
        slugAlvo,
        slugDigitado,
        sha256Informado,
        backupConferido: !!backup,
        simulou: !!plano,
        protegidos,
        interruptorLigado,
        bloqueios: plano?.bloqueios ?? [],
        notasFiscais: plano?.passos.find((p) => p.tabela === "fiscal_documents")?.linhas ?? 0,
        aceitoPerderNotaFiscal: aceitoNF,
      }),
    [slugAlvo, slugDigitado, sha256Informado, backup, plano, protegidos, interruptorLigado, aceitoNF],
  );

  /** Clique no botão de apagar: valida aqui, responde nos três lugares, e só então abre o diálogo. */
  function tentarApagar() {
    setErroPurga(null);
    if (!veredicto.liberado) {
      setPendenciasVisiveis(veredicto.pendencias);
      const primeira = veredicto.pendencias[0];
      if (primeira?.campo === "slug" || primeira?.campo === "protegido") refSlug.current?.focus();
      else if (primeira?.campo === "sha256") refSha.current?.focus();
      return;
    }
    setPendenciasVisiveis(null);
    setConfirmando(true);
  }

  async function apagarDeVerdade() {
    if (!slugAlvo) return;
    setApagando(true);
    setErroPurga(null);
    try {
      const r = await fetch("/api/admin/restaurants/purga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slugAlvo,
          confirmarSlug: slugDigitado.trim(),
          sha256DoBackup: sha256Informado.trim(),
          aceitoPerderNotaFiscal: aceitoNF,
        }),
      });
      const d = (await r.json()) as ResultadoDaPurga & { error?: string; motivo?: MotivoDeBloqueio };
      if (!r.ok) {
        setErroPurga({
          motivo: d.motivo,
          texto: d.motivo ? EM_PORTUGUES[d.motivo] : (d.error ?? "O servidor recusou a exclusão."),
        });
        return;
      }
      setResultado(d);
      setInventario((prev) => prev?.filter((l) => l.slug !== slugAlvo) ?? prev);
      requestAnimationFrame(() =>
        refResultado.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    } catch {
      setErroPurga({
        texto:
          "A conexão caiu antes de o servidor responder. NÃO tente de novo às cegas: recarregue " +
          "esta página e confira na lista se o restaurante ainda existe.",
      });
    } finally {
      setApagando(false);
      setConfirmando(false);
    }
  }

  const notasFiscais = plano?.passos.find((p) => p.tabela === "fiscal_documents")?.linhas ?? 0;
  const passosComLinhas = plano?.passos.filter((p) => p.linhas > 0) ?? [];
  const passosVazios = (plano?.passos.length ?? 0) - passosComLinhas.length;

  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* O interruptor, sempre visível — antes de qualquer clique. */}
      <div className="mb-5">
        {interruptorLigado ? (
          <Recado tom="aviso" titulo="O interruptor está ligado: esta tela consegue apagar de verdade.">
            <code className="font-mono text-[12px]">PURGA_RESTAURANTE_HABILITADA = sim</code> está
            valendo no servidor. Depois de terminar, desligue de novo no Railway — o normal desta
            variável é estar desligada.
          </Recado>
        ) : (
          <Recado tom="info" titulo="O interruptor está desligado. Nada será apagado por esta tela.">
            Os passos 1, 2 e 3 funcionam normalmente — inclusive o backup. Para liberar o passo 4:
            no Railway, em <span className="font-semibold">Variables</span>, defina{" "}
            <code className="font-mono text-[12px]">PURGA_RESTAURANTE_HABILITADA = sim</code> e
            espere o serviço reiniciar.
          </Recado>
        )}
      </div>

      {/* ── PASSO 1 ─────────────────────────────────────────────────────────── */}
      <Passo
        n={1}
        titulo="Olhe os números antes de escolher"
        descricao="Quem já viveu, quem nunca viveu, e quanta gente tem dentro. Só leitura."
        estado={slugAlvo ? "feito" : "atual"}
      >
        {carregandoInventario ? (
          <Card>
            <div className="space-y-2.5 p-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Esqueleto key={i} className="h-12" />
              ))}
              <p className="pt-1 text-sm text-muted">Contando os números de cada restaurante…</p>
            </div>
          </Card>
        ) : erroInventario ? (
          <Card>
            <div className="p-5">
              <Recado tom="erro" titulo="Não deu para carregar o inventário.">
                {erroInventario}
              </Recado>
              <Button variant="secondary" className="mt-3" onClick={() => void carregarInventario()}>
                Tentar de novo
              </Button>
            </div>
          </Card>
        ) : !inventario?.length ? (
          <Card>
            <EmptyState
              icon="🏪"
              title="Nenhum restaurante cadastrado."
              sub="Não há o que excluir. A lista de restaurantes fica em Restaurantes."
            />
          </Card>
        ) : (
          <>
              {/*
                Até 1023px: CARTÕES. A tabela de 8 colunas precisa de ~1005px de
                largura mínima; a 768 ela rolava na horizontal e levava a coluna de
                AÇÃO para fora da tela — o único botão do passo 1 ficava invisível
                justamente no tamanho em que ninguém pensa em arrastar a tabela.
                A 640px+ os cartões viram duas colunas para não ficarem esticados.
              */}
            <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {inventario.map((l) => {
                  const prot = ehProtegidoNaTela(l.slug, protegidos);
                  const sel = l.slug === slugAlvo;
                  return (
                    <li
                      key={l.slug}
                      className={`flex flex-col rounded-2xl border p-4 ${
                        sel ? "border-brand-400 bg-brand-50" : "border-line bg-paper"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-ink">{l.nome}</p>
                          <p className="truncate font-mono text-[11.5px] text-muted">{l.slug}</p>
                        </div>
                        <Pill tone={VEREDITO[l.veredito].tom}>{VEREDITO[l.veredito].rotulo}</Pill>
                      </div>
                      <dl className="mt-3 grid flex-1 grid-cols-3 gap-2 text-center">
                        {[
                          ["Clientes", num.format(l.clientes)],
                          ["Pedidos", num.format(l.pedidos)],
                          ["Últ. pedido", dataCurta(l.ultimoPedidoEm)],
                        ].map(([k, v]) => (
                          <div key={k} className="rounded-xl bg-[#F4F4F2] px-2 py-1.5">
                            <dt className="text-[10px] uppercase tracking-[.04em] text-muted">{k}</dt>
                            <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-3 pt-0.5">
                        {prot ? (
                          <Pill tone="brand">🔒 Protegido — não pode ser apagado</Pill>
                        ) : (
                          <Button
                            variant={sel ? "primary" : "secondary"}
                            className="w-full"
                            onClick={() => escolher(l.slug)}
                          >
                            {sel ? "✓ Escolhido" : "Escolher para excluir"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

            {/* 1024px+: tabela. */}
            <Card className="hidden overflow-hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line">
                      {[
                        // [rótulo, alinhado à direita, só a partir de lg]
                        ["Restaurante", false, false],
                        ["Estado", false, false],
                        ["Criado", false, true],
                        ["Último pedido", false, false],
                        ["Clientes", true, false],
                        ["Pedidos", true, false],
                        ["Conversas", true, true],
                        ["", true, false],
                      ].map(([rotulo, direita, soLg], i) => (
                        <th
                          key={(rotulo as string) || i}
                          className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.04em] text-muted ${
                            direita ? "text-right" : ""
                          } ${soLg ? "hidden xl:table-cell" : ""}`}
                        >
                          {rotulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {inventario.map((l) => {
                      const prot = ehProtegidoNaTela(l.slug, protegidos);
                      const sel = l.slug === slugAlvo;
                      return (
                        <tr key={l.slug} className={sel ? "bg-brand-50" : "hover:bg-[#FAFAF8]"}>
                          <td className="max-w-[220px] px-4 py-3">
                            <p className="truncate font-semibold text-ink">{l.nome}</p>
                            <p className="truncate font-mono text-[11.5px] text-muted">{l.slug}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Pill tone={VEREDITO[l.veredito].tom} className="whitespace-nowrap">
                                {VEREDITO[l.veredito].rotulo}
                              </Pill>
                              {!l.ativo && <Pill tone="neutral">Inativo</Pill>}
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-ink2 xl:table-cell">
                            {dataCurta(l.criadoEm)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink2">
                            {dataCurta(l.ultimoPedidoEm)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                            {num.format(l.clientes)}
                            <span className="block text-[11px] text-muted">
                              {num.format(l.clientesComTelefone)} c/ tel.
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                            {num.format(l.pedidos)}
                            <span className="block text-[11px] text-muted">{num.format(l.pedidos90d)} em 90 d</span>
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink2 xl:table-cell">
                            {num.format(l.conversas)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {prot ? (
                              <Pill tone="brand">🔒 Protegido</Pill>
                            ) : (
                              <Button
                                variant={sel ? "primary" : "secondary"}
                                className="whitespace-nowrap"
                                onClick={() => escolher(l.slug)}
                              >
                                {sel ? "✓ Escolhido" : "Escolher"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        <div className="mt-3">
          <Recado tom="info" titulo="“Nunca viveu” quer dizer zero pedido NESTE sistema.">
            Se a base veio de um PDV antigo ou de uma planilha, a vida daquele cliente aconteceu
            lá — e não aparece aqui. Ausência de pedido nesta tela não é prova de que o restaurante
            nunca vendeu.
          </Recado>
        </div>
      </Passo>

      {/* ── PASSO 2 ─────────────────────────────────────────────────────────── */}
      <div ref={refPasso2} className="scroll-mt-4">
        <Passo
          n={2}
          titulo="Conte o que sairia"
          descricao="Tabela por tabela, quantas linhas somem. Nada acontece no banco."
          estado={plano ? "feito" : slugAlvo ? "atual" : "espera"}
        >
          {resultado ? (
            <Aguardando>Concluído — este restaurante não existe mais para ser contado.</Aguardando>
          ) : !linhaAlvo ? (
            <Aguardando>
              Escolha um restaurante no passo 1. A contagem é sempre de um por vez, nomeado a dedo.
            </Aguardando>
          ) : (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{linhaAlvo.nome}</p>
                  <p className="font-mono text-[12px] text-muted">{linhaAlvo.slug}</p>
                </div>
                <Pill tone={VEREDITO[linhaAlvo.veredito].tom}>{VEREDITO[linhaAlvo.veredito].rotulo}</Pill>
              </div>

              {/* O inventário completo do escolhido — os números que a lista não coube. */}
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  ["Plano", linhaAlvo.plano],
                  ["Situação", linhaAlvo.ativo ? "Ativo" : "Inativo"],
                  ["Criado em", dataCurta(linhaAlvo.criadoEm)],
                  ["Último pedido", dataCurta(linhaAlvo.ultimoPedidoEm)],
                  ["Clientes", num.format(linhaAlvo.clientes)],
                  ["Com telefone", num.format(linhaAlvo.clientesComTelefone)],
                  ["Alcançáveis", num.format(linhaAlvo.clientesAlcancaveis)],
                  ["Pedidos", num.format(linhaAlvo.pedidos)],
                  ["Pedidos em 90 dias", num.format(linhaAlvo.pedidos90d)],
                  ["Conversas", num.format(linhaAlvo.conversas)],
                  ["Campanhas", num.format(linhaAlvo.campanhas)],
                  ["Categorias do cardápio", num.format(linhaAlvo.categoriasCardapio)],
                  ["Notas fiscais", num.format(linhaAlvo.notasFiscais)],
                  ["Assinaturas", num.format(linhaAlvo.assinaturas)],
                  ["Assinaturas em cobrança", num.format(linhaAlvo.assinaturasVivas)],
                  ["WhatsApp", linhaAlvo.whatsapp === "SEM_CONFIG" ? "sem configuração" : linhaAlvo.whatsapp],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-2">
                    <dt className="text-[10.5px] uppercase tracking-[.04em] text-muted">{k}</dt>
                    <dd className="mt-0.5 truncate text-[13.5px] font-semibold tabular-nums text-ink">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={() => void simular()} disabled={simulando}>
                  {simulando ? "Contando…" : plano ? "Simular de novo" : "Simular exclusão"}
                </Button>
                <span className="text-[12.5px] text-muted">Só leitura. Nada é apagado neste passo.</span>
              </div>

              {simulando && (
                <div className="mt-4 space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Esqueleto key={i} className="h-8" />
                  ))}
                </div>
              )}

              {erroSimulacao && !simulando && (
                <div className="mt-4">
                  <Recado tom="erro" titulo="A simulação não voltou.">
                    {erroSimulacao}
                  </Recado>
                  <Button variant="secondary" className="mt-3" onClick={() => void simular()}>
                    Tentar de novo
                  </Button>
                </div>
              )}

              {plano && !simulando && (
                <div className="mt-5 border-t border-line pt-5">
                  <p className="text-[28px] font-semibold leading-none tracking-[-.03em] text-ink">
                    {num.format(plano.totalLinhas)}
                    <span className="ml-2 align-middle text-[13.5px] font-normal text-ink2">
                      linhas sairiam do banco
                    </span>
                  </p>

                  {plano.bloqueios.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {plano.bloqueios.map((b) => (
                        <Recado
                          key={b.motivo}
                          tom={b.motivo === "PURGA_DESLIGADA" ? "info" : "aviso"}
                          titulo={
                            b.motivo === "ASSINATURA_VIVA"
                              ? "A exclusão não cancela a cobrança."
                              : b.motivo === "NOTA_FISCAL_NAO_RECONHECIDA"
                                ? "Há nota fiscal emitida aqui."
                                : b.motivo === "PURGA_DESLIGADA"
                                  ? "O interruptor está desligado."
                                  : "Bloqueio."
                          }
                        >
                          {EM_PORTUGUES[b.motivo]}
                        </Recado>
                      ))}
                    </div>
                  )}

                  <h3 className="mt-5 text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">
                    Na ordem em que a exclusão aconteceria
                  </h3>
                  <div className="mt-2 overflow-hidden rounded-xl border border-line">
                    <table className="w-full text-left text-[13px]">
                      <tbody className="divide-y divide-line">
                        {(mostrarVazias ? plano.passos : passosComLinhas).map((p) => (
                          <tr key={p.tabela} className={p.linhas === 0 ? "text-muted" : ""}>
                            <td className="w-10 px-3 py-2 text-right tabular-nums text-muted">{p.ordem}</td>
                            <td className="px-2 py-2">
                              <span className="font-mono text-[12px] text-ink">{p.tabela}</span>
                              {p.semChaveEstrangeira && p.linhas > 0 && (
                                <span className="ml-2 whitespace-nowrap text-[11px] text-amber-700">
                                  sobreviveria a um DELETE ingênuo
                                </span>
                              )}
                            </td>
                            <td className="w-24 px-3 py-2 text-right tabular-nums font-semibold text-ink">
                              {num.format(p.linhas)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {passosVazios > 0 && (
                    <button
                      type="button"
                      onClick={() => setMostrarVazias((v) => !v)}
                      className="mt-2 rounded-lg text-[12.5px] font-semibold text-brand-600 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    >
                      {mostrarVazias
                        ? "Esconder as tabelas vazias"
                        : `Mostrar as ${passosVazios} tabelas que já estão vazias`}
                    </button>
                  )}

                  {plano.profundas.some((p) => p.linhas > 0) && (
                    <>
                      <h3 className="mt-5 text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">
                        Levadas junto, sem vínculo direto
                      </h3>
                      <ul className="mt-2 space-y-1">
                        {plano.profundas
                          .filter((p) => p.linhas > 0)
                          .map((p) => (
                            <li key={p.tabela} className="flex flex-wrap justify-between gap-2 text-[13px]">
                              <span className="font-mono text-[12px] text-ink">{p.tabela}</span>
                              <span className="text-muted">
                                via {p.via} ·{" "}
                                <span className="font-semibold tabular-nums text-ink">{num.format(p.linhas)}</span>
                              </span>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}

                  {plano.sobra.some((s) => s.linhas > 0) && (
                    <>
                      <h3 className="mt-5 text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">
                        O que NÃO sai — e fica sem dono
                      </h3>
                      <ul className="mt-2 space-y-2">
                        {plano.sobra
                          .filter((s) => s.linhas > 0)
                          .map((s) => (
                            <li key={s.tabela} className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-2">
                              <p className="text-[13px] font-semibold text-ink">
                                <span className="font-mono text-[12px]">{s.tabela}</span> ·{" "}
                                <span className="tabular-nums">{num.format(s.linhas)}</span> linha(s)
                              </p>
                              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">{s.motivo}</p>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </Card>
          )}
        </Passo>
      </div>

      {/* ── PASSO 3 ─────────────────────────────────────────────────────────── */}
      <Passo
        n={3}
        titulo="Baixe o backup"
        descricao="O arquivo desce para o seu computador. É a única volta atrás que vai existir."
        estado={backup ? "feito" : plano ? "atual" : "espera"}
      >
        {resultado ? (
          <Aguardando>
            Concluído — o arquivo <span className="font-mono text-[12px]">{backup?.nomeDoArquivo}</span> está
            no seu computador e agora é a única cópia.
          </Aguardando>
        ) : !plano ? (
          <Aguardando>
            Primeiro a contagem. O backup só faz sentido depois de você ver o tamanho do que sairia.
          </Aguardando>
        ) : (
          <Card className="p-5">
            <Recado tom="aviso" titulo="Este arquivo carrega dado pessoal dos clientes.">
              Nome, telefone, endereço e conversa de gente de verdade. Guarde no seu computador ou
              num lugar seu. Não mande por e-mail, não suba em pasta compartilhada, não cole em
              chat — e não passe por nenhuma ferramenta que gere log público.
            </Recado>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => void baixarBackup()} disabled={baixando}>
                {baixando ? "Montando o arquivo…" : backup ? "Baixar de novo" : "Baixar o backup"}
              </Button>
              {baixando && (
                <span className="text-[12.5px] text-muted">
                  Em base grande isso leva alguns minutos. Não feche a página.
                </span>
              )}
            </div>

            {baixando && <Esqueleto className="mt-4 h-20" />}

            {erroBackup && !baixando && (
              <div className="mt-4">
                <Recado tom="erro" titulo="O backup não ficou pronto.">
                  {erroBackup}
                </Recado>
              </div>
            )}

            {backup && !baixando && (
              <div className="mt-4 space-y-3">
                <Recado
                  tom={backup.conferido ? "ok" : "aviso"}
                  titulo={
                    backup.conferido
                      ? "Arquivo baixado e conferido byte a byte."
                      : "Arquivo baixado — mas não deu para conferir a integridade neste navegador."
                  }
                >
                  {backup.conferido
                    ? "Os bytes que chegaram batem com os que o servidor enviou. Não veio truncado."
                    : "A conferência de integridade precisa de conexão segura (https). Abra esta tela pelo endereço https antes de apagar qualquer coisa."}
                </Recado>

                <div className="rounded-xl border border-line bg-[#FAFAF8] p-3">
                  <p className="break-all font-mono text-[12px] text-ink">{backup.nomeDoArquivo}</p>
                  <p className="mt-1 text-[12.5px] tabular-nums text-muted">
                    {tamanho(backup.bytes)} · {num.format(backup.linhas)} linhas
                  </p>
                  <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] uppercase tracking-[.04em] text-muted">
                        Código do backup (sha256)
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[12px] text-ink">{backup.sha256}</p>
                    </div>
                    <CopiarBtn texto={backup.sha256} />
                  </div>
                </div>

                <Recado tom="info" titulo="O que este código é — e o que ele não é.">
                  Ele é a impressão digital do <span className="font-semibold">banco</span>, não do
                  arquivo. No passo 4 o servidor recalcula esse mesmo código lendo o banco de novo:
                  se entrar um pedido, uma mensagem ou qualquer dado neste restaurante entre agora e
                  o corte, o código muda e a exclusão é recusada. Isso é o certo — quer dizer que o
                  seu backup ficou velho e precisa ser refeito.
                </Recado>
              </div>
            )}
          </Card>
        )}
      </Passo>

      {/* ── PASSO 4 ─────────────────────────────────────────────────────────── */}
      <Passo
        n={4}
        titulo="Apagar"
        descricao="Sem volta, exceto pelo arquivo que você acabou de baixar."
        estado={resultado ? "feito" : backup ? "atual" : "espera"}
      >
        {resultado ? (
          // O ref vive num invólucro porque `Card` do kit não repassa ref — e
          // acrescentar `forwardRef` a um primitivo compartilhado por causa de
          // uma tela é mudança grande demais para o ganho.
          <div ref={refResultado} className="scroll-mt-4">
          <Card className="p-5">
            <Recado tom="ok" titulo={`"${resultado.slug}" foi apagado.`}>
              {num.format(resultado.totalLinhas)} linhas saíram do banco em{" "}
              {new Date(resultado.apagadoEm).toLocaleString("pt-BR")}.
            </Recado>
            {Object.keys(resultado.sobraDetachada ?? {}).length > 0 && (
              <div className="mt-3">
                <Recado tom="aviso" titulo="Sobrou coisa com o vínculo desligado.">
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(resultado.sobraDetachada).map(([t, q]) => (
                      <li key={t} className="font-mono text-[12px]">
                        {t}: {num.format(q)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5">
                    Estas linhas não foram apagadas de propósito (assinatura, cobrança). Elas ficaram
                    sem restaurante — resolva à mão no provedor antes de esquecer.
                  </p>
                </Recado>
              </div>
            )}
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                setSlugAlvo(null);
                setPlano(null);
                setBackup(null);
                setResultado(null);
                setSlugDigitado("");
                setSha256Informado("");
                setAceitoNF(false);
              }}
            >
              Voltar para a lista
            </Button>
          </Card>
          </div>
        ) : !backup ? (
          <Aguardando>
            O backup vem antes. Exclusão sem rede não acontece nesta tela — nem no servidor.
          </Aguardando>
        ) : (
          <Card className="p-5">
            <div className="space-y-4">
              <div>
                <label htmlFor="slug-a-mao" className="block text-[13px] font-semibold text-ink">
                  Digite o endereço do restaurante, à mão
                </label>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
                  Não escolhemos por você e não preenchemos sozinho: digitar é o último momento em
                  que dá para reparar num engano.
                </p>
                <input
                  id="slug-a-mao"
                  ref={refSlug}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={slugDigitado}
                  onChange={(e) => {
                    setSlugDigitado(e.target.value);
                    setPendenciasVisiveis(null);
                  }}
                  placeholder="ex.: nome-do-restaurante"
                  className={`mt-2 w-full rounded-xl border bg-paper px-3 py-2 font-mono text-[13px] !text-ink placeholder:font-sans placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                    pendenciasVisiveis?.some((p) => p.campo === "slug" || p.campo === "protegido")
                      ? "!border-red-400"
                      : "border-line2"
                  }`}
                />
                {pendenciasVisiveis
                  ?.filter((p) => p.campo === "slug")
                  .map((p) => (
                    <p key={p.mensagem} className="mt-1.5 text-[12.5px] leading-relaxed text-red-600">
                      {p.mensagem}
                    </p>
                  ))}
              </div>

              <div>
                <label htmlFor="sha-do-backup" className="block text-[13px] font-semibold text-ink">
                  Código do backup
                </label>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
                  Veio do arquivo que você baixou agora. Se for usar um backup mais antigo, cole o
                  código dele aqui — o servidor confere contra o banco de qualquer jeito.
                </p>
                <input
                  id="sha-do-backup"
                  ref={refSha}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={sha256Informado}
                  onChange={(e) => {
                    setSha256Informado(e.target.value);
                    setPendenciasVisiveis(null);
                  }}
                  className={`mt-2 w-full rounded-xl border bg-paper px-3 py-2 font-mono text-[12px] !text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                    pendenciasVisiveis?.some((p) => p.campo === "sha256")
                      ? "!border-red-400"
                      : "border-line2"
                  }`}
                />
              </div>

              {notasFiscais > 0 && (
                <label
                  htmlFor="aceito-nf"
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                    pendenciasVisiveis?.some((p) => p.campo === "notaFiscal")
                      ? "border-red-400 bg-red-50"
                      : "border-line2 bg-[#FAFAF8]"
                  }`}
                >
                  <input
                    id="aceito-nf"
                    type="checkbox"
                    checked={aceitoNF}
                    onChange={(e) => {
                      setAceitoNF(e.target.checked);
                      setPendenciasVisiveis(null);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                  />
                  <span className="text-[13px] leading-relaxed text-ink2">
                    Eu entendo que <span className="font-semibold text-ink">{num.format(notasFiscais)}</span>{" "}
                    nota(s) fiscal(is) já emitida(s) serão apagadas junto. Nota fiscal tem guarda
                    legal: depois disto, a única cópia é o arquivo de backup.
                  </span>
                </label>
              )}
            </div>

            {/* A resposta colada no botão — onde o polegar está. */}
            {pendenciasVisiveis && pendenciasVisiveis.length > 0 && (
              <div className="mt-4">
                <Recado
                  tom={pendenciasVisiveis.some((p) => p.definitiva) ? "erro" : "aviso"}
                  titulo={
                    pendenciasVisiveis.some((p) => p.definitiva)
                      ? "Este restaurante não sai por aqui."
                      : pendenciasVisiveis.length === 1
                        ? "Falta uma coisa:"
                        : `Faltam ${pendenciasVisiveis.length} coisas:`
                  }
                >
                  <ul className="space-y-1">
                    {pendenciasVisiveis.map((p) => (
                      <li key={p.campo + p.mensagem}>— {p.mensagem}</li>
                    ))}
                  </ul>
                </Recado>
              </div>
            )}

            {erroPurga && (
              <div className="mt-4">
                <Recado tom="erro" titulo="O servidor recusou a exclusão. Nada foi apagado.">
                  {erroPurga.texto}
                  {erroPurga.motivo === "REDE_DIVERGENTE" && (
                    <div className="mt-3">
                      <Button variant="secondary" onClick={() => void baixarBackup()}>
                        Baixar o backup de novo
                      </Button>
                    </div>
                  )}
                </Recado>
              </div>
            )}

            {/* O botão que apaga: contorno vermelho, discreto. A ação laranja desta tela é simular. */}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button
                type="button"
                onClick={tentarApagar}
                disabled={apagando}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13.5px] font-semibold text-red-600 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-50"
              >
                {apagando ? "Apagando…" : `Apagar ${slugAlvo} definitivamente`}
              </button>
              <span className="text-[12.5px] text-muted">
                Ainda vai aparecer uma última confirmação.
              </span>
            </div>
          </Card>
        )}
      </Passo>

      {confirmando && plano && (
        <ConfirmDialog
          tone="danger"
          icon={<span className="text-lg">🗑</span>}
          title={`Apagar "${slugAlvo}"?`}
          subtitle="Depois deste botão, a única cópia é o arquivo que você baixou."
          footer={
            <>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
              <button
                type="button"
                onClick={() => void apagarDeVerdade()}
                disabled={apagando}
                className="flex-1 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13.5px] font-semibold text-red-600 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-50"
              >
                {apagando ? "Apagando…" : "Apagar"}
              </button>
            </>
          }
        >
          <ul className="space-y-1 text-[13px] leading-relaxed text-ink2">
            <li>
              — <span className="font-semibold tabular-nums text-ink">{num.format(plano.totalLinhas)}</span> linhas
              saem do banco.
            </li>
            <li>
              — <span className="font-semibold tabular-nums text-ink">{num.format(linhaAlvo?.clientes ?? 0)}</span>{" "}
              clientes deixam de existir aqui.
            </li>
            {notasFiscais > 0 && (
              <li>
                — <span className="font-semibold tabular-nums text-ink">{num.format(notasFiscais)}</span> nota(s)
                fiscal(is) vão junto.
              </li>
            )}
            <li>— Backup: {backup?.nomeDoArquivo}</li>
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}
