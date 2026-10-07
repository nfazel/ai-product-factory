import { getProduct, updateProduct } from "@/modules/product/service";
import { updateProductSchema } from "@/modules/product/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const product = await getProduct(id);
  if (!product) return jsonError(404, "Product not found.");
  return jsonData(product);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await readJson(request);
  const parsed = updateProductSchema.safeParse({ ...(body ?? {}), id });
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  try {
    const product = await updateProduct(parsed.data);
    return jsonData(product);
  } catch (error) {
    return toErrorResponse(error);
  }
}
