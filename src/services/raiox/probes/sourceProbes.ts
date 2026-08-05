/**
 * Raio-X — as cinco sondas dos padrões nomeados (puras).
 *
 * Cada uma lê o bloco `source` da amostra e traduz uma lista técnica em achado
 * de negócio, com arquivo:linha. Nenhuma delas inventa gravidade: a régua está
 * escrita no código, ao lado do achado.
 *
 * Aviso que atravessa as cinco: são HEURÍSTICAS calibradas contra este
 * repositório. Elas devolvem CANDIDATOS para leitura humana. O texto de cada
 * achado diz isso — um raio-x que se vende como veredito é o mesmo defeito que
 * ele foi construído para caçar.
 */

import { requireBlock, type RaioXFinding, type RaioXProbe, type RaioXSample } from "../types";

const N = (n: number) => n.toLocaleString("pt-BR");

// ─────────────────────────────────────────────────────────────────────────────
// Padrão 5 — porta aberta para a internet
// ─────────────────────────────────────────────────────────────────────────────

export const portaAbertaProbe: RaioXProbe = {
  id: "porta-aberta",
  area: "IA",
  question: "existe rota pública que gasta dinheiro por chamada sem nenhuma prova de quem chamou?",
  run(sample: RaioXSample): RaioXFinding[] {
    const s = requireBlock(sample.source, "varredura do código-fonte");
    const paid = s.publicPaidRoutes;
    const desprotegidas = paid.filter((r) => r.guards.length === 0);
    // "Escopo pelo slug" identifica a LOJA, não o visitante: qualquer pessoa na
    // internet pode gastar. É o desenho do produto (a loja é aberta), mas é
    // exatamente o lugar onde a fatura cresce sem ninguém quebrar nada.
    const soSlug = paid.filter(
      (r) => r.guards.length > 0 && r.guards.every((g) => g.includes("slug público")),
    );

    const metrics = {
      rotasPublicas: s.publicRoutesTotal,
      rotasPublicasComCustoPago: paid.length,
      semNenhumaProva: desprotegidas.length,
      apenasEscopoDeLoja: soSlug.length,
    };

    if (desprotegidas.length > 0) {
      return [
        {
          probeId: "porta-aberta",
          area: "IA",
          status: "FAIL",
          severity: "P0",
          title: "Rota aberta na internet com a chave paga atrás",
          summary:
            `${N(desprotegidas.length)} rota(s) pública(s) alcançam uma chamada paga (IA, imagem ou áudio) ` +
            `sem NENHUMA prova de quem chamou. Cada requisição de qualquer pessoa vira fatura.`,
          evidence: desprotegidas.map(
            (r) => `${r.route} (${r.file}) → custo em ${r.pathToCost[r.pathToCost.length - 1]}`,
          ),
          metrics,
          recommendation:
            "Fechar com autenticação, segredo ou assinatura — e, até fechar, limitar por IP. Confirmar no código antes de agir: a varredura lê imports, não executa a rota.",
        },
      ];
    }

    if (soSlug.length > 0) {
      return [
        {
          probeId: "porta-aberta",
          area: "IA",
          status: "WARNING",
          severity: "P2",
          title: "Loja aberta gasta IA por visitante anônimo",
          summary:
            `${N(soSlug.length)} rota(s) pública(s) chegam a chamada paga com escopo só de loja (o slug). ` +
            `É o desenho do produto — a loja é aberta —, mas o teto de gasto é o tráfego, não a venda.`,
          evidence: soSlug.map((r) => `${r.route} (${r.file})`),
          metrics,
          recommendation:
            "Conferir se há limite por IP/sessão e teto diário de chamadas por restaurante. Sem teto, um robô de scraping paga a conta da casa.",
        },
      ];
    }

    return [
      {
        probeId: "porta-aberta",
        area: "IA",
        status: "PASS",
        severity: "INFO",
        title: "Nenhuma rota pública desprotegida chega a chamada paga",
        summary:
          `${N(s.publicRoutesTotal)} rotas públicas varridas; ${N(paid.length)} alcançam chamada paga e todas ` +
          `têm alguma prova de chamador (segredo de admin, cron, assinatura ou sessão).`,
        evidence: [`arquivos com chamada paga: ${N(s.paidCallFiles.length)}`],
        metrics,
        recommendation: "Nada a fazer.",
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Padrão 2 — id aceito sem conferir de quem é
// ─────────────────────────────────────────────────────────────────────────────

export const idSemDonoProbe: RaioXProbe = {
  id: "id-sem-dono",
  area: "Dados",
  question: "alguma rota aceita um id de restaurante/cliente/pedido sem provar que o chamador é dono?",
  run(sample: RaioXSample): RaioXFinding[] {
    const s = requireBlock(sample.source, "varredura do código-fonte");
    const suspeitas = s.unscopedIdRoutes;
    const semJustificativa = suspeitas.filter((r) => r.ownershipProofs.length === 0);
    const justificadas = suspeitas.filter((r) => r.ownershipProofs.length > 0);

    const metrics = {
      rotasQueRecebemId: s.routesWithIdIntakeTotal,
      semProvaDePosse: suspeitas.length,
      semProvaNemJustificativa: semJustificativa.length,
    };

    if (semJustificativa.length > 0) {
      return [
        {
          probeId: "id-sem-dono",
          area: "Dados",
          status: "FAIL",
          severity: "P1",
          title: "Rota aceita id de outro dono sem conferir",
          summary:
            `${N(semJustificativa.length)} de ${N(s.routesWithIdIntakeTotal)} rotas que recebem id ` +
            `não mostram nenhuma prova de posse (tenant, sessão, segredo ou token). ` +
            `Trocar o id na URL pode devolver dado de outro cliente.`,
          evidence: semJustificativa.flatMap((r) => [
            `${r.route} — ${r.file}:${r.intake[0]?.line ?? "?"}`,
            ...r.intake.slice(0, 1).map((i) => `   ${i.snippet}`),
          ]),
          metrics,
          recommendation:
            "Abrir cada rota e confirmar. Se o id é a única credencial, isso precisa estar escrito e ser deliberado; se não é, escopar pelo tenant.",
        },
      ];
    }

    if (justificadas.length > 0) {
      return [
        {
          probeId: "id-sem-dono",
          area: "Dados",
          status: "WARNING",
          severity: "P2",
          title: "Id usado como senha — decisão escrita, vale reler",
          summary:
            `${N(justificadas.length)} rota(s) tratam o próprio id como credencial, com a justificativa no arquivo. ` +
            `Continua sendo uma escolha de risco: quem repassar o link repassa o acesso.`,
          evidence: justificadas.map((r) => `${r.route} — ${r.file}:${r.intake[0]?.line ?? "?"}`),
          metrics,
          recommendation:
            "Reler a justificativa uma vez por trimestre e conferir que a resposta não carrega dado sensível de terceiro.",
        },
      ];
    }

    return [
      {
        probeId: "id-sem-dono",
        area: "Dados",
        status: "PASS",
        severity: "INFO",
        title: "Toda rota que recebe id prova a posse",
        summary: `${N(s.routesWithIdIntakeTotal)} rotas recebem id de dono e todas exibem prova de posse.`,
        evidence: [`rotas com entrada de id: ${N(s.routesWithIdIntakeTotal)}`],
        metrics,
        recommendation: "Nada a fazer.",
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Padrão 3 — promessa que o código não cumpre
// ─────────────────────────────────────────────────────────────────────────────

export const seloVazioProbe: RaioXProbe = {
  id: "selo-vazio",
  area: "Portões",
  question: "algum veredito de verificação está escrito como `true` fixo em vez de ser medido?",
  run(sample: RaioXSample): RaioXFinding[] {
    const s = requireBlock(sample.source, "varredura do código-fonte");
    const candidatos = s.hollowChecks;
    const metrics = { vereditosLiterais: candidatos.length };

    if (candidatos.length === 0) {
      return [
        {
          probeId: "selo-vazio",
          area: "Portões",
          status: "PASS",
          severity: "INFO",
          title: "Nenhum veredito escrito como literal",
          summary: "Nenhum campo de verificação recebendo `true`/\"PASS\" fixo fora de testes e fixtures.",
          evidence: [`arquivos varridos: ${N(s.filesScanned)}`],
          metrics,
          recommendation: "Nada a fazer.",
        },
      ];
    }

    return [
      {
        probeId: "selo-vazio",
        area: "Portões",
        status: "WARNING",
        severity: "P1",
        title: "Verificação que aprova sem ter medido",
        summary:
          `${N(candidatos.length)} lugar(es) onde um campo de veredito recebe valor fixo. ` +
          `Cada um precisa de leitura: alguns são o ramo legítimo de sucesso, outros são portão que aprova por omissão — ` +
          `e portão que não registrou resultado tem que reprovar, não passar.`,
        evidence: candidatos.map(
          (c) => `${c.file}:${c.line} — ${c.field} em ${c.enclosing ?? "(escopo não identificado)"} · ${c.snippet}`,
        ),
        metrics,
        recommendation:
          "Ler cada linha e responder: se a verificação não rodou, o resultado é 'aprovado' ou 'não sei'? Se for 'aprovado', é defeito.",
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Padrão 4 — estado morto
// ─────────────────────────────────────────────────────────────────────────────

export const estadoMortoProbe: RaioXProbe = {
  id: "estado-morto",
  area: "Dados",
  question: "algum campo é gravado no banco e nenhum leitor consome?",
  run(sample: RaioXSample): RaioXFinding[] {
    const s = requireBlock(sample.source, "varredura do código-fonte");
    const mortos = s.deadStateFields;
    const metrics = { camposSemLeitor: mortos.length, camposAvaliados: s.schemaFieldsChecked };

    if (mortos.length === 0) {
      return [
        {
          probeId: "estado-morto",
          area: "Dados",
          status: "PASS",
          severity: "INFO",
          title: "Nenhum campo gravado sem leitor",
          summary: `${N(s.schemaFieldsChecked)} campos avaliados; todos têm ao menos um consumidor.`,
          evidence: [`campos avaliados: ${N(s.schemaFieldsChecked)}`],
          metrics,
          recommendation: "Nada a fazer.",
        },
      ];
    }

    return [
      {
        probeId: "estado-morto",
        area: "Dados",
        status: "WARNING",
        severity: "P2",
        title: "Campos gravados que ninguém lê",
        summary:
          `${N(mortos.length)} de ${N(s.schemaFieldsChecked)} campos avaliados são escritos e nunca lidos. ` +
          `Cada um é trabalho que acontece e não vira nada — e, quando o campo é uma trilha ou um carimbo de aprovação, ` +
          `é também uma promessa de tela que o sistema não cumpre.`,
        evidence: mortos.map(
          (f) => `${f.model}.${f.field} — escrito em ${f.writes.map((w) => `${w.file}:${w.line}`).join(", ")}`,
        ),
        metrics,
        recommendation:
          "Para cada campo: ou existe um leitor esquecido (bug de produto), ou o campo deve morrer. Guardar dado sensível sem uso (últimos 4 dígitos, IP) é risco puro.",
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Padrão 1 — trabalho que existe e ninguém vê (variante estática)
// ─────────────────────────────────────────────────────────────────────────────

export const loopSemTetoProbe: RaioXProbe = {
  id: "loop-sem-teto",
  area: "IA",
  question: "existe laço ou retentativa sem condição de parada, ainda mais se cada volta custa dinheiro?",
  run(sample: RaioXSample): RaioXFinding[] {
    const s = requireBlock(sample.source, "varredura do código-fonte");
    const loops = s.unboundedLoops;
    const caros = loops.filter((l) => l.reachesPaidCall);
    const metrics = { lacosSemParada: loops.length, lacosSemParadaComCustoPago: caros.length };

    if (loops.length === 0) {
      return [
        {
          probeId: "loop-sem-teto",
          area: "IA",
          status: "PASS",
          severity: "INFO",
          title: "Nenhum laço sem condição de parada",
          summary: `${N(s.filesScanned)} arquivos varridos; todo laço infinito encontrado tem teto ou fim de dados.`,
          evidence: [`arquivos varridos: ${N(s.filesScanned)}`],
          metrics,
          recommendation: "Nada a fazer.",
        },
      ];
    }

    return [
      {
        probeId: "loop-sem-teto",
        area: "IA",
        status: caros.length > 0 ? "FAIL" : "WARNING",
        severity: caros.length > 0 ? "P1" : "P2",
        title:
          caros.length > 0
            ? "Laço sem teto num caminho que gasta por chamada"
            : "Laço sem condição de parada visível",
        summary:
          `${N(loops.length)} laço(s) sem teto encontrado(s), ${N(caros.length)} deles em arquivo que alcança chamada paga. ` +
          `É o formato clássico de gasto que ninguém vê: nada falha, e a fatura sobe todo dia.`,
        evidence: loops.map(
          (l) => `${l.file}:${l.line} — ${l.kind}${l.reachesPaidCall ? " (alcança chamada paga)" : ""} · ${l.snippet}`,
        ),
        metrics,
        recommendation:
          "Dar teto explícito por contador e registrar quando o teto for atingido. Teto que estoura em silêncio é o mesmo problema com outro nome.",
      },
    ];
  },
};

export const SOURCE_PROBES: readonly RaioXProbe[] = [
  portaAbertaProbe,
  idSemDonoProbe,
  seloVazioProbe,
  estadoMortoProbe,
  loopSemTetoProbe,
];
