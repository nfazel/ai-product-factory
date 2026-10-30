import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson, contentHash } from '@/modules/coding/external-manifest';
import { approveVerificationCommand } from './policy';
import { approvedBehaviors } from './behavior-evidence';
import { parseRuntimeDeclaration, type RuntimeDeclaration } from './containers/policy';

export function runtimeCommands(validationPlan: string): Map<string, RuntimeDeclaration> {
  let value;
  try { value = JSON.parse(validationPlan); } catch {
    if (/verificationRuntime/.test(validationPlan)) throw new Error('Malformed verification runtime metadata.');
    return new Map();
  }
  const metadata = value?.verificationRuntime;
  if (metadata === undefined) return new Map();
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).some(key => !['commands', 'behaviors'].includes(key))) throw new Error('Invalid verification runtime metadata.');
  const entries = metadata.commands ?? [];
  if (!Array.isArray(entries)) throw new Error('Invalid approved verification runtime.');
  const result = new Map<string, RuntimeDeclaration>();
  for (const entry of entries) {
    const approved = entry && typeof entry.command === 'string' ? approveVerificationCommand(entry.command) : null;
    if (!entry || Object.keys(entry).sort().join() !== 'command,runtime' || !approved?.ok || approved.command !== entry.command || result.has(entry.command)) throw new Error('Invalid or duplicate approved runtime command.');
    result.set(entry.command, parseRuntimeDeclaration(entry.runtime));
  }
  return result;
}
export function validateRuntimeMetadata(validationPlan: string, criteria: { id: string }[], declaredCommands: string[]) {
  const commands = runtimeCommands(validationPlan);
  for (const command of commands.keys()) if (!declaredCommands.includes(command)) throw new Error('Runtime command is outside the approved validation commands.');
  const ids = new Set(criteria.map(criterion => criterion.id));
  if (ids.size !== criteria.length) throw new Error('Duplicate criterion identity.');
  for (const behavior of approvedBehaviors(validationPlan)) if (!ids.has(behavior.criterionId)) throw new Error('Behaviour references a criterion outside this task.');
}
export type RuntimeManifest = {
  kind: 'VERIFICATION_RUNTIME_MANIFEST'; version: 1;
  productId: string; taskId: string; workspaceId: string; commitSha: string; tree: string;
  files: { path: string; hash: string; mode: number }[];
  codeApproval: { id: string; approvalId: string; headCommit: string; diffHash: string; approvedBy: string; resolvedAt: string };
  plan: { id: string; version: number; approvedBy: string; approvedAt: string; validationPlan: string; content: unknown };
  criteria: { id: string; description: string }[];
  contractHash: string;
  runtime: { digest: string; files: Record<string, string> };
};
export const runtimeManifestDigest = (manifest: RuntimeManifest) => contentHash(canonicalJson(manifest));
export type RuntimeAttestation = { kind: 'VERIFICATION_RUNTIME_REVIEW'; version: 1; approvalId: string; digest: string; manifest: RuntimeManifest; actor: { id: string; name: string }; approvedAt: string; reason: string };
const DOMAIN = 'AI_PRODUCT_FACTORY_VERIFICATION_RUNTIME_REVIEW_V1\0';
export const signRuntimeReview = (attestation: RuntimeAttestation, key: string) => createHmac('sha256', key).update(DOMAIN).update(canonicalJson(attestation)).digest('hex');
export function validRuntimeReview(attestation: RuntimeAttestation, signature: string, key: string | undefined, manifest: RuntimeManifest) {
  try {
  if (!key || Buffer.byteLength(key) < 32 || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) || !attestation || attestation.kind !== 'VERIFICATION_RUNTIME_REVIEW' || attestation.version !== 1 || !attestation.approvalId || !attestation.actor?.id?.trim() || !attestation.actor.name?.trim() || /^(codex|coding agent|verification agent|testing agent)$/i.test(attestation.actor.name.trim()) || attestation.reason?.trim().length < 12 || !Number.isFinite(Date.parse(attestation.approvedAt))) return false;
  if (attestation.digest !== runtimeManifestDigest(manifest) || canonicalJson(attestation.manifest) !== canonicalJson(manifest)) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(signRuntimeReview(attestation, key), 'hex'));
  } catch { return false; }
}
export type RuntimeBinding = { kind: 'VERIFICATION_RUNTIME_BINDING'; version: 1; approvalId: string; evidenceId: string; digest: string; manifest: RuntimeManifest };
export function bindingFromState(state: unknown): RuntimeBinding | null {
  const binding = state && typeof state === 'object' && !Array.isArray(state) ? (state as Record<string, unknown>).runtimeBinding : null;
  if (!binding || typeof binding !== 'object') return null;
  const b = binding as RuntimeBinding;
  if (b.kind !== 'VERIFICATION_RUNTIME_BINDING' || b.version !== 1 || typeof b.approvalId !== 'string' || !b.approvalId || typeof b.evidenceId !== 'string' || !b.evidenceId || typeof b.digest !== 'string' || !/^[a-f0-9]{64}$/.test(b.digest) || !b.manifest || b.manifest.kind !== 'VERIFICATION_RUNTIME_MANIFEST' || b.manifest.version !== 1 || !['productId','taskId','workspaceId','commitSha'].every(key => typeof (b.manifest as unknown as Record<string,unknown>)[key] === 'string')) return null;
  return b;
}
