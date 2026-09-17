/**
 * O CHAMADOR QUE FALTAVA — a resposta do porteiro vira registro.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ─────────────────────────────────────────────
 * Até aqui, quando o atendente respondia *"quem cuida disso é a Juliana"*, o
 * caminho real de mensagem recebida (`FoocciSalesInbound.chamarOTA`) chamava o
 * `WhatsappBotGate` direto e mais nada. A política completa existia
 * (`ColdLeadInboundPolicy.aplicarPoliticaAntesDoTA`), estava testada, e **nenhum
 * caminho de produção passava por ela** — peça sem chamador, o mesmo defeito que
 * esta base já mediu quatro vezes. O nome da decisora ia para o histórico da
 * conversa e para lugar nenhum.
 *
 * ── ONDE O DADO PASSA A MORAR ───────────────────────────────────────────────
 * Em `Contato` (a tabela que o B1 criou), com tipo do porteiro, confiança e COMO
 * se soube — e na trilha (`EventoDaJornada`), pelos serviços da jornada. O
 * estágio da Empresa muda por `moverEmpresa` e por mais ninguém: escrever
 * `estagio` daqui gravaria estado sem história.
 *
 * ── O QUE ISTO NÃO FAZ, E É DE PROPÓSITO ────────────────────────────────────
 * Não manda mensagem, não responde menu, não libera envio. O porteiro **não é
 * rota de fuga das travas**: quem autoriza uma saída continua sendo o canal, o
 * `LeadContactSafety`, o `freioDeRitmo` e a Supervisora. Este arquivo só escreve.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  AUTORIA_SISTEMA,
  TRANSICOES_DA_EMPRESA,
  moverEmpresa,
  registrarContato,
  registrarNaTrilha,
  somenteDigitos,
  vincularLead,
  type Autoria,
} from "@/services/salaDeVendas/jornadaComercial";
import { classificarInterlocutor, type Classificacao } from "./classificacao";
import { extrairDecisorIndicado, type DecisorIndicado } from "./decisorIndicado";
import { objetivoDaProspeccao, type ObjetivoDaProspeccao } from "./objetivo";

type Cliente = PrismaClient | Prisma.TransactionClient;

const FONTE = "whatsapp-prospeccao";

export interface ResultadoDoRegistro {
  aplicado: boolean;
  causa:
    | "registrado"
    | "semSinal"
    | "leadNaoExiste"
    | "leadSemEmpresa";
  classificacao: Classificacao;
  decisor: DecisorIndicado | null;
  empresaId: string | null;
  contatoDoPorteiroId: string | null;
  contatoDoDecisorId: string | null;
  /** O objetivo DEPOIS do que acabou de ser registrado. */
  objetivo: ObjetivoDaProspeccao | null;
  detalhe: string;
}

function vazio(
  causa: ResultadoDoRegistro["causa"],
  classificacao: Classificacao,
  decisor: DecisorIndicado | null,
  detalhe: string,
): ResultadoDoRegistro {
  return {
    aplicado: false,
    causa,
    classificacao,
    decisor,
    empresaId: null,
    contatoDoPorteiroId: null,
    contatoDoDecisorId: null,
    objetivo: null,
    detalhe,
  };
}

/**
 * Move a empresa só quando o degrau existe.
 *
 * Uma empresa em DESCOBERTA não pula para GATEKEEPER — a máquina de estados
 * recusaria, e recusa silenciosa vira estado errado. Aqui a não-transição é
 * explícita e não escreve nada.
 */
async function moverSePuder(
  db: Cliente,
  params: { empresaId: string; para: "GATEKEEPER" | "DECISOR_ENCONTRADO"; autoria: Autoria; motivo: string; agora: Date },
): Promise<void> {
  const empresa = await db.empresa.findUnique({
    where: { id: params.empresaId },
    select: { estagio: true },
  });
  if (!empresa) return;
  if (empresa.estagio === params.para) return;
  if (!TRANSICOES_DA_EMPRESA[empresa.estagio]?.includes(params.para)) return;

  await moverEmpresa(db, {
    empresaId: params.empresaId,
    de: empresa.estagio,
    para: params.para,
    autoria: params.autoria,
    motivo: params.motivo,
    agora: params.agora,
  });
}

/**
 * Um contato que já existia mas que ninguém tinha classificado passa a carregar
 * o carimbo — e o carimbo fica na trilha.
 *
 * `chaveDeIdempotencia` amarrada ao contato e ao tipo: a mesma mensagem chegando
 * duas vezes não grava dois eventos.
 */
async function carimbarPorteiro(
  db: Cliente,
  p: { contatoId: string; empresaId: string; classificacao: Classificacao; autoria: Autoria },
): Promise<void> {
  const atual = await db.contato.findUnique({
    where: { id: p.contatoId },
    select: { ehGatekeeper: true, tipoDeGatekeeper: true },
  });
  if (atual?.ehGatekeeper && atual.tipoDeGatekeeper === p.classificacao.tipoDeGatekeeper) return;

  await db.contato.update({
    where: { id: p.contatoId },
    data: {
      ehGatekeeper: true,
      tipoDeGatekeeper: p.classificacao.tipoDeGatekeeper,
      comoFoiDescoberto: "classificado na resposta do WhatsApp de prospecção",
    },
  });

  await registrarNaTrilha(db, {
    entidade: "CONTATO",
    entidadeId: p.contatoId,
    contatoId: p.contatoId,
    empresaId: p.empresaId,
    tipo: "GATEKEEPER_IDENTIFICADO",
    autoria: p.autoria,
    fonte: FONTE,
    nota: `porteiro: ${p.classificacao.tipoDeGatekeeper} — ${p.classificacao.motivo}`,
    chaveDeIdempotencia: `contato:gatekeeper:${p.contatoId}:${p.classificacao.tipoDeGatekeeper}`,
  });
}

/**
 * Sem telefone não há chave única no banco, e sem chave única a mesma frase
 * recebida duas vezes criaria dois "proprietário" para a mesma empresa. A defesa
 * é a leitura por nome+cargo antes de criar — e ela é da mesma empresa, então
 * não passa de algumas linhas.
 */
async function decisorJaRegistrado(
  db: Cliente,
  p: { empresaId: string; nome: string; cargo?: string },
): Promise<string | null> {
  const existentes = await db.contato.findMany({
    where: { empresaId: p.empresaId, ehDecisor: true },
    select: { id: true, nome: true, cargo: true },
  });
  const igual = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

  const achado = existentes.find(
    (c) => igual(c.nome, p.nome) && (p.cargo ? igual(c.cargo, p.cargo) : true),
  );
  return achado?.id ?? null;
}

/**
 * Lê a resposta recebida numa conversa de prospecção e grava o que ela revelou.
 *
 * Idempotente: a mesma mensagem processada duas vezes devolve os MESMOS ids, não
 * cria segundo contato e não grava segundo evento.
 */
export async function registrarInterlocutorDaProspeccao(
  db: Cliente,
  p: { leadId: string; fromPhone?: string | null; texto: string; agora?: Date; autoria?: Autoria },
): Promise<ResultadoDoRegistro> {
  const agora = p.agora ?? new Date();
  const autoria = p.autoria ?? AUTORIA_SISTEMA;
  const classificacao = classificarInterlocutor(p.texto);
  const decisor = extrairDecisorIndicado(p.texto);

  if (classificacao.papel === "INDEFINIDO" && !decisor) {
    return vazio("semSinal", classificacao, decisor, "nada a registrar nesta resposta");
  }

  const lead = await db.siteLead.findUnique({
    where: { id: p.leadId },
    select: { id: true, nome: true, whatsapp: true, empresaId: true, contatoId: true },
  });
  if (!lead) return vazio("leadNaoExiste", classificacao, decisor, `lead ${p.leadId} não existe`);

  // ⚠️ Sem empresa não há onde pendurar um contato — `Contato.empresaId` é
  // obrigatório. Isto NÃO é falha: é a fronteira honesta entre o que o Hunter já
  // preparou e o que ainda não. A classificação volta mesmo assim, para quem
  // chamou registrar na conversa.
  if (!lead.empresaId) {
    return vazio(
      "leadSemEmpresa",
      classificacao,
      decisor,
      "o lead ainda não está ligado a uma empresa da jornada; nada foi gravado em Contato",
    );
  }

  const empresaId = lead.empresaId;
  let contatoDoPorteiroId: string | null = null;
  let contatoDoDecisorId: string | null = null;

  // ── 1. O PORTEIRO ────────────────────────────────────────────────────────
  if (classificacao.papel === "GATEKEEPER") {
    const telefone = p.fromPhone ?? lead.whatsapp ?? null;
    const r = await registrarContato(db, {
      empresaId,
      nome: (lead.nome ?? "").trim() || telefone || "Atendimento",
      canal: "whatsapp",
      telefone,
      ehGatekeeper: true,
      tipoDeGatekeeper: classificacao.tipoDeGatekeeper,
      confianca: classificacao.confianca,
      comoFoiDescoberto: "classificado na resposta do WhatsApp de prospecção",
      fonte: FONTE,
      autoria,
      agora,
    });
    contatoDoPorteiroId = r.contatoId;

    if (!r.criado) {
      await carimbarPorteiro(db, { contatoId: r.contatoId, empresaId, classificacao, autoria });
    }

    if (!lead.contatoId) {
      await vincularLead(db, { leadId: lead.id, contatoId: r.contatoId, autoria });
    }

    await moverSePuder(db, {
      empresaId,
      para: "GATEKEEPER",
      autoria,
      motivo: `porteiro identificado: ${classificacao.tipoDeGatekeeper}`,
      agora,
    });
  }

  // ── 1b. O DECISOR QUE SE DECLAROU ────────────────────────────────────────
  //
  // "O dono sou eu." É o caminho mais curto até o objetivo, e ele passava batido
  // junto com todo o resto. Confiança MÉDIA de propósito: quem se declara dono
  // pela primeira mensagem ainda não provou nada — mas já muda a conversa.
  if (classificacao.papel === "DECISOR") {
    const telefone = p.fromPhone ?? lead.whatsapp ?? null;
    const r = await registrarContato(db, {
      empresaId,
      nome: (lead.nome ?? "").trim() || telefone || "Decisor",
      canal: "whatsapp",
      telefone,
      ehDecisor: true,
      confianca: classificacao.confianca,
      comoFoiDescoberto: "o próprio interlocutor se declarou responsável",
      fonte: FONTE,
      autoria,
      agora,
    });
    contatoDoDecisorId = r.contatoId;

    if (!lead.contatoId) {
      await vincularLead(db, { leadId: lead.id, contatoId: r.contatoId, autoria });
    }

    await moverSePuder(db, {
      empresaId,
      para: "DECISOR_ENCONTRADO",
      autoria,
      motivo: "o interlocutor se declarou dono/gerente",
      agora,
    });
  }

  // ── 2. O DECISOR INDICADO ────────────────────────────────────────────────
  if (decisor) {
    const nome = decisor.nome ?? decisor.cargo ?? "Responsável indicado";
    const digitos = somenteDigitos(decisor.telefone ?? null);

    const jaExiste = digitos ? null : await decisorJaRegistrado(db, { empresaId, nome, cargo: decisor.cargo });

    if (jaExiste) {
      contatoDoDecisorId = jaExiste;
    } else {
      const r = await registrarContato(db, {
        empresaId,
        nome,
        cargo: decisor.cargo ?? null,
        canal: decisor.canal ?? null,
        telefone: decisor.telefone ?? null,
        email: decisor.email ?? null,
        ehDecisor: true,
        confianca: decisor.confianca,
        comoFoiDescoberto: decisor.comoFoiDescoberto,
        fonte: FONTE,
        autoria,
        agora,
      });
      contatoDoDecisorId = r.contatoId;
    }

    await moverSePuder(db, {
      empresaId,
      para: "DECISOR_ENCONTRADO",
      autoria,
      motivo: `decisor indicado pelo atendimento: ${nome}`,
      agora,
    });
  }

  // ── 3. O OBJETIVO, DEPOIS DO QUE ACABOU DE SER ESCRITO ───────────────────
  const empresaAgora = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { estagio: true },
  });

  return {
    aplicado: true,
    causa: "registrado",
    classificacao,
    decisor,
    empresaId,
    contatoDoPorteiroId,
    contatoDoDecisorId,
    objetivo: objetivoDaProspeccao({
      estagioDaEmpresa: empresaAgora?.estagio ?? null,
      contatoEhDecisor: null,
    }),
    detalhe: [
      classificacao.papel === "GATEKEEPER" ? `porteiro ${classificacao.tipoDeGatekeeper}` : null,
      decisor ? `decisor indicado (${decisor.confianca.toLowerCase()})` : null,
    ]
      .filter(Boolean)
      .join(" + "),
  };
}
