import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { confirmLocalOperator } from "@/modules/feature-review/authorization";
import { DomainError } from "@/modules/shared/errors";
import {
  AUTHORITY_EXCLUDES,
  DEFAULT_AUTHORITY_DAYS,
  DEFAULT_MAX_RETRIES,
  RISK_CEILING,
  RUN_AUTHORITY_STEPS,
  authorityWording,
  manifestIsAuthentic,
  signManifest,
  type RunAuthorityManifest,
  type RunAuthorityStep,
} from "@/modules/run-authority/manifest";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The authority was stopped or has run out. The run stops cleanly instead of retrying. */
export class AuthorityStoppedError extends DomainError {}

/** A person signs a grant for one approved plan. Requires the operator credential, like every protected decision. */
export async function grantRunAuthority(input: {
  productId: string;
  planId: string;
  credential: string;
  maxRetries?: number;
  days?: number;
  now?: Date;
}) {
  const principal = confirmLocalOperator(input.credential);
  const now = input.now ?? new Date();
  const plan = await db.implementationPlan.findFirst({
    where: { id: input.planId, productId: input.productId },
    include: { tasks: { select: { id: true, title: true }, orderBy: { id: "asc" } } },
  });
  if (!plan) throw new DomainError("That plan was not found for this product.", "NOT_FOUND");
  if (plan.status !== "APPROVED") throw new DomainError("Approve the plan before letting the Builder run it.");
  if (plan.tasks.length === 0) throw new DomainError("This plan has no tasks to run.");
  if (await activeAuthorityForPlan(plan.id, now)) throw new DomainError("The Builder already has an authority for this plan. Stop it before granting another.");

  const manifest: RunAuthorityManifest = {
    kind: "RUN_AUTHORITY",
    version: 1,
    productId: input.productId,
    planId: plan.id,
    tasks: plan.tasks,
    steps: [...RUN_AUTHORITY_STEPS],
    riskCeiling: RISK_CEILING,
    maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
    excludes: [...AUTHORITY_EXCLUDES],
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (input.days ?? DEFAULT_AUTHORITY_DAYS) * DAY_MS).toISOString(),
    operator: { kind: principal.kind, id: principal.id, name: principal.name },
  };
  const { digest, signature } = signManifest(manifest);

  return db.$transaction(async (tx) => {
    const approval = await tx.approval.create({
      data: {
        productId: input.productId,
        approvalType: "RUN_AUTHORITY",
        status: "APPROVED",
        approvedBy: principal.name,
        resolvedAt: now,
        comments: `Let the Builder run plan ${plan.id} until ${manifest.expiresAt}, for LOW risk tasks only.`,
      },
    });
    const authority = await tx.runAuthority.create({
      data: {
        id: randomUUID(),
        productId: input.productId,
        planId: plan.id,
        grantApprovalId: approval.id,
        manifest: manifest as never,
        digest,
        signature,
        expiresAt: new Date(manifest.expiresAt),
        maxRetries: manifest.maxRetries,
        riskCeiling: manifest.riskCeiling,
        createdAt: now,
      },
    });
    await recordActivity({
      productId: input.productId,
      type: "APPROVAL_APPROVED",
      description: `${principal.name} let the Builder run this plan until ${manifest.expiresAt}.`,
      actor: principal.name,
    });
    return authority;
  });
}

/** Stops the Builder. Nothing more can be recorded under the authority. */
export async function revokeRunAuthority(input: { authorityId: string; credential: string }) {
  const principal = confirmLocalOperator(input.credential);
  const authority = await db.runAuthority.findUnique({ where: { id: input.authorityId }, include: { events: { where: { type: "REVOKED" } } } });
  if (!authority) throw new DomainError("That authority was not found.", "NOT_FOUND");
  if (authority.events.length > 0) return;
  await db.runAuthorityEvent.create({
    data: { id: randomUUID(), authorityId: authority.id, type: "REVOKED", detail: { by: principal.name } },
  });
  await recordActivity({
    productId: authority.productId,
    type: "APPROVAL_REJECTED",
    description: `${principal.name} stopped the Builder's authority for this plan.`,
    actor: principal.name,
  });
}

async function activeAuthorityForPlan(planId: string, now: Date) {
  return db.runAuthority.findFirst({
    where: { planId, expiresAt: { gt: now }, events: { none: { type: "REVOKED" } } },
    select: { id: true },
  });
}

/**
 * The only way the rest of the system learns that the Builder may act. It checks the signature, the expiry, the revocation,
 * the product, the step and the task, every time, from the stored record. Nothing a caller passes is trusted.
 */
export async function requireAuthority(input: {
  authorityId: string;
  productId: string;
  step: RunAuthorityStep;
  taskId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const authority = await db.runAuthority.findUnique({ where: { id: input.authorityId }, include: { events: { where: { type: "REVOKED" }, select: { id: true } } } });
  if (!authority || authority.productId !== input.productId) throw new DomainError("The Builder has no authority for this product.");
  const manifest = authority.manifest as unknown as RunAuthorityManifest;
  if (!manifestIsAuthentic(manifest, authority.digest, authority.signature)) {
    throw new DomainError("The Builder's authority could not be verified, so it was not used.");
  }
  if (authority.events.length > 0) throw new AuthorityStoppedError("The Builder's authority was stopped.");
  if (authority.expiresAt <= now) throw new AuthorityStoppedError("The Builder's authority has expired. Grant it again to continue.");
  if (!manifest.steps.includes(input.step)) throw new DomainError("The Builder's authority does not cover this step.");
  if (input.taskId && !manifest.tasks.some((task) => task.id === input.taskId)) {
    throw new DomainError("This task is not part of the plan the Builder was given authority for.");
  }
  return { id: authority.id, planId: authority.planId, riskCeiling: authority.riskCeiling, maxRetries: authority.maxRetries, operatorName: manifest.operator.name, wording: authorityWording(authority.id, manifest.operator.name) };
}

/** Writes down that a step was taken under the authority. The database refuses it once the authority is expired or stopped. */
export async function recordAuthorityStep(authorityId: string, step: RunAuthorityStep, subjectId: string, detail: Record<string, unknown> = {}) {
  return db.runAuthorityEvent.create({
    data: { id: randomUUID(), authorityId, type: "STEP", step, subjectId, detail: detail as never },
  });
}

export type AuthorityGrant = Awaited<ReturnType<typeof requireAuthority>>;

/**
 * The Builder only acts on tasks at or below the risk ceiling. A task with no risk assessment is treated as not safe to
 * delegate, because nobody has said how risky it is.
 */
export async function assertTaskWithinRisk(taskId: string, riskCeiling: string) {
  const assessment = await db.codingRiskAssessment.findFirst({ where: { implementationTaskId: taskId }, orderBy: { createdAt: "desc" }, select: { riskLevel: true } });
  if (!assessment) throw new DomainError("This task has no risk assessment, so the Builder cannot act on it. It needs you.");
  if (assessment.riskLevel !== riskCeiling) {
    throw new DomainError(`This task is ${assessment.riskLevel} risk. The Builder only acts on ${riskCeiling} risk tasks, so it needs you.`);
  }
}
