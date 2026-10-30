import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isSecretPath, classifyWrite } from "@/modules/coding/policy";
import { preservationViolations } from "@/modules/coding/preservation";

export const EXTERNAL_REVIEW_VERSION = 1;
export type ExternalFile = { path: string; beforeHash: string | null; afterHash: string | null; beforeMode: string | null; afterMode: string | null; issues: string[] };
export type ExternalManifest = {
  version: 1; productId: string; taskId: string; workspaceId: string;
  baseCommit: string; sourceCommit: string; tree: string; scopeHash: string;
  files: ExternalFile[];
};
export type ExternalScope = { productId: string; taskId: string; workspaceId: string; baseCommit: string; plan: { version: number; approvedAt: Date | string | null; approvedBy: string; summary: string; filesExpectedToChange: unknown; steps: unknown; setupCommands: unknown; validationCommands: unknown; validationPlan: string }; contract: { allowedPaths: unknown; restrictedPaths: unknown; maxFiles: number | null; allowFileDelete: boolean; sourceFingerprint: string; objective: string; architectureConstraints: string; codingPolicyConstraints: string; acceptanceCriteria: unknown; requiredChecks: unknown; dependencies: unknown; validationExpectations: string; executionMode: string; riskLevel: string } };

export function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const contentHash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const manifestDigest = (manifest: ExternalManifest) => contentHash(canonicalJson(manifest));
export const scopeDigest = (scope: ExternalScope) => contentHash(canonicalJson(scope));

const REVIEWABLE = new Set([
  "Existing authentication/authorization import or call changed; explicit security review is required.",
  "An existing security interface implementation changed; explicit security review is required.",
  "Database SQL changes require review by a supported preservation adapter.",
]);
export const reviewableIssue = (reason: string) => REVIEWABLE.has(reason);

export function inspectExternalFile(input: { path: string; before: Buffer | null; after: Buffer | null; beforeMode: string | null; afterMode: string | null }, scope: ExternalScope) {
  const hard: string[] = [];
  const { path, before, after, beforeMode, afterMode } = input;
  const files = Array.isArray(scope.plan.filesExpectedToChange) ? scope.plan.filesExpectedToChange : [];
  const allowed = Array.isArray(scope.contract.allowedPaths) ? scope.contract.allowedPaths as string[] : [];
  const restricted = Array.isArray(scope.contract.restrictedPaths) ? scope.contract.restrictedPaths as string[] : [];
  if (!path || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..") || /[\x00-\x1f\\]/.test(path)) hard.push("Unsafe or noncanonical path.");
  if (isSecretPath(path)) hard.push("Secret paths cannot receive external review exceptions.");
  if (!files.includes(path)) hard.push("File is outside the approved plan.");
  const permission = classifyWrite(path, allowed, restricted);
  if (!permission.ok) hard.push(permission.reason);
  if ([beforeMode, afterMode].some(mode => mode !== null && mode !== "100644" && mode !== "100755")) hard.push("Symlinks, submodules and unsupported Git modes cannot be imported.");
  if (after === null && !scope.contract.allowFileDelete) hard.push("File deletion is not authorized.");
  const reasons = preservationViolations(path, before?.toString("utf8") ?? null, after?.toString("utf8") ?? null);
  hard.push(...reasons.filter(reason => !reviewableIssue(reason)));
  const file: ExternalFile = { path, beforeHash: before === null ? null : contentHash(before), afterHash: after === null ? null : contentHash(after), beforeMode, afterMode, issues: [...new Set(reasons)].sort() };
  return { file, hard };
}

export type ReviewAttestation = { kind: "EXTERNAL_CHANGE_REVIEW"; manifest: ExternalManifest; approvalId: string; digest: string; reviewedIssues: { path: string; reason: string }[]; actor: { id: string; name: string }; reason: string; approvedAt: string };
export function requireReviewCredential(supplied: string, configured: string | undefined) {
  if (!configured || Buffer.byteLength(configured) < 32) throw new Error("External review is disabled: configure an operator review key of at least 32 bytes.");
  if (!timingSafeEqual(Buffer.from(contentHash(supplied), "hex"), Buffer.from(contentHash(configured), "hex"))) throw new Error("External review operator authorization failed.");
}
export const signReview = (attestation: ReviewAttestation, key: string) => createHmac("sha256", key).update(canonicalJson(attestation)).digest("hex");
export function validReview(attestation: ReviewAttestation, signature: string, key: string | undefined, manifest: ExternalManifest) {
  if (!key || Buffer.byteLength(key) < 32 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (attestation.kind !== "EXTERNAL_CHANGE_REVIEW" || attestation.digest !== manifestDigest(manifest) || canonicalJson(attestation.manifest) !== canonicalJson(manifest)) return false;
  const expectedIssues = manifest.files.flatMap(file => file.issues.map(reason => ({ path: file.path, reason })));
  if (canonicalJson(attestation.reviewedIssues) !== canonicalJson(expectedIssues) || expectedIssues.some(issue => !reviewableIssue(issue.reason))) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signReview(attestation, key), "hex"));
}
