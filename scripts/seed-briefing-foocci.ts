/**
 * seed-briefing-foocci — grava o briefing da Foocci na agência Dioli.
 *
 * A Foocci é cliente fixo da Dioli. O conteúdo do briefing mora em
 * `src/services/brain/sdr/pilotos/BriefingFoocci.ts`, com a fonte de cada
 * resposta; este script só o coloca onde o SDR lê, pela MESMA porta de memória
 * que a entrevista ao vivo usa (`resolverMemoriaDaEntrevista`). Nada de INSERT
 * na mão: se a porta mudar, isto muda junto.
 *
 * Antes de gravar, roda a avaliação e o plano e imprime os dois. Um seed que
 * grava calado é um seed que ninguém confere.
 *
 * Uso:
 *   npm run dioli:briefing -- --dry                        # só mostra, não grava
 *   npm run dioli:briefing -- --agencia=<restaurantId>     # grava (precisa de DATABASE_URL)
 *   npm run dioli:briefing -- --agencia=<id> --semanas=8
 *
 * A agência é o tenant: `agenciaId` é o `Restaurant.id` da Dioli, o mesmo que
 * o `/api/sdr/entrevista` resolve pelo contexto de tenant.
 */

import {
  avaliarSondagem,
  CAMPOS_DA_FICHA,
} from "@/services/brain/oficina/Sondagem";
import {
  chaveDaEntrevista,
  resolverMemoriaDaEntrevista,
} from "@/services/brain/sdr/MemoriaDaEntrevista";
import { gerarPlano, renderizarPlano } from "@/services/brain/sdr/PlanoDeMidia";
import {
  briefingFoocci,
  CLIENTE_ID,
  PENDENTES,
  RESPOSTAS,
  SEGUNDO_CICLO,
} from "@/services/brain/sdr/pilotos/BriefingFoocci";

function arg(nome: string): string | undefined {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado?.slice(nome.length + 3).trim() || undefined;
}

const DRY      = process.argv.includes("--dry");
const AGENCIA  = arg("agencia") ?? process.env.DIOLI_AGENCIA_ID ?? "";
const SEMANAS  = Number(arg("semanas") ?? 4);

function titulo(t: string): void {
  console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);
}

async function main(): Promise<void> {
  const estado    = briefingFoocci();
  const avaliacao = avaliarSondagem(estado);

  titulo("BRIEFING — Foocci (cliente da Dioli)");
  for (const campo of CAMPOS_DA_FICHA) {
    const resposta = RESPOSTAS[campo.chave];
    if (resposta) {
      console.log(`\n● ${campo.chave}\n  ${resposta.valor}\n  fonte: ${resposta.fonte}`);
      continue;
    }
    const pendente = PENDENTES.find((p) => p.chave === campo.chave);
    console.log(
      `\n○ ${campo.chave} — PERGUNTADO, SEM RESPOSTA` +
      `\n  ${campo.pergunta}` +
      (pendente ? `\n  não preenchi porque: ${pendente.porqueNaoSei}` : ""),
    );
  }

  titulo("SERVIÇOS DO CICLO DE LANÇAMENTO");
  for (const s of avaliacao.servicos) {
    console.log(`\n● ${s.nome} — ${s.quemTrazOMaterial}${s.pronto ? "" : "  ⚠ PENDENTE"}`);
    const contratado = estado.servicos?.find((c) => c.chave === s.chave);
    for (const [k, v] of Object.entries(contratado?.definicoes ?? {})) console.log(`    ${k}: ${v}`);
    if (contratado?.quemExecuta) console.log(`    quem executa: ${contratado.quemExecuta}`);
  }
  console.log("\nFICAM PARA O 2º CICLO (falta dado que só o dono tem):");
  for (const s of SEGUNDO_CICLO) console.log(`  - ${s.chave}: falta ${s.falta}`);

  titulo("AVALIAÇÃO");
  console.log(`pode propor : ${avaliacao.podePropor ? "SIM" : "NÃO"}`);
  console.log(`cobertura   : ${avaliacao.cobertura}% do essencial respondido`);
  console.log(`motivo      : ${avaliacao.motivo}`);
  console.log(`veredito    : ${avaliacao.veredito}`);

  titulo(`PLANO DE MÍDIA — ${SEMANAS} semanas`);
  const plano = gerarPlano({ estado, semanas: SEMANAS });
  console.log(renderizarPlano(plano));

  if (!plano.liberado) {
    console.error("\n✗ Plano não liberado — não gravo briefing que não sustenta proposta.");
    process.exitCode = 1;
    return;
  }

  titulo("GRAVAÇÃO");
  if (DRY) {
    console.log("--dry: nada gravado.");
    return;
  }
  if (!AGENCIA) {
    console.error(
      "✗ Falta a agência. Passe --agencia=<Restaurant.id da Dioli> ou DIOLI_AGENCIA_ID.\n" +
      "  (use --dry para só conferir o briefing sem gravar)",
    );
    process.exitCode = 1;
    return;
  }

  const chave   = chaveDaEntrevista(AGENCIA, CLIENTE_ID);
  const memoria = await resolverMemoriaDaEntrevista();
  await memoria.gravar(chave, estado);

  // Relê pela porta: gravou de verdade ou só não deu erro?
  const conferido = await memoria.ler(chave);
  if (!conferido) {
    console.error(`✗ Gravou sem erro mas não voltou nada em ${chave}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Briefing gravado e relido em ${chave}`);
  console.log(`  ${Object.keys(conferido.ficha ?? {}).length} campos respondidos, ` +
              `${(conferido.perguntadas ?? []).length} perguntados sem resposta, ` +
              `${(conferido.servicos ?? []).length} serviços contratados.`);
}

main()
  .catch((err) => {
    console.error("✗ Falhou:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // O cliente Prisma segura o processo aberto quando a memória é a de banco.
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
