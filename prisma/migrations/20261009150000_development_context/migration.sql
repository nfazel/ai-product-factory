ALTER TABLE "Product" ADD COLUMN "developmentContext" "SystemKind";

UPDATE "Product" AS product
SET "developmentContext" = context."systemKind"
FROM "CodebaseContext" AS context
WHERE context."productId" = product.id
  AND product."developmentContext" IS NULL;
