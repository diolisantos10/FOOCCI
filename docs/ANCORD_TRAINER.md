# ANCORD Trainer 🎯

Treinador pessoal de estudos para a prova **ANCORD** (certificação de **Assessor de
Investimento**, ex-AAI). Projeto **independente** dentro do repositório — não compartilha
dados nem lógica com o app de restaurante/WhatsApp.

> Desenhado para foco curto e progresso visível (pensado para quem tem TDAH):
> microsessões, repetição espaçada, feedback imediato e gamificação.

## Onde fica

- **Páginas:** `/ancord` (área mobile-first, navegação inferior)
- **Código de UI:** `src/app/ancord/**`
- **Lógica + conteúdo:** `src/lib/ancord/**`
- **API do tutor:** `src/app/api/ancord/tutor/route.ts`

Sem login: as rotas `/ancord` e `/api/ancord` são públicas (liberadas no `src/middleware.ts`).

## A prova (referência)

80 questões objetivas · 4 alternativas · 2h30 · aplicada pela FGV · **15 módulos**.
Aprovação: **≥ 70% no geral (56/80)** **E** **≥ 50%** em cada capítulo crítico
(**I, II, III, VIII e XV**). Essa regra é aplicada de verdade no simulado.

## Funcionalidades

| Tela | O que faz |
|------|-----------|
| **Início** | Plano do dia (sem decisão), ofensiva (streak), contagem regressiva e % de prontidão |
| **Estudar** | Flashcards com repetição espaçada (SM-2) + bateria de questões com correção na hora |
| **Simulado** | 80q cronometradas (2h30) / mini-simulado (20q) / por capítulo — com correção por módulo e regra real de aprovação |
| **Módulos** | Os 15 capítulos com resumo relâmpago, tópicos e domínio (%) |
| **Tutor** | Chat de IA que explica de forma simples e gera questões; ancorado nos resumos validados |
| **Progresso** | Histórico de simulados, domínio por capítulo, XP, backup (export/import JSON) |

## Onde ficam os dados

100% no aparelho do usuário (`localStorage`, chave `ancord-trainer:v1`). Sem banco,
funciona offline. Em **Progresso → Configurações** há **Exportar/Importar** (JSON) para
backup e troca de aparelho.

## Tutor de IA (opcional)

A rota `/api/ancord/tutor` escolhe o provedor automaticamente (via `fetch`, sem SDK novo):

1. `ANTHROPIC_API_KEY` → **Claude** (preferido) — modelo via `ANCORD_TUTOR_MODEL`
   (padrão `claude-sonnet-4-6`)
2. `OPENAI_API_KEY` → OpenAI — modelo via `ANCORD_TUTOR_MODEL_OPENAI` (padrão `gpt-4o-mini`)
3. Nenhuma chave → resposta "offline" amigável; **o resto do app continua 100% funcional**

> Atenção: hoje o endpoint é aberto (sem login). Como roda no domínio privado do app
> (`robots: noindex`), está ok para uso pessoal. Para expor publicamente, adicione uma
> proteção (ex.: segredo compartilhado) antes.

## Conteúdo

Banco de questões e flashcards curados para precisão, com foco nos 5 capítulos críticos
e nos tópicos de maior incidência. É um **conjunto inicial que cresce com o tempo** — o
tutor de IA também gera questões extras sob demanda. Ao incorporar as apostilas oficiais,
o banco pode ser expandido e revisado.

## Roadmap curto

- [ ] Ampliar o banco de questões (meta: cobertura densa dos 15 módulos)
- [ ] Ingestão das apostilas em PDF para gerar/validar questões
- [ ] Notificações/lembretes diários (PWA)
- [ ] Modo "revisão dos erros" dedicado
