import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Foocci brand palette — aligned to #F97316 (orange-500 standard scale)
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",  // Primary accent (Laranja Foocci)
          600: "#ea580c",  // Hover state
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
        // Brand Book semantic tokens — "minimalismo premium", 90% neutro + 10% laranja.
        ink:    "#0B0B0B", // Preto (text/headings)
        paper:  "#FFFFFF", // Branco (surfaces/cards)
        canvas: "#F6F6F4", // app background (warm off-white)
        line:   "#E9E9E6", // hairline borders
        line2:  "#E5E5E5", // Cinza claro (stronger border)
        muted:  "#8A8A86", // secondary text
        ink2:   "#5C5C58", // body text
        chip:   "#F4F4F2", // superfície neutra de chip / hover (era hex literal solto)

        // A moldura da área comercial (desenho do CEO, 18/09/2026): a barra
        // superior escura. Vira token porque é UMA superfície da casa, e hex
        // solto em dois arquivos é o começo de dois azuis diferentes.
        nav: {
          DEFAULT: "#0F172A", // azul-marinho quase preto do cabeçalho
          soft:    "#1E293B", // hover/campo de busca dentro da barra escura
          line:    "#334155", // hairline sobre o escuro
          text:    "#CBD5E1", // texto secundário sobre o escuro
        },

        // O acento de IA do desenho (roxo). NÃO é cor de ação — ação continua
        // sendo `brand`. Existe como token para o roxo não voltar a entrar cru
        // (`violet-*`) tela a tela, que é exatamente o drift que o DESIGN.md
        // proíbe.
        ia: {
          50:  "#F5F3FF",
          200: "#DDD6FE",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
          800: "#5B21B6",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
