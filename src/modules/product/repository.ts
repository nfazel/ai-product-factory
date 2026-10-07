import "server-only";

import type { ProductStatus } from "@/domain/constants";
import { db } from "@/lib/db";
import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from "@/modules/product/types";

function toProduct(row: {
  id: string;
  name: string;
  description: string;
  vision: string;
  problemStatement: string;
  targetUsers: string;
  status: Product["status"];
  currentStage: Product["currentStage"];
  createdAt: Date;
  updatedAt: Date;
  _count?: { workItems: number };
}): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    vision: row.vision,
    problemStatement: row.problemStatement,
    targetUsers: row.targetUsers,
    status: row.status,
    currentStage: row.currentStage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    workItemCount: row._count?.workItems ?? 0,
  };
}

const productInclude = { _count: { select: { workItems: true } } } as const;

export async function listProductRows(limit?: number) {
  const rows = await db.product.findMany({
    include: productInclude,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map(toProduct);
}

export async function findProductRow(id: string) {
  const row = await db.product.findUnique({
    where: { id },
    include: productInclude,
  });
  return row ? toProduct(row) : null;
}

export async function insertProduct(
  input: CreateProductInput & {
    status: Product["status"];
    currentStage: Product["currentStage"];
  },
) {
  const row = await db.product.create({
    data: input,
    include: productInclude,
  });
  return toProduct(row);
}

export async function saveProduct(input: UpdateProductInput) {
  const row = await db.product.update({
    where: { id: input.id },
    data: {
      name: input.name,
      description: input.description,
      vision: input.vision,
      problemStatement: input.problemStatement,
      targetUsers: input.targetUsers,
      status: input.status,
      currentStage: input.currentStage,
    },
    include: productInclude,
  });
  return toProduct(row);
}

export async function countProducts(status?: ProductStatus) {
  return db.product.count({ where: status ? { status } : undefined });
}
