import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { loadSnapshots } from "@/modules/guidance/load";
import { createProduct, listProducts, listRemovedProducts, removeProduct, restoreProduct } from "@/modules/product/service";

const created: string[] = [];
afterEach(async () => {
  await db.activity.deleteMany({ where: { productId: { in: created } } });
  await db.product.deleteMany({ where: { id: { in: created } } });
  created.length = 0;
});

async function makeProduct() {
  const product = await createProduct({ name: "Removal test", startMode: "IDEA", problemStatement: "Test the removal.", description: "", vision: "", targetUsers: "" });
  created.push(product.id);
  return product;
}

describe("removing a product", () => {
  it("hides it from every list and keeps it recoverable", { timeout: 180_000 }, async () => {
    const product = await makeProduct();
    expect((await listProducts()).some((item) => item.id === product.id)).toBe(true);

    const removed = await removeProduct(product.id);
    expect(removed.status).toBe("ARCHIVED");
    expect((await listProducts()).some((item) => item.id === product.id)).toBe(false);
    expect((await listRemovedProducts()).some((item) => item.id === product.id)).toBe(true);
    expect((await loadSnapshots()).some((snapshot) => snapshot.productId === product.id)).toBe(false);
    // The record itself is still there, and a direct link still resolves.
    expect(await db.product.findUnique({ where: { id: product.id } })).not.toBeNull();
  });

  it("restores a removed product and is safe to repeat", async () => {
    const product = await makeProduct();
    await removeProduct(product.id);
    await removeProduct(product.id);
    const restored = await restoreProduct(product.id);
    expect(restored.status).toBe("ACTIVE");
    expect((await listProducts()).some((item) => item.id === product.id)).toBe(true);
    await expect(restoreProduct("missing-product")).rejects.toThrow("Product not found.");
  });
});
