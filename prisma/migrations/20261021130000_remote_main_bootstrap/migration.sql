-- Auditable result of publishing the existing local baseline commit as remote main.
CREATE TABLE "RemoteMainBootstrap" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "baselineSha" TEXT NOT NULL,
    "remoteSha" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemoteMainBootstrap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RemoteMainBootstrap_productId_createdAt_idx" ON "RemoteMainBootstrap"("productId", "createdAt");
CREATE INDEX "RemoteMainBootstrap_repositoryId_idx" ON "RemoteMainBootstrap"("repositoryId");

ALTER TABLE "RemoteMainBootstrap" ADD CONSTRAINT "RemoteMainBootstrap_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteMainBootstrap" ADD CONSTRAINT "RemoteMainBootstrap_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
