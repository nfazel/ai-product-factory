/**
 * What the screen shows about a run, worked out from plain facts. Pure, so each wording and each state can be tested without
 * a database. It reads no git state and runs no checks: the Build page is already heavy.
 */
export type RunTaskState = "DONE" | "WORKING" | "NEEDS_YOU" | "WAITING";

export type RunTaskView = { id: string; title: string; state: RunTaskState; reason: string };

export type TaskFacts = {
  id: string;
  title: string;
  status: string;
  /** Verdict of the latest non-demo verification attempt, or null when there is none. */
  verdict: string | null;
  /** Newest hand-back for this task, or null. */
  handedBack: { at: Date; reason: string } | null;
};

const PASSING = new Set(["PASS", "PASS_WITH_CONCERNS"]);

export function presentTasks(input: { tasks: TaskFacts[]; lastRunStartedAt: Date | null; running: boolean; currentTaskId: string | null }): RunTaskView[] {
  return input.tasks.map((task) => {
    if (task.status === "COMPLETED" && task.verdict && PASSING.has(task.verdict)) return { id: task.id, title: task.title, state: "DONE", reason: "" };
    // A hand-back only counts until the next run begins, because that run looks at the task afresh.
    const current = task.handedBack && (!input.lastRunStartedAt || task.handedBack.at >= input.lastRunStartedAt);
    if (current && task.handedBack) return { id: task.id, title: task.title, state: "NEEDS_YOU", reason: task.handedBack.reason };
    if (input.running && input.currentTaskId === task.id) return { id: task.id, title: task.title, state: "WORKING", reason: "" };
    return { id: task.id, title: task.title, state: "WAITING", reason: "" };
  });
}

export type AuthorityStatus = "ACTIVE" | "STOPPED" | "EXPIRED";

export function authorityStatus(input: { revoked: boolean; expiresAt: Date; now: Date }): AuthorityStatus {
  if (input.revoked) return "STOPPED";
  return input.expiresAt <= input.now ? "EXPIRED" : "ACTIVE";
}

/** The one line that says where the run is. */
export function runHeadline(input: { status: AuthorityStatus; running: boolean; tasks: RunTaskView[] }) {
  const total = input.tasks.length;
  const done = input.tasks.filter((task) => task.state === "DONE").length;
  const waiting = input.tasks.find((task) => task.state === "NEEDS_YOU");
  if (input.status === "STOPPED") return `The Builder was stopped. ${done} of ${total} tasks are done.`;
  if (input.status === "EXPIRED") return `The Builder's authority has run out. ${done} of ${total} tasks are done.`;
  if (done === total && total > 0) return `All ${total} tasks are built and verified. Review the features, then accept them.`;
  if (input.running) return `The Builder is building. ${done} of ${total} tasks are done.`;
  if (waiting) return `The Builder needs you on "${waiting.title}". ${done} of ${total} tasks are done.`;
  return `The Builder is ready to continue. ${done} of ${total} tasks are done.`;
}
