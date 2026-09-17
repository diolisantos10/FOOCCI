/**
 * UM BANCO DE PROVA PARA O REVENUE SUPERVISOR — só para os testes.
 *
 * ── POR QUE NÃO BASTA `vi.fn()` COM RESPOSTA FIXA ───────────────────────────
 *
 * Os testes de regra pura desta pasta usam dublês de resposta fixa, e está
 * certo: provam a regra. Não provam o que este bloco precisa provar — que os
 * números do funil SAEM DO BANCO, respeitando janela de data, estágio e
 * relação. Um dublê que devolve `42` para qualquer `where` faria o teste do
 * funil passar com a consulta errada: é a régua verde sobre o componente
 * errado, o defeito que esta casa já nomeou.
 *
 * Então este arquivo é um Postgres pequeno e burro: guarda linhas, e responde
 * `count`, `findMany` e `groupBy` FILTRANDO de verdade pelo `where` que o
 * serviço mandou. Se o serviço pedir a janela errada, o número vem errado e o
 * teste reprova — que é exatamente o serviço que se quer ter.
 *
 * ⚠️ Não é um Prisma completo e não tenta ser. Entende só o que estes serviços
 * usam: igualdade, `gte`/`lt`/`not`/`in`, e o `select` que puxa a empresa de um
 * evento da trilha. Consulta nova que ele não entenda ESTOURA, em vez de
 * devolver lista vazia — porque vazio silencioso viraria "medido: zero", e zero
 * inventado é o erro que este bloco inteiro existe para não cometer.
 */

type Linha = Record<string, unknown>;

export interface Tabelas {
  empresa: Linha[];
  contato: Linha[];
  oportunidade: Linha[];
  cliente: Linha[];
  eventoDaJornada: Linha[];
  siteLead: Linha[];
  leadProposta: Linha[];
  /** A conversa. Acrescentada pelo raio-x das conversas de prospecção. */
  leadMensagem: Linha[];

  // ── Acrescentadas pela frente UI-A (Central de Atendimento e CRM 360) ─────
  //
  // Nada foi removido nem alterado acima: as telas novas precisavam de tabelas
  // que este banco ainda não guardava, e um banco de prova que não guarda a
  // tabela obriga o teste a dublar a consulta — que é justamente a régua verde
  // sobre o componente errado.
  /** O time. As linhas já carregam `disponibilidade` embutida, como o Prisma devolve. */
  internalUser: Linha[];
  /** A passagem para gente. É dela que sai a espera de quem está na fila. */
  leadHandoff: Linha[];
  /** A trilha da ficha — o que a linha do tempo do CRM 360 lê. */
  siteLeadInteraction: Linha[];
  /** Reuniões e visitas marcadas. */
  leadCompromisso: Linha[];
}

function combinaCampo(valor: unknown, condicao: unknown): boolean {
  if (condicao === null) return valor === null || valor === undefined;

  if (typeof condicao === "object" && condicao !== null && !(condicao instanceof Date)) {
    const c = condicao as Record<string, unknown>;
    for (const chave of Object.keys(c)) {
      const alvo = c[chave];
      switch (chave) {
        case "gte":
          if (!(valor instanceof Date) || valor.getTime() < (alvo as Date).getTime()) return false;
          break;
        case "lt":
          if (!(valor instanceof Date) || valor.getTime() >= (alvo as Date).getTime()) return false;
          break;
        case "in":
          if (!(alvo as unknown[]).includes(valor as never)) return false;
          break;
        case "notIn":
          if ((alvo as unknown[]).includes(valor as never)) return false;
          break;
        case "isNot":
          // Só o caso que o Prisma usa nestes serviços: "a relação existe".
          if (alvo === null) {
            if (valor === null || valor === undefined) return false;
          } else {
            throw new Error("bancoDeProva: 'isNot' só entende null");
          }
          break;
        case "not":
          if (alvo === null) {
            if (valor === null || valor === undefined) return false;
          } else if (combinaCampo(valor, alvo)) {
            return false;
          }
          break;
        default:
          throw new Error(`bancoDeProva: operador '${chave}' não implementado`);
      }
    }
    return true;
  }

  if (condicao instanceof Date) {
    return valor instanceof Date && valor.getTime() === condicao.getTime();
  }
  return valor === condicao;
}

function combina(linha: Linha, where: Linha | undefined): boolean {
  if (!where) return true;
  for (const campo of Object.keys(where)) {
    if (campo === "AND") {
      if (!(where.AND as Linha[]).every((w) => combina(linha, w))) return false;
      continue;
    }
    if (campo === "OR") {
      if (!(where.OR as Linha[]).some((w) => combina(linha, w))) return false;
      continue;
    }
    if (!combinaCampo(linha[campo], where[campo])) return false;
  }
  return true;
}

function ordenar(linhas: Linha[], orderBy: Record<string, "asc" | "desc"> | undefined): Linha[] {
  if (!orderBy) return linhas;
  const campo = Object.keys(orderBy)[0]!;
  const direcao = orderBy[campo] === "desc" ? -1 : 1;
  return [...linhas].sort((a, b) => {
    const x = a[campo];
    const y = b[campo];
    const vx = x instanceof Date ? x.getTime() : Number(x ?? 0);
    const vy = y instanceof Date ? y.getTime() : Number(y ?? 0);
    return (vx - vy) * direcao;
  });
}

function comoTabela(linhas: Linha[], enriquecer?: (l: Linha) => Linha) {
  const ver = (l: Linha) => (enriquecer ? enriquecer(l) : l);

  return {
    async count(args?: { where?: Linha }) {
      return linhas.filter((l) => combina(l, args?.where)).length;
    },
    async findMany(args?: {
      where?: Linha;
      orderBy?: Record<string, "asc" | "desc">;
      skip?: number;
      take?: number;
    }) {
      const achadas = ordenar(
        linhas.filter((l) => combina(l, args?.where)),
        args?.orderBy,
      ).map(ver);
      // `select` é ignorado de propósito: devolver a linha inteira nunca faz um
      // teste passar com a consulta errada — o que ele mediria é o `where`.
      const inicio = args?.skip ?? 0;
      return args?.take === undefined ? achadas.slice(inicio) : achadas.slice(inicio, inicio + args.take);
    },
    async findUnique(args: { where: Linha }) {
      return linhas.filter((l) => combina(l, args.where)).map(ver)[0] ?? null;
    },
    async findFirst(args?: { where?: Linha; orderBy?: Record<string, "asc" | "desc"> }) {
      return (
        ordenar(
          linhas.filter((l) => combina(l, args?.where)),
          args?.orderBy,
        ).map(ver)[0] ?? null
      );
    },
    async groupBy(args: { by: string[]; where?: Linha; _count?: unknown }) {
      const campo = args.by[0]!;
      const grupos = new Map<unknown, number>();
      for (const l of linhas.filter((x) => combina(x, args.where))) {
        grupos.set(l[campo], (grupos.get(l[campo]) ?? 0) + 1);
      }
      return [...grupos.entries()].map(([valor, total]) => ({
        [campo]: valor,
        _count: { _all: total },
      }));
    },
  };
}

/** Um banco de prova já vazio, pronto para receber linhas. */
export function bancoDeProva(dados: Partial<Tabelas> = {}) {
  const t: Tabelas = {
    empresa: dados.empresa ?? [],
    contato: dados.contato ?? [],
    oportunidade: dados.oportunidade ?? [],
    cliente: dados.cliente ?? [],
    eventoDaJornada: dados.eventoDaJornada ?? [],
    siteLead: dados.siteLead ?? [],
    leadProposta: dados.leadProposta ?? [],
    leadMensagem: dados.leadMensagem ?? [],
    internalUser: dados.internalUser ?? [],
    leadHandoff: dados.leadHandoff ?? [],
    siteLeadInteraction: dados.siteLeadInteraction ?? [],
    leadCompromisso: dados.leadCompromisso ?? [],
  };

  const porId = new Map(t.empresa.map((e) => [e.id as string, e]));

  return {
    tabelas: t,
    empresa: comoTabela(t.empresa),
    contato: comoTabela(t.contato),
    oportunidade: comoTabela(t.oportunidade),
    cliente: comoTabela(t.cliente),
    // O lead carrega junto as relações que a ficha do CRM 360 lê num `select`
    // aninhado. Acrescentar campos nunca faz uma consulta errada passar — o que
    // o `where` mede continua sendo medido.
    siteLead: comoTabela(t.siteLead, (l) => ({
      ...l,
      propostas: t.leadProposta.filter((p) => p.leadId === l.id),
      compromissos: t.leadCompromisso.filter((c) => c.leadId === l.id),
      oportunidades: t.oportunidade.filter((o) => o.leadId === l.id),
    })),
    leadProposta: comoTabela(t.leadProposta),
    leadMensagem: comoTabela(t.leadMensagem),
    internalUser: comoTabela(t.internalUser),
    leadHandoff: comoTabela(t.leadHandoff),
    siteLeadInteraction: comoTabela(t.siteLeadInteraction),
    leadCompromisso: comoTabela(t.leadCompromisso),
    // A trilha carrega a empresa junto, porque `amostraDoHunter` precisa da
    // data de descoberta para medir quanto o Hunter demorou.
    eventoDaJornada: comoTabela(t.eventoDaJornada, (l) => ({
      ...l,
      empresa: porId.get(l.empresaId as string) ?? null,
    })),
  };
}
