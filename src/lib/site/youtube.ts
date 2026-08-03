/**
 * Extração do ID de vídeo do YouTube a partir das formas comuns de URL.
 * O embed público usa youtube-nocookie.com — sem cookie de rastreio até o play.
 */

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Devolve o ID de 11 caracteres, ou null quando a URL não é de vídeo do YouTube. */
export function youtubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.slice(1).split("/")[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else if (/^\/(shorts|embed|live)\//.test(url.pathname)) candidate = url.pathname.split("/")[2] ?? null;
  }
  return candidate && YT_ID_RE.test(candidate) ? candidate : null;
}

/** URL de embed sem cookies, pronta para iframe. */
export function youtubeEmbedUrl(rawUrl: string): string | null {
  const id = youtubeVideoId(rawUrl);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
