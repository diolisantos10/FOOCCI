import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ mediaUpload: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const s3 = vi.hoisted(() => ({ uploadToS3: vi.fn() }));
vi.mock("@/lib/s3", () => s3);

const ia = vi.hoisted(() => ({ gerarImagemOpenAI: vi.fn(), MODELO_DE_IMAGEM: "gpt-image-1" }));
vi.mock("./providers/openai", () => ia);

import { gerarFoto, tamanhoPara, geradorConfigurado } from "./GeradorDeFoto";

const PNG_B64 = Buffer.from("imagem-falsa").toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-chave-de-teste-longa-o-suficiente";
  s3.uploadToS3.mockResolvedValue("https://cdn/foto.png");
  ia.gerarImagemOpenAI.mockResolvedValue({ b64: PNG_B64 });
  db.mediaUpload.create.mockResolvedValue({ id: "media-1" });
});

describe("tamanhoPara", () => {
  it("traduz a proporção que a agência fala", () => {
    expect(tamanhoPara("4:5")).toBe("1024x1536");
    expect(tamanhoPara("story 9:16")).toBe("1024x1536");
    expect(tamanhoPara("16:9")).toBe("1536x1024");
    expect(tamanhoPara("1:1")).toBe("1024x1024");
  });

  it("formato desconhecido ou ausente cai no quadrado, não quebra", () => {
    expect(tamanhoPara()).toBe("1024x1024");
    expect(tamanhoPara("panorâmico gigante")).toBe("1024x1024");
  });
});

describe("gerarFoto", () => {
  it("gera e devolve a URL guardada", async () => {
    const r = await gerarFoto("Fotografia real de um hambúrguer...", "rest-1", "4:5");
    expect(r).toMatchObject({ ok: true, url: "https://cdn/foto.png", tamanho: "1024x1536" });
  });

  it("NÃO reescreve o comando forjado — manda exatamente o que recebeu", async () => {
    const comando = "Fotografia real de X. Luz: janela lateral. Evite: 8K.";
    await gerarFoto(comando, "rest-1");
    expect(ia.gerarImagemOpenAI).toHaveBeenCalledWith(comando, expect.any(String));
  });

  it("S3 fora do ar cai no banco em vez de perder a imagem", async () => {
    s3.uploadToS3.mockRejectedValue(new Error("s3 down"));
    const r = await gerarFoto("comando", "rest-1");
    expect(r).toMatchObject({ ok: true, url: "/api/media/media-1" });
  });

  it("aceita resposta por link em vez de base64", async () => {
    ia.gerarImagemOpenAI.mockResolvedValue({ url: "https://openai/img.png" });
    vi.doMock("./providers/fetchImageBuffer", () => ({
      fetchImageBuffer: async () => ({ buffer: Buffer.from("x"), mimeType: "image/png" }),
    }));
    const r = await gerarFoto("comando", "rest-1");
    expect(r.ok).toBe(true);
  });

  it("erro da IA volta com a CAUSA REAL, não 'IA indisponível'", async () => {
    ia.gerarImagemOpenAI.mockResolvedValue({ error: "429 rate limit exceeded" });
    const r = await gerarFoto("comando", "rest-1");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erro).toMatch(/429 rate limit/);
  });

  it("resposta sem imagem não vira sucesso silencioso", async () => {
    ia.gerarImagemOpenAI.mockResolvedValue({ error: "A IA respondeu sem nenhuma imagem." });
    const r = await gerarFoto("comando", "rest-1");
    expect(r.ok).toBe(false);
  });

  it("comando vazio não gasta chamada de IA", async () => {
    const r = await gerarFoto("   ", "rest-1");
    expect(r.ok).toBe(false);
    expect(ia.gerarImagemOpenAI).not.toHaveBeenCalled();
  });

  it("sem chave configurada, avisa em vez de estourar", async () => {
    process.env.OPENAI_API_KEY = "not-configured";
    expect(geradorConfigurado()).toBe(false);
    const r = await gerarFoto("comando", "rest-1");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erro).toMatch(/OPENAI_API_KEY/);
  });
});
