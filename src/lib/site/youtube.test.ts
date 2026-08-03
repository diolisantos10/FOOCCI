/**
 * youtubeVideoId / youtubeEmbedUrl — a URL que o CEO cola no admin vira embed.
 * URL que não rende embed viraria quadro quebrado na página pública; o admin
 * rejeita na entrada usando exatamente esta função.
 */

import { describe, it, expect } from "vitest";
import { youtubeVideoId, youtubeEmbedUrl } from "@/lib/site/youtube";

describe("youtubeVideoId", () => {
  it("aceita as formas comuns de URL do YouTube", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejeita o que não é vídeo do YouTube", () => {
    expect(youtubeVideoId("https://vimeo.com/12345")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/watch")).toBeNull();
    expect(youtubeVideoId("https://youtu.be/curto")).toBeNull(); // id de tamanho errado
    expect(youtubeVideoId("não é url")).toBeNull();
  });

  it("embed usa youtube-nocookie", () => {
    expect(youtubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(youtubeEmbedUrl("https://vimeo.com/12345")).toBeNull();
  });
});
