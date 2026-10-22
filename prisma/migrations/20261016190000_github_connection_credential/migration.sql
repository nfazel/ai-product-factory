-- Builder-level GitHub credential. The encryption key stays in the server environment.
-- Existing connection rows keep their repository fields. Empty credential columns are not a token.
ALTER TABLE "SourceControlConnection" ADD COLUMN "authMode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceControlConnection" ADD COLUMN "login" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceControlConnection" ADD COLUMN "appId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceControlConnection" ADD COLUMN "encryptedCredential" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceControlConnection" ADD COLUMN "encryptionIv" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceControlConnection" ADD COLUMN "authTag" TEXT NOT NULL DEFAULT '';
