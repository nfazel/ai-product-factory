import type { ProductStage, ProductStartMode, ProductStatus } from "@/domain/constants";

export type Product = {
  id: string;
  name: string;
  description: string;
  vision: string;
  problemStatement: string;
  targetUsers: string;
  status: ProductStatus;
  currentStage: ProductStage;
  startMode: ProductStartMode;
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
  startMode: ProductStartMode;
};

export type UpdateProductInput = Omit<CreateProductInput, "startMode"> & {
  id: string;
  status: ProductStatus;
  currentStage: ProductStage;
};
