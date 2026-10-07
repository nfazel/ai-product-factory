export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const idleState: ActionState = { status: "idle" };

export function fieldErrorsFromIssues(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export function invalidState(
  issues: { path: PropertyKey[]; message: string }[],
  message = "Check the highlighted fields and try again.",
): ActionState {
  return {
    status: "error",
    message,
    fieldErrors: fieldErrorsFromIssues(issues),
  };
}
