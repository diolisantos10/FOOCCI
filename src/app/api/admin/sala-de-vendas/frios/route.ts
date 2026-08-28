/**
 * /api/admin/sala-de-vendas/frios
 *
 *   GET  → as origens que se pode declarar, e a ordem das colunas da colagem
 *   POST → cadastra a lista colada (ou um contato digitado à mão)
 *
 * É a porta do pedido do CEO em 28/08/2026: *"um espaço dentro do comercial
 * onde eu possa colocar os agentes para alimentar cadastros frios pelo navegador
 * ao invés de usar o Google Drive."*
 *
 * ── AS CAMADAS, NESTA ROTA ──────────────────────────────────────────────────
 *
 *   1. `guardarSalaDeVendas` — você é da Sala? (protege o endereço)
 *   2. `somenteLeitura`      — o auditor lê e não escreve
 *   3. `problemaNoPedido`    — origem declarada? sobrou alguma linha boa?
 *   4. `cadastrarFrios`      — a duplicata contra a base, e a gravação
 *
 * Não existe camada de `podeVerOLead` aqui, e a ausência é de propósito: não há
 * lead para conferir. Estes contatos **estão nascendo** neste pedido.
 *
 * ── ⚠️ O AUTOR VEM DA SESSÃO, NUNCA DO CORPO ────────────────────────────────
 *
 * `autorUserId` e `autorNome` saem de `portao.sessao`. O corpo pode mandar
 * `autorNome`, `actor`, `quem` — nada disso é lido. Deixar o cliente escolher o
 * autor é entregar a assinatura a quem assina: a interação `CAPTURA` que fica na
 * ficha do lead diz quem trouxe aquele contato para a base, e é essa linha que
 * responde depois de onde ele veio.
 *
 * ── ⚠️ E POR QUE UMA VIA SÓ DE LEITURA ──────────────────────────────────────
 *
 * A tela tem duas entradas — colar a lista e digitar um contato — e as duas
 * caem no MESMO `lerColagem`. O formulário de um contato vira uma linha antes de
 * ser lido. Duas rotinas de leitura seriam duas regras de "o que é lead", e elas
 * divergiriam no primeiro ajuste feito só numa das duas.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura } from "../_guarda";
import {
  ORIGENS_FRIAS,
  lerColagem,
  problemaNoPedido,
  cadastrarFrios,
  type LinhaLida,
  type ProblemaNaLinha,
  type RecusaDoCadastro,
} from "@/services/salaDeVendas/frios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACAO = "cadastrar_leads_frios";

/**
 * A ordem em que `lerColagem` lê as colunas.
 *
 * Viaja para a tela porque é ela que a pessoa precisa ler ANTES de colar — uma
 * colagem na ordem errada não dá erro: cria leads com o nome do bar no lugar do
 * nome da pessoa. O teste da rota confere que esta lista é mesmo a que o leitor
 * usa, senão ela viraria uma legenda que mente.
 */
const ORDEM_DAS_COLUNAS = ["nome", "whatsapp", "estabelecimento", "cidade"] as const;

/**
 * O teto de uma colagem só.
 *
 * ⚠️ Não é capricho: cada linha nova custa DUAS escritas (o lead e a interação),
 * e elas acontecem dentro de uma requisição HTTP. Uma planilha de cinco mil
 * linhas seria cortada no meio pelo tempo limite, deixando metade gravada e
 * ninguém sabendo qual metade.
 *
 * Cortar a lista em duas colagens custa dez segundos a quem cola, e recolar é
 * seguro — quem já está na base volta em "já existiam", não duplica.
 */
const MAXIMO_DE_LINHAS = 500;

interface CorpoDoCadastro {
  /** O texto colado da planilha. */
  texto?: unknown;
  /** Um contato digitado no formulário curto. */
  campos?: unknown;
  origem?: unknown;
  descricaoDaOrigem?: unknown;
}

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, ACAO);
  if (!portao.ok) return portao.resposta;

  return NextResponse.json({
    ok: true,
    // As opções viajam pela rota que as VALIDA. Se a tela importasse
    // `ORIGENS_FRIAS` do serviço, a lista do seletor e a lista da recusa
    // seriam duas — e a divergência apareceria como "escolhi e não funciona".
    data: { origens: ORIGENS_FRIAS, ordemDasColunas: ORDEM_DAS_COLUNAS },
  });
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, ACAO);
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let corpo: CorpoDoCadastro;
  try {
    corpo = (await req.json()) as CorpoDoCadastro;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const colado = typeof corpo.texto === "string" ? corpo.texto : "";
  const digitado = umaLinhaDoFormulario(corpo.campos);
  const bruto = [colado, digitado].filter((t) => t.trim()).join("\n");

  if (!bruto.trim()) {
    return NextResponse.json(
      { ok: false, error: "Cole a lista ou preencha o contato — não veio nada para cadastrar." },
      { status: 400 },
    );
  }

  const linhas = lerColagem(bruto);

  if (linhas.length > MAXIMO_DE_LINHAS) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Esta lista tem ${linhas.length} linhas e o limite de uma colagem é ${MAXIMO_DE_LINHAS}. ` +
          "Cole em partes — quem já estiver na base não é duplicado.",
      },
      { status: 400 },
    );
  }

  const origem = typeof corpo.origem === "string" ? corpo.origem.trim() : "";
  const descricaoDaOrigem =
    typeof corpo.descricaoDaOrigem === "string" ? corpo.descricaoDaOrigem : null;

  const problema = problemaNoPedido({ linhas, origem, descricaoDaOrigem });
  if (problema) {
    return NextResponse.json(
      {
        ok: false,
        error: explicarRecusaDoPedido(problema),
        // As recusas viajam mesmo quando o lote inteiro cai: sem elas, "nenhuma
        // linha serve" não diz QUAL linha consertar, e a pessoa volta para a
        // planilha sem saber por onde começar.
        recusadas: paraATela(linhas),
      },
      { status: 400 },
    );
  }

  // ── POR QUE SEM TRANSAÇÃO ────────────────────────────────────────────────
  //
  // Uma transação por lote transformaria uma falha na linha 380 em "nada foi
  // cadastrado", e a pessoa recolaria as 380 do zero. Sem ela, o que entrou
  // ficou — e recolar é seguro, porque quem já está na base volta em
  // "já existiam". Aqui o certo é o parcial, não o tudo-ou-nada.
  const r = await cadastrarFrios(prisma, {
    linhas,
    // `origem` já passou por `problemaNoPedido`, que é quem o estreita para
    // `OrigemFria`. O molde repete a conferência para o TypeScript.
    origem: origem as Parameters<typeof cadastrarFrios>[1]["origem"],
    descricaoDaOrigem,
    // ⚠️ Da SESSÃO. O corpo não escolhe quem assinou o cadastro.
    autorUserId: portao.sessao.userId,
    autorNome: portao.sessao.nome,
  });

  return NextResponse.json({
    ok: true,
    data: {
      criados: r.criados,
      jaExistiam: r.jaExistiam,
      recusadas: paraATela(r.recusadas),
    },
  });
}

/**
 * O contato digitado no formulário curto vira UMA linha colada.
 *
 * ⚠️ As células são juntadas com ponto-e-vírgula, e não com tabulação. A razão
 * é chata e real: `lerColagem` apara cada linha antes de dividi-la, e a
 * tabulação é espaço em branco — um nome vazio no começo desapareceria junto e
 * as colunas deslizariam, fazendo o telefone ser lido como nome. O
 * ponto-e-vírgula sobrevive à aparagem, então "sem nome" continua sendo
 * recusado por falta de nome, que é o que a tela precisa dizer.
 *
 * Por isso mesmo `;` é retirado do que a pessoa digitou: um ponto-e-vírgula
 * dentro do nome abriria uma coluna que ninguém pediu.
 */
function umaLinhaDoFormulario(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const campos = v as Record<string, unknown>;

  const celulas = ORDEM_DAS_COLUNAS.map((c) => celula(campos[c]));
  return celulas.some((c) => c !== "") ? celulas.join(";") : "";
}

function celula(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\t\r\n;]+/g, " ").trim() : "";
}

/** A linha recusada, do jeito que a tela mostra: número, texto e frase. */
function paraATela(linhas: LinhaLida[]): Array<{ numero: number; texto: string; motivo: string }> {
  return linhas
    .filter((l) => l.problema !== null)
    .map((l) => ({
      numero: l.numero,
      texto: l.bruto,
      motivo: explicarRecusaDaLinha(l.problema!),
    }));
}

/**
 * O código da recusa vira frase para quem está cadastrando.
 *
 * Devolver `"whatsappInvalido"` na tela obrigaria quem cola a lista a adivinhar
 * o que consertar. Cada frase diz O QUE FAZER, no vocabulário de quem vende —
 * mesma doutrina de `explicarRecusaDeSaida`, em `conversa.ts`.
 */
function explicarRecusaDaLinha(p: ProblemaNaLinha): string {
  switch (p) {
    case "semNome":
      return "Faltou o nome. Um telefone sem dono não dá para atender.";
    case "semWhatsapp":
      return "Faltou o WhatsApp — é por ele que se fala com essa pessoa.";
    case "whatsappInvalido":
      return (
        "Este WhatsApp não tem forma de telefone brasileiro. Confira o DDD e a " +
        "quantidade de dígitos — ex.: (11) 98765-4321."
      );
    case "repetidaNoLote":
      return "Esta pessoa já aparece antes nesta mesma lista. Ela entrou uma vez só.";
  }
}

function explicarRecusaDoPedido(r: RecusaDoCadastro): string {
  switch (r) {
    case "origemInvalida":
      return (
        "Escolha de onde vieram estes contatos. A origem fica registrada porque é " +
        "ela que diz como a gente pode falar com essa pessoa depois."
      );
    case "origemOutroSemDescricao":
      return (
        "Você escolheu “Outro”. Escreva em uma linha de onde vieram — sem isso a " +
        "origem não fica registrada, e é para registrá-la que este campo existe."
      );
    case "semLinhasValidas":
      return "Nenhuma linha desta lista deu para aproveitar. Nada foi cadastrado.";
  }
}
