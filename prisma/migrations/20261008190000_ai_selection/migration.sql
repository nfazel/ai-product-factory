-- Non-secret active provider and model. Credentials stay in the server environment.
CREATE TABLE "AiSelection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSelectionChange" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSelectionChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiSelectionChange_createdAt_idx" ON "AiSelectionChange"("createdAt");
