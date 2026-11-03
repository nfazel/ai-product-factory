import type { BlockerView, NextAction } from "@/modules/guidance/types";

/** What the bar at the top of every product page says: one thing to do, or why nothing can be done yet. */
export type NextStepView = {
  tone: "action" | "blocked" | "quiet";
  kicker: string;
  title: string;
  body: string;
  meta: string;
  href: string | null;
  linkLabel: string;
};

export function nextStepView(action: NextAction | null, blocker: BlockerView | null): NextStepView {
  if (action) {
    return {
      tone: "action",
      kicker: action.decision ? "A decision is waiting for you" : "Your next step",
      title: action.label,
      body: action.why,
      meta: action.role,
      href: action.href,
      linkLabel: action.execution === "command" ? "Go to it" : `Open ${action.label}`,
    };
  }
  if (blocker) {
    return {
      tone: "blocked",
      kicker: "Blocked",
      title: blocker.what,
      body: [blocker.why, blocker.required].filter(Boolean).join(" "),
      meta: [blocker.who, blocker.next].filter(Boolean).join(" · "),
      href: null,
      linkLabel: "",
    };
  }
  return { tone: "quiet", kicker: "Nothing is waiting", title: "Nothing needs you right now.", body: "", meta: "", href: null, linkLabel: "" };
}
