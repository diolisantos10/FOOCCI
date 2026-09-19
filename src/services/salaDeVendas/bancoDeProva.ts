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

  // ── Acrescentadas pelas SEIS ABAS do CRM 360 (peça 04 do desenho) ────────
  //
  // A ficha passou a ler a aba Atividades e a ficha de qualificação. Sem estas
  // duas tabelas o teste teria de dublar as duas consultas — e dublê de
  // consulta é régua verde sobre o componente errado.
  /** As tarefas do lead. A aba Atividades do desenho. */
  leadTarefa: Linha[];
  /** A ficha que o SDR preenche para o closer. Uma linha por lead. */
  leadQualificacao: Linha[];

  // ── Acrescentadas pela CAMPANHA DE REABORDAGEM DOS CONTATOS FRIOS ────────
  //
  // Nada acima foi removido nem alterado. O motor da campanha precisa provar,
  // de ponta a ponta, que a trava anti-repetição barra o segundo envio — e
  // isso exige um banco que RECUSE a segunda gravação, como o Postgres recusa.
  // Um dublê que aceita tudo faria o teste da trava passar sem trava.
  /** A reserva de ritmo, uma linha por número (`@id telefoneDigits`). */
  travaDeAbordagemRitmo: Linha[];
  /** A reserva de conteúdo (`@@unique [telefoneDigits, impressao]`). */
  travaDeAbordagemEnviada: Linha[];
  /** Toda recusa da trava, escrita. */
  travaDeAbordagemRecusa: Linha[];
  /** O interruptor de pânico da campanha (uma linha, `id = "unico"`). */
  reabordagemInterruptor: Linha[];
  /** Uma linha por contato examinado (`@@unique [loteId, leadId]`). */
  reabordagemExecucao: Linha[];
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
    const condicao = where[campo];

    // ── Filtro de RELAÇÃO (`{ some: {...} }`) ──
    //
    // O Prisma resolve isto com uma junção; aqui a relação é uma lista já
    // pendurada na linha por `comoTabela(..., enriquecer)`. Se a lista não
    // existir, ESTOURA — lista ausente respondida como "não bate" faria a
    // consulta errada devolver zero em silêncio.
    if (
      typeof condicao === "object" &&
      condicao !== null &&
      !(condicao instanceof Date) &&
      "some" in (condicao as Record<string, unknown>)
    ) {
      const lista = linha[campo];
      if (!Array.isArray(lista)) {
        throw new Error(`bancoDeProva: '${campo}.some' pediu uma relação que esta linha não carrega`);
      }
      const alvo = (condicao as Record<string, unknown>).some as Linha;
      if (!lista.some((item) => combina(item as Linha, alvo))) return false;
      continue;
    }

    // ── Filtro de relação PARA UM (`{ qualificacao: { is: {...} } }`, ou o
    //    `{ lead: {...} }` que o Prisma aceita sem o `is`) ──
    //
    // A relação é um objeto pendurado por `comoTabela(..., enriquecer)`.
    // Ausente = a relação não existe = não bate, que é o que o Postgres faz
    // num `INNER JOIN`. Só `is: null` casa com a ausência.
    if (
      typeof condicao === "object" &&
      condicao !== null &&
      !(condicao instanceof Date) &&
      !Array.isArray(condicao) &&
      ehRelacaoParaUm(linha[campo])
    ) {
      const c = condicao as Record<string, unknown>;
      const alvo = "is" in c ? c.is : "isNot" in c ? null : c;
      if ("is" in c && alvo === null) {
        if (linha[campo] !== null && linha[campo] !== undefined) return false;
        continue;
      }
      if ("isNot" in c) {
        if (linha[campo] === null || linha[campo] === undefined) return false;
        continue;
      }
      const relacao = linha[campo];
      if (relacao === null || relacao === undefined) return false;
      if (!combina(relacao as Linha, alvo as Linha)) return false;
      continue;
    }

    if (!combinaCampo(linha[campo], where[campo])) return false;
  }
  return true;
}

/**
 * ⚠️ Só o que FOI PENDURADO como relação entra neste caminho.
 *
 * `null` sozinho não basta — `optOutAt: null` também é null, e tratá-lo como
 * relação faria `{ optOutAt: null }` virar uma recursão em vez da comparação
 * que ele é. Por isso a relação para um só é reconhecida quando o valor é um
 * objeto que não é Date nem lista.
 */
function ehRelacaoParaUm(valor: unknown): boolean {
  return (
    typeof valor === "object" &&
    valor !== null &&
    !(valor instanceof Date) &&
    !Array.isArray(valor)
  );
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

/**
 * ⭐ AS ESCRITAS — e por que elas RECUSAM.
 *
 * `unicos` é a lista de chaves únicas da tabela. Uma `create` que repita
 * qualquer uma delas **lança**, como o Postgres lança. É essa recusa que a
 * trava anti-repetição usa como trava: sem ela, o teste da trava mediria um
 * `if`, e não a trava.
 */
/**
 * A chave composta do Prisma vem aninhada (`{ loteId_leadId: { loteId, leadId } }`).
 * Aqui ela vira um `where` plano, que é o que `combina` entende.
 */
function achatarChave(where: Linha): Linha {
  const plano: Linha = {};
  for (const campo of Object.keys(where)) {
    const valor = where[campo];
    if (campo.includes("_") && typeof valor === "object" && valor !== null && !(valor instanceof Date)) {
      Object.assign(plano, valor as Linha);
    } else {
      plano[campo] = valor;
    }
  }
  return plano;
}

function comoTabela(
  linhas: Linha[],
  enriquecer?: (l: Linha) => Linha,
  unicos: ReadonlyArray<readonly string[]> = [],
) {
  const ver = (l: Linha) => (enriquecer ? enriquecer(l) : l);

  const conferirUnicos = (nova: Linha) => {
    for (const chave of unicos) {
      const igual = linhas.some((l) => chave.every((campo) => l[campo] === nova[campo]));
      if (igual) {
        throw new Error(
          `bancoDeProva: violação de unicidade (${chave.join(", ")}) — o banco recusou a segunda gravação`,
        );
      }
    }
  };

  return {
    async create(args: { data: Linha }) {
      const nova = { ...args.data };
      if (nova.id === undefined) nova.id = `id-${linhas.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
      conferirUnicos(nova);
      linhas.push(nova);
      return ver(nova);
    },
    async update(args: { where: Linha; data: Linha }) {
      const alvo = linhas.find((l) => combina(l, achatarChave(args.where)));
      if (!alvo) throw new Error("bancoDeProva: update não achou a linha");
      Object.assign(alvo, args.data);
      return ver(alvo);
    },
    async updateMany(args: { where?: Linha; data: Linha }) {
      const alvos = linhas.filter((l) => combina(l, args.where));
      for (const l of alvos) Object.assign(l, args.data);
      return { count: alvos.length };
    },
    async upsert(args: { where: Linha; create: Linha; update: Linha }) {
      const alvo = linhas.find((l) => combina(l, achatarChave(args.where)));
      if (alvo) {
        Object.assign(alvo, args.update);
        return ver(alvo);
      }
      const nova = { ...args.create };
      linhas.push(nova);
      return ver(nova);
    },
    async count(args?: { where?: Linha }) {
      // ⚠️ Filtra sobre a linha ENRIQUECIDA, como `findMany`: um `where` que
      // toca uma relação (`mensagens: { some: … }`) precisa da relação
      // pendurada. Contar sobre a linha crua devolveria um número diferente do
      // que a mesma consulta lista — e um teste verde com a conta errada.
      return linhas.map(ver).filter((l) => combina(l, args?.where)).length;
    },
    async findMany(args?: {
      where?: Linha;
      orderBy?: Record<string, "asc" | "desc">;
      skip?: number;
      take?: number;
    }) {
      // ⚠️ Enriquece ANTES de filtrar: o `where` pode tocar uma relação.
      const achadas = ordenar(
        linhas.map(ver).filter((l) => combina(l, args?.where)),
        args?.orderBy,
      );
      // `select` é ignorado de propósito: devolver a linha inteira nunca faz um
      // teste passar com a consulta errada — o que ele mediria é o `where`.
      const inicio = args?.skip ?? 0;
      return args?.take === undefined ? achadas.slice(inicio) : achadas.slice(inicio, inicio + args.take);
    },
    async findUnique(args: { where: Linha }) {
      return linhas.map(ver).filter((l) => combina(l, achatarChave(args.where)))[0] ?? null;
    },
    async findFirst(args?: { where?: Linha; orderBy?: Record<string, "asc" | "desc"> }) {
      return (
        ordenar(
          linhas.map(ver).filter((l) => combina(l, args?.where)),
          args?.orderBy,
        )[0] ?? null
      );
    },
    async groupBy(args: { by: string[]; where?: Linha; _count?: unknown }) {
      const campo = args.by[0]!;
      const grupos = new Map<unknown, number>();
      for (const l of linhas.map(ver).filter((x) => combina(x, args.where))) {
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
    leadTarefa: dados.leadTarefa ?? [],
    leadQualificacao: dados.leadQualificacao ?? [],
    travaDeAbordagemRitmo: dados.travaDeAbordagemRitmo ?? [],
    travaDeAbordagemEnviada: dados.travaDeAbordagemEnviada ?? [],
    travaDeAbordagemRecusa: dados.travaDeAbordagemRecusa ?? [],
    reabordagemInterruptor: dados.reabordagemInterruptor ?? [],
    reabordagemExecucao: dados.reabordagemExecucao ?? [],
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
      // A conversa, para o filtro `mensagens: { some: { direcao: "SAIDA" } }`
      // da fila da reabordagem ser RESOLVIDO, e não dublado.
      mensagens: t.leadMensagem.filter((m) => m.leadId === l.id),
      // As relações que o `select` da ficha pede aninhadas. `select` é ignorado
      // por este banco, então o que ele NÃO pendurar aqui chega `undefined` —
      // e `undefined` viraria "não medido" num teste que deveria falhar.
      qualificacao: t.leadQualificacao.find((q) => q.leadId === l.id) ?? null,
      atendente: t.internalUser.find((u) => u.id === l.atendenteUserId) ?? null,
    })),
    leadProposta: comoTabela(t.leadProposta),
    leadMensagem: comoTabela(t.leadMensagem, (m) => ({
      ...m,
      autorUser: t.internalUser.find((u) => u.id === m.autorUserId) ?? null,
    })),
    internalUser: comoTabela(t.internalUser),
    leadHandoff: comoTabela(t.leadHandoff),
    siteLeadInteraction: comoTabela(t.siteLeadInteraction),
    leadCompromisso: comoTabela(t.leadCompromisso, (c) => ({
      ...c,
      responsavel: t.internalUser.find((u) => u.id === c.responsavelId) ?? null,
    })),
    leadTarefa: comoTabela(t.leadTarefa, (x) => ({
      ...x,
      responsavel: t.internalUser.find((u) => u.id === x.responsavelId) ?? null,
    })),
    leadQualificacao: comoTabela(t.leadQualificacao, (q) => ({
      ...q,
      // O `where: { lead: <escopo> }` das opções de filtro da qualificação.
      lead: t.siteLead.find((l) => l.id === q.leadId) ?? null,
    })),
    // A trilha carrega a empresa junto, porque `amostraDoHunter` precisa da
    // data de descoberta para medir quanto o Hunter demorou.
    // ⛔ As travas: com unicidade DE VERDADE. Ver o cabeçalho de `comoTabela`.
    travaDeAbordagemRitmo: comoTabela(t.travaDeAbordagemRitmo, undefined, [["telefoneDigits"]]),
    travaDeAbordagemEnviada: comoTabela(t.travaDeAbordagemEnviada, undefined, [
      ["telefoneDigits", "impressao"],
    ]),
    travaDeAbordagemRecusa: comoTabela(t.travaDeAbordagemRecusa),
    reabordagemInterruptor: comoTabela(t.reabordagemInterruptor),
    reabordagemExecucao: comoTabela(t.reabordagemExecucao, undefined, [["loteId", "leadId"]]),
    eventoDaJornada: comoTabela(t.eventoDaJornada, (l) => ({
      ...l,
      empresa: porId.get(l.empresaId as string) ?? null,
    })),
  };
}
