import type { ProductStage, ProductStatus } from "@/domain/constants";

export type Product = {
  id: string;
  name: string;
  description: string;
  vision: string;
  problemStatement: string;
  targetUsers: string;
  status: ProductStatus;
  currentStage: ProductStage;
  createdAt: Date;
  updatedAt: Date;
  workItemCount: number;
};

export type CreateProductInput = {
  name: string;
  description: string;
  vision: string;
  problemStatement: string;
  targetUsers: string;
};

export type UpdateProductInput = CreateProductInput & {
  id: string;
  status: ProductStatus;
  currentStage: ProductStage;
};
