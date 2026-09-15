import type { Prisma, PrismaClient } from "@prisma/client";
import {
  confirmarEnvio,
  registrarFalhaDeEnvio,
  registrarSaida,
} from "@/services/salaDeVendas/conversa";
import {
  canalDeVendasPronto,
  enviarTextoDeVendas,
} from "./FoocciSalesChannel";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type VereditoDoBotGate =
  | { tipo: "HUMANO"; motivo: string }
  | { tipo: "AGUARDAR_HUMANO"; motivo: string }
  | { tipo: "BOT_SEM_ROTA"; motivo: string }
  | { tipo: "MENU"; motivo: string; opcao: string; rotulo: string };

export type ResultadoDoBotGate = {
  intercepted: boolean;
  status:
    | "HUMANO"
    | "AGUARDANDO_HUMANO"
    | "BOT_SEM_ROTA"
    | "MENU_NAVEGADO"
    | "MENU_SEM_AUTORIZACAO"
    | "LOOP_INTERROMPIDO"
    | "FALHA_DE_NAVEGACAO";
  detalhe: string;
};

const MAX_TENTATIVAS_EM_30_MIN = 3;
const ORIGEM_NAVEGADOR = "navegador-menu";

function semAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizar(valor: string): string {
  return semAcentos(valor)
    .toLowerCase()
    .replace(/([0-9])\ufe0f?\u20e3/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function limparKeycaps(valor: string): string {
  return valor.replace(/([0-9])\ufe0f?\u20e3/g, "$1");
}

type OpcaoDoMenu = { chave: string; rotulo: string };

function extrairOpcoes(texto: string): OpcaoDoMenu[] {
  const limpo = limparKeycaps(texto);
  const achadas: OpcaoDoMenu[] = [];
  const adicionar = (chave: string, rotulo: string) => {
    const c = chave.trim().toUpperCase();
    const r = rotulo.trim().replace(/\s+/g, " ");
    if (!c || !r) return;
    if (!achadas.some((o) => o.chave === c && normalizar(o.rotulo) === normalizar(r))) {
      achadas.push({ chave: c, rotulo: r });
    }
  };
  const adicionarMatch = (match: RegExpMatchArray | null): boolean => {
    const chave = match?.[1];
    const rotulo = match?.[2];
    if (!chave || !rotulo) return false;
    adicionar(chave, rotulo);
    return true;
  };

  for (const linhaCrua of limpo.split(/\r?\n|\s+\|\s+/)) {
    const linha = linhaCrua.trim();
    if (!linha) continue;

    let m = linha.match(/^([0-9]{1,2}|[A-D])\s*[-–—.):/]\s*(.+)$/i);
    if (adicionarMatch(m)) continue;

    m = linha.match(/^(?:op[cç][aã]o\s*)?([0-9]{1,2}|[A-D])\s+(?:para|pra)\s+(.+)$/i);
    if (adicionarMatch(m)) continue;

    m = linha.match(/^(?:digite|tecle|responda|envie)\s+([0-9]{1,2}|[A-D])(?:\s+(?:para|pra))?\s+(.+)$/i);
    if (adicionarMatch(m)) continue;

    // Menus de WhatsApp frequentemente vêm apenas como "1 Vendas" / "2 Suporte".
    m = linha.match(/^([0-9]{1,2}|[A-D])\s+(.+)$/i);
    adicionarMatch(m);
  }

  // Também cobre menus escritos numa linha: "1 para Pedidos ou 2 para Vendas".
  const inline = /\b([0-9]{1,2}|[A-D])\s+(?:para|pra)\s+([^,;.]+?)(?=\s+(?:ou\s+)?(?:[0-9]{1,2}|[A-D])\s+(?:para|pra)\s+|$)/gi;
  for (const m of limpo.matchAll(inline)) adicionarMatch(m);

  return achadas;
}

function prioridadeDaOpcao(rotulo: string): number {
  const r = normalizar(rotulo);
  if (/\b(atendente|humano|pessoa|especialista)\b/.test(r)) return 100;
  if (/\b(falar|conversar)\b.*\b(alguem|equipe|time)\b/.test(r)) return 95;
  if (/\b(comercial|vendas)\b/.test(r)) return 80;
  if (/\b(outro|outros|outra|outras)\b.*\b(assunto|assuntos|opcao|opcoes)\b/.test(r)) return 50;
  return 0;
}

/**
 * Classificador determinístico. Default = HUMANO: só bloqueia o SDR quando há
 * evidência concreta de automação. Nunca inventa uma opção que não veio no texto.
 */
export function analisarAutomacaoWhatsapp(texto: string | null | undefined): VereditoDoBotGate {
  const original = (texto ?? "").trim();
  if (!original) return { tipo: "HUMANO", motivo: "sem texto de automação" };

  const t = normalizar(original);

  const transferenciaExplicita =
    /\b(vou|vamos|irei|estou|estamos)\b.{0,50}\b(transfer|encaminh)\w*\b.{0,80}\b(atendente|humano|pessoa|equipe|time|setor|comercial|vendas)\b/.test(t) ||
    /\b(aguarde|um momento|so um momento)\b.{0,80}\b(atendente|transfer|encaminh|atender)\w*\b/.test(t) ||
    /\batendente\b.{0,50}\b(instantes|momento|breve)\b/.test(t);

  if (transferenciaExplicita) {
    return {
      tipo: "AGUARDAR_HUMANO",
      motivo: "o atendimento automático declarou transferência/espera por uma pessoa",
    };
  }

  const opcoes = extrairOpcoes(original);
  const sinalForteDeMenu =
    /\b(atendimento automatico|assistente virtual|menu de atendimento|menu principal)\b/.test(t) ||
    /\b(escolha|selecione)\b.{0,30}\b(opcao|opcoes)\b/.test(t) ||
    /\b(digite|tecle|responda|envie)\b.{0,60}\b(opcao|numero|uma das opcoes)\b/.test(t) ||
    /\bpara continuar\b.{0,50}\b(digite|tecle|escolha)\b/.test(t);

  const pareceMenu = sinalForteDeMenu || opcoes.length >= 2 || (opcoes.length >= 1 && /\b(digite|tecle|responda|envie)\b/.test(t));

  if (pareceMenu) {
    const candidatas = opcoes
      .map((opcao, indice) => ({ ...opcao, prioridade: prioridadeDaOpcao(opcao.rotulo), indice }))
      .filter((opcao) => opcao.prioridade > 0)
      .sort((a, b) => b.prioridade - a.prioridade || a.indice - b.indice);

    const melhor = candidatas[0];
    if (melhor) {
      return {
        tipo: "MENU",
        opcao: melhor.chave,
        rotulo: melhor.rotulo,
        motivo: `menu automático: opção existente escolhida (${melhor.chave} — ${melhor.rotulo})`,
      };
    }

    return {
      tipo: "BOT_SEM_ROTA",
      motivo: "menu automático detectado, mas sem opção segura para atendente/comercial/vendas/outros assuntos",
    };
  }

  const sinalDeBotSemMenu =
    /\b(atendimento automatico|assistente virtual|sou (o|a) assistente|sou (o|a) robo|chatbot)\b/.test(t) ||
    /\bnao entendi sua opcao|opcao invalida|escolha novamente\b/.test(t);

  if (sinalDeBotSemMenu) {
    return { tipo: "BOT_SEM_ROTA", motivo: "automação detectada sem uma rota segura explícita" };
  }

  return { tipo: "HUMANO", motivo: "nenhum sinal determinístico de automação" };
}

/**
 * Executa o gate antes do TA. Mensagens de bot continuam gravadas na conversa,
 * mas não chegam ao SDR. Quando existe opção segura, o navegador responde apenas
 * a chave que o próprio menu ofereceu. Três tentativas/30 min é o teto anti-loop.
 */
export async function interceptarAutomacaoAntesDoTA(
  db: Cliente,
  params: { leadId: string; fromPhone: string; text: string; agora?: Date },
): Promise<ResultadoDoBotGate> {
  const agora = params.agora ?? new Date();
  const veredito = analisarAutomacaoWhatsapp(params.text);

  if (veredito.tipo === "HUMANO") {
    return { intercepted: false, status: "HUMANO", detalhe: veredito.motivo };
  }

  if (veredito.tipo === "AGUARDAR_HUMANO") {
    return { intercepted: true, status: "AGUARDANDO_HUMANO", detalhe: veredito.motivo };
  }

  if (veredito.tipo === "BOT_SEM_ROTA") {
    return { intercepted: true, status: "BOT_SEM_ROTA", detalhe: veredito.motivo };
  }

  // Só no ramo que realmente pretende falar tocamos novamente no cadastro.
  // Um opt-out anterior também vale contra o navegador automático.
  const lead = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { optOutAt: true },
  });
  if (lead?.optOutAt) {
    return {
      intercepted: true,
      status: "BOT_SEM_ROTA",
      detalhe: "menu detectado, mas o lead tem opt-out anterior; nada automático será enviado",
    };
  }

  const desde = new Date(agora.getTime() - 30 * 60 * 1000);
  const recentes = await db.leadMensagem.findMany({
    where: { leadId: params.leadId, ocorreuEm: { gte: desde } },
    orderBy: { ocorreuEm: "desc" },
    take: 30,
    select: { direcao: true, texto: true, origemDaFala: true, ocorreuEm: true },
  });

  const navegacoes = recentes.filter(
    (m) => m.direcao === "SAIDA" && m.origemDaFala === ORIGEM_NAVEGADOR,
  );
  if (navegacoes.length >= MAX_TENTATIVAS_EM_30_MIN) {
    return {
      intercepted: true,
      status: "LOOP_INTERROMPIDO",
      detalhe: `navegador atingiu o teto de ${MAX_TENTATIVAS_EM_30_MIN} tentativas em 30 minutos`,
    };
  }

  // Mesmo menu voltou imediatamente depois da mesma escolha: não insiste.
  const idxUltimaNavegacao = recentes.findIndex(
    (m) => m.direcao === "SAIDA" && m.origemDaFala === ORIGEM_NAVEGADOR,
  );
  if (idxUltimaNavegacao >= 0) {
    const anteriorAoEnvio = recentes
      .slice(idxUltimaNavegacao + 1)
      .find((m) => m.direcao === "ENTRADA" && Boolean(m.texto?.trim()));
    const ultimaEscolha = recentes[idxUltimaNavegacao]?.texto?.trim().toUpperCase();
    if (
      anteriorAoEnvio?.texto &&
      normalizar(anteriorAoEnvio.texto) === normalizar(params.text) &&
      ultimaEscolha === veredito.opcao.toUpperCase()
    ) {
      return {
        intercepted: true,
        status: "LOOP_INTERROMPIDO",
        detalhe: "o mesmo menu voltou depois da mesma escolha; navegador não repetiu a resposta",
      };
    }
  }

  // O navegador é determinístico: só responde uma chave que o próprio menu exibiu.
  // Ele usa a autorização do canal de envio, mas NÃO depende da chave que libera
  // respostas autônomas do SDR/IA; navegar no menu não liga a IA comercial.
  if (!canalDeVendasPronto()) {
    return {
      intercepted: true,
      status: "MENU_SEM_AUTORIZACAO",
      detalhe: "menu detectado; canal de vendas não está configurado/autorizado para envio",
    };
  }

  const saida = await registrarSaida(db, {
    leadId: params.leadId,
    texto: veredito.opcao,
    autor: "IA",
    agora,
    papelDoAgente: "navegador-menu",
    origemDaFala: ORIGEM_NAVEGADOR,
  });

  if (!saida.ok) {
    return {
      intercepted: true,
      status: "FALHA_DE_NAVEGACAO",
      detalhe: `não foi possível registrar a escolha do menu (${saida.causa})`,
    };
  }

  const envio = await enviarTextoDeVendas(
    { sendable: true, reason: null, detail: "navegador determinístico: inbound recente, sem opt-out" },
    params.fromPhone,
    veredito.opcao,
  );

  if (!envio.ok || !envio.providerMessageId) {
    await registrarFalhaDeEnvio(db, {
      mensagemId: saida.mensagemId,
      erro: envio.error ?? "Meta aceitou sem devolver o id da mensagem",
    }).catch(() => undefined);
    return {
      intercepted: true,
      status: "FALHA_DE_NAVEGACAO",
      detalhe: envio.error ?? "a Meta não confirmou a escolha do menu",
    };
  }

  await confirmarEnvio(db, {
    mensagemId: saida.mensagemId,
    waMessageId: envio.providerMessageId,
  });

  return {
    intercepted: true,
    status: "MENU_NAVEGADO",
    detalhe: `respondeu somente a opção exibida pelo menu: ${veredito.opcao} — ${veredito.rotulo}`,
  };
}
