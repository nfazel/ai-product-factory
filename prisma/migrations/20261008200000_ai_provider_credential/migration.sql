-- Encrypted cloud provider credentials. The encryption key stays in the server environment.
CREATE TABLE "AiProviderCredential" (
    "provider" TEXT NOT NULL,
    "encryptedCredential" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderCredential_pkey" PRIMARY KEY ("provider")
);

CREATE TABLE "AiProviderConnectionCheck" (
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConnectionCheck_pkey" PRIMARY KEY ("provider")
);
