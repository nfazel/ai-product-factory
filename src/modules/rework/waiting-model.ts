/**
 * Where a piece of feedback is on its way from "someone said it" to "it is built": a pure reading of the records,
 * so the person can be told plainly what is waiting for them. It never decides anything.
 */
export type FeedbackFacts = {
  /** Status of the thread's latest feedback event: AI_ANALYSIS (needs a person), CONFIRMED, REJECTED or CANCELLED. */
  head: string | null;
  scope: "NONE" | "DRAFT" | "APPROVED" | "REJECTED";
  amendment: "NONE" | "DRAFTED" | "APPROVED" | "REJECTED" | "ACTIVATED";
  tasks: { id: string; title: string; status: string; authorised: boolean }[];
};

export type FeedbackStep =
  | "CONFIRM_PROPOSAL"
  | "PREPARE_SCOPE"
  | "APPROVE_SCOPE"
  | "DRAFT_TASKS"
  | "APPROVE_TASKS"
  | "CREATE_TASKS"
  | "AUTHORISE_TASK"
  | "BUILD_TASK"
  | "DONE"
  | "CLOSED";

export type FeedbackProgress = { step: FeedbackStep; sentence: string; taskId: string | null };

const open = (step: FeedbackStep, sentence: string, taskId: string | null = null): FeedbackProgress => ({ step, sentence, taskId });

export function feedbackProgress(facts: FeedbackFacts): FeedbackProgress {
  if (facts.head === "REJECTED" || facts.head === "CANCELLED") return open("CLOSED", "This feedback was closed.");
  if (facts.head !== "CONFIRMED") return open("CONFIRM_PROPOSAL", "The AI has read it and replied. Read its reply, then confirm the proposal or correct it.");
  if (facts.scope === "REJECTED") return open("PREPARE_SCOPE", "The development scope was rejected. Prepare a new one.");
  if (facts.scope === "NONE") return open("PREPARE_SCOPE", "Confirmed. Next, prepare the development scope: exactly what the AI may change.");
  if (facts.scope === "DRAFT") return open("APPROVE_SCOPE", "The scope is drafted. Read it, then approve it, or ask for a revision.");
  if (facts.amendment === "NONE" || facts.amendment === "REJECTED") return open("DRAFT_TASKS", "The scope is approved. Next, draft the development tasks.");
  if (facts.amendment === "DRAFTED") return open("APPROVE_TASKS", "The tasks are drafted. Read them, then approve them.");
  if (facts.amendment === "APPROVED") return open("CREATE_TASKS", "The tasks are approved but not created yet. Create them.");
  const pending = facts.tasks.find((task) => !task.authorised && task.status === "PROPOSED");
  if (pending) return open("AUTHORISE_TASK", `The task "${pending.title}" is created. Approve it for coding to let the Coding Agent build it.`, pending.id);
  const building = facts.tasks.find((task) => task.authorised && task.status !== "COMPLETED");
  if (building) return open("BUILD_TASK", `The task "${building.title}" is authorised. Continue it in Build.`, building.id);
  return open("DONE", "Built.");
}

export const FEEDBACK_NEEDS_PERSON = new Set<FeedbackStep>(["CONFIRM_PROPOSAL", "PREPARE_SCOPE", "APPROVE_SCOPE", "DRAFT_TASKS", "APPROVE_TASKS", "CREATE_TASKS", "AUTHORISE_TASK", "BUILD_TASK"]);
