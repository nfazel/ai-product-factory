import { describe, expect, it } from "vitest";

import { removeProductSchema } from "@/modules/product/schema";

describe("removeProductSchema", () => {
  it("rejects a missing confirmation, which is what an unticked checkbox sends", () => {
    expect(removeProductSchema.safeParse({ productId: "p1" }).success).toBe(false);
  });
  it("rejects any value other than yes", () => {
    expect(removeProductSchema.safeParse({ productId: "p1", confirm: "no" }).success).toBe(false);
    expect(removeProductSchema.safeParse({ productId: "p1", confirm: "" }).success).toBe(false);
  });
  it("accepts an explicit yes", () => {
    expect(removeProductSchema.safeParse({ productId: "p1", confirm: "yes" }).success).toBe(true);
  });
});
