"use server";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  acceptEntireProposal,
  answerRequirementQuestion,
  approveFirstSlice,
  approveProductDefinition,
  commitProductDefinition,
  confirmNonFunctional,
  confirmProductCapability,
  confirmProductOutcome,
  continueDefinition,
  editProposedItem,
  generateProductDefinition,
  markDefinitionReady,
  moveDefinitionToBuild,
  regenerateDefinitionSection,
  rejectNonFunctional,
  rejectProductCapability,
  requestDefinitionReview,
  reviewProposalItem,
} from "@/modules/requirements/service";
import {
  answerQuestionSchema,
  editProposalSchema,
  entityActionSchema,
  productIdSchema,
  proposalActionSchema,
  regenerateSchema,
} from "@/modules/requirements/schema";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

export async function generateDefinitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await generateProductDefinition(parsed.data.productId);
    return done(parsed.data.productId, "A product definition proposal is ready for review. Nothing was added to the backlog.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function regenerateSectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = regenerateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await regenerateDefinitionSection(parsed.data.productId, parsed.data.section);
    return done(parsed.data.productId, "That section of the proposal was regenerated. Accepted and edited items were kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function requestDefinitionReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await requestDefinitionReview(parsed.data.productId);
    return done(parsed.data.productId, "The review is recorded. The agent did not approve the definition.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function acceptProposalItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = proposalActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await reviewProposalItem({ ...parsed.data, decision: "ACCEPTED" });
    return done(parsed.data.productId, "Accepted. Commit it when you are ready for it to enter the definition.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectProposalItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = proposalActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await reviewProposalItem({ ...parsed.data, decision: "REJECTED" });
    return done(parsed.data.productId, "Rejected. It will not be committed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function acceptAllProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = productIdSchema.safeParse(values);
  if (!parsed.success || !values.proposalId) return invalidState(parsed.success ? [] : parsed.error.issues);
  try {
    await acceptEntireProposal(parsed.data.productId, values.proposalId);
    return done(parsed.data.productId, "Every pending item is accepted. Commit them to add them to the definition.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function editProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = editProposalSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await editProposedItem(parsed.data);
    return done(parsed.data.productId, "Saved your edit on the proposal.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function commitProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = productIdSchema.safeParse(values);
  if (!parsed.success || !values.proposalId) {
    return { status: "error", message: "Choose a proposal to commit." };
  }
  try {
    await commitProductDefinition(parsed.data.productId, values.proposalId);
    return done(parsed.data.productId, "Accepted items are now part of the product definition and backlog.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function confirmOutcomeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = entityActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await confirmProductOutcome(parsed.data.productId, parsed.data.entityId);
    return done(parsed.data.productId, "Outcome confirmed. The agent cannot overwrite it.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function confirmCapabilityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = entityActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await confirmProductCapability(parsed.data.productId, parsed.data.entityId);
    return done(parsed.data.productId, "Capability confirmed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectCapabilityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = entityActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await rejectProductCapability(parsed.data.productId, parsed.data.entityId);
    return done(parsed.data.productId, "Capability rejected.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function confirmNfrAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = entityActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await confirmNonFunctional(parsed.data.productId, parsed.data.entityId);
    return done(parsed.data.productId, "Non-functional requirement confirmed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectNfrAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = entityActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await rejectNonFunctional(parsed.data.productId, parsed.data.entityId);
    return done(parsed.data.productId, "Non-functional requirement rejected.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveSliceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = entityActionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveFirstSlice(parsed.data.productId, parsed.data.entityId);
    return done(parsed.data.productId, "First product slice approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function answerQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = answerQuestionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await answerRequirementQuestion(parsed.data);
    return done(parsed.data.productId, "Answer recorded.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewDefinitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await markDefinitionReady(parsed.data.productId);
    return done(parsed.data.productId, "Product definition is ready for review.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function continueDefinitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await continueDefinition(parsed.data.productId);
    return done(parsed.data.productId, "Definition continues. It is not approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveDefinitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveProductDefinition(parsed.data.productId);
    return done(
      parsed.data.productId,
      "Product Definition approved. Product is ready for architecture and delivery planning.",
    );
  } catch (error) {
    return actionFailure(error);
  }
}

export async function moveToBuildAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await moveDefinitionToBuild(parsed.data.productId);
    return done(parsed.data.productId, "The product is now in Build.");
  } catch (error) {
    return actionFailure(error);
  }
}
