"use server";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  acceptEntireArchitectureProposal,
  addImplementationDependency,
  answerArchitectureQuestion,
  approveImplementationPlan,
  approveSolutionArchitecture,
  captureLocalCodebaseContext,
  chooseDevelopmentContext,
  commitArchitecture,
  commitImplementationPlan,
  editProposalSummary,
  generateArchitecture,
  generateImplementationPlan,
  markArchitectureReady,
  markPlanReady,
  regenerateArchitectureSection,
  requestArchitectureReview,
  reviewArchitectureItem,
  saveManualCodebaseContext,
  updateArchitectureComponent,
  updateArchitectureSummary,
  updateImplementationTask,
  updateTechnologyChoice,
} from "@/modules/architecture/service";
import {
  answerArchitectureQuestionSchema,
  architectureProductSchema,
  architectureSectionSchema,
  codebaseContextSchema,
  developmentContextSchema,
  editRecordSchema,
  editSummarySchema,
  proposalItemSchema,
  taskDependencySchema,
} from "@/modules/architecture/schema";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

export async function generateArchitectureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await generateArchitecture(parsed.data.productId);
    return done(parsed.data.productId, "An architecture proposal is ready for review. Nothing is approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function regenerateArchitectureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureSectionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await regenerateArchitectureSection(
      parsed.data.productId,
      parsed.data.section,
      parsed.data.featureTitle,
    );
    return done(parsed.data.productId, "That section was regenerated. Accepted and edited items were kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewArchitectureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await requestArchitectureReview(parsed.data.productId);
    return done(parsed.data.productId, "The review is recorded. The agent did not approve the architecture.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function generatePlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await generateImplementationPlan(parsed.data.productId);
    return done(parsed.data.productId, "An implementation plan proposal is ready for review.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = proposalItemSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  const status = formData.get("status") === "REJECTED" ? "REJECTED" : "ACCEPTED";
  try {
    await reviewArchitectureItem({ ...parsed.data, status });
    return done(parsed.data.productId, status === "ACCEPTED" ? "Accepted." : "Rejected.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function acceptArchitectureProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema
    .extend({ proposalId: architectureProductSchema.shape.productId })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await acceptEntireArchitectureProposal(parsed.data.productId, parsed.data.proposalId);
    return done(parsed.data.productId, "The proposal is accepted and still waiting to be committed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function commitArchitectureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema
    .extend({ proposalId: architectureProductSchema.shape.productId })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await commitArchitecture(parsed.data.productId, parsed.data.proposalId);
    return done(parsed.data.productId, "The architecture is saved as a draft. It is not approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function commitPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema
    .extend({ proposalId: architectureProductSchema.shape.productId })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await commitImplementationPlan(parsed.data.productId, parsed.data.proposalId);
    return done(parsed.data.productId, "The implementation plan is saved as a draft. It is not approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function markArchitectureReadyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await markArchitectureReady(parsed.data.productId);
    return done(parsed.data.productId, "Architecture is ready for review.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveArchitectureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveSolutionArchitecture(parsed.data.productId);
    return done(parsed.data.productId, "Design approved. The delivery plan still needs its own approval.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function markPlanReadyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await markPlanReady(parsed.data.productId);
    return done(parsed.data.productId, "Delivery plan is ready for a person to approve.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approvePlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveImplementationPlan(parsed.data.productId);
    return done(parsed.data.productId, "Delivery plan approved. Coding stays closed until the engineering review and the task are approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function editSummaryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  if (values.proposalId) {
    const parsed = editSummarySchema.safeParse(values);
    if (!parsed.success) return invalidState(parsed.error.issues);
    try {
      await editProposalSummary({
        productId: parsed.data.productId,
        proposalId: parsed.data.proposalId,
        architectureStyle: parsed.data.architectureStyle,
        summary: parsed.data.summary,
        rationale: parsed.data.rationale,
      });
      return done(parsed.data.productId, "The proposal summary was edited.");
    } catch (error) {
      return actionFailure(error);
    }
  }
  const parsed = editSummarySchema.safeParse(values);
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await updateArchitectureSummary({
      productId: parsed.data.productId,
      summary: parsed.data.summary,
      rationale: parsed.data.rationale,
      architectureStyle: parsed.data.architectureStyle,
    });
    return done(parsed.data.productId, "The architecture summary was updated.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function editComponentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = editRecordSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await updateArchitectureComponent({
      productId: parsed.data.productId,
      componentId: parsed.data.recordId,
      name: parsed.data.title,
      responsibilities: parsed.data.body,
      technology: String(formData.get("technology") ?? ""),
    });
    return done(parsed.data.productId, "The component was updated.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function editTechnologyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = editRecordSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await updateTechnologyChoice({
      productId: parsed.data.productId,
      choiceId: parsed.data.recordId,
      choice: parsed.data.title,
      reason: parsed.data.body,
      alternatives: String(formData.get("alternatives") ?? ""),
    });
    return done(parsed.data.productId, "The technology choice was updated.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function editTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = editRecordSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await updateImplementationTask({
      productId: parsed.data.productId,
      taskId: parsed.data.recordId,
      title: parsed.data.title,
      objective: parsed.data.body,
      validation: String(formData.get("validation") ?? ""),
      guidance: String(formData.get("guidance") ?? ""),
    });
    return done(parsed.data.productId, "The implementation task was updated.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function answerQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = answerArchitectureQuestionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await answerArchitectureQuestion(parsed.data);
    return done(parsed.data.productId, "The architecture question was answered.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function addDependencyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = taskDependencySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await addImplementationDependency(parsed.data);
    return done(parsed.data.productId, "The task dependency was added.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function chooseDevelopmentContextAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = developmentContextSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await chooseDevelopmentContext(parsed.data.productId, parsed.data.developmentContext);
    return done(
      parsed.data.productId,
      parsed.data.developmentContext === "GREENFIELD"
        ? "Recorded as a new application. No existing codebase is required."
        : "Recorded as an existing application.",
    );
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveContextAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = codebaseContextSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await saveManualCodebaseContext(parsed.data);
    return done(parsed.data.productId, "Codebase context saved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function captureLocalContextAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = architectureProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await captureLocalCodebaseContext(parsed.data.productId);
    return done(parsed.data.productId, "Read the configured project directory. No repository was cloned.");
  } catch (error) {
    return actionFailure(error);
  }
}
