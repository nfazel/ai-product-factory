import { createProduct, listProducts } from "@/modules/product/service";
import { createProductSchema } from "@/modules/product/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function GET() {
  const products = await listProducts();
  return jsonData(products);
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  try {
    const product = await createProduct(parsed.data);
    return jsonData(product, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
