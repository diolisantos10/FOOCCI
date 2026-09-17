/**
 * O TETO DIÁRIO DE CHAMADAS DE MODELO DA SUPERVISORA.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * Ligar a Supervisora em INTERVENTION coloca uma chamada de modelo no caminho
 * de TODA mensagem que sai. Isso é o desenho, e é o que o CEO pediu. Mas até
 * hoje não havia nenhum número que dissesse "a partir daqui, pare" — e um
 * gasto sem teto em contenção é o tipo de coisa que só se descobre na fatura.
 *
 * ── ⚠️ O QUE ACONTECE AO BATER O TETO, MEDIDO E ESCRITO ──────────────────────
 *
 * Bater o teto **não libera mensagem ruim** e **não trava a sala de vendas**.
 * Ele desliga só a parte CARA: as camadas rápida e profunda param de chamar
 * modelo, e a régua determinística (`rubrica.ts`) continua valendo sozinha —
 * custo zero, e ainda assim barrando panfleto, urgência inventada, escassez
 * falsa, promessa, medo e a mentira do porteiro.
 *
 * Essa é a escolha honesta entre as duas alternativas ruins:
 *   - travar tudo (fail-closed total) pararia a operação comercial inteira por
 *     causa de um limite de custo, o que é um estrago maior que o do custo;
 *   - liberar tudo (fail-open) seria exatamente "ninguém decidiu" virando
 *     "está liberado" — o guardrail 1 ao contrário.
 * A terceira é esta: **degrada para a régua que não custa nada, e grita.**
 *
 * ── ⚠️ O ESCOPO REAL DESTE CONTADOR, SEM ENCENAÇÃO ───────────────────────────
 *
 * O contador é **por processo**, em memória. Com uma única instância da
 * aplicação (o caso do Railway hoje) ele é o teto real. Com N instâncias, o
 * teto efetivo é N × `TETO_DE_CHAMADAS_POR_DIA` — e isso está escrito aqui em
 * vez de ser prometido como se fosse global, porque um teto que se anuncia
 * global e não é vale menos que teto nenhum.
 *
 * O dia é contado em UTC e vira sozinho na primeira chamada do dia seguinte.
 */

/**
 * Quantas chamadas de modelo a Supervisora pode fazer por dia.
 *
 * A conta, com os números medidos em `camadaRapida.ts`/`camadaProfunda.ts`:
 * cada mensagem revisada custa **1 chamada** (camada rápida) no caso comum, e
 * **2** quando a camada profunda é acionada — e ela só é acionada quando algo
 * concreto já apontou problema (`deveAcionar`). Uma mensagem barrada pela
 * régua determinística custa **0**.
 *
 * 3.000 cobre com folga o volume de uma sala de vendas em operação (≈1.500
 * mensagens revisadas por dia, com 100% delas acionando também a camada
 * profunda — um pior caso que não acontece). O número é para pegar defeito
 * (laço, retentativa em loop, varredura descontrolada), não para apertar o uso
 * normal. Se a operação crescer de verdade, sobe-se o número por decisão, não
 * por acidente.
 */
export const TETO_DE_CHAMADAS_POR_DIA = 3_000;

interface Contador {
  /** Dia UTC no formato AAAA-MM-DD. */
  dia: string;
  chamadas: number;
  /** Para não repetir o mesmo alerta em todo envio depois de estourar. */
  jaAvisou: boolean;
}

let contador: Contador = { dia: "", chamadas: 0, jaAvisou: false };

function diaUtc(agora: Date): string {
  return agora.toISOString().slice(0, 10);
}

function girarSeMudouODia(agora: Date): void {
  const hoje = diaUtc(agora);
  if (contador.dia !== hoje) contador = { dia: hoje, chamadas: 0, jaAvisou: false };
}

/**
 * Pergunta e CONTA de uma vez: `true` significa "pode chamar o modelo, e esta
 * chamada já foi contabilizada". Perguntar e contar em passos separados abriria
 * a porta para contar o que não aconteceu (ou não contar o que aconteceu).
 */
export function podeChamarModelo(agora: Date = new Date()): boolean {
  girarSeMudouODia(agora);

  if (contador.chamadas >= TETO_DE_CHAMADAS_POR_DIA) {
    if (!contador.jaAvisou) {
      contador.jaAvisou = true;
      console.error("[supervisora/teto] teto diário de chamadas de modelo atingido", {
        dia: contador.dia,
        teto: TETO_DE_CHAMADAS_POR_DIA,
        consequencia:
          "as camadas rápida e profunda param de chamar modelo até a virada do dia (UTC); a régua determinística da rubrica continua valendo sozinha",
      });
    }
    return false;
  }

  contador.chamadas += 1;
  return true;
}

/** Para o painel e para os testes. Não altera nada. */
export function estadoDoTeto(agora: Date = new Date()): {
  dia: string;
  chamadas: number;
  teto: number;
  restantes: number;
} {
  girarSeMudouODia(agora);
  return {
    dia: contador.dia,
    chamadas: contador.chamadas,
    teto: TETO_DE_CHAMADAS_POR_DIA,
    restantes: Math.max(0, TETO_DE_CHAMADAS_POR_DIA - contador.chamadas),
  };
}

/** Só para teste — zera o contador entre casos. */
export function zerarTetoParaTeste(): void {
  contador = { dia: "", chamadas: 0, jaAvisou: false };
}
