/**
 * SdrDiagnostic — o piso de segurança do SDR, hermético.
 *
 * Sem banco, sem IA, sem rede. Mesmo molde do OficinaDiagnostic: roda em
 * milissegundos e prova que as travas inegociáveis seguram, o que permite o SDR
 * subir na escada de promoção do Brain como qualquer outro agente.
 *
 * P0 aqui = trava que, se quebrar, manda proposta para cliente sem ter
 * perguntado. Foi o que aconteceu uma vez; não pode acontecer em silêncio.
 */

import {
  avaliarSondagem,
  podePropor,
  CAMPOS_DA_FICHA,
  CATALOGO_DE_SERVICOS,
  type EstadoDaSondagem,
} from "../oficina/Sondagem";
import { lerOrigem, lerServicos } from "./Entrevistador";
import { gerarPlano, lerData } from "./PlanoDeMidia";

export interface SdrCheck {
  nome: string;
  p0: boolean;
  passou: boolean;
  detalhe: string;
}

export interface SdrDiagnosticResult {
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  p0: number;
  checks: SdrCheck[];
}

const HOJE = new Date("2026-01-15T12:00:00Z");

function fichaCompleta(): Record<string, string> {
  const f: Record<string, string> = {};
  for (const c of CAMPOS_DA_FICHA) f[c.chave] = "respondido";
  f.data_inicio = "2026-02-01";
  return f;
}

const REELS_FECHADO = {
  chave: "reels",
  origemDoInsumo: "agencia" as const,
  definicoes: { tipo_de_reels: "o ambiente", quantidade: "8" },
};

export function runSdrDiagnostic(): SdrDiagnosticResult {
  const checks: SdrCheck[] = [];
  const check = (nome: string, p0: boolean, passou: boolean, detalhe: string) =>
    checks.push({ nome, p0, passou, detalhe });

  // ── P0: a falha original não pode se repetir ──────────────────────────────
  const semOrigem: EstadoDaSondagem = { ficha: fichaCompleta(), servicos: [{ chave: "reels" }] };
  const r1 = podePropor(semOrigem);
  check("serviço sem origem de insumo NÃO libera proposta", true, !r1.pode, r1.motivo);

  const plano1 = gerarPlano({ estado: semOrigem, hoje: HOJE });
  check("e também não produz plano", true, !plano1.liberado && plano1.linhas.length === 0,
    `liberado=${plano1.liberado} linhas=${plano1.linhas.length}`);

  // ── P0: catálogo não apresentado = sondagem não começou ───────────────────
  const semCatalogo = podePropor({ ficha: fichaCompleta() });
  check("catálogo não apresentado NÃO libera proposta", true, !semCatalogo.pode, semCatalogo.motivo);

  // ── P0: essencial nunca perguntado trava ─────────────────────────────────
  const semPerguntar = podePropor({ servicos: [REELS_FECHADO] });
  check("essencial nunca perguntado NÃO libera proposta", true, !semPerguntar.pode, semPerguntar.motivo);

  // ── P0: perguntado e sem resposta NÃO trava (a regra da casa) ────────────
  const perguntadoTudo: EstadoDaSondagem = {
    perguntadas: CAMPOS_DA_FICHA.filter((c) => c.essencial).map((c) => c.chave),
    servicos: [REELS_FECHADO],
  };
  const r2 = podePropor(perguntadoTudo);
  check("perguntado e sem resposta LIBERA — falta de resposta não é o pecado", true, r2.pode, r2.motivo);

  const avaliacao = avaliarSondagem(perguntadoTudo);
  check("e a pendência sai declarada, não escondida", true,
    avaliacao.aguardandoCliente.length > 0,
    `declaradas=${avaliacao.aguardandoCliente.length}`);

  // ── P0: plano sem data não sai ───────────────────────────────────────────
  const vago = gerarPlano({
    estado: { ficha: { ...fichaCompleta(), data_inicio: "semana que vem" }, servicos: [REELS_FECHADO] },
    hoje: HOJE,
  });
  check("data vaga NÃO vira calendário", true, !vago.liberado, vago.motivo);

  const bom = gerarPlano({ estado: { ficha: fichaCompleta(), servicos: [REELS_FECHADO] }, hoje: HOJE });
  check("plano liberado tem data em toda linha", true,
    bom.liberado && bom.linhas.length > 0 && bom.linhas.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.data)),
    `linhas=${bom.linhas.length}`);

  check("toda linha declara quem traz o material", true,
    bom.linhas.every((l) => l.quemTrazOMaterial.trim().length > 0 && !l.quemTrazOMaterial.includes("NÃO DEFINIDO")),
    `linhas=${bom.linhas.length}`);

  // ── P0: a leitura não chuta ──────────────────────────────────────────────
  check("resposta evasiva NÃO vira origem de insumo", true,
    lerOrigem("depois a gente vê") === null && lerOrigem("") === null,
    "evasiva devolve null");

  check("serviço não citado NÃO é sugerido", true,
    !lerServicos("quero reels").includes("trafego"),
    "só o que está escrito");

  check("texto vago NÃO vira data", true,
    lerData("assim que possível", HOJE) === null && lerData("semana que vem", HOJE) === null,
    "sem data presumida");

  // ── Integridade do questionário ──────────────────────────────────────────
  const chavesFicha = CAMPOS_DA_FICHA.map((c) => c.chave);
  check("nenhuma chave de ficha duplicada", false,
    new Set(chavesFicha).size === chavesFicha.length, `campos=${chavesFicha.length}`);

  const chavesServico = CATALOGO_DE_SERVICOS.map((s) => s.chave);
  check("nenhum serviço duplicado", false,
    new Set(chavesServico).size === chavesServico.length, `serviços=${chavesServico.length}`);

  check("todo campo essencial explica o porquê", false,
    CAMPOS_DA_FICHA.every((c) => c.porque.trim().length > 15), "o SDR sabe por que insiste");

  const passed = checks.filter((c) => c.passou).length;
  const p0 = checks.filter((c) => c.p0 && !c.passou).length;

  return { status: p0 === 0 ? "PASS" : "FAIL", total: checks.length, passed, p0, checks };
}
