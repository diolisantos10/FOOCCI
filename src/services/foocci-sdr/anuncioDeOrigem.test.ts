/**
 * O ANÚNCIO CLIQUE-PARA-WHATSAPP — a tradução pura de `referral`.
 *
 * Estes casos não tocam banco. Eles protegem as três decisões que, erradas,
 * fariam a casa carimbar "campanha paga" em cima de nada.
 */
import { describe, it, expect } from "vitest";
import {
  camposDeOrigemDoAnuncio, marcadorDoClique, nomeDoAnuncio, notaDoAnuncio,
  plataformaDoAnuncio, veioDeAnuncio, ORIGEM_DE_ANUNCIO, FONTE_DO_ANUNCIO,
  type ReferralDeAnuncio,
} from "./anuncioDeOrigem";
import { FONTES_QUE_NOS_PROCURARAM } from "@/services/salaDeVendas/recepcao/portasDeEntrada";
import { veioDeListaFria } from "@/services/salaDeVendas/frioOuLead";

const REF: ReferralDeAnuncio = {
  sourceType: "ad",
  sourceId: "120210000000000001",
  sourceUrl: "https://fb.me/2abcDEF",
  headline: "Cardápio digital que vende sozinho",
  body: "Teste grátis por 7 dias",
  ctwaClid: "ARBxyz123",
};

describe("veioDeAnuncio", () => {
  it("reconhece anúncio e publicação", () => {
    expect(veioDeAnuncio(REF)).toBe(true);
    expect(veioDeAnuncio({ ...REF, sourceType: "post" })).toBe(true);
  });

  it("mensagem comum não tem referral — e ausência não é anúncio", () => {
    expect(veioDeAnuncio(null)).toBe(false);
    expect(veioDeAnuncio(undefined)).toBe(false);
  });

  it("⛔ referral SEM identificador nenhum não é atribuição, é ruído", () => {
    // Carimbar CAMPANHA_PAGA aqui inventaria uma campanha que ninguém acha
    // no Gerenciador depois.
    expect(veioDeAnuncio({ ...REF, sourceId: null, ctwaClid: null })).toBe(false);
  });

  it("tipo desconhecido não vira mídia paga", () => {
    expect(veioDeAnuncio({ ...REF, sourceType: "whatsapp_status" })).toBe(false);
  });
});

describe("a marca do primeiro clique", () => {
  it("⛔ é o ctwa_clid, que é único por CLIQUE — nunca o id do anúncio", () => {
    // O sourceId se repete em toda pessoa que clicar no mesmo anúncio: usá-lo
    // como chave faria o segundo lead da campanha parecer o primeiro de volta.
    expect(marcadorDoClique(REF)).toBe("ctwa:ARBxyz123");
    const outraPessoa = { ...REF, ctwaClid: "ARBoutro999" };
    expect(marcadorDoClique(outraPessoa)).not.toBe(marcadorDoClique(REF));
  });

  it("sem clid, cai no anúncio — e o prefixo diz que é o anúncio, não o clique", () => {
    expect(marcadorDoClique({ ...REF, ctwaClid: null })).toBe("ctwa-ad:120210000000000001");
  });
});

describe("os campos que a ficha grava", () => {
  it("a campanha é o TÍTULO do anúncio — é o que um humano reconhece", () => {
    const c = camposDeOrigemDoAnuncio(REF);
    expect(c.utmCampaign).toBe("Cardápio digital que vende sozinho");
    expect(c.utmContent).toBe("120210000000000001");
    expect(c.utmMedium).toBe("click_to_whatsapp");
    expect(c.origem.startsWith(ORIGEM_DE_ANUNCIO)).toBe(true);
    expect(c.origem).toContain("Cardápio digital que vende sozinho");
  });

  it("sem título, o id serve — e nada é inventado", () => {
    expect(nomeDoAnuncio({ ...REF, headline: null })).toBe("120210000000000001");
    expect(nomeDoAnuncio({ ...REF, headline: null, sourceId: null })).toBe("anúncio sem identificador");
  });

  it("a plataforma é lida da URL; facebook é o palpite padrão declarado", () => {
    expect(plataformaDoAnuncio(REF)).toBe("facebook");
    expect(plataformaDoAnuncio({ ...REF, sourceUrl: "https://www.instagram.com/p/xyz" })).toBe("instagram");
  });

  it("a nota de auditoria carrega tudo que a Meta mandou", () => {
    const n = notaDoAnuncio(REF);
    expect(n).toContain("source_id=120210000000000001");
    expect(n).toContain("ctwa_clid=ARBxyz123");
  });
});

describe("a fonte gravada é enxergada pelo resto da casa", () => {
  it("⛔ CAMPANHA_PAGA está nas portas que a recepção enxerga", () => {
    // Gravar uma fonte de fora daquela lista faria o lead entrar e ficar
    // parado do mesmo jeito — o defeito só teria mudado de lugar.
    expect(FONTES_QUE_NOS_PROCURARAM).toContain(FONTE_DO_ANUNCIO);
  });

  it("⛔ quem veio de anúncio JÁ é lead — nunca lista fria", () => {
    expect(veioDeListaFria({ fonte: FONTE_DO_ANUNCIO })).toBe(false);
  });
});
