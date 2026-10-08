"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  acceptReleaseRisk,
  addReleaseQuestion,
  answerReleaseQuestion,
  approveDeploymentPlan,
  approveRelease,
  approveReleaseNotes,
  completeDeploymentCheck,
  confirmLearningProposal,
  createLearningRecord,
  createReleaseCandidate,
  createReleaseIssue,
  draftNotesWithModel,
  markOutcomeAchieved,
  rateOperationalArea,
  recordAssumptionFeedback,
  recordDeployment,
  recordOutcomeObservation,
  recordRollback,
  rejectRelease,
  resolveReleaseIssue,
  reviewRelease,
  saveDeploymentPlan,
  saveReleaseNotes,
} from "@/modules/release/service";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

export async function createReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), version: z.string().trim().min(1).max(41) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await createReleaseCandidate(parsed.data.productId, parsed.data.version);
    return done(parsed.data.productId, "Created the release candidate.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await reviewRelease(parsed.data.productId, parsed.data.candidateId);
    return done(parsed.data.productId, "Stored the release narrative. It does not approve the release.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function questionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    candidateId: z.string().min(1),
    question: z.string().trim().min(8),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await addReleaseQuestion(parsed.data.productId, parsed.data.candidateId, parsed.data.question, true);
    return done(parsed.data.productId, "Asked for more evidence.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function answerQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), questionId: z.string().min(1), answer: z.string().trim().min(2) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await answerReleaseQuestion(parsed.data.productId, parsed.data.questionId, parsed.data.answer);
    return done(parsed.data.productId, "Recorded the answer.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function acceptRiskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), factorId: z.string().min(1), rationale: z.string().trim().min(12) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await acceptReleaseRisk(parsed.data.productId, parsed.data.factorId, parsed.data.rationale);
    return done(parsed.data.productId, "Recorded the risk acceptance.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function savePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = z.object({
    productId: z.string().min(1),
    candidateId: z.string().min(1),
    environment: z.string().trim().min(2),
    strategy: z.string().trim().min(1),
    summary: z.string().trim().max(4000),
    steps: z.string().max(4000),
    preChecks: z.string().max(2000),
    postChecks: z.string().max(2000),
    rollbackTrigger: z.string().max(1000),
    rollbackSteps: z.string().max(4000),
    rollbackDataImplications: z.string().max(2000),
    rollbackRole: z.string().max(200),
    rollbackVerification: z.string().max(2000),
    rollbackAcknowledgement: z.string().max(2000),
    plannedWindow: z.string().max(200),
  }).safeParse(values);
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await saveDeploymentPlan(parsed.data.productId, parsed.data.candidateId, {
      ...parsed.data,
      rollbackUnavailable: values.rollbackUnavailable === "on",
    });
    return done(parsed.data.productId, "Saved the deployment plan. AI Product Builder will not execute it.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approvePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveDeploymentPlan(parsed.data.productId, parsed.data.candidateId);
    return done(parsed.data.productId, "Approved the deployment plan.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function checkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    checkId: z.string().min(1),
    status: z.string().min(1),
    rationale: z.string().max(2000).optional(),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await completeDeploymentCheck(parsed.data.productId, parsed.data.checkId, parsed.data.status, parsed.data.rationale ?? "");
    return done(parsed.data.productId, "Recorded the check.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveRelease(parsed.data.productId, parsed.data.candidateId);
    return done(parsed.data.productId, "Approved the release. Deployment is still a human action.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1), reason: z.string().trim().min(8) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await rejectRelease(parsed.data.productId, parsed.data.candidateId, parsed.data.reason);
    return done(parsed.data.productId, "Rejected the release.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deploymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    candidateId: z.string().min(1),
    environment: z.string().max(120),
    status: z.string().min(1),
    deployedVersion: z.string().max(41),
    deployedCommitSha: z.string().max(80),
    externalReference: z.string().max(240),
    notes: z.string().max(2000),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await recordDeployment(parsed.data.productId, parsed.data.candidateId, parsed.data);
    return done(parsed.data.productId, "Recorded the deployment. AI Product Builder did not deploy it.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rollbackAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1), reason: z.string().trim().min(8) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await recordRollback(parsed.data.productId, parsed.data.candidateId, parsed.data.reason);
    return done(parsed.data.productId, "Recorded the rollback. The failed deployment is kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function issueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    candidateId: z.string().min(1),
    severity: z.string().min(1),
    category: z.string().min(1),
    description: z.string().trim().min(8),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await createReleaseIssue(parsed.data.productId, parsed.data.candidateId, parsed.data);
    return done(parsed.data.productId, "Recorded the release issue.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function resolveIssueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), issueId: z.string().min(1), status: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await resolveReleaseIssue(parsed.data.productId, parsed.data.issueId, parsed.data.status);
    return done(parsed.data.productId, "Updated the release issue.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function notesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1), notes: z.string().max(8000) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await saveReleaseNotes(parsed.data.productId, parsed.data.candidateId, parsed.data.notes);
    return done(parsed.data.productId, "Saved the release notes draft.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function draftNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await draftNotesWithModel(parsed.data.productId, parsed.data.candidateId);
    return done(parsed.data.productId, "Drafted release notes from the evidence pack.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), candidateId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveReleaseNotes(parsed.data.productId, parsed.data.candidateId);
    return done(parsed.data.productId, "Approved the release notes.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function observationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    outcomeId: z.string().min(1),
    candidateId: z.string().optional(),
    measure: z.string().trim().min(1),
    value: z.string().trim().min(1),
    unit: z.string().max(40),
    source: z.string().max(80),
    notes: z.string().max(2000),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await recordOutcomeObservation(parsed.data.productId, parsed.data);
    return done(parsed.data.productId, "Recorded the observation. The outcome was not marked achieved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function achieveOutcomeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), outcomeId: z.string().min(1), rationale: z.string().trim().min(12) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await markOutcomeAchieved(parsed.data.productId, parsed.data.outcomeId, parsed.data.rationale);
    return done(parsed.data.productId, "Marked the product outcome achieved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function assumptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    assumptionId: z.string().min(1),
    scope: z.string().min(1),
    status: z.string().min(1),
    evidence: z.string().trim().min(8),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await recordAssumptionFeedback(parsed.data.productId, parsed.data.assumptionId, parsed.data.scope, parsed.data.status, parsed.data.evidence);
    return done(parsed.data.productId, "Updated the assumption.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function learningAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    candidateId: z.string().optional(),
    outcomeId: z.string().optional(),
    observation: z.string().trim().min(8),
    interpretation: z.string().max(4000),
    decision: z.string().min(1),
    proposalKind: z.string().optional(),
    proposalTitle: z.string().optional(),
    proposalDescription: z.string().optional(),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await createLearningRecord(parsed.data.productId, parsed.data);
    return done(parsed.data.productId, "Recorded the learning decision.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function confirmProposalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), proposalId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await confirmLearningProposal(parsed.data.productId, parsed.data.proposalId);
    return done(parsed.data.productId, "Confirmed the next step as unapproved scope.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rateAreaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = z.object({
    productId: z.string().min(1),
    areaId: z.string().min(1),
    rating: z.string().min(1),
    notes: z.string().max(1000),
  }).safeParse(values);
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await rateOperationalArea(parsed.data.productId, parsed.data.areaId, parsed.data.rating, parsed.data.notes, values.relevant === "on");
    return done(parsed.data.productId, "Updated operational readiness.");
  } catch (error) {
    return actionFailure(error);
  }
}
