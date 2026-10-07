import {
  ACCEPTANCE_STATUS_LABEL,
  ACTIVITY_TYPE_LABEL,
  APPROVAL_STATUS_LABEL,
  APPROVAL_TYPE_LABEL,
  PRIORITY_LABEL,
  PRODUCT_STATUS_LABEL,
  STAGE_META,
  WORK_ITEM_STATUS_LABEL,
  WORK_ITEM_TYPE_LABEL,
  isActivityType,
  isApprovalType,
  type AcceptanceStatus,
  type ApprovalStatus,
  type Priority,
  type ProductStage,
  type ProductStatus,
  type WorkItemStatus,
  type WorkItemType,
} from "@/domain/constants";
import { cn } from "cn";

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const tone: Record<ProductStatus, string> = {
    DRAFT: "bg-stone-100 text-stone-700",
    ACTIVE: "bg-emerald-50 text-emerald-800",
    PAUSED: "bg-amber-50 text-amber-900",
    ARCHIVED: "bg-stone-100 text-stone-500",
  };
  return <Pill className={tone[status]}>{PRODUCT_STATUS_LABEL[status]}</Pill>;
}

export function StageBadge({ stage }: { stage: ProductStage }) {
  return (
    <Pill className="bg-indigo-50 text-indigo-800">{STAGE_META[stage].label}</Pill>
  );
}

export function WorkItemTypeBadge({ type }: { type: WorkItemType }) {
  const tone: Record<WorkItemType, string> = {
    EPIC: "bg-slate-800 text-white",
    FEATURE: "bg-indigo-50 text-indigo-800",
    STORY: "bg-sky-50 text-sky-800",
    TASK: "bg-stone-100 text-stone-700",
    DEFECT: "bg-rose-50 text-rose-800",
  };
  return <Pill className={tone[type]}>{WORK_ITEM_TYPE_LABEL[type]}</Pill>;
}

export function WorkItemStatusBadge({ status }: { status: WorkItemStatus }) {
  const tone: Record<WorkItemStatus, string> = {
    DRAFT: "bg-stone-100 text-stone-700",
    READY: "bg-sky-50 text-sky-800",
    IN_PROGRESS: "bg-indigo-50 text-indigo-800",
    BLOCKED: "bg-amber-100 text-amber-950",
    REVIEW: "bg-violet-50 text-violet-800",
    DONE: "bg-emerald-50 text-emerald-800",
  };
  return <Pill className={tone[status]}>{WORK_ITEM_STATUS_LABEL[status]}</Pill>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone: Record<Priority, string> = {
    CRITICAL: "bg-rose-100 text-rose-900",
    HIGH: "bg-amber-50 text-amber-900",
    MEDIUM: "bg-stone-100 text-stone-700",
    LOW: "bg-stone-50 text-stone-500",
  };
  return <Pill className={tone[priority]}>{PRIORITY_LABEL[priority]}</Pill>;
}

export function AcceptanceBadge({ status }: { status: AcceptanceStatus }) {
  const tone: Record<AcceptanceStatus, string> = {
    PENDING: "bg-amber-50 text-amber-900",
    PASSED: "bg-emerald-50 text-emerald-800",
    FAILED: "bg-rose-50 text-rose-800",
  };
  return <Pill className={tone[status]}>{ACCEPTANCE_STATUS_LABEL[status]}</Pill>;
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const tone: Record<ApprovalStatus, string> = {
    PENDING: "bg-amber-100 text-amber-950",
    APPROVED: "bg-emerald-50 text-emerald-800",
    REJECTED: "bg-rose-50 text-rose-800",
  };
  return <Pill className={tone[status]}>{APPROVAL_STATUS_LABEL[status]}</Pill>;
}

export function approvalLabel(value: string) {
  return isApprovalType(value) ? APPROVAL_TYPE_LABEL[value] : value;
}

export function activityLabel(value: string) {
  return isActivityType(value) ? ACTIVITY_TYPE_LABEL[value] : value;
}
