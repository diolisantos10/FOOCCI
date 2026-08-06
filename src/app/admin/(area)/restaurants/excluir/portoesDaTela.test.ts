/**
 * OS PORTÕES DA TELA — as DUAS metades de cada um.
 *
 * Um portão só está provado quando existem os dois testes: o que mostra que ele
 * REPROVA com o defeito presente, e o que mostra que ele LIBERA com o defeito
 * ausente. Portão testado só pelo lado que reprova pode ser um `return false`
 * constante; portão testado só pelo lado que passa pode ser um `return true`.
 *
 * O teste mais importante do arquivo é o dos protegidos: ele prova que a tela
 * recusa `foocci-bakery` e `sushi-cazza` inclusive quando TODO o resto está
 * perfeito e o slug foi digitado exatamente certo.
 */

import { describe, it, expect } from "vitest";
import { conferirPedidoDeExclusao, ehProtegidoNaTela, type EstadoDaExclusao } from "./portoesDaTela";

const PROTEGIDOS = ["foocci-bakery", "sushi-cazza"] as const;

/** Um estado em que TUDO está certo. Cada teste estraga exatamente uma coisa. */
function estadoPerfeito(over: Partial<EstadoDaExclusao> = {}): EstadoDaExclusao {
  return {
    slugAlvo: "pizzaria-testando",
    slugDigitado: "pizzaria-testando",
    sha256Informado: "a".repeat(64),
    backupConferido: true,
    simulou: true,
    protegidos: PROTEGIDOS,
    interruptorLigado: true,
    bloqueios: [],
    notasFiscais: 0,
    aceitoPerderNotaFiscal: false,
    ...over,
  };
}

const campos = (e: EstadoDaExclusao) => conferirPedidoDeExclusao(e).pendencias.map((p) => p.campo);

// ═════════════════════════════════════════════════════════════════════════════
//  O portão que não tem exceção
// ═════════════════════════════════════════════════════════════════════════════

describe("a trava dos dois protegidos, pela tela", () => {
  it("(passa) libera um slug que não está na lista, com todo o resto em ordem", () => {
    expect(conferirPedidoDeExclusao(estadoPerfeito()).liberado).toBe(true);
  });

  it.each([...PROTEGIDOS])(
    "(reprova) recusa %s mesmo com backup, simulação, interruptor e slug digitado CERTO",
    (protegido) => {
      const v = conferirPedidoDeExclusao(
        estadoPerfeito({ slugAlvo: protegido, slugDigitado: protegido }),
      );
      expect(v.liberado).toBe(false);
      expect(v.pendencias[0].campo).toBe("protegido");
      expect(v.pendencias[0].definitiva).toBe(true);
    },
  );

  it("(reprova) recusa também quando o protegido aparece SÓ no campo digitado à mão", () => {
    // O alvo veio de uma linha apagável, mas a mão digitou um protegido. Recusa:
    // um dos dois lados sendo protegido já basta.
    const v = conferirPedidoDeExclusao(
      estadoPerfeito({ slugAlvo: "auditprobe04597", slugDigitado: "sushi-cazza" }),
    );
    expect(v.liberado).toBe(false);
    expect(v.pendencias[0].campo).toBe("protegido");
  });

  it("(reprova) a proteção falha para o lado de PROTEGER — caixa e espaço não driblam", () => {
    for (const variacao of [" foocci-bakery", "FOOCCI-BAKERY", "  Sushi-Cazza  "]) {
      expect(ehProtegidoNaTela(variacao, PROTEGIDOS)).toBe(true);
      expect(
        conferirPedidoDeExclusao(estadoPerfeito({ slugAlvo: "x", slugDigitado: variacao })).liberado,
      ).toBe(false);
    }
  });

  it("(passa) não confunde quem apenas se parece com um protegido", () => {
    expect(ehProtegidoNaTela("foocci-bakery-2", PROTEGIDOS)).toBe(false);
    expect(ehProtegidoNaTela("sushi", PROTEGIDOS)).toBe(false);
    expect(
      conferirPedidoDeExclusao(
        estadoPerfeito({ slugAlvo: "foocci-bakery-2", slugDigitado: "foocci-bakery-2" }),
      ).liberado,
    ).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Os portões que se resolvem fazendo alguma coisa
// ═════════════════════════════════════════════════════════════════════════════

describe("o interruptor de ambiente", () => {
  it("(reprova) desligado, aponta o Railway pelo nome da variável", () => {
    const v = conferirPedidoDeExclusao(estadoPerfeito({ interruptorLigado: false }));
    expect(v.liberado).toBe(false);
    expect(campos(estadoPerfeito({ interruptorLigado: false }))).toContain("interruptor");
    expect(v.pendencias.find((p) => p.campo === "interruptor")?.mensagem).toContain(
      "PURGA_RESTAURANTE_HABILITADA",
    );
  });

  it("(passa) ligado, some da lista de pendências", () => {
    expect(campos(estadoPerfeito({ interruptorLigado: true }))).not.toContain("interruptor");
  });
});

describe("a rede (backup)", () => {
  it("(reprova) sem arquivo conferido", () => {
    expect(campos(estadoPerfeito({ backupConferido: false }))).toContain("backup");
  });

  it("(reprova) com arquivo baixado mas sem o código", () => {
    expect(campos(estadoPerfeito({ sha256Informado: "  " }))).toEqual(
      expect.arrayContaining(["backup", "sha256"]),
    );
  });

  it("(passa) arquivo conferido e código presente", () => {
    expect(campos(estadoPerfeito())).not.toContain("backup");
  });
});

describe("a simulação obrigatória", () => {
  it("(reprova) sem ter rodado", () => {
    expect(campos(estadoPerfeito({ simulou: false }))).toContain("simulacao");
  });
  it("(passa) depois de rodar", () => {
    expect(campos(estadoPerfeito({ simulou: true }))).not.toContain("simulacao");
  });
});

describe("o slug digitado à mão", () => {
  it("(reprova) campo vazio", () => {
    expect(campos(estadoPerfeito({ slugDigitado: "" }))).toContain("slug");
  });

  it("(reprova) digitou outro restaurante — e a mensagem mostra os dois lados", () => {
    const v = conferirPedidoDeExclusao(
      estadoPerfeito({ slugAlvo: "auditprobe04597", slugDigitado: "auditprobe04598" }),
    );
    expect(v.liberado).toBe(false);
    const m = v.pendencias.find((p) => p.campo === "slug")!.mensagem;
    expect(m).toContain("auditprobe04598");
    expect(m).toContain("auditprobe04597");
  });

  it("(passa) idêntico ao escolhido", () => {
    expect(campos(estadoPerfeito())).not.toContain("slug");
  });

  it("(passa) espaço em volta não é erro de digitação", () => {
    expect(conferirPedidoDeExclusao(estadoPerfeito({ slugDigitado: " pizzaria-testando " })).liberado).toBe(true);
  });
});

describe("a nota fiscal", () => {
  it("(reprova) há nota e o reconhecimento não foi marcado", () => {
    const v = conferirPedidoDeExclusao(estadoPerfeito({ notasFiscais: 12 }));
    expect(v.liberado).toBe(false);
    expect(v.pendencias.find((p) => p.campo === "notaFiscal")?.mensagem).toContain("12");
  });

  it("(passa) há nota e o reconhecimento foi marcado", () => {
    expect(
      conferirPedidoDeExclusao(estadoPerfeito({ notasFiscais: 12, aceitoPerderNotaFiscal: true })).liberado,
    ).toBe(true);
  });

  it("(passa) não há nota — o reconhecimento nem é pedido", () => {
    expect(campos(estadoPerfeito({ notasFiscais: 0 }))).not.toContain("notaFiscal");
  });
});

describe("a assinatura viva", () => {
  it("(reprova) e diz que o cartão continua sendo debitado", () => {
    const v = conferirPedidoDeExclusao(
      estadoPerfeito({ bloqueios: [{ motivo: "ASSINATURA_VIVA", detalhe: "1 assinatura" }] }),
    );
    expect(v.liberado).toBe(false);
    const p = v.pendencias.find((x) => x.campo === "assinatura")!;
    expect(p.definitiva).toBe(true);
    expect(p.mensagem).toContain("Mercado Pago");
  });

  it("(passa) sem assinatura em cobrança", () => {
    expect(campos(estadoPerfeito({ bloqueios: [] }))).not.toContain("assinatura");
  });

  it("(passa) o bloqueio de nota fiscal vindo do servidor NÃO vira parede — vira caixa de marcar", () => {
    // O servidor lista NOTA_FISCAL_NAO_RECONHECIDA e PURGA_DESLIGADA junto com
    // ASSINATURA_VIVA. Tratar os três como parede deixaria o CEO sem saída para
    // um caso que TEM saída.
    const v = conferirPedidoDeExclusao(
      estadoPerfeito({
        notasFiscais: 3,
        aceitoPerderNotaFiscal: true,
        bloqueios: [{ motivo: "NOTA_FISCAL_NAO_RECONHECIDA", detalhe: "3 notas" }],
      }),
    );
    expect(v.liberado).toBe(true);
  });
});

describe("sem restaurante escolhido", () => {
  it("(reprova) e a primeira frase manda escolher, não manda baixar backup", () => {
    const v = conferirPedidoDeExclusao(estadoPerfeito({ slugAlvo: null, slugDigitado: "" }));
    expect(v.liberado).toBe(false);
    expect(v.pendencias).toHaveLength(1);
    expect(v.pendencias[0].mensagem).toContain("passo 1");
  });
});

describe("várias pendências ao mesmo tempo", () => {
  it("(reprova) lista todas, na ordem em que dá para resolver", () => {
    const v = conferirPedidoDeExclusao(
      estadoPerfeito({
        interruptorLigado: false,
        simulou: false,
        backupConferido: false,
        sha256Informado: "",
        slugDigitado: "",
        notasFiscais: 2,
      }),
    );
    expect(v.liberado).toBe(false);
    expect(v.pendencias.map((p) => p.campo)).toEqual([
      "interruptor",
      "simulacao",
      "backup",
      "slug",
      "sha256",
      "notaFiscal",
    ]);
  });
});
