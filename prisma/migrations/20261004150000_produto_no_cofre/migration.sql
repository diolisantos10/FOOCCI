-- ⭐ PAREAMENTO COM O COFRE DA CONTROL ROOM (desenho do CEO, 04/10/2026)
--
-- O Foocci gera o PRÓPRIO segredo e o guarda só aqui, cifrado (AES-256-GCM,
-- src/lib/crypto.ts). Ninguém entrega token: a Control Room recebe apenas o
-- sha256 do segredo e o CEO aprova o pareamento com um clique.
-- Tabela nova; nada existente é tocado.
CREATE TABLE IF NOT EXISTS "produto_no_cofre" (
  "id"                  TEXT NOT NULL,
  "segredoCifrado"      TEXT NOT NULL,
  "hash"                TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'novo',
  "ultimaSolicitacaoEm" TIMESTAMP(3),
  "ultimaResposta"      TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "produto_no_cofre_pkey" PRIMARY KEY ("id")
);
