/**
 * piloto-dioli — a esteira da Dioli ponta a ponta, com a Foocci de cliente.
 *
 *   SDR → plano do PM → portão de direção → produção → aviso
 *
 * Não é teste unitário: é o passeio inteiro pelas peças de verdade, na ordem
 * real, para descobrir onde a corrente arrebenta. Foi assim que apareceram as
 * duas quebras de 30/07 — a Oficina não tinha manual de "agencia", e o caminho
 * sem manual jogava fora as proibições que vinham do briefing.
 *
 * IA: a produção usa a IA de verdade quando há chave configurada. Sem chave,
 * a etapa é marcada como SEM IA e o passeio continua — o valor de cada etapa
 * determinística (trava do SDR, datas do plano, juiz do comando) não depende
 * de a IA estar ligada, e é justamente isso que se quer provar.
 *
 * Uso:
 *   npm run dioli:piloto
 *   npm run dioli:piloto -- --semanas=8
 *
 * Sai com código 1 se algum portão obrigatório reprovar.
 */

import {
  avaliarSondagem,
  briefingFoocci,
  registeredDominios,
  RESPOSTAS,
  rodarEsteira,
  atender,
  gerarPlano,
  renderizarPlano,
  selectEngine,
  callStructuredJson,
  snapshotDoBriefing,
  snapshotParaVerdade,
} from "./piloto-dioli.imports";

function arg(nome: string): string | undefined {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado?.slice(nome.length + 3).trim() || undefined;
}

const SEMANAS = Number(arg("semanas") ?? 4);

const falhas: string[] = [];

function etapa(n: number, titulo: string): void {
  console.log(`\n${"═".repeat(78)}\nETAPA ${n} — ${titulo}\n${"═".repeat(78)}`);
}
function ok(msg: string): void { console.log(`  ✓ ${msg}`); }
function erro(msg: string): void { console.log(`  ✗ ${msg}`); falhas.push(msg); }
function nota(msg: string): void { console.log(`  · ${msg}`); }

async function main(): Promise<void> {
  console.log("PILOTO DIOLI — esteira ponta a ponta, cliente: Foocci\n");

  // ── 1. SDR ────────────────────────────────────────────────────────────────
  etapa(1, "SDR — a sondagem fecha?");
  const estado = briefingFoocci();
  const avaliacao = avaliarSondagem(estado);

  console.log(`  cobertura : ${avaliacao.cobertura}% do essencial`);
  console.log(`  veredito  : ${avaliacao.veredito}`);
  if (avaliacao.podePropor) ok("o bastão pode passar para o PM");
  else erro(`SDR travou: ${avaliacao.motivo}`);

  const semPergunta = avaliacao.naoPerguntado.filter((p) => p.essencial);
  if (semPergunta.length === 0) ok("nenhum essencial ficou sem PERGUNTAR");
  else erro(`${semPergunta.length} essencial(is) nunca perguntado(s)`);
  nota(`${avaliacao.aguardandoCliente.length} resposta(s) pendente(s) — vão declaradas`);

  // ── 2. PM ─────────────────────────────────────────────────────────────────
  etapa(2, "PM — o plano tem data e dono do material?");
  const plano = gerarPlano({ estado, semanas: SEMANAS });

  if (!plano.liberado) {
    erro(`plano não liberado: ${plano.motivo}`);
  } else {
    ok(`calendário de ${plano.inicio} a ${plano.fim} com ${plano.linhas.length} peça(s)`);
    const semData = plano.linhas.filter((l) => !/^\d{4}-\d{2}-\d{2}$/.test(l.data));
    if (semData.length === 0) ok("toda linha nasceu com data e dia da semana");
    else erro(`${semData.length} linha(s) sem data`);

    const semDono = plano.linhas.filter((l) => l.quemTrazOMaterial.includes("NÃO DEFINIDO"));
    if (semDono.length === 0) ok("toda peça tem dono do material declarado");
    else erro(`${semDono.length} peça(s) prometendo material sem dono`);

    for (const a of plano.avisos) nota(a);
  }

  // ── 3. Direção ────────────────────────────────────────────────────────────
  etapa(3, "Direção — o portão do aceite");
  if (!plano.liberado) {
    erro("nada para aprovar: o plano não saiu");
  } else if (plano.pendenciasDeclaradas.length > 0 && plano.avisos.length === 0) {
    erro("há pendência do cliente e nenhum aviso — a proposta pareceria mais fechada do que é");
  } else {
    ok("proposta apta ao aceite, com as pendências impressas no rodapé");
    nota(`aceite simulado — a esteira segue para produção da 1ª peça`);
  }

  // ── 4. Produção ───────────────────────────────────────────────────────────
  etapa(4, "Produção — a Oficina escreve a peça");

  if (!registeredDominios().includes("agencia")) {
    erro('a Oficina não tem manual para o domínio "agencia" — peça sai sem régua e sem juiz');
  } else {
    ok('manual do domínio "agencia" registrado');
  }

  const primeira = plano.linhas[0];
  if (!primeira) {
    erro("o calendário não produziu nenhuma peça para trabalhar");
  } else {
    nota(`peça escolhida: ${primeira.nome} em ${primeira.data} (${primeira.diaDaSemana})`);

    const intencao =
      `${primeira.nome} para a Foocci no lançamento comercial: ` +
      `sistema de vendas, relacionamento e fidelização para restaurantes`;

    // A porta lê o meio e devolve o comando pronto.
    const porta = await atender({ texto: intencao, agentId: "social" });
    ok(`porta leu o meio como "${porta.meio}" (${porta.leitura})`);

    // As proibições do CLIENTE vêm do briefing — é isto que precisa chegar na peça.
    const proibicoesDoCliente = String(RESPOSTAS.proibicoes?.valor ?? "")
      .split(/\.\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    // `selectEngine` nunca lança: sem chave configurada ele devolve o motor
    // MOCK, que recusa a chamada. Perguntar pelo provider é o único jeito
    // honesto de saber se existe IA de verdade nesta máquina.
    const selection = (() => {
      try { return selectEngine("social"); } catch { return null; }
    })();
    const temIA = selection !== null && selection.provider !== "MOCK";
    nota(temIA ? `IA disponível: ${selection!.provider}` : "sem IA nesta máquina (motor MOCK — nenhuma chave configurada)");

    // A verdade do cliente de agência É o briefing. Em produção o adapter lê a
    // entrevista do banco; aqui monta-se do briefing em mãos, para a corrente
    // rodar inteira mesmo sem Postgres. É a mesma tradução, chamada direto.
    const snapshot = snapshotDoBriefing("foocci", estado);
    const verdadeDoBriefing = {
      verdade:    snapshotParaVerdade(snapshot.truthSources as Record<string, unknown>),
      faltando:   snapshot.missingContext,
      completude: snapshot.completenessScore ?? 0,
    };
    const chaves = Object.keys(verdadeDoBriefing.verdade).length;
    if (chaves > 0) ok(`o briefing virou verdade: ${chaves} chave(s), completude ${verdadeDoBriefing.completude}`);
    else erro("o briefing não produziu verdade nenhuma — a peça sairia genérica");

    const esteira = await rodarEsteira({
      verdade: verdadeDoBriefing,
      pedido: { agentId: "social", medium: porta.meio === "imagem" ? "imagem" : "texto", intencao, dominio: "agencia" },
      businessType: "AGENCY",
      businessId: "foocci",
      rascunho: {
        objetivo: intencao,
        publico:  String(RESPOSTAS.publico?.valor ?? ""),
        tom:      "humano e comercial, simples e direto, premium e acolhedor",
        proibicoes: proibicoesDoCliente,
      },
      modo: "sombra",
      ...(temIA
        ? {
            produzir: async (comando: string) =>
              callStructuredJson({
                selection: selection!,
                systemPrompt: "Você escreve a peça pedida. Responda APENAS o texto final, sem comentário.",
                userContent: comando,
                temperature: 0.7,
                maxTokens: 400,
              }),
          }
        : {}),
    });

    console.log(`\n  --- ficha ---`);
    console.log(`  objetivo   : ${esteira.ficha.objetivo.slice(0, 90)}`);
    console.log(`  proibições : ${esteira.ficha.proibicoes.length}`);
    console.log(`  verdade    : ${Object.keys(esteira.ficha.verdade).length} chave(s), completude ${esteira.completude}`);
    if (esteira.faltando.length > 0) nota(`faltando: ${esteira.faltando.slice(0, 2).join(" | ")}`);

    if (esteira.ficha.proibicoes.length > 0) {
      ok(`${esteira.ficha.proibicoes.length} proibição(ões) chegaram na ficha`);
    } else {
      erro("a ficha saiu SEM proibição nenhuma — o juiz não tem contra o que conferir");
    }

    const doCliente = proibicoesDoCliente.filter((p) => esteira.ficha.proibicoes.includes(p));
    if (doCliente.length === proibicoesDoCliente.length && proibicoesDoCliente.length > 0) {
      ok("as proibições do BRIEFING sobreviveram até a ficha");
    } else {
      erro(`só ${doCliente.length}/${proibicoesDoCliente.length} proibições do briefing chegaram`);
    }

    console.log(`\n  --- juiz do comando ---`);
    console.log(`  aprovado: ${esteira.notaComando.aprovado}  ·  ${esteira.motivoFinal}`);

    if (temIA) {
      if (esteira.saida) {
        ok("a IA produziu a peça");
        console.log(`\n  --- peça ---\n${esteira.saida.split("\n").map((l) => `  ${l}`).join("\n")}`);
        console.log(`\n  juiz do resultado: ${esteira.notaResultado?.aprovado ? "aprovado" : "reprovado"}`);
      } else {
        erro(`havia motor de IA mas nenhuma peça saiu: ${esteira.motivoFinal}`);
      }
    } else {
      nota("SEM IA nesta máquina (nenhuma chave configurada) — a produção parou no comando forjado");
      nota("o comando abaixo é o que iria para a IA:");
      console.log(esteira.comando.split("\n").map((l) => `    ${l}`).join("\n"));
    }
  }

  // ── 5. Aviso ──────────────────────────────────────────────────────────────
  etapa(5, "Aviso — o que o cliente recebe");
  if (plano.liberado) {
    console.log(renderizarPlano(plano).split("\n").slice(0, 12).map((l) => `  ${l}`).join("\n"));
    console.log("  …");
    ok("o aviso sai com o calendário e as pendências declaradas");
  } else {
    erro("sem plano, não há aviso");
  }

  // ── Placar ────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(78)}`);
  if (falhas.length === 0) {
    console.log("PILOTO OK — a corrente inteira aguentou.");
  } else {
    console.log(`PILOTO COM ${falhas.length} QUEBRA(S):`);
    for (const f of falhas) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
  console.log("═".repeat(78));
}

main()
  .catch((err) => {
    console.error("✗ o piloto morreu:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
