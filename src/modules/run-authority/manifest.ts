import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { canonicalJson } from "@/modules/coding/external-manifest";

/**
 * A run authority is a person's signed grant that lets the Builder make routine approvals for one plan. This file holds its
 * shape and its signature. It is pure apart from the signing key, so it can be tested without a database.
 */
export const RUN_AUTHORITY_STEPS = [
  "APPROVE_TASK",
  "APPROVE_PLAN",
  "APPROVE_CODE",
  "RECORD_SNAPSHOT",
  "SIGN_RUNTIME_REVIEW",
  "START_VERIFICATION",
] as const;
export type RunAuthorityStep = (typeof RUN_AUTHORITY_STEPS)[number];

export const DEFAULT_AUTHORITY_DAYS = 7;
export const DEFAULT_MAX_RETRIES = 2;
export const RISK_CEILING = "LOW" as const;

/** What an authority can never do, stated in the grant itself so the person sees it when they sign. */
export const AUTHORITY_EXCLUDES = [
  "Accept a feature",
  "Ship or merge",
  "Change requirements or scope",
  "Approve code for a task that is not LOW risk",
  "Approve a verification that did not pass",
  "Renew itself",
] as const;

export type RunAuthorityManifest = {
  kind: "RUN_AUTHORITY";
  version: 1;
  productId: string;
  planId: string;
  tasks: { id: string; title: string }[];
  steps: RunAuthorityStep[];
  riskCeiling: typeof RISK_CEILING;
  maxRetries: number;
  excludes: string[];
  grantedAt: string;
  expiresAt: string;
  operator: { kind: string; id: string; name: string };
};

const PURPOSE = "AI_PRODUCT_FACTORY_RUN_AUTHORITY_V1\0";

function signingKey() {
  const key = process.env.EXTERNAL_REVIEW_APPROVAL_KEY;
  if (!key || Buffer.byteLength(key) < 32) throw new Error("Protected operator confirmation is unavailable.");
  return key;
}

export function manifestDigest(manifest: RunAuthorityManifest) {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function signManifest(manifest: RunAuthorityManifest) {
  const signature = createHmac("sha256", signingKey()).update(PURPOSE).update(canonicalJson(manifest)).digest("hex");
  return { digest: manifestDigest(manifest), signature };
}

/** True only when the stored digest and signature both match this manifest under the current key. */
export function manifestIsAuthentic(manifest: RunAuthorityManifest, digest: string, signature: string) {
  try {
    if (!/^[a-f0-9]{64}$/.test(digest) || !/^[a-f0-9]{64}$/.test(signature)) return false;
    if (manifestDigest(manifest) !== digest) return false;
    const expected = createHmac("sha256", signingKey()).update(PURPOSE).update(canonicalJson(manifest)).digest();
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/** The exact words recorded as the approver. The database refuses any other text for an approval under authority. */
export function authorityWording(authorityId: string, operatorName: string) {
  return `Builder, under authority ${authorityId} granted by ${operatorName}`;
}
