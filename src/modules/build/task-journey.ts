import type { BuildTaskRow, CodingTask } from "@/modules/build/task-status";

/** What a task's page needs to say plainly: where the task is on its way from "proposed" to "verified", and what is next. */
export type JourneyStepId =
  | "approve-task"
  | "plan"
  | "approve-plan"
  | "code"
  | "review-code"
  | "record"
  | "verify"
  | "approve-verification";

export type JourneyState = "done" | "current" | "working" | "attention" | "upcoming";

export type JourneyStep = { id: JourneyStepId; label: string; state: JourneyState };

export type JourneyVerification = { status: string; overallVerdict: string | null; approved?: boolean } | null;

export type Journey = {
  steps: JourneyStep[];
  current: JourneyStep | null;
  /** One sentence: what to do, or what is happening. */
  headline: string;
  /** One more sentence of context, or empty. */
  detail: string;
  /** True when it is the person's turn and a button can be pressed. */
  yourTurn: boolean;
  finished: boolean;
};

const LABEL: Record<JourneyStepId, string> = {
  "approve-task": "Approve the task",
  plan: "Create the plan",
  "approve-plan": "Approve the plan",
  code: "Write the code",
  "review-code": "Review the code",
  record: "Save the approved version",
  verify: "Verify it",
  "approve-verification": "Approve the verification",
};

const ORDER: JourneyStepId[] = ["approve-task", "plan", "approve-plan", "code", "review-code", "record", "verify", "approve-verification"];

const YOUR_TURN: Record<JourneyStepId, { headline: string; detail: string }> = {
  "approve-task": { headline: "Approve this task so coding can start.", detail: "Nothing is built until you do." },
  plan: { headline: "Generate the execution plan.", detail: "The Coding Agent drafts what it will change. You approve it before any code is written." },
  "approve-plan": { headline: "Read the plan and approve it.", detail: "Check the files it will change and the checks it will run. If it is wrong, ask for changes instead." },
  code: { headline: "Start coding.", detail: "The Coding Agent writes the change and runs the checks. It takes a minute or two." },
  "review-code": { headline: "Review the change and approve it.", detail: "Read what changed. If something is wrong or unrelated, ask for changes instead of approving." },
  record: { headline: "Save the approved version (Record Approved Snapshot).", detail: "This commits the change on the task's branch, locally. Nothing is pushed." },
  verify: { headline: "Open verification and run it.", detail: "You sign a short review of what will run, then it runs in isolated containers." },
  "approve-verification": { headline: "Read the verification result and approve it.", detail: "Check the evidence, and any concerns, before you sign." },
};

const WORKING: Partial<Record<JourneyStepId, { headline: string; detail: string }>> = {
  plan: { headline: "The Coding Agent is drafting the plan.", detail: "Nothing is needed from you. This takes up to a minute or two." },
  code: { headline: "The Coding Agent is writing the change and running the checks.", detail: "Nothing is needed from you. This takes a minute or two." },
  verify: { headline: "Verification is running.", detail: "Nothing is needed from you. This takes about five minutes." },
};

const VERIFIED = new Set(["PASS", "PASSED", "PASS_WITH_CONCERNS"]);
const RUNNING_VERIFICATION = new Set(["PLANNING", "READY", "EXECUTING", "RUNNING", "ACTIVE"]);

export function taskJourney(task: CodingTask, summary: BuildTaskRow, verification: JourneyVerification): Journey {
  const workspace = task.workspace;
  const plan = workspace?.plan ?? null;
  const taskApproved = !["PROPOSED", "BLOCKED"].includes(task.status);
  const hasPlan = Boolean(plan);
  const planApproved = plan?.status === "APPROVED" || plan?.status === "COMPLETED";
  const coded = workspace?.status === "READY_FOR_REVIEW" || workspace?.status === "COMPLETED";
  const committed = workspace?.status === "COMPLETED" && Boolean(workspace.headCommit) && workspace.headCommit !== workspace.baseCommit;
  const reviewed = committed || Boolean(workspace?.approvals?.some((item) => !item.stale));
  const verified = Boolean(verification && (VERIFIED.has(verification.overallVerdict ?? "") || (verification.status === "PASSED" && !verification.overallVerdict)));
  const done: Record<JourneyStepId, boolean> = {
    "approve-task": taskApproved,
    plan: hasPlan,
    "approve-plan": planApproved,
    code: coded,
    "review-code": reviewed,
    record: committed,
    verify: verified,
    "approve-verification": Boolean(verification?.approved) && verified,
  };
  // A later fact implies the earlier ones (for example a committed task obviously had its plan approved).
  const reached = ORDER.reduce((last, id, index) => (done[id] ? index : last), -1);
  const currentIndex = ORDER.findIndex((id, index) => index > reached && !done[id]);
  const finished = ORDER.every((id) => done[id] || ORDER.indexOf(id) < reached);
  const currentId = finished ? null : (ORDER[currentIndex === -1 ? ORDER.length - 1 : currentIndex] ?? null);

  const codingRunning = workspace?.status === "ACTIVE" || (workspace?.status as string | undefined) === "CHECKING";
  const verificationRunning = Boolean(verification && RUNNING_VERIFICATION.has(verification.status));
  const stuck = Boolean(summary.attention && (summary.blockers.length > 0 || workspace?.status === "FAILED" || summary.codingTone === "attention" && !summary.primaryAction));
  const failedVerification = Boolean(verification && (verification.status === "FAILED" || verification.status === "BLOCKED" || verification.overallVerdict === "FAIL"));

  const steps: JourneyStep[] = ORDER.map((id, index) => {
    if (finished || index <= reached || done[id]) return { id, label: LABEL[id], state: "done" };
    if (id !== currentId) return { id, label: LABEL[id], state: "upcoming" };
    const working = (currentId === "plan" || currentId === "code") ? codingRunning : currentId === "verify" ? verificationRunning : false;
    const state: JourneyState = working ? "working" : stuck || (currentId === "verify" && failedVerification) ? "attention" : "current";
    return { id, label: LABEL[id], state };
  });
  const current = steps.find((step) => step.id === currentId) ?? null;

  if (!current) return { steps, current: null, headline: "Everything for this task is done.", detail: "It is built, approved, saved and verified.", yourTurn: false, finished: true };
  if (current.state === "working") {
    const text = WORKING[current.id] ?? { headline: "Working.", detail: "Nothing is needed from you." };
    return { steps, current, ...text, yourTurn: false, finished: false };
  }
  if (current.state === "attention") {
    const reason = summary.blockers[0] ?? (failedVerification ? "The verification did not pass. Open it to see why." : summary.nextAction);
    return { steps, current, headline: `This step needs attention: ${current.label.toLowerCase()}.`, detail: reason, yourTurn: true, finished: false };
  }
  return { steps, current, ...YOUR_TURN[current.id], yourTurn: true, finished: false };
}
