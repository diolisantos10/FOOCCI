/**
 * O CADASTRO FRIO — a planilha entrando pelo navegador.
 *
 * O que estes testes protegem, em uma frase: que o que era lixo na planilha
 * continue sendo lixo aqui, e que o que era lead continue entrando.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: recusando o que não presta E deixando passar o
 * que presta. Um arquivo só com a primeira metade ficaria verde contra uma
 * `lerColagem` que recusasse TODA linha — e uma função assim é indistinguível
 * de uma função quebrada, com o agravante de parecer rigorosa.
 *
 * ── OS TRÊS DEFEITOS QUE DOEM MAIS ──────────────────────────────────────────
 *
 *   · **Duplicar dentro do próprio lote.** A planilha real tem a mesma pessoa
 *     em duas linhas, escrita de dois jeitos. Sem a conferência por dígitos, os
 *     dois viram lead — e dois vendedores ligam para a mesma pessoa no mesmo
 *     dia. A conferência contra o banco NÃO pega isso: nenhum dos dois existia.
 *   · **Aceitar cadastro sem origem.** É a origem que responde depois "com que
 *     base a gente falou com essa pessoa?". `OUTRO` sem descrição é o mesmo que
 *     não perguntar, e por isso é recusa, não aviso.
 *   · **Criar de novo quem já está na base.** Colar a lista da semana passada é
 *     o que qualquer pessoa faz. O certo é não criar nada e DIZER que já
 *     existia — nem recusar o lote, nem duplicar em silêncio.
 */

import { describe, it, expect, vi } from "vitest";
import {
  ORIGENS_FRIAS,
  ehOrigemValida,
  fonteDaOrigem,
  lerColagem,
  problemaNoPedido,
  cadastrarFrios,
} from "./frios";

const AGORA = new Date("2026-08-28T15:00:00Z");

/** O mesmo celular, nos dois jeitos que gente de verdade escreve. */
const ANA = "11 98888-7777";
const ANA_COM_DDI = "+55 (11) 98888-7777";
const ANA_DIGITOS = "5511988887777";

const BIA = "21 97777-6666";
const BIA_DIGITOS = "5521977776666";

// ═══════════════════════════════════════════════════════════════════════════
// A LISTA DE ORIGENS
// ═══════════════════════════════════════════════════════════════════════════

describe("as origens que se pode declarar", () => {
  it("as cinco da lista são aceitas", () => {
    // A metade que PASSA. Sem ela, um `ehOrigemValida` que devolvesse `false`
    // sempre ficaria verde em todo o resto — e nenhum cadastro entraria.
    for (const o of ORIGENS_FRIAS) {
      expect(ehOrigemValida(o.valor), o.valor).toBe(true);
    }
  });

  it("o que não está na lista é recusado — inclusive o vazio", () => {
    // Vazio precisa cair aqui e não em algum `if (!origem)` mais adiante: é o
    // valor que um `<select>` sem escolha manda, e é o caso comum de verdade.
    expect(ehOrigemValida("")).toBe(false);
    expect(ehOrigemValida("AMIGO_DO_PRIMO")).toBe(false);
    expect(ehOrigemValida("indicacao")).toBe(false);
  });

  it("cada origem tem rótulo escrito para gente ler", () => {
    // A lista viaja para a tela pela rota. Um valor sem rótulo viraria um
    // `<option>` em branco no seletor — e ninguém escolhe o que não lê.
    for (const o of ORIGENS_FRIAS) {
      expect(o.rotulo.trim().length, o.valor).toBeGreaterThan(3);
    }
  });

  it("só INDICACAO vira INDICACAO no banco; o resto é MANUAL", () => {
    // O enum do banco é mais grosso que a lista de propósito. O que não pode é
    // uma origem cair num valor de enum que conte outra história — "LISTA
    // comprada" gravada como INDICACAO diria que alguém nos apresentou.
    expect(fonteDaOrigem("INDICACAO")).toBe("INDICACAO");
    expect(fonteDaOrigem("PROSPECCAO")).toBe("MANUAL");
    expect(fonteDaOrigem("EVENTO")).toBe("MANUAL");
    expect(fonteDaOrigem("LISTA")).toBe("MANUAL");
    expect(fonteDaOrigem("OUTRO")).toBe("MANUAL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A COLAGEM
// ═══════════════════════════════════════════════════════════════════════════

describe("o texto colado vira linhas conferidas", () => {
  it("⭐ colagem TABULADA de planilha — o caso que faz esta tela existir", () => {
    // Copiar do Google Sheets ou do Excel cola tabulado. Se só este caso
    // quebrasse, a tela inteira não substituiria a planilha que ela veio
    // aposentar — e o defeito apareceria no primeiro uso real.
    const r = lerColagem(
      `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
      `Bia Ramos\t${BIA}\tCantina da Bia\tRio de Janeiro`,
    );

    expect(r).toHaveLength(2);
    expect(r[0]!.problema).toBeNull();
    expect(r[0]!.numero).toBe(1);
    expect(r[0]!.linha).toEqual({
      nome: "Ana Paula",
      whatsapp: "(11) 98888-7777",
      estabelecimento: "Bar do Zé",
      cidade: "São Paulo",
    });
    expect(r[0]!.digitos).toBe(ANA_DIGITOS);
    expect(r[1]!.numero).toBe(2);
    expect(r[1]!.digitos).toBe(BIA_DIGITOS);
  });

  it("ponto-e-vírgula separa colunas — é o CSV que o Excel brasileiro exporta", () => {
    const r = lerColagem(`Ana Paula;${ANA};Bar do Zé;São Paulo`);

    expect(r[0]!.problema).toBeNull();
    expect(r[0]!.linha).toEqual({
      nome: "Ana Paula",
      whatsapp: "(11) 98888-7777",
      estabelecimento: "Bar do Zé",
      cidade: "São Paulo",
    });
  });

  it("vírgula também separa, quando não há tabulação nem ponto-e-vírgula", () => {
    const r = lerColagem(`Ana Paula,${ANA},Bar do Zé,São Paulo`);

    expect(r[0]!.problema).toBeNull();
    expect(r[0]!.linha!.nome).toBe("Ana Paula");
    expect(r[0]!.linha!.cidade).toBe("São Paulo");
  });

  it("⭐ vírgula DENTRO do nome não vira coluna quando a linha é tabulada", () => {
    // O defeito que a ordem dos separadores impede: "Marina, sócia do bar" é
    // um nome, não duas colunas. Se a vírgula fosse tentada primeiro, o nome
    // viraria "Marina" e o WhatsApp viraria " sócia do bar" — um lead com
    // telefone inventado, que é pior que um lead recusado.
    const r = lerColagem(`Marina, sócia do bar\t${ANA}\tBar do Zé\tSão Paulo`);

    expect(r[0]!.problema).toBeNull();
    expect(r[0]!.linha!.nome).toBe("Marina, sócia do bar");
    expect(r[0]!.linha!.whatsapp).toBe("(11) 98888-7777");
  });

  it("linha sem nome é recusada — telefone sem dono não se atende", () => {
    const r = lerColagem(`;${ANA};Bar do Zé;São Paulo`);

    expect(r[0]!.problema).toBe("semNome");
    expect(r[0]!.linha).toBeNull();
    // O texto original volta junto: é com ele que a pessoa acha a linha na
    // planilha de onde copiou.
    expect(r[0]!.bruto).toContain(ANA);

    expect(lerColagem(`,${ANA},Bar do Zé,São Paulo`)[0]!.problema).toBe("semNome");
  });

  it("na colagem TABULADA a coluna vazia do começo some, e a recusa muda de nome", () => {
    /* ⚠️ O LIMITE HONESTO DE `lerColagem`, registrado aqui em vez de escondido.
     *
     * Cada linha passa por `.trim()` antes de ser dividida — é o que descarta o
     * `\r` do Windows e a linha só de espaços. Só que a tabulação TAMBÉM é
     * espaço: numa linha tabulada, a coluna vazia do começo desaparece junto, e
     * as colunas deslizam uma casa para a esquerda.
     *
     * A consequência real: a linha continua RECUSADA — nenhum dado torto entra
     * na base —, mas o motivo que a tela mostra é "whatsapp inválido" em vez de
     * "sem nome", porque quem foi lido como nome foi o telefone.
     *
     * Fica de pé como está por dois motivos: nada errado é gravado, e o mesmo
     * `.trim()` é o que faz a planilha com coluna de numeração em branco à
     * esquerda ser lida CERTO (o teste logo abaixo). Trocar a leitura para
     * acertar o rótulo desta recusa quebraria aquele caso, que é mais comum.
     */
    const r = lerColagem(`\t${ANA}\tBar do Zé\tSão Paulo`);

    expect(r[0]!.problema).toBe("whatsappInvalido");
    expect(r[0]!.linha).toBeNull();
  });

  it("planilha com uma coluna vazia à esquerda continua sendo lida certo", () => {
    // A metade que passa, e a razão de o `.trim()` da linha ficar onde está:
    // exportação de planilha traz coluna de numeração ou de marcação em branco
    // na frente o tempo todo.
    const r = lerColagem(`\tAna Paula\t${ANA}\tBar do Zé\tSão Paulo`);

    expect(r[0]!.problema).toBeNull();
    expect(r[0]!.linha!.nome).toBe("Ana Paula");
    expect(r[0]!.linha!.whatsapp).toBe("(11) 98888-7777");
  });

  it("linha sem whatsapp é recusada — é o único jeito de falar com ela", () => {
    const r = lerColagem("Ana Paula");

    expect(r[0]!.problema).toBe("semWhatsapp");
    expect(r[0]!.digitos).toBeNull();
  });

  it("whatsapp que nenhum telefone brasileiro tem é recusado", () => {
    // Curto demais e DDD que a Anatel nunca atribuiu. Os dois entram numa
    // planilha por erro de digitação, e os dois produziriam um lead que ninguém
    // consegue chamar — que é o pior tipo de lead: ele ocupa fila.
    const curto = lerColagem("Carlos Dias\t9999\tBar do Carlos\tSão Paulo");
    expect(curto[0]!.problema).toBe("whatsappInvalido");
    expect(curto[0]!.digitos).toBeNull();

    const dddQueNaoExiste = lerColagem("Carlos Dias\t(20) 98888-7777\tBar\tSão Paulo");
    expect(dddQueNaoExiste[0]!.problema).toBe("whatsappInvalido");
  });

  it("⭐ a MESMA pessoa duas vezes no lote: a primeira entra, a segunda é recusada", () => {
    // O defeito mais caro deste arquivo, e o que a conferência contra o banco
    // NÃO pega: nenhum dos dois existia antes, então os dois seriam criados.
    // Repare que os dois números estão escritos de jeitos diferentes — a
    // comparação é por dígitos com DDI, não por texto.
    const r = lerColagem(
      `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
      `Ana P.\t${ANA_COM_DDI}\tBar do Zé\tSão Paulo`,
    );

    expect(r[0]!.problema).toBeNull();
    expect(r[1]!.problema).toBe("repetidaNoLote");
    // Os dígitos da repetida voltam mesmo na recusa: é o que permite à tela
    // dizer QUAL número está duplicado, em vez de só "linha 2 repetida".
    expect(r[1]!.digitos).toBe(ANA_DIGITOS);
  });

  it("duas pessoas diferentes NÃO são confundidas por serem parecidas", () => {
    // A metade que passa da regra acima. Sem ela, um "vistos" que marcasse
    // qualquer coisa deixaria passar só a primeira linha de todo lote.
    const r = lerColagem(
      `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
      `Ana Paula\t${BIA}\tBar do Zé\tSão Paulo`,
    );

    expect(r[0]!.problema).toBeNull();
    expect(r[1]!.problema).toBeNull();
  });

  it("colunas a mais são ignoradas, e a linha entra assim mesmo", () => {
    // Planilha de verdade tem coluna de anotação no fim. Derrubar a linha por
    // causa dela jogaria fora exatamente as listas mais trabalhadas.
    const r = lerColagem(
      `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\tligar depois das 15h\tR$ 4 mil/mês`,
    );

    expect(r[0]!.problema).toBeNull();
    expect(r[0]!.linha).toEqual({
      nome: "Ana Paula",
      whatsapp: "(11) 98888-7777",
      estabelecimento: "Bar do Zé",
      cidade: "São Paulo",
    });
  });

  it("colunas a menos não quebram: estabelecimento e cidade viram nulo", () => {
    // Nome e WhatsApp bastam. Um vazio precisa virar `null` e não `""` — string
    // vazia gravada no banco vira um travessão na ficha que a pessoa lê como
    // "alguém apagou", e não como "ninguém preencheu".
    const r = lerColagem(`Ana Paula\t${ANA}`);

    expect(r[0]!.problema).toBeNull();
    expect(r[0]!.linha!.estabelecimento).toBeNull();
    expect(r[0]!.linha!.cidade).toBeNull();
  });

  it("linhas em branco e espaços soltos não viram linha nenhuma", () => {
    // Toda colagem termina com uma quebra sobrando, e planilha copiada traz
    // linha vazia no meio. Cada uma delas viraria uma recusa "sem nome" na
    // tela — e uma tela que reclama de dez linhas que a pessoa não digitou
    // ensina a ignorar a lista de recusas inteira.
    const r = lerColagem(
      `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
      `\n` +
      `   \n` +
      `Bia Ramos\t${BIA}\tCantina da Bia\tRio de Janeiro\n`,
    );

    expect(r).toHaveLength(2);
    // ⚠️ 1 e 4, não 1 e 2. As vazias não viram linha, mas **contam na
    // numeração**, porque o número serve para a pessoa achar a linha no
    // textarea dela. Este teste afirmava [1, 2] até 28/08/2026, e a
    // expectativa é que estava errada: com ela, a recusa da segunda linha boa
    // mandaria a pessoa para a linha 2, que está em branco.
    expect(r.map((l) => l.numero)).toEqual([1, 4]);
    expect(r.every((l) => l.problema === null)).toBe(true);
  });

  it("texto vazio devolve lista vazia — e não uma linha de erro", () => {
    expect(lerColagem("")).toEqual([]);
    expect(lerColagem("\n\n   \n")).toEqual([]);
  });

  it("espaço em volta das colunas é aparado", () => {
    // Copiar de planilha traz espaço junto o tempo todo. " Ana Paula " gravado
    // assim vira um nome que não casa com nenhuma busca depois.
    const r = lerColagem(`  Ana Paula \t ${ANA} \t Bar do Zé \t São Paulo `);

    expect(r[0]!.linha!.nome).toBe("Ana Paula");
    expect(r[0]!.linha!.estabelecimento).toBe("Bar do Zé");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A CONFERÊNCIA DO PEDIDO, ANTES DO BANCO
// ═══════════════════════════════════════════════════════════════════════════

const UMA_LINHA_BOA = () => lerColagem(`Ana Paula\t${ANA}\tBar do Zé\tSão Paulo`);
const SO_LINHAS_RUINS = () => lerColagem("Ana Paula\nCarlos Dias\t9999");

describe("o pedido é conferido antes de o banco ser tocado", () => {
  it("pedido completo passa", () => {
    // A metade que PASSA. Sem ela, um `problemaNoPedido` que recusasse tudo
    // ficaria verde em todos os casos abaixo, e nenhum lead entraria nunca.
    expect(
      problemaNoPedido({ linhas: UMA_LINHA_BOA(), origem: "PROSPECCAO" }),
    ).toBeNull();
  });

  it("origem fora da lista é recusada", () => {
    expect(
      problemaNoPedido({ linhas: UMA_LINHA_BOA(), origem: "AMIGO_DO_PRIMO" }),
    ).toBe("origemInvalida");
  });

  it("origem em branco é recusada — é o que um seletor sem escolha manda", () => {
    expect(problemaNoPedido({ linhas: UMA_LINHA_BOA(), origem: "" })).toBe("origemInvalida");
  });

  it("⭐ OUTRO sem descrição é recusado — seria o mesmo que não perguntar", () => {
    // A porta que a obrigatoriedade de origem fecha. Se "OUTRO" pudesse entrar
    // vazio, ele viraria a escolha padrão de quem tem pressa, e a base voltaria
    // a ser o que a planilha era: contatos sem base legal declarada.
    expect(problemaNoPedido({ linhas: UMA_LINHA_BOA(), origem: "OUTRO" }))
      .toBe("origemOutroSemDescricao");

    // Espaço em branco não é descrição.
    expect(
      problemaNoPedido({
        linhas: UMA_LINHA_BOA(),
        origem: "OUTRO",
        descricaoDaOrigem: "   ",
      }),
    ).toBe("origemOutroSemDescricao");

    expect(
      problemaNoPedido({ linhas: UMA_LINHA_BOA(), origem: "OUTRO", descricaoDaOrigem: null }),
    ).toBe("origemOutroSemDescricao");
  });

  it("⭐ OUTRO COM descrição passa — a resposta honesta e vaga é aceita", () => {
    // A outra metade, e a razão de "OUTRO" existir: obrigar a mentir numa lista
    // curta é pior que aceitar uma resposta escrita à mão.
    expect(
      problemaNoPedido({
        linhas: UMA_LINHA_BOA(),
        origem: "OUTRO",
        descricaoDaOrigem: "grupo de donos de bar no WhatsApp",
      }),
    ).toBeNull();
  });

  it("descrição nas outras origens é livre — não obriga e não atrapalha", () => {
    expect(
      problemaNoPedido({ linhas: UMA_LINHA_BOA(), origem: "EVENTO" }),
    ).toBeNull();
    expect(
      problemaNoPedido({
        linhas: UMA_LINHA_BOA(),
        origem: "EVENTO",
        descricaoDaOrigem: "Feira do Empreendedor 2026",
      }),
    ).toBeNull();
  });

  it("lote sem NENHUMA linha boa é recusado inteiro", () => {
    // Sem isto, a tela diria "0 criados" e ficaria calada sobre o motivo. A
    // recusa nomeada é o que permite dizer "nenhuma linha desta colagem serve"
    // em vez de fingir que o cadastro foi feito.
    expect(problemaNoPedido({ linhas: SO_LINHAS_RUINS(), origem: "PROSPECCAO" }))
      .toBe("semLinhasValidas");
    expect(problemaNoPedido({ linhas: [], origem: "PROSPECCAO" }))
      .toBe("semLinhasValidas");
  });

  it("uma linha boa no meio de linhas ruins basta para o lote passar", () => {
    // A metade que passa da regra acima. Recusar o lote inteiro por causa de
    // uma linha torta obrigaria a pessoa a limpar a planilha na mão — que é
    // exatamente o trabalho que esta tela veio eliminar.
    const misto = lerColagem(
      `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
      `Carlos Dias\t9999\tBar do Carlos\tSão Paulo`,
    );

    expect(problemaNoPedido({ linhas: misto, origem: "LISTA" })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A GRAVAÇÃO, COM UM BANCO DE MENTIRA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param jaNaBase os `whatsappDigits` que a consulta vai dizer que já existem.
 */
function bancoFalso(jaNaBase: string[] = []) {
  let n = 0;
  return {
    siteLead: {
      findMany: vi.fn().mockResolvedValue(jaNaBase.map((whatsappDigits) => ({ whatsappDigits }))),
      create: vi.fn().mockImplementation(async () => ({ id: `lead-${++n}` })),
    },
    siteLeadInteraction: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

const AUTOR = { autorUserId: "u-sdr", autorNome: "Marina" };

describe("a gravação dos leads frios", () => {
  it("grava o lead com o que veio da linha, e com a origem em texto", async () => {
    // A metade que PASSA, e a mais importante do arquivo: sem ela, tudo abaixo
    // ficaria verde contra um `cadastrarFrios` que não gravasse nada.
    const db = bancoFalso();
    const r = await cadastrarFrios(
      db as never,
      { linhas: UMA_LINHA_BOA(), origem: "PROSPECCAO", ...AUTOR },
      AGORA,
    );

    expect(r.criados).toBe(1);
    expect(r.jaExistiam).toBe(0);
    expect(r.recusadas).toEqual([]);

    const gravado = db.siteLead.create.mock.calls[0]![0].data;
    expect(gravado.nome).toBe("Ana Paula");
    expect(gravado.whatsapp).toBe("(11) 98888-7777");
    expect(gravado.whatsappDigits).toBe(ANA_DIGITOS);
    expect(gravado.restaurante).toBe("Bar do Zé");
    expect(gravado.cidade).toBe("São Paulo");
    expect(gravado.origem).toBe("PROSPECCAO");
    expect(gravado.fonte).toBe("MANUAL");
    expect(gravado.createdAt).toBe(AGORA);
    // O código curto é o elo entre o cadastro e o "oi" que chega no WhatsApp.
    expect(typeof gravado.codigo).toBe("string");
    expect(gravado.codigo.length).toBeGreaterThan(0);
  });

  it("⭐ a interação CAPTURA é gravada, e ela CARREGA a origem", async () => {
    // Sem esta linha do tempo, a ficha do lead abre sem dizer como ele chegou
    // ali — e a pergunta "com que base a gente falou com essa pessoa?" chega
    // junto com a reclamação, quando já não dá para reconstruir.
    const db = bancoFalso();
    await cadastrarFrios(
      db as never,
      {
        linhas: UMA_LINHA_BOA(),
        origem: "LISTA",
        descricaoDaOrigem: "lista da associação de bares",
        ...AUTOR,
      },
      AGORA,
    );

    expect(db.siteLeadInteraction.create).toHaveBeenCalledTimes(1);
    const interacao = db.siteLeadInteraction.create.mock.calls[0]![0].data;
    expect(interacao.tipo).toBe("CAPTURA");
    expect(interacao.leadId).toBe("lead-1");
    expect(interacao.actor).toBe("Marina");
    expect(interacao.interna).toBe(true);
    expect(interacao.createdAt).toBe(AGORA);
    // A origem escrita por extenso, e não só o código do enum.
    expect(interacao.nota).toContain("LISTA");
    expect(interacao.nota).toContain("lista da associação de bares");

    // E a mesma frase vai para o campo `origem` do lead — é lá que ela é
    // consultada depois, sem precisar caçar a interação.
    const gravado = db.siteLead.create.mock.calls[0]![0].data;
    expect(gravado.origem).toBe("LISTA: lista da associação de bares");
    expect(gravado.fonte).toBe("MANUAL");
  });

  it("⭐ quem JÁ EXISTE pelo mesmo whatsapp não é criado de novo — volta em jaExistiam", async () => {
    // Colar de novo a lista da semana passada é o que qualquer pessoa faz. Sem
    // esta conferência, a base dobra e dois vendedores ligam para a mesma
    // pessoa no mesmo dia. `whatsappDigits` NÃO é único no banco: se a
    // conferência não estiver aqui, não está em lugar nenhum.
    const db = bancoFalso([ANA_DIGITOS]);
    const r = await cadastrarFrios(
      db as never,
      { linhas: UMA_LINHA_BOA(), origem: "PROSPECCAO", ...AUTOR },
      AGORA,
    );

    expect(r.criados).toBe(0);
    expect(r.jaExistiam).toBe(1);
    expect(db.siteLead.create).not.toHaveBeenCalled();
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });

  it("⭐ no mesmo lote: o que já existe é pulado e o novo é criado", async () => {
    // A metade que passa da regra acima, e o caso real de quem recola a lista
    // com três nomes novos no fim. Recusar o lote inteiro seria tão errado
    // quanto duplicar: o certo é gravar o que falta e dizer a conta.
    const db = bancoFalso([ANA_DIGITOS]);
    const r = await cadastrarFrios(
      db as never,
      {
        linhas: lerColagem(
          `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
          `Bia Ramos\t${BIA}\tCantina da Bia\tRio de Janeiro`,
        ),
        origem: "PROSPECCAO",
        ...AUTOR,
      },
      AGORA,
    );

    expect(r.criados).toBe(1);
    expect(r.jaExistiam).toBe(1);
    expect(db.siteLead.create).toHaveBeenCalledTimes(1);
    expect(db.siteLead.create.mock.calls[0]![0].data.whatsappDigits).toBe(BIA_DIGITOS);
  });

  it("as recusadas voltam com o número da linha e o motivo", async () => {
    // A conta que a tela mostra tem três parcelas, e a terceira é a que ensina
    // a pessoa a arrumar a planilha. Sem ela, "12 criados de 20 colados" deixa
    // oito sumidas sem explicação.
    const db = bancoFalso();
    const r = await cadastrarFrios(
      db as never,
      {
        linhas: lerColagem(
          `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
          `Carlos Dias\t9999\tBar do Carlos\tSão Paulo\n` +
          `;${BIA};Cantina;Rio de Janeiro`,
        ),
        origem: "EVENTO",
        ...AUTOR,
      },
      AGORA,
    );

    expect(r.criados).toBe(1);
    expect(r.recusadas).toHaveLength(2);
    expect(r.recusadas.map((l) => [l.numero, l.problema])).toEqual([
      [2, "whatsappInvalido"],
      [3, "semNome"],
    ]);
  });

  it("a repetida do lote não é criada duas vezes", async () => {
    // O fecho da trava de `lerColagem`, provado no lado do banco: mesmo com a
    // conferência contra a base dizendo "não existe ninguém", só UM lead nasce.
    const db = bancoFalso();
    const r = await cadastrarFrios(
      db as never,
      {
        linhas: lerColagem(
          `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
          `Ana P.\t${ANA_COM_DDI}\tBar do Zé\tSão Paulo`,
        ),
        origem: "INDICACAO",
        ...AUTOR,
      },
      AGORA,
    );

    expect(r.criados).toBe(1);
    expect(db.siteLead.create).toHaveBeenCalledTimes(1);
    // Repetida no lote é RECUSA, e não "já existia": são coisas diferentes e a
    // tela precisa dizer qual das duas aconteceu.
    expect(r.jaExistiam).toBe(0);
    expect(r.recusadas.map((l) => l.problema)).toEqual(["repetidaNoLote"]);
  });

  it("indicação grava a fonte INDICACAO — e só ela", async () => {
    const db = bancoFalso();
    await cadastrarFrios(
      db as never,
      { linhas: UMA_LINHA_BOA(), origem: "INDICACAO", ...AUTOR },
      AGORA,
    );

    expect(db.siteLead.create.mock.calls[0]![0].data.fonte).toBe("INDICACAO");
  });

  it("lote sem nenhuma linha boa NÃO consulta e NÃO grava nada", async () => {
    // Uma consulta com `in: []` e um laço vazio custam pouco, mas abrem
    // transação e sujam a trilha do banco por um pedido que já se sabia morto.
    const db = bancoFalso();
    const r = await cadastrarFrios(
      db as never,
      { linhas: SO_LINHAS_RUINS(), origem: "PROSPECCAO", ...AUTOR },
      AGORA,
    );

    expect(r).toEqual({ criados: 0, jaExistiam: 0, recusadas: expect.any(Array) });
    expect(r.recusadas).toHaveLength(2);
    expect(db.siteLead.findMany).not.toHaveBeenCalled();
    expect(db.siteLead.create).not.toHaveBeenCalled();
  });

  it("a consulta de duplicata pergunta pelos dígitos das linhas boas, e só por eles", async () => {
    const db = bancoFalso();
    await cadastrarFrios(
      db as never,
      {
        linhas: lerColagem(
          `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
          `Carlos Dias\t9999\tBar do Carlos\tSão Paulo\n` +
          `Bia Ramos\t${BIA}\tCantina da Bia\tRio de Janeiro`,
        ),
        origem: "PROSPECCAO",
        ...AUTOR,
      },
      AGORA,
    );

    // Uma consulta só para o lote inteiro — não uma por linha.
    expect(db.siteLead.findMany).toHaveBeenCalledTimes(1);
    expect(db.siteLead.findMany.mock.calls[0]![0].where.whatsappDigits.in)
      .toEqual([ANA_DIGITOS, BIA_DIGITOS]);
  });

  it("cada lead criado ganha um código próprio", async () => {
    // Dois leads com o mesmo código quebrariam o elo entre o "oi" do WhatsApp
    // e a linha certa — e o `codigo` é UNIQUE no banco: o segundo `create`
    // estouraria e derrubaria o lote no meio.
    const db = bancoFalso();
    await cadastrarFrios(
      db as never,
      {
        linhas: lerColagem(
          `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
          `Bia Ramos\t${BIA}\tCantina da Bia\tRio de Janeiro`,
        ),
        origem: "PROSPECCAO",
        ...AUTOR,
      },
      AGORA,
    );

    const codigos = db.siteLead.create.mock.calls.map((c) => c[0].data.codigo);
    expect(new Set(codigos).size).toBe(2);
  });

  it("⛔ cadastrar não manda mensagem: o banco só recebe lead e interação", async () => {
    // A regra em código, e não em recado: esta tela alimenta a base, e quem
    // fala com o lead é o atendimento. Um envio disparado no cadastro seria uma
    // abordagem fria automática que ninguém aprovou.
    const db = bancoFalso();
    await cadastrarFrios(
      db as never,
      { linhas: UMA_LINHA_BOA(), origem: "PROSPECCAO", ...AUTOR },
      AGORA,
    );

    expect(Object.keys(db)).toEqual(["siteLead", "siteLeadInteraction"]);
  });
});

describe("⭐ o número da linha aponta para o que a pessoa vê", () => {
  it("⭐ linha em branco no meio NÃO desloca a numeração", () => {
    /*
      Achado em 28/08/2026, depois de a funcionalidade estar pronta: o número
      era o índice DEPOIS de descartar as vazias. Numa colagem com uma linha em
      branco no meio — que toda planilha tem — a recusa dizia "linha 3" e a
      pessoa ia procurar o erro na linha 3 do textarea, onde não há erro nenhum.

      Mensagem de erro que manda a pessoa para o lugar errado é pior que
      mensagem sem número.
    */
    const r = lerColagem(
      [
        "Marina\t11988887777\tBar do Zé\tSP", // linha 1
        "", //                                   linha 2 — em branco
        "Sem telefone", //                       linha 3 — a que falha
      ].join("\n"),
    );

    expect(r).toHaveLength(2);
    expect(r[1]!.problema).toBe("semWhatsapp");
    expect(r[1]!.numero, "a recusa apontou para a linha errada").toBe(3);
  });

  it("⭐ e sem linhas em branco a contagem continua igual", () => {
    // A metade que passa: a correção não podia deslocar o caso comum.
    const r = lerColagem("Marina\t11988887777\nJoão\t11977776666");

    expect(r[0]!.numero).toBe(1);
    expect(r[1]!.numero).toBe(2);
  });
});
