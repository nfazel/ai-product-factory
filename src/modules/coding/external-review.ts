import {AuthorityUnavailableError} from '@/modules/verification/authority-status';
import "server-only";

import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { childEnv, createWorktree, assertWorktreeIsolated, worktreeRoot } from "@/modules/coding/git";
import { resolveProductRepository } from "@/modules/source-control/product-repository";
import { baselinePreservationIssues } from "@/modules/coding/preservation";
import { classifyWrite, isSecretPath } from "@/modules/coding/policy";
import { DomainError } from "@/modules/shared/errors";
import { canonicalJson, inspectExternalFile, manifestDigest, scopeDigest, requireReviewCredential, signReview, validReview, type ExternalManifest, type ExternalScope, type ReviewAttestation } from "@/modules/coding/external-manifest";

const exec = promisify(execFile);
const KEY = "EXTERNAL_REVIEW_APPROVAL_KEY";

async function gitBytes(root: string, args: string[]) {
  const result = await exec("git", ["--no-replace-objects", "-c", "core.fsmonitor=false", "-c", "maintenance.auto=false", ...args], { cwd: root, env: childEnv(), encoding: "buffer", maxBuffer: 20_000_000, timeout: 30000 });
  return result.stdout;
}
async function text(root: string, args: string[]) { return (await gitBytes(root, args)).toString("utf8").trim(); }
function configuredKey() { return process.env[KEY]; }

async function workspaceScope(productId: string, workspaceId: string) {
  const workspace = await db.repositoryWorkspace.findFirst({ where: { id: workspaceId, productId }, include: { plan: true, contract: true, task: true } });
  if (!workspace?.plan || !workspace.contract) throw new DomainError("An approved task scope is required for external import.");
  if (workspace.executionContractStale || workspace.contract.stale || ["DRAFT", "ESCALATED"].includes(workspace.contract.status) || !workspace.plan.approvedAt || !workspace.plan.approvedBy || !["APPROVED", "COMPLETED"].includes(workspace.plan.status)) throw new DomainError("External review requires a current approved plan and contract.");
  const p = workspace.plan, c = workspace.contract;
  const scope: ExternalScope = {
    productId, workspaceId, taskId: workspace.implementationTaskId, baseCommit: workspace.baseCommit,
    plan: { version: p.version, approvedAt: p.approvedAt, approvedBy: p.approvedBy, summary: p.summary, filesExpectedToChange: p.filesExpectedToChange, steps: p.steps, setupCommands: p.setupCommands, validationCommands: p.validationCommands, validationPlan: p.validationPlan },
    contract: { allowedPaths: c.allowedPaths, restrictedPaths: c.restrictedPaths, maxFiles: c.maxFiles, allowFileDelete: c.allowFileDelete, sourceFingerprint: c.sourceFingerprint, objective: c.objective, architectureConstraints: c.architectureConstraints, codingPolicyConstraints: c.codingPolicyConstraints, acceptanceCriteria: c.acceptanceCriteria, requiredChecks: c.requiredChecks, dependencies: c.dependencies, validationExpectations: c.validationExpectations, executionMode: c.executionMode, riskLevel: c.riskLevel },
  };
  return { workspace, scope };
}

async function entry(root: string, commit: string, file: string) {
  const raw = await gitBytes(root, ["ls-tree", "-z", commit, "--", file]);
  if (!raw.length) return { mode: null, content: null };
  const header = raw.toString("utf8").split("\t")[0], [mode, kind, oid] = header.split(" ");
  if (kind !== "blob" || !/^[a-f0-9]{40}$/.test(oid)) throw new DomainError("Only ordinary file blobs may be externally imported.");
  return { mode, content: await gitBytes(root, ["cat-file", "blob", oid]) };
}

/** Read-only, complete commit manifest. Full SHAs only; no user-controlled refs. */
export async function prepareExternalReview(productId: string, workspaceId: string, sourceCommit: string, rootOverride?: string): Promise<ExternalManifest> {
  const { scope } = await workspaceScope(productId, workspaceId);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit) || !/^[a-f0-9]{40}$/.test(scope.baseCommit)) throw new DomainError("Resolved full commit SHAs are required.");
  const root = rootOverride ?? (await resolveProductRepository(productId)).localPath;
  if (await text(root, ["cat-file", "-t", sourceCommit]) !== "commit") throw new DomainError("Source is not a commit.");
  if (await text(root, ["merge-base", scope.baseCommit, sourceCommit]) !== scope.baseCommit) throw new DomainError("External commit must descend from the original task baseline.");
  const raw = (await gitBytes(root, ["diff", "--name-status", "--no-renames", "-z", scope.baseCommit, sourceCommit, "--"])).toString("utf8").split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    if (!["A", "M", "D", "T"].includes(raw[i]) || !raw[i + 1]) throw new DomainError("Unsupported external change status.");
    paths.push(raw[i + 1]);
  }
  if (!paths.length || paths.length > (scope.contract.maxFiles ?? 8)) throw new DomainError("External change set is empty or exceeds the approved file limit.");
  const files = [], hard: string[] = [];
  for (const file of paths.sort()) {
    const permission = classifyWrite(file, scope.contract.allowedPaths as string[], scope.contract.restrictedPaths as string[]);
    if (!permission.ok || isSecretPath(file) || file.startsWith("/") || file.split("/").some(part => !part || part === "." || part === "..") || /[\x00-\x1f\\]/.test(file) || !(scope.plan.filesExpectedToChange as string[]).includes(file)) throw new DomainError("External commit contains an unsafe, restricted or out-of-scope path.");
    const before = await entry(root, scope.baseCommit, file), after = await entry(root, sourceCommit, file);
    const inspected = inspectExternalFile({ path: file, before: before.content, after: after.content, beforeMode: before.mode, afterMode: after.mode }, scope);
    files.push(inspected.file); hard.push(...inspected.hard.map(reason => `${file}: ${reason}`));
  }
  if (hard.length) throw new DomainError(`External import has non-waivable blockers:\n${hard.join("\n")}`);
  return { version: 1, productId, taskId: scope.taskId, workspaceId, baseCommit: scope.baseCommit, sourceCommit, tree: await text(root, ["rev-parse", `${sourceCommit}^{tree}`]), scopeHash: scopeDigest(scope), files };
}

/** Local operator only: never expose this as an unauthenticated server action.
 * Possessing a configured review credential is required in addition to naming
 * an actor. Caller-supplied names do not establish authority. */
export async function approveExternalReview(input: { productId: string; workspaceId: string; sourceCommit: string; digest: string; reviewedIssues: { path: string; reason: string }[]; credential: string; actor: { id: string; name: string }; reason: string }) {
  requireReviewCredential(input.credential, configuredKey());
  if (!input.actor.id.trim() || !input.actor.name.trim() || /^(?:codex|coding agent|verification agent|testing agent)$/i.test(input.actor.name.trim()) || input.reason.trim().length < 12) throw new DomainError("A human operator attribution and substantive review reason are required.");
  const manifest = await prepareExternalReview(input.productId, input.workspaceId, input.sourceCommit);
  const digest = manifestDigest(manifest);
  if (input.digest !== digest) throw new DomainError("The reviewed manifest changed. Review the current manifest before approving.");
  const issues = manifest.files.flatMap(file => file.issues.map(reason => ({ path: file.path, reason })));
  if (canonicalJson(input.reviewedIssues) !== canonicalJson(issues)) throw new DomainError("Every flagged change must be explicitly acknowledged, with no additional flags.");
  const { workspace, scope } = await workspaceScope(input.productId, input.workspaceId);
  if (scopeDigest(scope) !== manifest.scopeHash) throw new DomainError("Scope changed since the manifest was prepared.");
  return db.$transaction(async tx => {
    // Re-check the scope under the transaction before recording authorization.
    const plan = await tx.codingExecutionPlan.findUniqueOrThrow({ where: { workspaceId: input.workspaceId } });
    const contract = await tx.codingExecutionContract.findUniqueOrThrow({ where: { workspaceId: input.workspaceId } });
    if (plan.updatedAt.getTime() !== workspace.plan!.updatedAt.getTime() || contract.updatedAt.getTime() !== workspace.contract!.updatedAt.getTime()) throw new DomainError("Scope changed while review was being recorded.");
    const approvedAt = new Date();
    const approval = await tx.approval.create({ data: { productId: input.productId, workItemId: workspace.task.workItemId, approvalType: "CODE_CHANGE", status: "APPROVED", approvedBy: input.actor.name, requestedAt: approvedAt, resolvedAt: approvedAt, comments: `External preservation review only. Manifest ${digest}. ${input.reason}` } });
    const attestation: ReviewAttestation = { kind: "EXTERNAL_CHANGE_REVIEW", manifest, approvalId: approval.id, digest, reviewedIssues: issues, actor: input.actor, reason: input.reason.trim(), approvedAt: approvedAt.toISOString() };
    const signature = signReview(attestation, configuredKey()!);
    const evidence = await tx.codingEvidence.create({ data: { workspaceId: workspace.id, implementationTaskId: workspace.implementationTaskId, type: "HUMAN_CONFIRMATION", source: "HUMAN", result: "APPROVED", description: `Explicit human preservation review ${approval.id}; exact manifest ${digest}. This is not a validation pass or final code approval.`, output: JSON.stringify({ attestation, signature }) } });
    await tx.activity.create({ data: { productId: input.productId, workItemId: workspace.task.workItemId, type: "CODING_APPROVED", actor: input.actor.name, description: `Human authorized external review ${approval.id}, manifest ${digest}, ${issues.length} explicit flags. Validation and final code review remain required.` } });
    return { approvalId: approval.id, evidenceId: evidence.id, digest };
  });
}

async function effectiveReview(manifest: ExternalManifest) {
  const invalidated = await db.codingEvidence.findMany({ where: { workspaceId: manifest.workspaceId, result: "INVALIDATED", type: "HUMAN_CONFIRMATION" }, select: { output: true } });
  const revoked = new Set(invalidated.flatMap(record => { try { const data = JSON.parse(record.output); return data.kind === "EXTERNAL_REVIEW_INVALIDATED" ? [data.approvalId] : []; } catch { return []; } }));
  const evidence = await db.codingEvidence.findMany({ where: { workspaceId: manifest.workspaceId, implementationTaskId: manifest.taskId, type: "HUMAN_CONFIRMATION", source: "HUMAN", result: "APPROVED" }, orderBy: { createdAt: "desc" } });
  for (const record of evidence) {
    let attestation:ReviewAttestation;
    try {
      const parsed=JSON.parse(record.output) as {attestation:ReviewAttestation;signature:string};attestation=parsed.attestation;
      if(!attestation||revoked.has(attestation.approvalId)||!validReview(attestation,parsed.signature,configuredKey(),manifest))continue;
    }catch{continue}
    const approval=await db.approval.findUnique({where:{id:attestation.approvalId}});
    if(approval?.status!=='APPROVED'||approval.productId!==manifest.productId||!approval.comments.startsWith(`External preservation review only. Manifest ${attestation.digest}.`)||approval.approvedBy!==attestation.actor.name||approval.resolvedAt?.toISOString()!==attestation.approvedAt)continue;
    return {approvalId:approval.id,evidenceId:record.id,attestation};
  }
  return null;
}

/** Preservation remains enforced; only exact explicitly reviewed auth/SQL flags
 * are accounted for. Any dirty tree, scope change, or new issue fails closed. */
async function invalidateImport(workspace: { id: string; productId: string; implementationTaskId: string }, approvalId: string, reason: string) {
  await db.$transaction(async tx => {
    const now = new Date();
    // An invalidated idle implementation must be able to receive a fresh review
    // and import. Active commands keep their normal failure transition.
    await tx.repositoryWorkspace.updateMany({ where: { id: workspace.id, status: { in: ["COMPLETED", "READY_FOR_REVIEW"] } }, data: { status: "FAILED", completedAt: null } });
    await tx.codingEvidence.create({ data: { workspaceId: workspace.id, implementationTaskId: workspace.implementationTaskId, type: "HUMAN_CONFIRMATION", source: "REPOSITORY", result: "INVALIDATED", description: reason, output: JSON.stringify({ kind: "EXTERNAL_REVIEW_INVALIDATED", approvalId, reason }) } });
    await tx.codeChangeApproval.updateMany({ where: { workspaceId: workspace.id, stale: false }, data: { stale: true, staleReason: reason, staleFlaggedAt: now } });
    const sessions = await tx.verificationSession.findMany({ where: { repositoryWorkspaceId: workspace.id, demo: false }, select: { id: true } });
    const ids = sessions.map(item => item.id);
    if (ids.length) {
      await tx.verificationSession.updateMany({ where: { id: { in: ids }, stale: false }, data: { stale: true, staleReason: reason, staleFlaggedAt: now } });
      await tx.verificationContract.updateMany({ where: { sessionId: { in: ids } }, data: { stale: true } });
      await tx.verificationApproval.updateMany({ where: { sessionId: { in: ids }, stale: false }, data: { stale: true, staleReason: reason, staleFlaggedAt: now } });
    }
  });
}

export async function unapprovedPreservationIssues(workspaceId: string, root: string, baseCommit: string, readOnly=false) {
  const issues = await baselinePreservationIssues(root, baseCommit, true);
  const imports = await db.codingEvidence.findMany({ where: { workspaceId, type: "HUMAN_CONFIRMATION", source: "HUMAN", result: "IMPORTED" }, orderBy: { createdAt: "desc" }, select: { output: true } });
  const latest = imports.flatMap(item => { try { const parsed = JSON.parse(item.output); return parsed.kind === "EXTERNAL_COMMIT_IMPORT" ? [parsed] : []; } catch { return []; } })[0];
  if (!latest) return issues;
  if(!configuredKey()||Buffer.byteLength(configuredKey()!)<32)throw new AuthorityUnavailableError();
  const workspace = await db.repositoryWorkspace.findUnique({ where: { id: workspaceId } });
  let failure = "External import approval no longer matches the source or approved scope. Fresh human review is required.";
  try {
    if (!workspace || workspace.baseCommit !== baseCommit || path.resolve(workspace.workspacePath) !== path.resolve(root)) throw new DomainError("Workspace binding changed.");
    if (await text(root, ["status", "--porcelain", "--untracked-files=all"])) throw new DomainError("External source has uncommitted changes.");
    const head = await text(root, ["rev-parse", "HEAD"]);
    const manifest = await prepareExternalReview(workspace.productId, workspaceId, head, root);
    const approved = await effectiveReview(manifest);
    if (!approved || (latest && (latest.reviewApprovalId !== approved.approvalId || latest.digest !== manifestDigest(manifest)))) throw new DomainError("Signed review is stale, missing or invalid.");
    return issues.filter(issue => !approved.attestation.reviewedIssues.some(allowed => allowed.path === issue.path && allowed.reason === issue.reason));
  } catch (error) {
    if(!(error instanceof DomainError))throw new AuthorityUnavailableError();
    failure += ` ${error.message}`;
    if (latest && workspace) {
      const records = await db.codingEvidence.findMany({ where: { workspaceId, result: "INVALIDATED" }, select: { output: true } });
      const alreadyInvalid = records.some(item => { try { return JSON.parse(item.output).approvalId === latest.reviewApprovalId; } catch { return false; } });
      if (!alreadyInvalid && !readOnly) await invalidateImport(workspace, latest.reviewApprovalId, failure);
      return [...issues, { path: ".", reason: failure }];
    }
    return issues;
  }
}

export async function importExternalCommit(input: { productId: string; workspaceId: string; sourceCommit: string; digest: string; credential: string }) {
  requireReviewCredential(input.credential, configuredKey());
  const manifest = await prepareExternalReview(input.productId, input.workspaceId, input.sourceCommit);
  if (manifestDigest(manifest) !== input.digest) throw new DomainError("External import manifest is no longer current.");
  const review = await effectiveReview(manifest);
  if (!review) throw new DomainError("A current signed human external review is required before import.");
  const { workspace, scope } = await workspaceScope(input.productId, input.workspaceId);
  if (scopeDigest(scope) !== manifest.scopeHash) throw new DomainError("Scope changed since the manifest was prepared.");
  if (workspace.status !== "FAILED") throw new DomainError("Import requires an idle failed workspace; do not replace active or approved coding work.");
  const repository = await resolveProductRepository(input.productId);
  const original = { path: workspace.workspacePath, branch: workspace.branchName, head: workspace.headCommit, status: workspace.status, gitStatus: await text(workspace.workspacePath, ["status", "--porcelain", "--untracked-files=all"]), actualHead: await text(workspace.workspacePath, ["rev-parse", "HEAD"]) };
  const directory = path.join(worktreeRoot(), `external-${randomUUID()}`);
  const created = await createWorktree({ repositoryPath: repository.localPath, workspacePath: directory, branchName: `codex/external-${workspace.id}-${manifest.sourceCommit.slice(0, 8)}`, baseCommit: manifest.sourceCommit });
  await assertWorktreeIsolated(directory, repository.localPath);
  const imported = await prepareExternalReview(input.productId, input.workspaceId, manifest.sourceCommit, directory);
  if (manifestDigest(imported) !== input.digest || await text(directory, ["status", "--porcelain", "--untracked-files=all"])) throw new DomainError(`Import verification failed; original checkout retained and new checkout kept for inspection: ${directory}`);
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`external-import:${workspace.id}`})::bigint)`;
    const current = await tx.repositoryWorkspace.findUniqueOrThrow({ where: { id: workspace.id } });
    if (current.updatedAt.getTime() !== workspace.updatedAt.getTime()) throw new DomainError("Coding workspace changed during import; neither checkout was discarded.");
    const p = await tx.codingExecutionPlan.findUniqueOrThrow({ where: { workspaceId: workspace.id } });
    const c = await tx.codingExecutionContract.findUniqueOrThrow({ where: { workspaceId: workspace.id } });
    if (p.updatedAt.getTime() !== workspace.plan!.updatedAt.getTime() || c.updatedAt.getTime() !== workspace.contract!.updatedAt.getTime()) throw new DomainError("Approved scope changed during import; re-review required.");
    const approval = await tx.approval.findUniqueOrThrow({ where: { id: review.approvalId } });
    if (approval.status !== "APPROVED" || approval.approvedBy !== review.attestation.actor.name || approval.resolvedAt?.toISOString() !== review.attestation.approvedAt || !approval.comments.startsWith(`External preservation review only. Manifest ${input.digest}.`)) throw new DomainError("The external review was revoked during import.");
    const invalidations = await tx.codingEvidence.findMany({ where: { workspaceId: workspace.id, result: "INVALIDATED", type: "HUMAN_CONFIRMATION" }, select: { output: true } });
    if (invalidations.some(record => { try { return JSON.parse(record.output).approvalId === review.approvalId; } catch { return false; } })) throw new DomainError("The external review was invalidated during import.");
    await tx.repositoryWorkspace.update({ where: { id: workspace.id }, data: { workspacePath: directory, branchName: created.branchName, headCommit: manifest.sourceCommit, status: "FAILED", completedAt: null } });
    await tx.codingEvidence.create({ data: { workspaceId: workspace.id, implementationTaskId: workspace.implementationTaskId, type: "HUMAN_CONFIRMATION", source: "HUMAN", result: "IMPORTED", description: `Imported externally reviewed commit ${manifest.sourceCommit}; original checkout preserved. Native validation is required.`, output: JSON.stringify({ kind: "EXTERNAL_COMMIT_IMPORT", original, imported: { path: directory, branch: created.branchName, head: manifest.sourceCommit }, digest: input.digest, reviewApprovalId: review.approvalId }) } });
    await tx.activity.create({ data: { productId: input.productId, workItemId: workspace.task.workItemId, type: "CODING_CHANGES_REQUESTED", actor: review.attestation.actor.name, description: `Imported commit ${manifest.sourceCommit} into isolated checkout; original ${original.path} retained. No checks or completion results inferred.` } });
  });
  return { workspaceId: workspace.id, workspacePath: directory, sourceCommit: manifest.sourceCommit, original };
}
