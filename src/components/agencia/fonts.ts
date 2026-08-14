import localFont from "next/font/local";

// Sora — a tipografia de títulos do Client Command Center aprovado. A folha
// portada usa `var(--sora)` em todo `font:` de heading; sem ela a hierarquia
// da referência cai para Inter e a tela deixa de ser a que o CEO aprovou.
//
// Embarcada como arquivo local (os dois `.woff2` vieram do próprio ZIP de
// referência) e NÃO via `next/font/google`: build de produção não pode depender
// de rede para desenhar uma tela.
//
// É variável, 100–800, em um único arquivo por subset — por isso não conflita
// com a regra do `DESIGN.md` de embarcar só 400/600: ali a conta é "quantos
// arquivos de peso" e aqui é um só. E ela não vale para o painel Foocci: a
// variável só existe dentro do contêiner `.dioliOS`.
export const sora = localFont({
  src: [
    { path: "../../../public/fonts/sora-latin.woff2",     weight: "100 800", style: "normal" },
    { path: "../../../public/fonts/sora-latin-ext.woff2", weight: "100 800", style: "normal" },
  ],
  variable: "--font-sora",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
