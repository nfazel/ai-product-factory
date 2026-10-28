import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { inspectImplementation } from "@/modules/verification/inspection";
import { validateFixturePlan } from "@/modules/verification/http/fixtures";

/**
 * Task 4 regression, read-only. It inspects the Find-a-Friend product checkout and checks that the planner can name the
 * Card Discovery Feed routes and validate verification-only accounts against them. It starts no application, provisions
 * no database, and runs no verification session. The product tree is fingerprinted before and after, so any write fails.
 *
 * The product is outside this repository, so the test is skipped when the checkout is absent. Set TASK4_PRODUCT_PATH to
 * point at another checkout of the same product.
 */

const PRODUCT =
  process.env.TASK4_PRODUCT_PATH ||
  "/Users/nichervanfazel/.ai-product-factory/products/cmv0tsipq0003aappiumgzxgn";
const PRESENT = fs.existsSync(path.join(PRODUCT, "src", "app", "api"));

const SKIP = new Set(["node_modules", ".git", ".next"]);

/** A digest of every file's relative path, size and modification time. Reading never changes it. */
function fingerprint(root: string) {
  const hash = crypto.createHash("sha256");
  const walk = (directory: string, depth: number) => {
    if (depth > 12) return;
    for (const name of fs.readdirSync(directory).sort()) {
      if (SKIP.has(name)) continue;
      const absolute = path.join(directory, name);
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) walk(absolute, depth + 1);
      else hash.update(`${path.relative(root, absolute)}:${stat.size}:${stat.mtimeMs}\n`);
    }
  };
  walk(root, 0);
  return hash.digest("hex");
}

describe.skipIf(!PRESENT)("Task 4 regression (Card Discovery Feed, read-only)", () => {
  it("lets the planner name the discovery feed and action routes from the approved snapshot", () => {
    const inspection = inspectImplementation({ workspacePath: PRODUCT, changedFiles: [] });
    const urls = inspection.profile.routes.map((route) => route.url);
    expect(urls).toEqual(expect.arrayContaining(["/api/discovery/feed", "/api/discovery/action"]));
    expect(urls).toEqual(expect.arrayContaining(["/api/auth/signup", "/api/auth/login"]));
  });

  it("validates verification-only accounts and a feed setup step against the real routes, without inventing any", () => {
    const inspection = inspectImplementation({ workspacePath: PRODUCT, changedFiles: [] });
    const { plan, notes } = validateFixturePlan(
      {
        authentication: {
          required: true,
          signupPath: "/api/auth/signup",
          loginPath: "/api/auth/login",
          accountKeys: ["viewer", "candidate"],
        },
        steps: [{ account: "viewer", method: "GET", path: "/api/discovery/feed", body: "", purpose: "feed is reachable" }],
      },
      inspection.profile.routes.map((route) => route.url),
    );
    expect(notes).toEqual([]);
    expect(plan.authentication.required).toBe(true);
    expect(plan.steps).toHaveLength(1);
  });

  it("leaves the product source exactly as it was", () => {
    const before = fingerprint(PRODUCT);
    inspectImplementation({ workspacePath: PRODUCT, changedFiles: [] });
    expect(fingerprint(PRODUCT)).toBe(before);
  });
});
