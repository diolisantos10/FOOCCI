# ANCORD Trainer

Treinador de estudos para a prova **ANCORD** (Assessor de Investimento, ex‑AAI).
App **independente**, mobile‑first, que roda **100% no aparelho do usuário** — sem
login, sem banco de dados e sem servidor. Todo o progresso fica salvo no
`localStorage` do próprio celular (com exportar/importar em JSON para backup).

> Este app não compartilha nada com nenhum outro projeto. É um Next.js isolado,
> com suas próprias dependências e build.

## O que tem dentro

- **Plano do dia** — uma lista clara do que estudar hoje, priorizando os pontos
  fracos e os capítulos críticos.
- **Estudar** — bateria de questões e flashcards com repetição espaçada (SRS).
- **Simulado** — formato real da prova (80 questões, cronômetro de 2h30 e a regra
  de aprovação: ≥70% no geral **e** ≥50% em cada capítulo crítico). Também tem
  mini‑simulado (20q) e simulado por capítulo.
- **Módulos** — os 15 capítulos do edital, com resumo relâmpago e "o que cai".
- **Progresso** — prontidão geral, ofensiva (streak), histórico de simulados,
  domínio por capítulo e backup dos dados.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
```

Build de produção (exportação estática para a pasta `out/`):

```bash
npm run build
```

## Publicar na Vercel

1. Acesse https://vercel.com e clique em **Add New → Project**.
2. Importe o repositório.
3. Em **Root Directory**, selecione a pasta **`ancord-trainer`**.
   - Framework: **Next.js** (detectado automaticamente).
   - Não há variáveis de ambiente para configurar.
4. Clique em **Deploy**. Pronto — o app ganha um endereço próprio
   (ex.: `ancord-trainer.vercel.app`), totalmente separado de qualquer outro
   projeto.

No celular, abra esse endereço e use **"Adicionar à tela de início"** para ter
o ícone do app na home do telefone.

## Stack

- Next.js 14 (App Router) com `output: "export"` (site estático, sem servidor)
- React 18 + TypeScript
- Tailwind CSS
- Estado do usuário em `localStorage` (sem backend)
