/**
 * OficinaDiagnostic — o piso de segurança da Oficina, hermético.
 *
 * Sem banco, sem IA, sem rede: roda em milissegundos e prova que as travas
 * inegociáveis seguram. Mesmo molde do CrmBrainDiagnostic — é o que permite a
 * Oficina subir na escada de promoção do Brain como qualquer outro agente.
 *
 * P0 = trava que, se quebrar, publica peça errada. Não existe P0 aceitável.
 */

import { criticar } from "./PromptCritic";
import { criticarResultado } from "./OutputCritic";
import { manualRestaurante } from "./HouseManual";
import { totalDeCombinacoes, variar, type Eixo } from "./Variator";
import { decidirImagem } from "./PoliticaDeImagem";
import { montarFicha } from "./OficinaService";
import { renderizarComandoDeImagem } from "./EsteiraDeImagem";
import type { Ficha } from "./OficinaTypes";

export interface OficinaCheck {
  nome: string;
  p0: boolean;
  passou: boolean;
  detalhe: string;
}

export interface OficinaDiagnosticResult {
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  p0: number;
  checks: OficinaCheck[];
}

function fichaBase(over: Partial<Ficha> = {}): Ficha {
  return {
    objetivo:   "levar o cliente a pedir o combo de domingo",
    publico:    "quem pediu nos últimos 60 dias",
    tom:        "direto e caloroso, sem gíria",
    formato:    "WhatsApp, 1 linha",
    verdade:    { products: "picanha de quinta", restaurante: "Boteco do Zé", preco: "R$ 79,90" },
    proibicoes: [...manualRestaurante.proibicoesPadrao],
    eixos:      { abertura: "fato concreto" },
    assinatura: "abertura:fato concreto",
    ...over,
  };
}

export function runOficinaDiagnostic(): OficinaDiagnosticResult {
  const checks: OficinaCheck[] = [];
  const check = (nome: string, p0: boolean, passou: boolean, detalhe: string) =>
    checks.push({ nome, p0, passou, detalhe });

  // ── P0: sem verdade, nada passa ───────────────────────────────────────────
  const semVerdade = criticar(fichaBase({ verdade: {} }), manualRestaurante);
  check(
    "ficha sem verdade é reprovada",
    true,
    !semVerdade.aprovado && semVerdade.graves > 0,
    `aprovado=${semVerdade.aprovado} graves=${semVerdade.graves}`,
  );

  // ── P0: sem manual, nada passa (nunca "passa por não existir") ────────────
  const semManual = criticar(fichaBase(), null);
  check("domínio sem manual é reprovado", true, !semManual.aprovado, `score=${semManual.score}`);

  // ── P0: número inventado no resultado é barrado ───────────────────────────
  const inventado = criticarResultado(
    "Hoje a picanha do Boteco do Zé sai por R$ 49,90!",
    fichaBase(),
    manualRestaurante,
  );
  check(
    "preço que não está na verdade é barrado",
    true,
    !inventado.aprovado && inventado.motivos.join(" ").includes("49"),
    `motivos=${inventado.motivos.length}`,
  );

  // ── P0: peça genérica (sem nenhum fato da verdade) é barrada ──────────────
  const generica = criticarResultado("Sentimos sua falta! Volte a pedir com a gente.", fichaBase(), manualRestaurante);
  check("peça genérica é barrada", true, !generica.aprovado, `graves=${generica.graves}`);

  // ── P0: clichê da lista negra é barrado no resultado ──────────────────────
  const cliche = criticarResultado(
    "Picanha do Boteco do Zé — imperdível!",
    fichaBase(),
    manualRestaurante,
  );
  check("clichê da lista negra é barrado", true, !cliche.aprovado, `graves=${cliche.graves}`);

  // ── P0: o anti-mesmice não repete dentro da janela ────────────────────────
  const eixos: Eixo[] = [
    { nome: "a", opcoes: ["1", "2", "3"] },
    { nome: "b", opcoes: ["x", "y"] },
  ];
  const total = totalDeCombinacoes(eixos);
  const vistas: string[] = [];
  let repetiu = false;
  for (let i = 0; i < total; i++) {
    const v = variar(eixos, vistas, 0);
    if (vistas.includes(v.assinatura)) repetiu = true;
    vistas.push(v.assinatura);
  }
  check(
    "variador não repete antes de esgotar",
    true,
    !repetiu && new Set(vistas).size === total,
    `${new Set(vistas).size}/${total} combinações distintas`,
  );

  // ── P0: repertório esgotado é ANUNCIADO, não escondido ────────────────────
  const esgotou = variar(eixos, vistas, 0);
  check("esgotamento é anunciado", true, esgotou.esgotado, `esgotado=${esgotou.esgotado}`);

  // ── P0: a REGRA DE OURO da imagem ─────────────────────────────────────────
  // "Nunca inventar. Trabalhar com o insumo que o cliente traz, a não ser que
  //  seja solicitado pelo próprio cliente — caso ele não tenha mídia."
  const agora = new Date("2026-07-25T12:00:00Z");
  const autorizado = { por: "dono", em: "2026-07-24T10:00:00Z", escopo: "gerar imagem do Burger do Chef" };

  const semFotoSemPedido = decidirImagem({
    categoria: "prato", temMidiaPropria: false, escopoPedido: "Burger do Chef", agora,
  });
  check(
    "prato sem foto e sem pedido do lojista é bloqueado",
    true,
    semFotoSemPedido.caminho === "bloqueado" && !!semFotoSemPedido.saida,
    `caminho=${semFotoSemPedido.caminho}`,
  );

  const comFoto = decidirImagem({
    categoria: "prato", temMidiaPropria: true, escopoPedido: "Burger do Chef",
    autorizacao: autorizado, agora,
  });
  check(
    "tendo foto, o insumo do cliente ganha até de uma autorização",
    true,
    comFoto.caminho === "realce",
    `caminho=${comFoto.caminho}`,
  );

  const comPedido = decidirImagem({
    categoria: "prato", temMidiaPropria: false, escopoPedido: "Burger do Chef",
    autorizacao: autorizado, agora,
  });
  check(
    "geração autorizada de prato exige selo de ilustrativa",
    true,
    comPedido.caminho === "geracao" && comPedido.exigeSelo,
    `caminho=${comPedido.caminho} selo=${comPedido.exigeSelo}`,
  );

  const outroPrato = decidirImagem({
    categoria: "prato", temMidiaPropria: false, escopoPedido: "Picanha na Chapa",
    autorizacao: autorizado, agora,
  });
  check(
    "autorização de um prato não libera outro",
    true,
    outroPrato.caminho === "bloqueado",
    `caminho=${outroPrato.caminho}`,
  );

  const pessoa = decidirImagem({
    categoria: "pessoa", temMidiaPropria: false, escopoPedido: "cliente sorrindo",
    autorizacao: { por: "dono", em: "2026-07-24T10:00:00Z", escopo: "cliente sorrindo" }, agora,
  });
  check(
    "pessoa nunca é gerada, nem com autorização",
    true,
    pessoa.caminho === "bloqueado",
    `caminho=${pessoa.caminho}`,
  );

  const fichaDeImagem = montarFicha(
    {
      pedido: { agentId: "social", medium: "imagem", intencao: "post do burger", dominio: "restaurante" },
      verdade: { products: "Burger do Chef" },
    },
    manualRestaurante,
  ).ficha;
  check(
    "ficha de imagem carrega as proibições da regra de ouro",
    true,
    fichaDeImagem.proibicoes.some((p) => p.includes("como foto real")),
    `proibicoes=${fichaDeImagem.proibicoes.length}`,
  );

  const comandoComSelo = renderizarComandoDeImagem(fichaDeImagem, true);
  const comandoSemSelo = renderizarComandoDeImagem(fichaDeImagem, false);
  check(
    "comando de imagem gerada declara o selo de ilustrativa",
    true,
    comandoComSelo.includes("SELO OBRIGATÓRIO") && !comandoSemSelo.includes("SELO OBRIGATÓRIO"),
    `comSelo=${comandoComSelo.includes("SELO OBRIGATÓRIO")} semSelo=${comandoSemSelo.includes("SELO OBRIGATÓRIO")}`,
  );

  check(
    "comando de imagem manda retratar só a verdade",
    true,
    comandoSemSelo.includes("retrate só isto"),
    `tamanho=${comandoSemSelo.length}`,
  );

  // ── Caminho feliz: ficha boa passa e peça ancorada passa ──────────────────
  const boa = criticar(fichaBase(), manualRestaurante);
  check("ficha completa é aprovada", false, boa.aprovado, `score=${boa.score}`);

  const peçaBoa = criticarResultado(
    "A picanha de quinta do Boteco do Zé está saindo agora. Guardo uma pra você?",
    fichaBase(),
    manualRestaurante,
  );
  check("peça ancorada na verdade é aprovada", false, peçaBoa.aprovado, `score=${peçaBoa.score}`);

  const passed = checks.filter((c) => c.passou).length;
  const p0 = checks.filter((c) => c.p0 && !c.passou).length;
  return {
    status: p0 === 0 && passed === checks.length ? "PASS" : "FAIL",
    total: checks.length,
    passed,
    p0,
    checks,
  };
}
