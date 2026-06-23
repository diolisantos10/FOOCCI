/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportação 100% estática: sem servidor, sem banco — pode ser publicado em
  // qualquer host (Vercel, Netlify, GitHub Pages...). Todo o estado do usuário
  // fica no próprio aparelho (localStorage).
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;
