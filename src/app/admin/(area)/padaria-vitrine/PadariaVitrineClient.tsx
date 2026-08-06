"use client";

/**
 * A tela dos dois botões da padaria de vitrine.
 *
 * Botão 1 — "Criar/atualizar a padaria": idempotente, de graça. Devolve quantas
 * categorias e itens entraram e os três endereços de degustação.
 *
 * Botão 2 — "Gerar as fotos": DINHEIRO REAL. O custo aparece ANTES, num aviso que
 * exige um segundo clique de confirmação. Enquanto a geração corre, o botão fica
 * desabilitado e a tela acompanha o progresso — nenhum clique acidental gasta de
 * novo. Regerar foto que já existe é um caminho separado, com o seu próprio aviso.
 *
 * Estados obrigatórios (DESIGN.md §6.1): carregando, vazio ("a padaria ainda não
 * foi criada" + o botão que resolve) e erro (o que houve + "Tentar de novo").
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, ConfirmDialog, Pill } from "@/components/ui";

// ── O que a API devolve ───────────────────────────────────────────────────────

interface Routes {
  mesaQr: string;
  lojaSemIa: string;
  garcomIa: string;
}

interface Overview {
  padariaExiste: boolean;
  eVitrine: boolean;
  restaurantName: string;
  totalItens: number;
  totalCategorias: number;
  comFoto: number;
  semFoto: number;
  comCarrossel: number;
  semCarrossel: number;
  fotosExtrasPorItem: number;
  routes: Routes;
  temChaveOpenAi: boolean;
}

interface SeedResult {
  dryRun: boolean;
  restaurantCreated: boolean;
  restaurantName: string;
  ownerEmail: string;
  ownerPasswordOnce: string | null;
  categoriesCreated: number;
  categoriesUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  variants: number;
  extras: number;
  optionGroups: number;
  options: number;
  itemsWithoutImage: number | null;
  routes: Routes;
}

interface Plano {
  padariaExiste: boolean;
  eVitrine: boolean;
  totalItens: number;
  comFoto: number;
  semFoto: number;
  fotosExtrasPorItem: number;
  comCarrossel: number;
  semCarrossel: number;
  capasAGerar: number;
  extrasAGerar: number;
  aGerar: number;
  itensNestaRodada: number;
  modelo: string;
  custoPorFotoUsd: number;
  custoEstimadoUsd: number;
  temChaveOpenAi: boolean;
}

interface Trabalho {
  id: string;
  status: "RODANDO" | "CONCLUIDO" | "FALHOU" | "ABANDONADO";
  regerar: boolean;
  total: number;
  processadas: number;
  geradas: number;
  puladas: number;
  itemAtual: string | null;
  falhas: Array<{ item: string; motivo: string }>;
  erroFatal: string | null;
  custoEstimadoUsd: number;
}

/** Lê o envelope padrão da API e transforma falha em Error com a frase do servidor. */
async function readJson<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error ?? "O servidor não respondeu como esperado.");
  }
  return json.data as T;
}

export function PadariaVitrineClient() {
  // Estado da tela
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [trabalho, setTrabalho] = useState<Trabalho | null>(null);

  // Seed
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);

  // Fotos
  const [confirmando, setConfirmando] = useState<null | "faltantes" | "regerar">(null);
  const [disparando, setDisparando] = useState(false);
  const [fotosError, setFotosError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    setLoadError(null);
    try {
      const [ov, img] = await Promise.all([
        fetch("/api/admin/demo-bakery/seed").then((r) => readJson<Overview>(r)),
        fetch("/api/admin/demo-bakery/imagens").then((r) =>
          readJson<{ plano: Plano; trabalho: Trabalho | null }>(r),
        ),
      ]);
      setOverview(ov);
      setPlano(img.plano);
      setTrabalho(img.trabalho);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Não consegui carregar o estado da padaria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto a geração corre, a tela pergunta o progresso a cada 3s. Quando o
  // trabalho termina (ou é declarado abandonado pelo prazo vencido), para.
  const rodando = trabalho?.status === "RODANDO";
  useEffect(() => {
    if (!rodando) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => { void carregar(); }, 3000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [rodando, carregar]);

  async function criarPadaria() {
    if (seeding) return; // trava de duplo clique (a outra trava é do servidor)
    setSeeding(true);
    setSeedError(null);
    setSeedResult(null);
    try {
      const res = await fetch("/api/admin/demo-bakery/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setSeedResult(await readJson<SeedResult>(res));
      await carregar();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "A criação da padaria falhou.");
    } finally {
      setSeeding(false);
    }
  }

  async function gerarFotos(regerar: boolean) {
    if (disparando || rodando) return;
    setDisparando(true);
    setFotosError(null);
    setConfirmando(null);
    try {
      const res = await fetch("/api/admin/demo-bakery/imagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: true, regerar }),
      });
      const data = await readJson<{ trabalho: Trabalho }>(res);
      setTrabalho(data.trabalho);
    } catch (e) {
      setFotosError(e instanceof Error ? e.message : "A geração das fotos não começou.");
    } finally {
      setDisparando(false);
    }
  }

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Cabecalho />
        <div className="mt-6 space-y-4">
          <div className="h-32 animate-pulse rounded-2xl bg-line2/20" />
          <div className="h-40 animate-pulse rounded-2xl bg-line2/20" />
        </div>
      </div>
    );
  }

  // ── Erro de carga ───────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Cabecalho />
        <Card className="mt-6 p-6">
          <p className="text-sm font-semibold text-ink">Não consegui ler o estado da padaria.</p>
          <p className="mt-1 text-sm text-ink2">{loadError}</p>
          <Button variant="primary" className="mt-4" onClick={() => { setLoading(true); void carregar(); }}>
            Tentar de novo
          </Button>
        </Card>
      </div>
    );
  }

  const semChave = plano ? !plano.temChaveOpenAi : false;
  const custoFaltantes = plano?.custoEstimadoUsd ?? 0;
  // Regerar refaz a ficha INTEIRA de cada item: a capa MAIS as fotos extras.
  // Enquanto esta conta era `totalItens × custoPorFoto`, o botão prometia um
  // terço do que ia cobrar — número que mente é pior que número ausente.
  const fotosPorItem = (plano?.fotosExtrasPorItem ?? 0) + 1;
  const fotosSeRegerarTudo = plano ? plano.totalItens * fotosPorItem : 0;
  const custoTudo = plano ? Number((fotosSeRegerarTudo * plano.custoPorFotoUsd).toFixed(2)) : 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Cabecalho />

      {/* ── Estado atual ─────────────────────────────────────────────────── */}
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-ink">Como está a padaria agora</h2>
          {overview?.padariaExiste ? (
            <Pill tone="green">no ar</Pill>
          ) : (
            <Pill tone="amber">ainda não existe</Pill>
          )}
          {overview?.padariaExiste && !overview.eVitrine && (
            <Pill tone="red">não está marcada como vitrine</Pill>
          )}
        </div>

        {!overview?.padariaExiste ? (
          <p className="mt-3 max-w-2xl text-sm text-ink2">
            A padaria de demonstração ainda não foi criada neste ambiente. Clique em{" "}
            <strong className="font-semibold text-ink">Criar/atualizar a padaria</strong> abaixo: são 7
            categorias e 40 itens, com variantes, adicionais, horário e entrega. Leva alguns segundos e
            não custa nada.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="categorias" valor={overview.totalCategorias} />
              <Numero rotulo="itens no cardápio" valor={overview.totalItens} />
              <Numero rotulo="com capa" valor={overview.comFoto} />
              <Numero rotulo={`sem as ${overview.fotosExtrasPorItem} extras`} valor={overview.semCarrossel} />
            </div>
            <Rotas routes={overview.routes} />
          </>
        )}
      </Card>

      {/* ── Botão 1: criar/atualizar ─────────────────────────────────────── */}
      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-ink">1. Criar/atualizar a padaria</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink2">
          Escreve o cardápio inteiro no banco. Pode clicar quantas vezes quiser: a operação é
          idempotente — não duplica restaurante, categoria nem item, e <strong className="font-semibold">
          nunca apaga as fotos</strong> já geradas. Não custa dinheiro.
        </p>

        <Button variant="primary" className="mt-4" onClick={criarPadaria} disabled={seeding}>
          {seeding ? "Criando… (alguns segundos)" : "Criar/atualizar a padaria"}
        </Button>

        {seedError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Não deu certo.</p>
            <p className="mt-1 text-sm text-red-600">{seedError}</p>
            <Button className="mt-3" onClick={criarPadaria} disabled={seeding}>Tentar de novo</Button>
          </div>
        )}

        {seedResult && (
          <div className="mt-4 rounded-xl border border-line2 bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">
              {seedResult.restaurantCreated
                ? `Padaria criada: ${seedResult.restaurantName}.`
                : `Padaria atualizada: ${seedResult.restaurantName}.`}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink2">
              <li>
                {seedResult.categoriesCreated} categorias criadas ·{" "}
                {seedResult.categoriesUpdated} atualizadas
              </li>
              <li>
                {seedResult.itemsCreated} itens criados · {seedResult.itemsUpdated} atualizados
              </li>
              <li>
                {seedResult.variants} variantes (tamanhos) · {seedResult.extras} adicionais ·{" "}
                {seedResult.optionGroups} grupos de escolha
              </li>
              {seedResult.itemsWithoutImage !== null && (
                <li>
                  {seedResult.itemsWithoutImage === 0
                    ? "Todos os itens já têm foto."
                    : `${seedResult.itemsWithoutImage} itens ainda estão sem foto — é o passo 2.`}
                </li>
              )}
            </ul>

            {seedResult.ownerPasswordOnce && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800">
                  Acesso ao painel da padaria — anote agora, aparece uma única vez.
                </p>
                <p className="mt-1 break-all text-sm text-amber-700">
                  {seedResult.ownerEmail} · senha: <code>{seedResult.ownerPasswordOnce}</code>
                </p>
              </div>
            )}

            <Rotas routes={seedResult.routes} />
          </div>
        )}
      </Card>

      {/* ── Botão 2: as fotos (dinheiro) ─────────────────────────────────── */}
      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-ink">2. Gerar as fotos do cardápio</h2>
          <Pill tone="amber">custa dinheiro de verdade</Pill>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink2">
          Cada foto é uma imagem nova, criada por IA a partir da descrição do item — nenhuma vem da
          internet. O custo aparece abaixo antes de qualquer clique, e a confirmação é obrigatória.
        </p>

        {/* Estado: sem padaria */}
        {!plano?.padariaExiste ? (
          <div className="mt-4 rounded-xl border border-dashed border-line2 bg-canvas p-5 text-center">
            <p className="text-sm font-semibold text-ink2">Ainda não há o que fotografar.</p>
            <p className="mt-1 text-sm text-muted">Crie a padaria no passo 1 primeiro.</p>
          </div>
        ) : semChave ? (
          /* Estado: falta a chave — dito em português, não em erro técnico */
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">
              Faltou a chave da OpenAI neste ambiente.
            </p>
            <p className="mt-1 text-sm text-amber-700">
              A variável <code>OPENAI_API_KEY</code> não está configurada aqui, então não dá para
              gerar foto nenhuma — e nada foi cobrado. Configure a variável no Railway e recarregue
              esta página. (Todo o resto da tela continua funcionando.)
            </p>
            <Button className="mt-3" onClick={() => { setLoading(true); void carregar(); }}>
              Verificar de novo
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="itens sem capa" valor={plano.semFoto} />
              <Numero
                rotulo="fotos a gerar"
                valor={`${plano.aGerar} (${plano.capasAGerar} capa + ${plano.extrasAGerar} extra)`}
              />
              <Numero rotulo="custo estimado" valor={`~US$ ${custoFaltantes.toFixed(2)}`} />
              <Numero rotulo="modelo" valor={plano.modelo} />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={() => setConfirmando("faltantes")}
                disabled={rodando || disparando || plano.aGerar === 0}
              >
                {rodando
                  ? "Gerando…"
                  : plano.aGerar === 0
                    ? "Todos os itens já têm a capa e as fotos extras"
                    : `Gerar as ${plano.aGerar} fotos que faltam · ~US$ ${custoFaltantes.toFixed(2)}`}
              </Button>

              {plano.comFoto > 0 && (
                <Button
                  onClick={() => setConfirmando("regerar")}
                  disabled={rodando || disparando}
                  title="Refaz TODAS as fotos, inclusive as que já existem"
                >
                  Regerar as {fotosSeRegerarTudo} fotos · ~US$ {custoTudo.toFixed(2)}
                </Button>
              )}
            </div>

            <p className="mt-2 text-xs text-muted">
              Cada item tem {fotosPorItem} fotos: a capa (a que aparece no card) e mais{" "}
              {plano.fotosExtrasPorItem} no carrossel da ficha. O padrão nunca refaz foto que já
              existe — só o que está faltando. Regerar é o botão separado, e ele também pede
              confirmação.
            </p>
          </>
        )}

        {fotosError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">A geração não começou.</p>
            <p className="mt-1 text-sm text-red-600">{fotosError}</p>
          </div>
        )}

        {trabalho && <Progresso trabalho={trabalho} />}
      </Card>

      {/* ── Confirmação do gasto ─────────────────────────────────────────── */}
      {confirmando && plano && (
        <ConfirmDialog
          tone="caution"
          icon={<span className="text-lg">💸</span>}
          title="Isto gasta dinheiro de verdade"
          subtitle={
            confirmando === "regerar"
              ? `Serão refeitas TODAS as ${fotosSeRegerarTudo} fotos — ${plano.totalItens} itens × ${fotosPorItem} (a capa e mais ${plano.fotosExtrasPorItem} do carrossel), inclusive as que já existem.`
              : `Serão geradas ${plano.aGerar} ${plano.aGerar === 1 ? "foto" : "fotos"}: ${plano.capasAGerar} de capa e ${plano.extrasAGerar} do carrossel, em ${plano.itensNestaRodada} ${plano.itensNestaRodada === 1 ? "item" : "itens"}.`
          }
          footer={
            <>
              <Button className="flex-1" onClick={() => setConfirmando(null)}>Cancelar</Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={disparando}
                onClick={() => void gerarFotos(confirmando === "regerar")}
              >
                {disparando ? "Começando…" : "Confirmar e gerar"}
              </Button>
            </>
          }
        >
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-800">
              Custo estimado: ~US${" "}
              {(confirmando === "regerar" ? custoTudo : custoFaltantes).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              São ~US$ {plano.custoPorFotoUsd.toFixed(2)} por foto, cobrados pela OpenAI na conta da
              Foocci. A estimativa é aproximada; o valor final é o da fatura.
            </p>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

// ── Pedaços ───────────────────────────────────────────────────────────────────

function Cabecalho() {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-white">Padaria de vitrine</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        A <strong className="font-semibold text-white">Foocci Bakery</strong> é o restaurante fictício
        que o visitante do site de vendas usa para experimentar o sistema antes de comprar. Ela é uma
        loja completa e de verdade por dentro — mas fica marcada como demonstração, então nunca entra
        em cobrança nem em relatório comercial.
      </p>
    </header>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div className="rounded-xl border border-line2 bg-canvas px-3 py-2.5">
      <p className="truncate text-lg font-semibold text-ink">{valor}</p>
      <p className="mt-0.5 text-xs text-muted">{rotulo}</p>
    </div>
  );
}

function Rotas({ routes }: { routes: Routes }) {
  const linhas: Array<[string, string]> = [
    ["Mesa (QR code)", routes.mesaQr],
    ["Loja sem IA", routes.lojaSemIa],
    ["Garçom de IA", routes.garcomIa],
  ];
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        As três rotas de degustação
      </p>
      <ul className="mt-2 space-y-1.5">
        {linhas.map(([rotulo, href]) => (
          <li key={href} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:gap-2">
            <span className="w-32 shrink-0 text-ink2">{rotulo}</span>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-semibold text-brand-600 hover:text-brand-700 hover:underline"
            >
              {href}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Progresso({ trabalho }: { trabalho: Trabalho }) {
  const pct = trabalho.total > 0 ? Math.round((trabalho.processadas / trabalho.total) * 100) : 0;

  if (trabalho.status === "RODANDO") {
    return (
      <div className="mt-4 rounded-xl border border-line2 bg-canvas p-4">
        <p className="text-sm font-semibold text-ink">
          Gerando as fotos… {trabalho.processadas} de {trabalho.total}
        </p>
        {trabalho.itemAtual && (
          <p className="mt-0.5 text-sm text-ink2">Agora: {trabalho.itemAtual}</p>
        )}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line2">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Cada foto leva de 10 a 30 segundos. Pode sair desta tela: o trabalho continua no servidor e
          o progresso reaparece quando você voltar.
        </p>
      </div>
    );
  }

  const tomBorda =
    trabalho.status === "CONCLUIDO" && trabalho.falhas.length === 0
      ? "border-green-200 bg-green-50"
      : "border-amber-200 bg-amber-50";

  return (
    <div className={`mt-4 rounded-xl border p-4 ${tomBorda}`}>
      <p className="text-sm font-semibold text-ink">
        {trabalho.status === "CONCLUIDO" && `Pronto: ${trabalho.geradas} fotos geradas.`}
        {trabalho.status === "FALHOU" && "A geração parou antes de terminar."}
        {trabalho.status === "ABANDONADO" && "A geração parou no meio."}
      </p>

      {trabalho.erroFatal && <p className="mt-1 text-sm text-ink2">{trabalho.erroFatal}</p>}

      <ul className="mt-2 space-y-1 text-sm text-ink2">
        <li>{trabalho.geradas} fotos geradas · custo aproximado US$ {trabalho.custoEstimadoUsd.toFixed(2)}</li>
        {trabalho.puladas > 0 && (
          <li>{trabalho.puladas} pulados porque já tinham foto — nada foi cobrado por eles.</li>
        )}
        {trabalho.falhas.length > 0 && (
          <li className="font-semibold text-ink">{trabalho.falhas.length} não saíram:</li>
        )}
      </ul>

      {trabalho.falhas.length > 0 && (
        <>
          <ul className="mt-1 space-y-0.5 text-sm text-ink2">
            {trabalho.falhas.map((f) => (
              <li key={f.item}>
                <span className="font-semibold text-ink">{f.item}</span> — {f.motivo}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Esses itens continuam sem foto (a loja mostra o item sem imagem, não uma imagem quebrada).
            Clicar em gerar de novo tenta só eles.
          </p>
        </>
      )}
    </div>
  );
}
