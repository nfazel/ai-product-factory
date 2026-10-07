import "server-only";

import {
  ASSUMPTION_STATUS_LABEL,
  BRIEF_SECTION_LABEL,
  type AssumptionStatus,
  type BriefSection,
  type ProductStage,
} from "@/domain/constants";
import { isAIConfigured } from "@/modules/ai/provider";
import { AINotConfiguredError, safeErrorMessage } from "@/modules/ai/errors";
import { executeAgent } from "@/modules/agent/service";
import { recordActivity } from "@/modules/activity/service";
import { queryApprovals } from "@/modules/approval/repository";
import { requestApproval, resolveApproval } from "@/modules/approval/service";
import {
  appendDiscoveryMessage,
  createDiscoverySession,
  findBriefByVersion,
  findCurrentBrief,
  findDiscoverySession,
  latestDiscoveryRun,
  listBriefVersions,
  listDiscoveryMessages,
  markDiscoveryApproved,
  saveAssumptionStatus,
  saveBriefEdit,
} from "@/modules/discovery/repository";
import { formatIntake, REVIEW_REQUEST } from "@/modules/discovery/prompt";
import { countSufficientClarity } from "@/modules/discovery/merge";
import { findProductRow } from "@/modules/product/repository";
import { updateProduct } from "@/modules/product/service";
import { DomainError } from "@/modules/shared/errors";

async function runTurn(productId: string, sessionId: string, mode: string) {
  try {
    return await executeAgent({
      productId,
      agentType: "PRODUCT_DISCOVERY",
      input: { sessionId, mode },
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await appendDiscoveryMessage({
      sessionId,
      role: "SYSTEM",
      content: `Discovery turn failed. ${message} The product brief was not changed.`,
    });
    if (error instanceof DomainError) throw error;
    throw new DomainError(message);
  }
}

export async function getDiscoveryWorkspace(productId: string, version?: number) {
  const product = await findProductRow(productId);
  if (!product) return null;
  const session = await findDiscoverySession(productId);
  const [versions, current, messages, approvals, latestRun] = await Promise.all([
    listBriefVersions(productId),
    findCurrentBrief(productId),
    session ? listDiscoveryMessages(session.id) : Promise.resolve([]),
    queryApprovals({ productId }),
    latestDiscoveryRun(productId),
  ]);
  const brief =
    version && version > 0
      ? await findBriefByVersion(productId, version)
      : current;
  const output = latestRun?.output;
  const latestError =
    latestRun?.status === "FAILED" &&
    output &&
    typeof output === "object" &&
    "error" in output &&
    typeof output.error === "string"
      ? output.error
      : null;
  const clarity = brief
    ? countSufficientClarity([
        brief.problemClarity,
        brief.userClarity,
        brief.outcomeClarity,
        brief.scopeClarity,
        brief.riskClarity,
      ])
    : 0;

  return {
    configured: isAIConfigured(),
    product,
    session,
    messages,
    brief,
    currentBriefId: current?.id ?? null,
    versions,
    viewingHistorical: Boolean(brief && current && brief.id !== current.id),
    approvals: approvals.filter((item) => item.approvalType === "PRODUCT_DISCOVERY"),
    canRetry: isAIConfigured() && latestRun?.status === "FAILED",
    latestError,
    sufficientAreas: clarity,
  };
}

export async function startDiscovery(input: {
  productId: string;
  initialIdea: string;
  optionalContext: string;
  knownConstraints: string;
  knownUsers: string;
  desiredOutcome: string;
}) {
  if (!isAIConfigured()) throw new AINotConfiguredError();
  const product = await findProductRow(input.productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  const existing = await findDiscoverySession(input.productId);
  if (existing) {
    throw new DomainError("Discovery has already started for this product.", "CONFLICT");
  }

  const created = await createDiscoverySession({
    ...input,
    intake: formatIntake(input),
  });
  await recordActivity({
    productId: input.productId,
    type: "DISCOVERY_STARTED",
    description: "Started product discovery from an initial idea.",
  });
  await runTurn(input.productId, created.sessionId, "start");
  return created;
}

export async function continueDiscovery(productId: string, message: string) {
  if (!isAIConfigured()) throw new AINotConfiguredError();
  const session = await findDiscoverySession(productId);
  if (!session) throw new DomainError("Start product discovery before continuing.");
  await appendDiscoveryMessage({
    sessionId: session.id,
    role: "USER",
    content: message.trim(),
  });
  await runTurn(productId, session.id, "continue");
}

export async function requestDiscoveryReview(productId: string) {
  if (!isAIConfigured()) throw new AINotConfiguredError();
  const session = await findDiscoverySession(productId);
  if (!session) throw new DomainError("Start product discovery before requesting a review.");
  await appendDiscoveryMessage({
    sessionId: session.id,
    role: "USER",
    content: REVIEW_REQUEST,
  });
  await runTurn(productId, session.id, "review");
}

export async function retryDiscovery(productId: string) {
  if (!isAIConfigured()) throw new AINotConfiguredError();
  const session = await findDiscoverySession(productId);
  if (!session) throw new DomainError("There is no discovery session to retry.");
  const latest = await latestDiscoveryRun(productId);
  if (latest?.status !== "FAILED") {
    throw new DomainError("There is no failed discovery turn to retry.");
  }
  await runTurn(productId, session.id, "retry");
}

export async function editProductBrief(input: {
  productId: string;
  section: BriefSection;
  value: string;
}) {
  const saved = await saveBriefEdit(input);
  await recordActivity({
    productId: input.productId,
    type: "DISCOVERY_BRIEF_EDITED",
    description: `Edited ${BRIEF_SECTION_LABEL[input.section]} on product brief v${saved.version}.`,
  });
  return saved;
}

export async function setAssumptionStatus(input: {
  productId: string;
  assumptionId: string;
  status: AssumptionStatus;
}) {
  const saved = await saveAssumptionStatus(input);
  await recordActivity({
    productId: input.productId,
    type: "ASSUMPTION_UPDATED",
    description: `Marked an assumption as ${ASSUMPTION_STATUS_LABEL[input.status].toLowerCase()}: ${saved.description}`,
  });
  return saved;
}

export async function approveProductBrief(productId: string) {
  const product = await findProductRow(productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  const session = await findDiscoverySession(productId);
  const brief = await findCurrentBrief(productId);
  if (!session || !brief) {
    throw new DomainError("There is no product brief to approve.");
  }
  if (session.status === "APPROVED" && brief.status === "APPROVED") {
    throw new DomainError("This product brief is already approved.", "CONFLICT");
  }

  const stageBefore = product.currentStage;
  const approval = await requestApproval({
    productId,
    approvalType: "PRODUCT_DISCOVERY",
    comments: `Human approval of product brief v${brief.version}.`,
  });
  await resolveApproval(approval.id, "APPROVED", {
    comments: `Approved product brief v${brief.version}. The discovery agent did not approve its own work.`,
  });
  await markDiscoveryApproved({ productId, briefId: brief.id });
  await recordActivity({
    productId,
    type: "DISCOVERY_APPROVED",
    description: `Approved product brief v${brief.version}. The product stage was not changed.`,
  });

  const after = await findProductRow(productId);
  if (!after || after.currentStage !== stageBefore) {
    throw new DomainError("Product stage changed during discovery approval.");
  }
  return { briefId: brief.id, version: brief.version, stage: stageBefore };
}

export async function moveDiscoveryToDefine(productId: string) {
  const product = await findProductRow(productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  const session = await findDiscoverySession(productId);
  const brief = await findCurrentBrief(productId);
  if (session?.status !== "APPROVED" || brief?.status !== "APPROVED") {
    throw new DomainError("Approve the product brief before moving to Define.");
  }
  if (product.currentStage !== "EXPLORE") {
    throw new DomainError(
      "This product is not in Explore, so discovery will not change its stage.",
    );
  }
  return updateProduct({
    id: product.id,
    name: product.name,
    description: product.description,
    vision: product.vision,
    problemStatement: product.problemStatement,
    targetUsers: product.targetUsers,
    status: product.status,
    currentStage: "DEFINE" satisfies ProductStage,
  });
}
