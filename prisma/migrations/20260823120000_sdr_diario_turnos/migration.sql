-- Diário do SDR: um turno da entrevista, sem uma palavra do cliente dentro.
CREATE TABLE "sdr_diario_turnos" (
    "id" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversa" TEXT NOT NULL,
    "iaRespondeu" BOOLEAN NOT NULL,
    "motivoSemIA" TEXT,
    "camposPelaIA" INTEGER NOT NULL DEFAULT 0,
    "camposPeloMotor" INTEGER NOT NULL DEFAULT 0,
    "chavesPeloMotor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "perguntasNoAr" INTEGER NOT NULL DEFAULT 0,
    "seguemSemResposta" INTEGER NOT NULL DEFAULT 0,
    "travou" BOOLEAN NOT NULL DEFAULT false,
    "cobertura" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "podePropor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sdr_diario_turnos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sdr_diario_turnos_quando_idx" ON "sdr_diario_turnos"("quando");
CREATE INDEX "sdr_diario_turnos_conversa_quando_idx" ON "sdr_diario_turnos"("conversa", "quando");
CREATE INDEX "sdr_diario_turnos_motivoSemIA_quando_idx" ON "sdr_diario_turnos"("motivoSemIA", "quando");
