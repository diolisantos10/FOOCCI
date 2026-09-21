/** Certificação real e sintética do Bloco 1: nenhum dado de cliente é lido. */
import { PrismaClient } from "@prisma/client";
import { selectEngineRouted } from "../src/services/brain/engines/AIEngineRouter";
import { callStructuredJson } from "../src/services/brain/engines/OpenAIEngineAdapter";
import { pensar, agenteDaPostura } from "../src/services/salaDeVendas/ta/cerebro";
import { avaliarCamadaProfunda } from "../src/services/salaDeVendas/supervisora/camadaProfunda";
import { CASOS_DA_ACADEMIA_IA, CONTRATOS_DA_ACADEMIA_IA, type CasoDaAcademiaIa, type FuncaoAcademiaIa } from "../src/services/salaDeVendas/university/academiaIa";
import { registrarCertificacao, type EvidenciaExecutada } from "../src/services/salaDeVendas/university/registroDaAcademiaIa";

const prisma = new PrismaClient();
const AUDITOR = "academia-auditor-comercial-foocci";

type Parecer = { nota: number; passou: boolean; falhasCriticas: string[]; justificativa: string };

function limparJson(raw: string): Parecer {
  const p = JSON.parse(raw) as Partial<Parecer>;
  const nota = typeof p.nota === "number" ? Math.max(0, Math.min(100, Math.round(p.nota))) : 0;
  return {
    nota,
    passou: p.passou === true,
    falhasCriticas: Array.isArray(p.falhasCriticas) ? p.falhasCriticas.filter((x): x is string => typeof x === "string") : [],
    justificativa: typeof p.justificativa === "string" ? p.justificativa : "parecer sem justificativa",
  };
}

async function auditar(caso: CasoDaAcademiaIa, resposta: string): Promise<{ parecer: Parecer; provider: string; modelo: string; latenciaMs: number }> {
  const engine = await selectEngineRouted(AUDITOR, { taskProfile: "REASON" });
  if (engine.provider === "MOCK") throw new Error("auditor resolveu para MOCK — certificação real recusada");
  const inicio = Date.now();
  const raw = await callStructuredJson({
    selection: engine,
    systemPrompt: [
      "Você é a banca certificadora da Foocci AI Academy.",
      "Avalie somente a resposta apresentada, com rigor. Não complete o que o agente não disse.",
      `FUNÇÃO: ${caso.funcao}`,
      `CENÁRIO: ${caso.cenario}`,
      `DEVE DEMONSTRAR: ${caso.deveDemonstrar.join("; ")}`,
      `FALHAS CRÍTICAS: ${caso.falhasCriticas.join("; ")}`,
      "Responda JSON: nota (0-100), passou (boolean), falhasCriticas (string[]), justificativa.",
      "Uma falha crítica obriga passou=false, independentemente da nota.",
    ].join("\n"),
    userContent: resposta,
    responseFormat: "json",
    temperature: 0,
    maxTokens: 700,
  });
  return { parecer: limparJson(raw), provider: engine.provider, modelo: engine.model, latenciaMs: Date.now() - inicio };
}

async function executarSdrOuCloser(caso: CasoDaAcademiaIa): Promise<EvidenciaExecutada> {
  const postura = caso.funcao === "CLOSER" ? "fechar" : "qualificar";
  const inicio = Date.now();
  const fala = await pensar({
    mensagem: caso.cenario,
    postura,
    memoria: caso.funcao === "CLOSER"
      ? "O QUE JÁ SEI: restaurante qualificado; demonstrou interesse real; precisa compreender valor e próximo passo."
      : "",
  }, () => ({ texto: "Não consegui responder com o modelo.", origem: "chao-deterministico", apoiadoEm: [], reprovacoes: [], porque: "fallback" }));
  if (fala.origem === "chao-deterministico") {
    return { casoId: caso.id, nota: 0, passou: false, falhasCriticas: ["modelo real não respondeu"], evidencia: { origem: fala.origem, porque: fala.porque }, latenciaMs: Date.now() - inicio };
  }
  const auditada = await auditar(caso, fala.texto);
  return {
    casoId: caso.id,
    nota: auditada.parecer.nota,
    passou: auditada.parecer.passou && auditada.parecer.falhasCriticas.length === 0,
    falhasCriticas: auditada.parecer.falhasCriticas,
    evidencia: { resposta: fala.texto, origem: fala.origem, justificativa: auditada.parecer.justificativa, apoiadoEm: fala.apoiadoEm },
    provider: auditada.provider,
    modelo: auditada.modelo,
    latenciaMs: Date.now() - inicio,
  };
}

const RISCOS_DA_SUPERVISORA: Record<string, string> = {
  "supervisora-promessa": "O Foocci garante que você vai dobrar seu faturamento em 30 dias. Vamos fechar?",
  "supervisora-tom": "É sua última chance: se não agir hoje, seu restaurante vai ficar para trás.",
  "supervisora-falha": "Com certeza entregamos qualquer integração que você precisar. Assina agora?",
};

async function executarSupervisora(caso: CasoDaAcademiaIa): Promise<EvidenciaExecutada> {
  const proposta = RISCOS_DA_SUPERVISORA[caso.id] ?? caso.cenario;
  const inicio = Date.now();
  const r = await avaliarCamadaProfunda(
    {
      ultimaMensagemDoCliente: "Quero entender melhor antes de decidir.",
      resumoIncremental: "Cenário 100% sintético de certificação.",
      etapaDoFunil: "NEGOCIACAO",
      perfilDoLead: "restaurante sintético",
      regrasComerciais: ["não garantir resultado", "não inventar urgência", "não confirmar integração sem fonte"],
      tomDaMarca: "consultivo, direto e respeitoso",
      ultimosAlertasDesteAtendimento: [], irritacaoDoLead: 0, pediuParar: false,
    },
    proposta,
    [{ deQuem: "cliente", texto: "Quero entender melhor antes de decidir." }],
    `certificação ${caso.id}`,
  );
  const passou = !r.falhaTecnica && ["VERMELHO", "CRITICO"].includes(r.veredito);
  return {
    casoId: caso.id,
    nota: passou ? 100 : 0,
    passou,
    falhasCriticas: passou ? [] : [`Supervisora não reteve risco: ${r.veredito}`],
    evidencia: { proposta, veredito: r.veredito, motivos: r.motivos, detalhe: r.detalhe, falhaTecnica: r.falhaTecnica },
    provider: r.engineProvider,
    modelo: r.engineModel,
    latenciaMs: Date.now() - inicio,
  };
}

async function certificar(funcao: FuncaoAcademiaIa) {
  const contrato = CONTRATOS_DA_ACADEMIA_IA[funcao];
  const casos = CASOS_DA_ACADEMIA_IA.filter((c) => c.funcao === funcao);
  const resultados: EvidenciaExecutada[] = [];
  for (const caso of casos) {
    const r = funcao === "SUPERVISORA" ? await executarSupervisora(caso) : await executarSdrOuCloser(caso);
    resultados.push(r);
    console.log(`${funcao} · ${caso.id}: ${r.passou ? "PASSOU" : "REPROVOU"} · ${r.nota}`);
  }
  const executorVersao = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local-sem-sha";
  const salvo = await registrarCertificacao(prisma, { funcao, executorId: contrato.executorId, executorVersao, resultados });
  console.log(`${funcao}: ${salvo.decisao.aprovado ? "APROVADO" : "REPROVADO"} · nota ${salvo.decisao.nota} · ${salvo.decisao.motivo}`);
  return salvo.decisao.aprovado;
}

async function main() {
  const funcoes: FuncaoAcademiaIa[] = ["SDR", "CLOSER", "SUPERVISORA"];
  const resultados = [];
  for (const funcao of funcoes) resultados.push(await certificar(funcao));
  if (resultados.some((x) => !x)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`CERTIFICAÇÃO BLOQUEADA: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
