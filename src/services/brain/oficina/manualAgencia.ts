/**
 * Manual da casa — domínio "agencia".
 *
 * Nasceu de uma quebra achada no piloto ponta a ponta da Dioli (30/07/2026): a
 * Oficina só conhecia o domínio "restaurante". Toda peça pedida para um cliente
 * de agência caía no caminho SEM manual — ficha pelada, nenhum eixo para o
 * Variador girar e, pior, o juiz sem nada contra o que conferir.
 *
 * Isso importava de verdade, não em teoria: o cliente da vez é a própria Foocci,
 * que tem uma lista de proibições escrita e específica (não posicionar como
 * chatbot, nunca prometer percentual de aumento, nenhum depoimento inventado).
 * Sem manual, a peça saía sem ninguém segurando nada disso.
 *
 * Este manual é a régua do OFÍCIO — o que vale para qualquer cliente de
 * agência. As proibições de CADA cliente continuam vindo do briefing, pelo
 * rascunho, e se somam a estas. As duas camadas têm donos diferentes de
 * propósito: esta muda quando a agência aprende; a do briefing muda quando o
 * cliente fala.
 *
 * Registrado no import, igual ao manual do restaurante — o core da Oficina não
 * conhece nenhum dos dois.
 */

import { registerManual, type Manual } from "./HouseManual";

export const manualAgencia: Manual = {
  dominio: "agencia",

  listaNegra: [
    // o sotaque de IA — empilhar superlativo técnico não deixa melhor, deixa igual
    "hiper-realista",
    "ultra detalhado",
    "obra-prima",
    "8k",
    "award winning",
    // o jargão que denuncia peça escrita por robô para "marca"
    "solução inovadora",
    "revolucionar o mercado",
    "no próximo nível",
    "game changer",
    "disruptivo",
    "sinergia",
    "alavancar resultados",
    // as chamadas gastas — se toda marca usa, nenhuma marca ganha
    "não perca essa oportunidade",
    "imperdível",
    "corre que é por tempo limitado",
    "clique agora",
    "arrasta pra cima",
    "link na bio" ,
    // a promessa vazia: número sem fonte é o pecado da agência
    "resultados garantidos",
    "resultado garantido",
    "aumente suas vendas em",
  ],

  /**
   * A verdade mínima de uma peça de agência é o que o negócio VENDE. Sem isso a
   * peça vira publicidade genérica — bonita, intercambiável e inútil.
   */
  verdadeExigida: ["products"],

  proibicoesPadrao: [
    "prometer número, percentual ou prazo de resultado que não veio da verdade",
    "inventar depoimento, caso de cliente, logo ou métrica",
    "superlativo sem prova ('o melhor do Brasil', 'líder de mercado')",
    "falar de concorrente pelo nome",
    "usar jargão técnico no lugar do benefício concreto",
  ],

  proibicoesPorMedium: {
    imagem: [
      "apresentar imagem gerada como foto real da empresa, da equipe ou do produto",
      "inventar rosto de cliente ou de funcionário",
      "reproduzir marca, logo ou identidade de terceiro",
    ],
  },

  eixosPorMedium: {
    texto: [
      // `formato` é obrigatório para o juiz e NENHUM manual o oferecia em texto —
      // sem ele, toda peça escrita de agência era reprovada com "defina o
      // formato e o limite". Quem sabe o canal passa no rascunho e sobrescreve;
      // quem não sabe recebe um padrão sensato em vez de uma reprovação.
      { nome: "formato",    opcoes: ["legenda de feed (até 3 linhas)", "story (1 tela, 1–2 linhas)", "carrossel (título + 1 linha por card)", "texto curto de anúncio"] },
      { nome: "abertura",   opcoes: ["fato concreto", "pergunta direta", "cena do dia a dia", "número real da verdade", "objeção do cliente"] },
      { nome: "tamanho",    opcoes: ["1 linha", "2 linhas", "curta com quebra", "média com respiro"] },
      { nome: "angulo",     opcoes: ["o problema", "o antes e depois", "como funciona", "quem já usa", "o bastidor"] },
      { nome: "fechamento", opcoes: ["chamada leve", "sem chamada", "pergunta", "próximo passo concreto"] },
    ],
    imagem: [
      { nome: "angulo",     opcoes: ["frontal", "de cima", "diagonal 45°", "detalhe macro"] },
      { nome: "luz",        opcoes: ["janela de manhã", "fim de tarde", "softbox neutro", "luz dura de estúdio"] },
      { nome: "composicao", opcoes: ["objeto centrado", "regra dos terços", "muito respiro", "recorte apertado"] },
      { nome: "superficie", opcoes: ["mesa clara", "fundo liso", "textura de papel", "concreto"] },
      { nome: "formato",    opcoes: ["4:5 feed", "9:16 story", "1:1", "16:9 capa"] },
    ],
  },
};

registerManual(manualAgencia);
