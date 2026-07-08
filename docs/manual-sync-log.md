# Manual Sync — Log noturno

Diário das atualizações automáticas do manual. Cada linha é uma noite.
(Entradas mais recentes no topo.)

---

## Baseline — 20 guias do lojista publicados
- **Guias existentes:** Início, Pedidos, Central de Conversas, Cardápio, Cardápio digital/QR,
  Agentes IA, Ensinar a IA, Analytics, Promoções, CRM, Canais, Marca, Fotos do Cardápio,
  Conectar WhatsApp, Integrações, Pagamentos, Entrega, Horário, Configurações, Pausar pedidos.
- **Fonte:** `src/services/manual/howToGuidesContent.ts`.
- **Estado:** ponto de partida do robô noturno. A partir daqui, cada madrugada registra
  aqui o que mudou.
