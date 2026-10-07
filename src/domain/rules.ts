import {
  ALLOWED_PARENTS,
  WORK_ITEM_TYPE_LABEL,
  type WorkItemType,
} from "@/domain/constants";

export function parentPlacementError(
  type: WorkItemType,
  parentType: WorkItemType | null,
): string | null {
  const allowed = ALLOWED_PARENTS[type];

  if (allowed === null) {
    return parentType
      ? "An epic stands at the top of the backlog and cannot have a parent."
      : null;
  }

  if (!parentType) {
    if (type === "FEATURE") return "A feature must belong to an epic.";
    if (type === "STORY") return "A story must belong to a feature.";
    return null;
  }

  if (!allowed.includes(parentType)) {
    const expected = allowed
      .map((item) => WORK_ITEM_TYPE_LABEL[item].toLowerCase())
      .join(" or ");
    return `A ${WORK_ITEM_TYPE_LABEL[type].toLowerCase()} can only sit under a ${expected}.`;
  }

  return null;
}
