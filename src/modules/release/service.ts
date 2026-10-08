import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { getAIProvider, isAIConfigured, prepareAI } from "@/modules/ai/provider";
import { recordActivity } from "@/modules/activity/service";
import { getCurrentActor } from "@/modules/identity/actor";
import { buildReleasePrompt, RELEASE_REVIEW_PROMPT, releaseNotesSchema, releaseReviewSchema } from "@/modules/release/prompt";
import {
  approvalBlockers,
  assessReleaseReadiness,
  desiredRiskFactors,
  draftReleaseNotes,
  entryBlockers,
  evidenceDrafts,
  learnBlockers,
  OPERATIONAL_AREAS,
  OPERATIONAL_AREA_LABEL,
  overallRisk,
  postDeploymentReady,
  releaseFingerprint,
  type PlanFact,
  type ReleaseFacts,
  type ReleaseLevel,
  type ReleaseTaskFact,
} from "@/modules/release/readiness";
import { redactSecrets } from "@/modules/source-control/redact";
import { DomainError } from "@/modules/shared/errors";

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/;

function assertHuman(actor: string) {
  const name = actor.trim().toLowerCase();
  if (!name || name.includes("agent") || name === "ai product factory" || name === "ai product builder") {
    throw new DomainError("A person records release decisions. An agent cannot approve a release or mark a deployment successful.");
  }
}

function actorName(actor?: string) {
  return actor?.trim() || getCurrentActor().name;
}

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function requiredChecks(protection: unknown) {
  if (!protection || typeof protection !== "object" || Array.isArray(protection)) return null;
  const value = (protection as { requiredChecks?: unknown }).requiredChecks;
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function chain(workItem: { title: string; type: string; parent?: { title: string; type: string; parent?: { title: string; type: string } | null } | null } | null) {
  const names = { epic: "", feature: "", story: "" };
  let current = workItem;
  while (current) {
    if (current.type === "EPIC") names.epic = current.title;
    if (current.type === "FEATURE") names.feature = current.title;
    if (current.type === "STORY") names.story = current.title;
    current = current.parent ?? null;
  }
  return names;
}

export async function loadReleaseFacts(productId: string): Promise<ReleaseFacts> {
  const slice = await db.productSlice.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
  });
  const outcome = await db.productOutcome.findFirst({
    where: { productId, status: { in: ["CONFIRMED", "ACHIEVED"] } },
    orderBy: { createdAt: "asc" },
    include: { capabilities: { take: 1 } },
  });
  const architecture = slice
    ? await db.solutionArchitecture.findFirst({
        where: { productId, productSliceId: slice.id, status: "APPROVED" },
        orderBy: { version: "desc" },
      })
    : null;
  const plan = slice
    ? await db.implementationPlan.findFirst({
        where: { productId, productSliceId: slice.id, status: "APPROVED" },
        orderBy: { version: "desc" },
        include: {
          tasks: {
            orderBy: { sequence: "asc" },
            include: {
              workItem: { include: { acceptanceCriteria: true, parent: { include: { parent: true } } } },
              verificationSessions: { orderBy: { createdAt: "desc" }, include: { approvals: { include: { approval: true } }, coverages: true } },
              publishedChanges: { orderBy: { createdAt: "desc" }, include: { pullRequest: { include: { checks: true, reviews: true } } } },
            },
          },
        },
      })
    : null;
  const review = await db.engineeringGovernanceReview.findFirst({ where: { productId }, orderBy: { createdAt: "desc" } });
  const governanceApproval = await db.approval.findFirst({ where: { productId, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED" } });
  const policy = await db.codingPolicy.findFirst({ where: { productId }, orderBy: { createdAt: "desc" }, include: { review: true } });
  const policyApproval = await db.approval.findFirst({ where: { productId, approvalType: "CODING_POLICY", status: "APPROVED" } });
  const definitionApproval = await db.approval.findFirst({ where: { productId, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" } });
  const codeApprovals = await db.codeChangeApproval.findMany({
    where: { productId, stale: false, approval: { status: "APPROVED" } },
  });
  const defects = await db.workItem.findMany({
    where: { productId, type: "DEFECT", status: { not: "DONE" }, priority: { in: ["HIGH", "CRITICAL"] } },
  });
  const integrated = slice
    ? await db.integratedVerificationSession.findFirst({ where: { productId, productSliceId: slice.id }, orderBy: { createdAt: "desc" } })
    : null;
  const tasks: ReleaseTaskFact[] = (plan?.tasks ?? []).map((task) => {
    const session = task.verificationSessions[0];
    const verificationApproval = session?.approvals.find((item) => !item.stale && item.approval.status === "APPROVED");
    const names = chain(task.workItem);
    const published = task.publishedChanges.find((change) => change.pullRequest && !change.pullRequest.demo) ?? task.publishedChanges[0];
    const pull = published?.pullRequest;
    const code = codeApprovals.find((item) => item.implementationTaskId === task.id);
    const verified = new Set((session?.coverages ?? []).filter((coverage) => coverage.status === "VERIFIED").map((coverage) => coverage.acceptanceCriterionId));
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      workItemId: task.workItemId ?? "",
      storyTitle: names.story || task.workItem?.title || "",
      featureTitle: names.feature,
      epicTitle: names.epic,
      criteria: (task.workItem?.acceptanceCriteria ?? []).map((criterion) => ({ id: criterion.id, description: criterion.description })),
      verifiedCriteria: [...verified],
      commitSha: code?.headCommit || session?.commitSha || pull?.headSha || "",
      verificationSessionId: session?.id ?? "",
      verificationCommit: verificationApproval?.commitSha || session?.commitSha || "",
      verificationApproved: Boolean(verificationApproval),
      verificationStale: Boolean(session?.stale || verificationApproval?.stale),
      verificationVerdict: session?.overallVerdict ?? "",
      codeApproved: Boolean(code && code.headCommit && (code.headCommit === (pull?.headSha || session?.commitSha || code.headCommit))),
      pull: pull
        ? {
            id: pull.id,
            number: pull.number,
            state: pull.state,
            demo: pull.demo,
            headSha: pull.headSha,
            mergeSha: pull.mergeCommitSha,
            mergedBy: pull.mergedBy,
            mergedAt: pull.mergedAt?.toISOString() ?? null,
            requiredChecks: requiredChecks(pull.protection),
            checks: pull.checks.map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion })),
            reviews: pull.reviews.map((review) => ({ reviewer: review.reviewer, state: review.state })),
          }
        : null,
    };
  });
  return {
    productId,
    slice: slice ? { id: slice.id, name: slice.name, status: slice.status, description: slice.description } : null,
    outcome: outcome
      ? { id: outcome.id, title: outcome.title, successMeasure: outcome.successMeasure, target: outcome.targetValue, status: outcome.status }
      : null,
    capability: outcome?.capabilities[0] ? { name: outcome.capabilities[0].name } : null,
    governanceCurrent: Boolean(review && review.status === "APPROVED" && !review.reviewRequired && governanceApproval),
    policyCurrent: Boolean(policy && !policy.reapprovalRequired && policy.review.status === "APPROVED" && policyApproval),
    architectureApproved: Boolean(architecture),
    architectureSummary: architecture?.summary ?? "",
    definitionApproved: Boolean(definitionApproval),
    tasks,
    defects: defects.map((defect) => ({ id: defect.id, title: defect.title, priority: defect.priority, status: defect.status })),
    integrated: integrated ? { id: integrated.id, verdict: integrated.overallVerdict ?? "", gaps: textList(integrated.evidenceGaps) } : null,
  };
}

const candidateInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  evidence: { orderBy: { createdAt: "asc" as const } },
  risk: { include: { factors: { orderBy: { createdAt: "asc" as const } } } },
  questions: { orderBy: { createdAt: "asc" as const } },
  plans: { orderBy: { version: "desc" as const }, include: { checks: { orderBy: { createdAt: "asc" as const } } } },
  operational: { include: { areas: true } },
  approvals: { orderBy: { createdAt: "desc" as const }, include: { approval: true } },
  deployments: { orderBy: { createdAt: "desc" as const } },
  issues: { orderBy: { detectedAt: "desc" as const } },
  outcome: true,
} satisfies Prisma.ReleaseCandidateInclude;

type CandidateRecord = Prisma.ReleaseCandidateGetPayload<{ include: typeof candidateInclude }>;

function planFact(candidate: CandidateRecord): PlanFact | null {
  const plan = candidate.plans[0];
  if (!plan) return null;
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    strategy: plan.strategy,
    summary: plan.summary,
    rollbackTrigger: plan.rollbackTrigger,
    rollbackSteps: plan.rollbackSteps,
    rollbackDataImplications: plan.rollbackDataImplications,
    rollbackRole: plan.rollbackRole,
    rollbackVerification: plan.rollbackVerification,
    rollbackUnavailable: plan.rollbackUnavailable,
    rollbackAcknowledgement: plan.rollbackAcknowledgement,
    rollbackAcknowledgedBy: plan.rollbackAcknowledgedBy,
    checks: plan.checks.map((check) => ({
      phase: check.phase,
      name: check.name,
      required: check.required,
      status: check.status,
      waiverRationale: check.waiverRationale,
    })),
  };
}

async function loadCandidate(id: string, productId: string) {
  const candidate = await db.releaseCandidate.findFirst({ where: { id, productId }, include: candidateInclude });
  if (!candidate) throw new DomainError("The release candidate was not found.", "NOT_FOUND");
  return candidate;
}

function sourceCommits(facts: ReleaseFacts) {
  return facts.tasks.flatMap((task) =>
    task.pull && !task.pull.demo
      ? [{ pullRequestRecordId: task.pull.id, number: task.pull.number, headSha: task.pull.headSha, mergeSha: task.pull.mergeSha, mergedBy: task.pull.mergedBy, mergedAt: task.pull.mergedAt }]
      : [],
  );
}

async function replaceGenerated(candidateId: string, facts: ReleaseFacts) {
  await db.releaseCandidateItem.deleteMany({ where: { releaseCandidateId: candidateId } });
  const items = facts.tasks.flatMap((task) => {
    const rows: Prisma.ReleaseCandidateItemCreateManyInput[] = [];
    if (task.featureTitle) rows.push({ releaseCandidateId: candidateId, type: "FEATURE", title: task.featureTitle, workItemId: task.workItemId || null });
    if (task.storyTitle) rows.push({ releaseCandidateId: candidateId, type: "STORY", title: task.storyTitle, workItemId: task.workItemId || null });
    rows.push({
      releaseCandidateId: candidateId,
      type: "IMPLEMENTATION_TASK",
      title: task.title,
      implementationTaskId: task.id,
      workItemId: task.workItemId || null,
      pullRequestRecordId: task.pull && !task.pull.demo ? task.pull.id : null,
      verificationSessionId: task.verificationSessionId || null,
    });
    return rows;
  });
  if (items.length > 0) await db.releaseCandidateItem.createMany({ data: items });
  await db.releaseEvidence.deleteMany({ where: { releaseCandidateId: candidateId, source: { in: ["FACTORY", "GITHUB", "COMMAND_RUNNER"] } } });
  await db.releaseEvidence.createMany({
    data: evidenceDrafts(facts).map((row) => ({ ...row, releaseCandidateId: candidateId })) as Prisma.ReleaseEvidenceCreateManyInput[],
  });
  await db.releaseCandidate.update({
    where: { id: candidateId },
    data: { sourceCommitSummary: sourceCommits(facts) },
  });
}

async function syncFactors(candidate: CandidateRecord, facts: ReleaseFacts) {
  const plan = planFact(candidate);
  const desired = desiredRiskFactors(facts, plan);
  const assessment =
    candidate.risk ??
    (await db.releaseRiskAssessment.create({
      data: { releaseCandidateId: candidate.id, overallRisk: "LOW", summary: "" },
      include: { factors: true },
    }));
  const existing = candidate.risk?.factors ?? [];
  const seen = new Set<string>();
  for (const factor of desired) {
    const match = existing.find((item) => item.category === factor.category && item.description === factor.description);
    if (match) {
      seen.add(match.id);
      const preserve = match.status === "ACCEPTED" || match.status === "MITIGATED" || match.status === "CLOSED";
      await db.releaseRiskFactor.update({
        where: { id: match.id },
        data: {
          severity: factor.severity as ReleaseLevel,
          evidence: factor.evidence,
          mitigation: factor.mitigation,
          blocking: factor.blocking,
          status: preserve ? match.status : "OPEN",
        },
      });
    } else {
      await db.releaseRiskFactor.create({
        data: {
          releaseRiskAssessmentId: assessment.id,
          category: factor.category as Prisma.ReleaseRiskFactorCreateManyInput["category"],
          severity: factor.severity,
          description: factor.description,
          evidence: factor.evidence,
          mitigation: factor.mitigation,
          blocking: factor.blocking,
        },
      });
    }
  }
  for (const factor of existing) {
    if (!seen.has(factor.id) && factor.status !== "CLOSED") {
      await db.releaseRiskFactor.update({ where: { id: factor.id }, data: { status: "CLOSED" } });
    }
  }
  const factors = await db.releaseRiskFactor.findMany({ where: { releaseRiskAssessmentId: assessment.id } });
  const level = overallRisk(factors);
  const open = factors.filter((factor) => factor.status === "OPEN").length;
  await db.releaseRiskAssessment.update({
    where: { id: assessment.id },
    data: {
      overallRisk: level,
      summary: `${open} open release risk factor${open === 1 ? "" : "s"}. Overall risk is ${level}. Narrative does not change a blocker.`,
    },
  });
  return factors;
}

async function syncCandidate(candidate: CandidateRecord, facts: ReleaseFacts) {
  if (candidate.demo) return candidate;
  await replaceGenerated(candidate.id, facts);
  const refreshed = await loadCandidate(candidate.id, candidate.productId);
  const factors = await syncFactors(refreshed, facts);
  const plan = planFact(await loadCandidate(candidate.id, candidate.productId));
  const evidence = await db.releaseEvidence.findMany({ where: { releaseCandidateId: candidate.id } });
  const fingerprint = releaseFingerprint({
    sliceId: facts.slice?.id ?? "",
    tasks: facts.tasks,
    plan,
    factors,
    evidence,
    governanceCurrent: facts.governanceCurrent,
    policyCurrent: facts.policyCurrent,
    integratedId: facts.integrated?.id ?? "",
    integratedGaps: facts.integrated?.gaps ?? [],
  });
  const approval = refreshed.approvals.find((item) => item.approval.status === "APPROVED");
  let status = refreshed.status;
  if (approval && !approval.stale && approval.evidenceFingerprint !== fingerprint) {
    await db.releaseApproval.update({
      where: { id: approval.id },
      data: { stale: true, staleReason: "Release evidence changed after approval.", staleFlaggedAt: new Date() },
    });
    if (status === "APPROVED") status = "READY_FOR_REVIEW";
    await recordActivity({
      productId: candidate.productId,
      type: "RELEASE_APPROVAL_STALE",
      description: `Release approval for ${candidate.version} is stale because the evidence changed.`,
    });
  }
  await db.releaseCandidate.update({ where: { id: candidate.id }, data: { evidenceFingerprint: fingerprint, status } });
  return loadCandidate(candidate.id, candidate.productId);
}

function operationalScore(candidate: CandidateRecord) {
  const areas = candidate.operational?.areas ?? [];
  const relevant = areas.filter((area) => area.relevant);
  return { sufficient: relevant.filter((area) => area.rating === "HIGH").length, relevant: relevant.length, areas };
}

function present(candidate: CandidateRecord, facts: ReleaseFacts) {
  const plan = planFact(candidate);
  const factors = candidate.risk?.factors ?? [];
  const evidence = candidate.evidence.map((row) => ({ id: row.id, type: row.type, source: row.source, description: row.description, result: row.result, referenceId: row.referenceId }));
  const operations = operationalScore(candidate);
  const readiness = candidate.demo
    ? { sufficient: 0, total: 9, areas: [] as { key: string; label: string; level: "LOW" | "MEDIUM" | "HIGH"; explanation: string }[] }
    : assessReleaseReadiness({ facts, plan, evidence, operationalSufficient: operations.sufficient, operationalRelevant: operations.relevant });
  const blockers = candidate.demo
    ? ["DEMO DATA. This release candidate cannot be approved."]
    : approvalBlockers({ factors, questions: candidate.questions, evidence, plan });
  const approval = candidate.approvals[0];
  const learn = learnBlockers({
    demo: candidate.demo,
    status: candidate.status,
    checks: plan?.checks ?? [],
    issues: candidate.issues,
  });
  return {
    id: candidate.id,
    version: candidate.version,
    name: candidate.name,
    description: candidate.description,
    status: candidate.status,
    demo: candidate.demo,
    createdBy: candidate.createdBy,
    sourceCommits: Array.isArray(candidate.sourceCommitSummary)
      ? (candidate.sourceCommitSummary as { number: number; headSha: string; mergeSha: string; mergedBy: string; mergedAt: string | null }[])
      : [],
    items: candidate.items.map((item) => ({ id: item.id, type: item.type, title: item.title })),
    evidence,
    risk: candidate.risk
      ? {
          overall: candidate.risk.overallRisk,
          summary: candidate.risk.summary,
          narrative: candidate.risk.narrative,
          factors: factors.map((factor) => ({
            id: factor.id,
            category: factor.category,
            severity: factor.severity,
            description: factor.description,
            evidence: factor.evidence,
            mitigation: factor.mitigation,
            blocking: factor.blocking,
            status: factor.status,
            acceptedRationale: factor.acceptedRationale,
          })),
        }
      : null,
    questions: candidate.questions,
    readiness,
    blockers,
    approval: approval
      ? {
          status: approval.approval.status,
          stale: approval.stale,
          staleReason: approval.staleReason,
          approvedBy: approval.approval.approvedBy ?? "",
          resolvedAt: approval.approval.resolvedAt?.toISOString() ?? "",
          version: approval.deploymentPlanVersion,
        }
      : null,
    plan: candidate.plans[0]
      ? {
          ...plan,
          steps: textList(candidate.plans[0].deploymentSteps),
          plannedWindow: candidate.plans[0].plannedWindow,
          approvedBy: candidate.plans[0].approvedBy,
          checks: candidate.plans[0].checks,
        }
      : null,
    operational: {
      sufficient: operations.sufficient,
      relevant: operations.relevant,
      areas: operations.areas.map((area) => ({ ...area, label: OPERATIONAL_AREA_LABEL[area.area] })),
    },
    deployments: candidate.deployments,
    issues: candidate.issues,
    releaseOutcome: candidate.outcome,
    releaseNotes: candidate.releaseNotes,
    releaseNotesStatus: candidate.releaseNotesStatus,
    learn: { ready: learn.length === 0, label: learn.length === 0 ? "READY TO MOVE TO LEARN" : "NOT READY", reasons: learn },
    trace: {
      outcome: facts.outcome?.title ?? "",
      capability: facts.capability?.name ?? "",
      epic: facts.tasks[0]?.epicTitle ?? "",
      feature: facts.tasks[0]?.featureTitle ?? "",
      story: facts.tasks[0]?.storyTitle ?? "",
      criteria: facts.tasks.flatMap((task) => task.criteria.map((criterion) => criterion.description)),
      tasks: facts.tasks.map((task) => task.title),
      commits: facts.tasks.map((task) => task.commitSha),
      verification: facts.tasks.map((task) => task.verificationSessionId),
      pullRequests: facts.tasks.flatMap((task) => (task.pull ? [`#${task.pull.number}`] : [])),
      ci: evidence.filter((row) => row.type === "CI_RESULT").map((row) => `${row.result}`),
      merges: facts.tasks.flatMap((task) => (task.pull?.mergeSha ? [task.pull.mergeSha] : [])),
    },
  };
}

export async function suggestReleaseVersion(productId: string) {
  const count = await db.releaseCandidate.count({ where: { productId, demo: false } });
  return `R${count + 1}`;
}

export async function createReleaseCandidate(productId: string, versionInput: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const version = versionInput.trim();
  if (!VERSION.test(version)) throw new DomainError("Enter a release version such as 0.1.0, 2026.10.08, or R5.1.");
  const facts = await loadReleaseFacts(productId);
  const blockers = entryBlockers(facts);
  if (blockers.length > 0) throw new DomainError(blockers.join(" "));
  const duplicate = await db.releaseCandidate.findUnique({ where: { productId_version: { productId, version } } });
  if (duplicate) throw new DomainError("That release version already exists.", "CONFLICT");
  await db.releaseCandidate.updateMany({
    where: { productId, demo: false, status: { notIn: ["DEPLOYED", "SUPERSEDED"] } },
    data: { status: "SUPERSEDED" },
  });
  const notes = draftReleaseNotes({ version, facts, planSummary: "Deployment remains a human action." });
  const candidate = await db.releaseCandidate.create({
    data: {
      productId,
      productSliceId: facts.slice?.id ?? "",
      version,
      name: `${facts.slice?.name ?? "Release"} ${version}`,
      description: facts.outcome?.title ?? "",
      status: "ASSESSING",
      createdBy: actor,
      releaseNotes: notes,
    },
  });
  await db.operationalReadinessAssessment.create({
    data: {
      releaseCandidateId: candidate.id,
      summary: "0 of 11 relevant operational areas are sufficiently understood.",
      areas: { create: OPERATIONAL_AREAS.map((area) => ({ area, rating: "LOW", relevant: true, notes: "" })) },
    },
  });
  await recordActivity({ productId, type: "RELEASE_CANDIDATE_CREATED", description: `${actor} created release candidate ${version}.`, actor });
  const loaded = await loadCandidate(candidate.id, productId);
  await syncCandidate(loaded, facts);
  await db.releaseCandidate.update({ where: { id: candidate.id }, data: { status: "READY_FOR_REVIEW" } });
  await recordActivity({ productId, type: "RELEASE_EVIDENCE_ADDED", description: `Evidence pack recorded for ${version}.`, actor });
  await recordActivity({ productId, type: "RELEASE_RISK_IDENTIFIED", description: `Deterministic release risk recorded for ${version}.`, actor });
  return getShipView(productId);
}

export async function getShipView(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const facts = await loadReleaseFacts(productId);
  const rows = await db.releaseCandidate.findMany({ where: { productId }, orderBy: { createdAt: "desc" }, include: candidateInclude });
  const synced: CandidateRecord[] = [];
  for (const row of rows) synced.push(row.demo ? row : await syncCandidate(row, facts));
  const primary = synced.find((row) => row.status !== "SUPERSEDED") ?? synced[0] ?? null;
  const presented = primary ? present(primary, facts) : null;
  const deployed = synced.find((row) => !row.demo && row.status === "DEPLOYED");
  const learnSource = deployed ? present(deployed, facts).learn : presented?.learn ?? { ready: false, label: "NOT READY" as const, reasons: ["No release candidate exists."] };
  return {
    productId,
    stage: product.currentStage,
    suggestedVersion: `R${synced.filter((row) => !row.demo).length + 1}`,
    entryBlockers: entryBlockers(facts),
    outcome: facts.outcome,
    capability: facts.capability,
    candidate: presented,
    versions: synced.map((row) => ({ id: row.id, version: row.version, status: row.status, demo: row.demo })),
    readyToLearn: learnSource,
  };
}

export async function reviewRelease(productId: string, candidateId: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  if (candidate.demo) throw new DomainError("Demo release data is not sent for release review.");
  await prepareAI();
  if (!isAIConfigured()) throw new DomainError("AI is not configured. The deterministic risk assessment is unchanged.");
  const facts = await loadReleaseFacts(productId);
  const synced = await syncCandidate(candidate, facts);
  const provider = await getAIProvider();
  const generated = await provider.generate({
    systemPrompt: RELEASE_REVIEW_PROMPT,
    messages: [{ role: "user", content: buildReleasePrompt({ evidence: synced.evidence, factors: synced.risk?.factors ?? [], questions: synced.questions }) }],
    responseSchema: releaseReviewSchema,
    schemaName: "release_review",
  });
  const parsed = releaseReviewSchema.safeParse(generated.data);
  if (!parsed.success) throw new DomainError("The release review did not match the required structure. No narrative was stored.");
  const narrative = redactSecrets(
    [parsed.data.summary, ...parsed.data.missingEvidence, ...parsed.data.operationalConcerns, ...parsed.data.rollbackConcerns, ...parsed.data.conditions].join("\n"),
  );
  if (synced.risk) await db.releaseRiskAssessment.update({ where: { id: synced.risk.id }, data: { narrative } });
  if (synced.status === "ASSESSING" || synced.status === "DRAFT") {
    await db.releaseCandidate.update({ where: { id: candidateId }, data: { status: "READY_FOR_REVIEW" } });
  }
  await recordActivity({ productId, type: "RELEASE_RISK_IDENTIFIED", description: `${actor} stored a release narrative. It does not approve the release.`, actor });
  return getShipView(productId);
}

export async function addReleaseQuestion(productId: string, candidateId: string, question: string, blocking: boolean, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  if (candidate.demo) throw new DomainError("Demo release questions are already labelled as demo data.");
  if (question.trim().length < 8) throw new DomainError("Write the release question.");
  await db.releaseQuestion.create({
    data: { releaseCandidateId: candidateId, question: redactSecrets(question.trim()), reason: "Asked by a person.", blocking, impact: "HIGH" },
  });
  await recordActivity({ productId, type: "RELEASE_EVIDENCE_ADDED", description: `${actor} asked for more release evidence.`, actor });
  return getShipView(productId);
}

export async function answerReleaseQuestion(productId: string, questionId: string, answer: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const question = await db.releaseQuestion.findFirst({ where: { id: questionId, releaseCandidate: { productId } } });
  if (!question) throw new DomainError("The release question was not found.", "NOT_FOUND");
  if (answer.trim().length < 2) throw new DomainError("Write an answer before closing the question.");
  await db.releaseQuestion.update({
    where: { id: question.id },
    data: { answer: redactSecrets(answer.trim()), answeredBy: actor, status: "ANSWERED", resolvedAt: new Date() },
  });
  return getShipView(productId);
}

export async function acceptReleaseRisk(productId: string, factorId: string, rationale: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const factor = await db.releaseRiskFactor.findFirst({ where: { id: factorId, assessment: { releaseCandidate: { productId } } } });
  if (!factor) throw new DomainError("The release risk was not found.", "NOT_FOUND");
  if (factor.severity !== "HIGH" && factor.severity !== "CRITICAL") throw new DomainError("Low and medium risks do not need a risk acceptance.");
  if (rationale.trim().length < 12) throw new DomainError("Risk acceptance needs a human rationale.");
  await db.releaseRiskFactor.update({
    where: { id: factor.id },
    data: { status: "ACCEPTED", acceptedBy: actor, acceptedRationale: redactSecrets(rationale.trim()) },
  });
  await recordActivity({
    productId,
    type: "RELEASE_RISK_ACCEPTED",
    description: `${actor} accepted ${factor.severity} risk: ${factor.description} Rationale: ${redactSecrets(rationale.trim())}`,
    actor,
  });
  return getShipView(productId);
}

export async function saveDeploymentPlan(productId: string, candidateId: string, input: {
  environment: string;
  strategy: string;
  summary: string;
  steps: string;
  preChecks: string;
  postChecks: string;
  rollbackTrigger: string;
  rollbackSteps: string;
  rollbackDataImplications: string;
  rollbackRole: string;
  rollbackVerification: string;
  rollbackUnavailable: boolean;
  rollbackAcknowledgement: string;
  plannedWindow: string;
}, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  if (candidate.demo) throw new DomainError("The demo deployment plan cannot be edited into a real plan.");
  const strategies = ["MANUAL", "ROLLING", "BLUE_GREEN", "CANARY", "FEATURE_FLAG", "OTHER"];
  if (!strategies.includes(input.strategy)) throw new DomainError("Choose a deployment strategy.");
  if (input.strategy !== "MANUAL" && input.summary.trim().length < 40) {
    throw new DomainError("A strategy other than manual needs a written justification. Deployment stays human-controlled.");
  }
  if (input.environment.trim().length < 2) throw new DomainError("Name the target environment.");
  if (input.rollbackUnavailable && input.rollbackAcknowledgement.trim().length < 12) {
    throw new DomainError("Rollback is unavailable and needs a human acknowledgement.");
  }
  const current = candidate.plans[0];
  const version = current && current.status === "APPROVED" ? current.version + 1 : current?.version ?? 1;
  if (current && current.status === "APPROVED") {
    await db.deploymentPlan.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
  }
  const plan = current && current.status !== "APPROVED"
    ? await db.deploymentPlan.update({
        where: { id: current.id },
        data: planData(input, actor, version),
      })
    : await db.deploymentPlan.create({ data: { releaseCandidateId: candidateId, ...planData(input, actor, version) } });
  await db.deploymentCheck.deleteMany({ where: { deploymentPlanId: plan.id } });
  const checks = [
    ...lines(input.preChecks).map((name) => ({ deploymentPlanId: plan.id, phase: "PRE_DEPLOYMENT" as const, name, required: true })),
    ...lines(input.postChecks).map((name) => ({ deploymentPlanId: plan.id, phase: "POST_DEPLOYMENT" as const, name, required: true })),
  ];
  if (checks.length > 0) await db.deploymentCheck.createMany({ data: checks });
  await recordActivity({ productId, type: "DEPLOYMENT_PLAN_CREATED", description: `${actor} saved deployment plan version ${version}. AI Product Builder will not execute it.`, actor });
  return getShipView(productId);
}

function planData(input: {
  environment: string;
  strategy: string;
  summary: string;
  steps: string;
  rollbackTrigger: string;
  rollbackSteps: string;
  rollbackDataImplications: string;
  rollbackRole: string;
  rollbackVerification: string;
  rollbackUnavailable: boolean;
  rollbackAcknowledgement: string;
  plannedWindow: string;
}, actor: string, version: number) {
  return {
    version,
    status: "DRAFT" as const,
    environment: input.environment.trim(),
    strategy: input.strategy as "MANUAL",
    summary: redactSecrets(input.summary.trim()),
    deploymentSteps: lines(input.steps),
    rollbackTrigger: input.rollbackTrigger.trim(),
    rollbackSteps: input.rollbackSteps.trim(),
    rollbackDataImplications: input.rollbackDataImplications.trim(),
    rollbackRole: input.rollbackRole.trim(),
    rollbackVerification: input.rollbackVerification.trim(),
    rollbackUnavailable: input.rollbackUnavailable,
    rollbackAcknowledgement: input.rollbackUnavailable ? redactSecrets(input.rollbackAcknowledgement.trim()) : "",
    rollbackAcknowledgedBy: input.rollbackUnavailable ? actor : "",
    plannedWindow: input.plannedWindow.trim(),
    approvedBy: "",
  };
}

export async function approveDeploymentPlan(productId: string, candidateId: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  const plan = candidate.plans[0];
  if (!plan) throw new DomainError("Save a deployment plan before approving it.");
  const fact = planFact(candidate);
  const message = fact && (fact.rollbackUnavailable
    ? fact.rollbackAcknowledgement.trim().length >= 12 && fact.rollbackAcknowledgedBy.trim()
      ? ""
      : "Rollback is unavailable and needs a human acknowledgement."
    : !fact.rollbackTrigger.trim() || !fact.rollbackSteps.trim() || !fact.rollbackRole.trim() || !fact.rollbackVerification.trim()
      ? "Rollback trigger, steps, responsible role, and verification after rollback are required."
      : "");
  if (message) throw new DomainError(message);
  if (!plan.checks.some((check) => check.phase === "POST_DEPLOYMENT" && check.required)) {
    throw new DomainError("A required post-deployment check has not been defined.");
  }
  await db.deploymentPlan.update({ where: { id: plan.id }, data: { status: "APPROVED", approvedBy: actor } });
  await recordActivity({ productId, type: "DEPLOYMENT_PLAN_APPROVED", description: `${actor} approved deployment plan version ${plan.version}.`, actor });
  return getShipView(productId);
}

export async function completeDeploymentCheck(productId: string, checkId: string, status: string, rationale: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const allowed = ["PASSED", "FAILED", "WAIVED", "NOT_APPLICABLE"];
  if (!allowed.includes(status)) throw new DomainError("Choose a check result.");
  const check = await db.deploymentCheck.findFirst({ where: { id: checkId, plan: { releaseCandidate: { productId } } }, include: { plan: true } });
  if (!check) throw new DomainError("The deployment check was not found.", "NOT_FOUND");
  if (check.required && (status === "WAIVED" || status === "NOT_APPLICABLE") && rationale.trim().length < 12) {
    throw new DomainError("Waiving a required check needs a human rationale.");
  }
  await db.deploymentCheck.update({
    where: { id: check.id },
    data: { status: status as "PASSED", waiverRationale: redactSecrets(rationale.trim()), completedBy: actor, completedAt: new Date() },
  });
  await recordActivity({
    productId,
    type: check.phase === "POST_DEPLOYMENT" ? "POST_DEPLOYMENT_CHECK" : "RELEASE_EVIDENCE_ADDED",
    description: `${actor} recorded ${check.name} as ${status}.${rationale.trim() ? ` Rationale: ${redactSecrets(rationale.trim())}` : ""}`,
    actor,
  });
  await promote(productId, check.plan.releaseCandidateId, actor);
  return getShipView(productId);
}

export async function approveRelease(productId: string, candidateId: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const facts = await loadReleaseFacts(productId);
  const candidate = await syncCandidate(await loadCandidate(candidateId, productId), facts);
  if (candidate.demo) throw new DomainError("Demo release data cannot be approved.");
  const blockers = approvalBlockers({
    factors: candidate.risk?.factors ?? [],
    questions: candidate.questions,
    evidence: candidate.evidence,
    plan: planFact(candidate),
  });
  if (blockers.length > 0) throw new DomainError(blockers.join(" "));
  const plan = candidate.plans[0];
  const approval = await db.approval.create({
    data: { productId, approvalType: "RELEASE", status: "APPROVED", approvedBy: actor, resolvedAt: new Date(), comments: `Release ${candidate.version}` },
  });
  await db.releaseApproval.create({
    data: {
      productId,
      approvalId: approval.id,
      releaseCandidateId: candidate.id,
      deploymentPlanId: plan?.id,
      deploymentPlanVersion: plan?.version ?? 0,
      evidenceFingerprint: candidate.evidenceFingerprint,
      riskState: candidate.risk?.overallRisk ?? "LOW",
    },
  });
  await db.releaseCandidate.update({ where: { id: candidate.id }, data: { status: "APPROVED" } });
  await recordActivity({ productId, type: "RELEASE_APPROVED", description: `${actor} approved release ${candidate.version}.`, actor });
  return getShipView(productId);
}

export async function rejectRelease(productId: string, candidateId: string, reason: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  if (candidate.demo) throw new DomainError("Demo release data cannot be rejected into a production decision.");
  await db.approval.create({
    data: { productId, approvalType: "RELEASE", status: "REJECTED", approvedBy: actor, resolvedAt: new Date(), comments: redactSecrets(reason.trim()) },
  });
  await db.releaseCandidate.update({ where: { id: candidate.id }, data: { status: "REJECTED" } });
  await recordActivity({ productId, type: "RELEASE_APPROVED", description: `${actor} rejected release ${candidate.version}. ${redactSecrets(reason.trim())}`, actor });
  return getShipView(productId);
}

export async function recordDeployment(productId: string, candidateId: string, input: {
  environment: string;
  status: string;
  deployedVersion: string;
  deployedCommitSha: string;
  externalReference: string;
  notes: string;
}, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  if (candidate.demo) throw new DomainError("Demo data cannot be recorded as a deployment.");
  if (!["STARTED", "SUCCEEDED", "FAILED"].includes(input.status)) throw new DomainError("Choose a deployment result.");
  const approval = candidate.approvals.find((item) => item.approval.status === "APPROVED" && !item.stale);
  if (!approval || candidate.status === "SUPERSEDED" || candidate.status === "REJECTED") {
    throw new DomainError("A current human release approval is required before deployment is recorded.");
  }
  if (candidate.status !== "APPROVED" && candidate.status !== "FAILED") {
    throw new DomainError("Record deployment after release approval.");
  }
  if (input.deployedCommitSha && !/^[0-9a-f]{40}$/i.test(input.deployedCommitSha.trim())) {
    throw new DomainError("The deployed commit SHA must be the SHA that was actually deployed.");
  }
  if ((input.status === "SUCCEEDED" || input.status === "FAILED") && !input.deployedCommitSha.trim() && !input.externalReference.trim() && !input.notes.trim()) {
    throw new DomainError("Record a commit SHA, an external reference, or notes for this deployment.");
  }
  const now = new Date();
  await db.deploymentRecord.create({
    data: {
      releaseCandidateId: candidate.id,
      deploymentPlanId: candidate.plans[0]?.id,
      environment: input.environment.trim() || candidate.plans[0]?.environment || "",
      status: input.status as "STARTED",
      deployedVersion: input.deployedVersion.trim() || candidate.version,
      deployedCommitSha: input.deployedCommitSha.trim(),
      externalReference: redactSecrets(input.externalReference.trim()),
      notes: redactSecrets(input.notes.trim()),
      performedBy: actor,
      startedAt: now,
      completedAt: input.status === "STARTED" ? null : now,
      reason: input.status === "FAILED" ? redactSecrets(input.notes.trim()) : "",
    },
  });
  const activity = input.status === "FAILED" ? "DEPLOYMENT_FAILED" : input.status === "SUCCEEDED" ? "DEPLOYMENT_SUCCEEDED" : "DEPLOYMENT_STARTED";
  await recordActivity({
    productId,
    type: activity,
    description: `${actor} recorded deployment ${input.status.toLowerCase()} for ${candidate.version}. AI Product Builder did not deploy it.`,
    actor,
  });
  if (input.status === "FAILED") await db.releaseCandidate.update({ where: { id: candidate.id }, data: { status: "FAILED" } });
  await promote(productId, candidate.id, actor);
  return getShipView(productId);
}

export async function recordRollback(productId: string, candidateId: string, reason: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  if (!candidate.deployments.some((record) => record.status === "FAILED" || record.status === "SUCCEEDED")) {
    throw new DomainError("Record the deployment result before recording a rollback.");
  }
  if (reason.trim().length < 8) throw new DomainError("Record why the rollback happened.");
  const now = new Date();
  await db.deploymentRecord.create({
    data: {
      releaseCandidateId: candidate.id,
      deploymentPlanId: candidate.plans[0]?.id,
      environment: candidate.plans[0]?.environment ?? "",
      status: "ROLLED_BACK",
      deployedVersion: candidate.version,
      performedBy: actor,
      reason: redactSecrets(reason.trim()),
      notes: redactSecrets(reason.trim()),
      startedAt: now,
      completedAt: now,
    },
  });
  await db.releaseCandidate.update({ where: { id: candidate.id }, data: { status: "FAILED" } });
  if (candidate.outcome) {
    await db.releaseOutcome.update({
      where: { id: candidate.outcome.id },
      data: { rollbackRequired: true, summary: `${candidate.outcome.summary} Rollback recorded by ${actor}.` },
    });
  }
  await recordActivity({ productId, type: "ROLLBACK_RECORDED", description: `${actor} recorded a rollback for ${candidate.version}. The failed deployment is kept.`, actor });
  return getShipView(productId);
}

async function promote(productId: string, candidateId: string, actor: string) {
  const candidate = await loadCandidate(candidateId, productId);
  if (candidate.demo) return;
  const latest = candidate.deployments[0];
  if (!latest) return;
  if (latest.status === "FAILED" || latest.status === "ROLLED_BACK") {
    await db.releaseCandidate.update({ where: { id: candidate.id }, data: { status: "FAILED" } });
    return;
  }
  if (latest.status !== "SUCCEEDED") return;
  const critical = candidate.issues.some((issue) => issue.status === "OPEN" && issue.severity === "CRITICAL");
  const checks = candidate.plans[0]?.checks ?? [];
  if (!postDeploymentReady(checks) || critical) return;
  await db.releaseCandidate.update({ where: { id: candidate.id }, data: { status: "DEPLOYED" } });
  if (!candidate.outcome) {
    await db.releaseOutcome.create({
      data: {
        releaseCandidateId: candidate.id,
        deploymentSuccessful: true,
        rollbackRequired: false,
        summary: `Deployment recorded by ${actor}. AI Product Builder did not deploy this release.`,
      },
    });
  }
}

export async function createReleaseIssue(productId: string, candidateId: string, input: { severity: string; category: string; description: string }, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const categories = ["FUNCTIONAL", "PERFORMANCE", "SECURITY", "DATA", "INTEGRATION", "OPERABILITY", "OTHER"];
  if (!severities.includes(input.severity) || !categories.includes(input.category)) throw new DomainError("Choose an issue severity and category.");
  if (input.description.trim().length < 8) throw new DomainError("Describe the release issue.");
  const candidate = await loadCandidate(candidateId, productId);
  await db.releaseIssue.create({
    data: {
      releaseCandidateId: candidate.id,
      deploymentRecordId: candidate.deployments[0]?.id,
      severity: input.severity as "LOW",
      category: input.category as "FUNCTIONAL",
      description: redactSecrets(input.description.trim()),
    },
  });
  await recordActivity({ productId, type: "RELEASE_ISSUE_CREATED", description: `${actor} recorded a ${input.severity} release issue.`, actor });
  return getShipView(productId);
}

export async function resolveReleaseIssue(productId: string, issueId: string, status: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  if (!["MITIGATED", "RESOLVED", "ACCEPTED"].includes(status)) throw new DomainError("Choose how the issue was handled.");
  const issue = await db.releaseIssue.findFirst({ where: { id: issueId, releaseCandidate: { productId } } });
  if (!issue) throw new DomainError("The release issue was not found.", "NOT_FOUND");
  await db.releaseIssue.update({ where: { id: issue.id }, data: { status: status as "RESOLVED", resolvedAt: new Date() } });
  await promote(productId, issue.releaseCandidateId, actor);
  return getShipView(productId);
}

export async function rateOperationalArea(productId: string, areaId: string, rating: string, notes: string, relevant: boolean, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  if (!["LOW", "MEDIUM", "HIGH"].includes(rating)) throw new DomainError("Rate the area low, medium, or high.");
  const area = await db.operationalReadinessArea.findFirst({ where: { id: areaId, assessment: { releaseCandidate: { productId } } }, include: { assessment: true } });
  if (!area) throw new DomainError("The operational area was not found.", "NOT_FOUND");
  await db.operationalReadinessArea.update({ where: { id: area.id }, data: { rating: rating as "LOW", notes: redactSecrets(notes.trim()), relevant } });
  const areas = await db.operationalReadinessArea.findMany({ where: { assessmentId: area.assessmentId } });
  const relevantAreas = areas.filter((item) => (item.id === area.id ? relevant : item.relevant));
  const sufficient = relevantAreas.filter((item) => (item.id === area.id ? rating === "HIGH" : item.rating === "HIGH")).length;
  await db.operationalReadinessAssessment.update({
    where: { id: area.assessmentId },
    data: { summary: `${sufficient} of ${relevantAreas.length} relevant operational areas are sufficiently understood.` },
  });
  return getShipView(productId);
}

export async function saveReleaseNotes(productId: string, candidateId: string, notes: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  await db.releaseCandidate.update({
    where: { id: candidate.id },
    data: { releaseNotes: redactSecrets(notes.trim()), releaseNotesStatus: "DRAFT", releaseNotesApprovedBy: "" },
  });
  return getShipView(productId);
}

export async function approveReleaseNotes(productId: string, candidateId: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const candidate = await loadCandidate(candidateId, productId);
  if (!candidate.releaseNotes.includes(candidate.version)) throw new DomainError("Release notes need the release version before they can be approved.");
  await db.releaseCandidate.update({
    where: { id: candidate.id },
    data: { releaseNotesStatus: "APPROVED", releaseNotesApprovedBy: actor },
  });
  return getShipView(productId);
}

export async function draftNotesWithModel(productId: string, candidateId: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const facts = await loadReleaseFacts(productId);
  const candidate = await loadCandidate(candidateId, productId);
  const draft = draftReleaseNotes({ version: candidate.version, facts, planSummary: candidate.plans[0]?.summary ?? "" });
  await prepareAI();
  if (!isAIConfigured()) {
    await db.releaseCandidate.update({ where: { id: candidate.id }, data: { releaseNotes: draft, releaseNotesStatus: "DRAFT" } });
    return getShipView(productId);
  }
  const provider = await getAIProvider();
  const generated = await provider.generate({
    systemPrompt: "Draft release notes from the evidence. Do not approve the release, invent metrics, or include secrets. Keep the version and factory identifiers.",
    messages: [{ role: "user", content: buildReleasePrompt({ draft, version: candidate.version }) }],
    responseSchema: releaseNotesSchema,
    schemaName: "release_notes",
  });
  const parsed = releaseNotesSchema.safeParse(generated.data);
  if (!parsed.success || !parsed.data.notes.includes(candidate.version)) {
    await db.releaseCandidate.update({ where: { id: candidate.id }, data: { releaseNotes: draft, releaseNotesStatus: "DRAFT" } });
    return getShipView(productId);
  }
  await db.releaseCandidate.update({ where: { id: candidate.id }, data: { releaseNotes: redactSecrets(parsed.data.notes), releaseNotesStatus: "DRAFT" } });
  return getShipView(productId);
}

export async function recordOutcomeObservation(productId: string, input: {
  outcomeId: string;
  candidateId?: string;
  measure: string;
  value: string;
  unit: string;
  source: string;
  notes: string;
}, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  if (!input.measure.trim() || !input.value.trim()) throw new DomainError("An observation needs a measure and a value a person recorded.");
  const outcome = await db.productOutcome.findFirst({ where: { id: input.outcomeId, productId } });
  if (!outcome) throw new DomainError("The product outcome was not found.", "NOT_FOUND");
  await db.outcomeObservation.create({
    data: {
      productId,
      productOutcomeId: outcome.id,
      releaseCandidateId: input.candidateId || null,
      measure: input.measure.trim(),
      value: redactSecrets(input.value.trim()),
      unit: input.unit.trim(),
      source: input.source.trim() || "HUMAN",
      notes: redactSecrets(input.notes.trim()),
      recordedBy: actor,
    },
  });
  const stored = await db.productOutcome.findUnique({ where: { id: outcome.id } });
  if (stored?.status === "ACHIEVED" && outcome.status !== "ACHIEVED") {
    await db.productOutcome.update({ where: { id: outcome.id }, data: { status: outcome.status } });
  }
  await recordActivity({ productId, type: "OUTCOME_OBSERVATION", description: `${actor} recorded an observation for "${outcome.title}". Deployment status was not changed.`, actor });
  return getLearnView(productId);
}

export async function markOutcomeAchieved(productId: string, outcomeId: string, rationale: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  if (rationale.trim().length < 12) throw new DomainError("Marking an outcome achieved needs a human rationale.");
  const outcome = await db.productOutcome.findFirst({ where: { id: outcomeId, productId } });
  if (!outcome) throw new DomainError("The product outcome was not found.", "NOT_FOUND");
  await db.productOutcome.update({ where: { id: outcome.id }, data: { status: "ACHIEVED" } });
  await recordActivity({ productId, type: "OUTCOME_CONFIRMED", description: `${actor} marked "${outcome.title}" achieved. ${redactSecrets(rationale.trim())}`, actor });
  return getLearnView(productId);
}

export async function recordAssumptionFeedback(productId: string, assumptionId: string, scope: string, status: string, evidence: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  if (status !== "VALIDATED" && status !== "INVALIDATED") throw new DomainError("Mark the assumption validated or invalidated.");
  if (evidence.trim().length < 8) throw new DomainError("Assumption feedback needs evidence.");
  if (scope === "DISCOVERY") {
    const assumption = await db.assumption.findFirst({ where: { id: assumptionId, brief: { productId } } });
    if (!assumption) throw new DomainError("The assumption was not found.", "NOT_FOUND");
    await db.assumption.update({ where: { id: assumption.id }, data: { status } });
  } else {
    const assumption = await db.requirementAssumption.findFirst({ where: { id: assumptionId, productId } });
    if (!assumption) throw new DomainError("The assumption was not found.", "NOT_FOUND");
    await db.requirementAssumption.update({ where: { id: assumption.id }, data: { status: status as "VALIDATED" } });
  }
  await recordActivity({ productId, type: "ASSUMPTION_UPDATED", description: `${actor} marked an assumption ${status.toLowerCase()}. Evidence: ${redactSecrets(evidence.trim())}`, actor });
  return getLearnView(productId);
}

export async function createLearningRecord(productId: string, input: {
  candidateId?: string;
  outcomeId?: string;
  observation: string;
  interpretation: string;
  decision: string;
  proposalKind?: string;
  proposalTitle?: string;
  proposalDescription?: string;
}, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const decisions = ["CONTINUE", "ITERATE", "PIVOT", "STOP", "SCALE", "INVESTIGATE"];
  if (!decisions.includes(input.decision)) throw new DomainError("Choose a learning decision.");
  if (input.observation.trim().length < 8) throw new DomainError("Write what was observed.");
  const record = await db.learningRecord.create({
    data: {
      productId,
      releaseCandidateId: input.candidateId || null,
      productOutcomeId: input.outcomeId || null,
      observation: redactSecrets(input.observation.trim()),
      interpretation: redactSecrets(input.interpretation.trim()),
      decision: input.decision as "CONTINUE",
      createdBy: actor,
    },
  });
  const kinds = ["DISCOVERY_QUESTION", "REQUIREMENT", "PRODUCT_SLICE", "DEFECT", "IMPROVEMENT"];
  if (input.proposalKind && kinds.includes(input.proposalKind) && input.proposalTitle?.trim()) {
    await db.learningProposal.create({
      data: {
        learningRecordId: record.id,
        productId,
        kind: input.proposalKind as "DEFECT",
        title: input.proposalTitle.trim(),
        description: redactSecrets(input.proposalDescription?.trim() ?? ""),
        status: "PROPOSED",
      },
    });
  }
  await recordActivity({ productId, type: "LEARNING_DECISION", description: `${actor} recorded a learning decision: ${input.decision}.`, actor });
  return getLearnView(productId);
}

export async function confirmLearningProposal(productId: string, proposalId: string, actorInput?: string) {
  const actor = actorName(actorInput);
  assertHuman(actor);
  const proposal = await db.learningProposal.findFirst({ where: { id: proposalId, productId, status: "PROPOSED" } });
  if (!proposal) throw new DomainError("The learning proposal was not found.", "NOT_FOUND");
  let createdRecordId = "";
  if (proposal.kind === "DISCOVERY_QUESTION") {
    const question = await db.requirementQuestion.create({ data: { productId, question: proposal.title, reason: proposal.description, status: "OPEN" } });
    createdRecordId = question.id;
  } else if (proposal.kind === "PRODUCT_SLICE") {
    const slice = await db.productSlice.create({ data: { productId, name: proposal.title, description: proposal.description, status: "PROPOSED" } });
    createdRecordId = slice.id;
  } else if (proposal.kind === "DEFECT") {
    const item = await db.workItem.create({ data: { productId, title: proposal.title, description: proposal.description, type: "DEFECT", status: "DRAFT", stage: "LEARN" } });
    createdRecordId = item.id;
  } else if (proposal.kind === "REQUIREMENT") {
    const item = await db.workItem.create({ data: { productId, title: proposal.title, description: proposal.description, type: "STORY", status: "DRAFT", stage: "LEARN" } });
    createdRecordId = item.id;
  } else {
    const item = await db.workItem.create({ data: { productId, title: proposal.title, description: proposal.description, type: "TASK", status: "DRAFT", stage: "LEARN" } });
    createdRecordId = item.id;
  }
  await db.learningProposal.update({
    where: { id: proposal.id },
    data: { status: "CONFIRMED", createdRecordId, confirmedBy: actor, confirmedAt: new Date() },
  });
  await recordActivity({ productId, type: "LEARNING_DECISION", description: `${actor} confirmed a ${proposal.kind} proposal as unapproved scope.`, actor });
  return getLearnView(productId);
}

export async function getLearnView(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const ship = await getShipView(productId);
  const outcomes = await db.productOutcome.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
    include: { observations: { orderBy: { observedAt: "desc" } } },
  });
  const discovery = await db.assumption.findMany({ where: { brief: { productId } }, orderBy: { createdAt: "asc" } });
  const requirements = await db.requirementAssumption.findMany({ where: { productId }, orderBy: { createdAt: "asc" } });
  const records = await db.learningRecord.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: { proposals: true, outcome: true },
  });
  return {
    productId,
    stage: product.currentStage,
    readyToLearn: ship?.readyToLearn ?? { ready: false, label: "NOT READY", reasons: ["No release candidate exists."] },
    releaseOutcome: ship?.candidate?.releaseOutcome ?? null,
    outcomes,
    assumptions: [
      ...discovery.map((item) => ({ id: item.id, scope: "DISCOVERY" as const, description: item.description, status: item.status })),
      ...requirements.map((item) => ({ id: item.id, scope: "REQUIREMENT" as const, description: item.description, status: item.status })),
    ],
    records,
  };
}

export async function stageMoveBlockers(productId: string, stage: "SHIP" | "LEARN") {
  const view = await getShipView(productId);
  if (!view) return ["The product was not found."];
  if (stage === "SHIP") {
    const approved = view.versions.some((item) => !item.demo && (item.status === "APPROVED" || item.status === "DEPLOYED"));
    const current = view.candidate && !view.candidate.demo && (view.candidate.status === "APPROVED" || view.candidate.status === "DEPLOYED") && view.candidate.approval && !view.candidate.approval.stale;
    return approved && current ? [] : ["Ship stays closed until a person has approved a release candidate."];
  }
  return view.readyToLearn.ready ? [] : view.readyToLearn.reasons;
}
