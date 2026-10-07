"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import {
  ALLOWED_PARENTS,
  PRIORITIES,
  PRIORITY_LABEL,
  PRODUCT_STAGES,
  STAGE_META,
  WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS_LABEL,
  WORK_ITEM_TYPES,
  WORK_ITEM_TYPE_LABEL,
  type WorkItemType,
} from "@/domain/constants";
import { idleState } from "@/lib/action-state";
import {
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ProductStage } from "@/domain/constants";
import type { WorkItemSummary } from "@/modules/work-item/types";
import {
  addDependencyAction,
  createWorkItemAction,
  updateCriterionStatusAction,
  updateWorkItemAction,
} from "@/server/actions/work-items";
import { addCriterionAction, recordDecisionAction } from "@/server/actions/records";
import type { AcceptanceCriterion } from "@/modules/acceptance/types";
import { ACCEPTANCE_STATUSES, ACCEPTANCE_STATUS_LABEL } from "@/domain/constants";
import { getCurrentActor } from "@/modules/identity/actor";

export function CreateWorkItemDialog({
  productId,
  stage,
  items,
}: {
  productId: string;
  stage: ProductStage;
  items: WorkItemSummary[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus />
          Add work item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add work item</DialogTitle>
          <DialogDescription>
            Epics hold features. Features hold stories. Tasks and defects sit
            with the work they belong to.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CreateWorkItemForm
            productId={productId}
            stage={stage}
            items={items}
            onCreated={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkItemForm({
  productId,
  stage,
  items,
  onCreated,
}: {
  productId: string;
  stage: ProductStage;
  items: WorkItemSummary[];
  onCreated: () => void;
}) {
  const [state, action] = useActionState(createWorkItemAction, idleState);
  const [type, setType] = useState<WorkItemType>("STORY");
  const allowed = ALLOWED_PARENTS[type];
  const parents = allowed
    ? items.filter((item) => allowed.includes(item.type))
    : [];

  useEffect(() => {
    if (state.status === "success") onCreated();
  }, [state, onCreated]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      <SelectField
        label="Type"
        name="type"
        defaultValue="STORY"
        onChange={(event) => setType(event.target.value as WorkItemType)}
      >
        {WORK_ITEM_TYPES.map((itemType) => (
          <option key={itemType} value={itemType}>
            {WORK_ITEM_TYPE_LABEL[itemType]}
          </option>
        ))}
      </SelectField>
      <TextField label="Title" name="title" error={state.fieldErrors?.title} required />
      <TextAreaField
        label="Description"
        name="description"
        error={state.fieldErrors?.description}
      />
      {allowed ? (
        <SelectField
          label="Parent"
          name="parentId"
          error={state.fieldErrors?.parentId}
          hint={
            type === "FEATURE" || type === "STORY"
              ? "Required so the backlog stays grouped."
              : "Optional. Attach it when a parent already exists."
          }
        >
          <option value="">No parent</option>
          {parents.map((item) => (
            <option key={item.id} value={item.id}>
              {WORK_ITEM_TYPE_LABEL[item.type]} · {item.title}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="parentId" value="" />
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Status" name="status" defaultValue="DRAFT">
          {WORK_ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {WORK_ITEM_STATUS_LABEL[status]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Priority" name="priority" defaultValue="MEDIUM">
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABEL[priority]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Stage" name="stage" defaultValue={stage}>
          {PRODUCT_STAGES.map((item) => (
            <option key={item} value={item}>
              {STAGE_META[item].label}
            </option>
          ))}
        </SelectField>
      </div>
      <FormMessage state={state.status === "success" ? idleState : state} />
      <SubmitButton pendingLabel="Adding…">Add to backlog</SubmitButton>
    </form>
  );
}

export function UpdateWorkItemForm({ item }: { item: WorkItemSummary }) {
  const [state, action] = useActionState(updateWorkItemAction, idleState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={item.id} />
      <TextField
        label="Title"
        name="title"
        defaultValue={item.title}
        error={state.fieldErrors?.title}
        required
      />
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={item.description}
        error={state.fieldErrors?.description}
      />
      <SelectField label="Status" name="status" defaultValue={item.status}>
        {WORK_ITEM_STATUSES.map((status) => (
          <option key={status} value={status}>
            {WORK_ITEM_STATUS_LABEL[status]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Priority" name="priority" defaultValue={item.priority}>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {PRIORITY_LABEL[priority]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Product stage" name="stage" defaultValue={item.stage}>
        {PRODUCT_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_META[stage].label}
          </option>
        ))}
      </SelectField>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save work item</SubmitButton>
    </form>
  );
}

export function AddCriterionForm({ workItemId }: { workItemId: string }) {
  const [state, action] = useActionState(addCriterionAction, idleState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workItemId" value={workItemId} />
      <TextAreaField
        label="New acceptance criterion"
        name="description"
        error={state.fieldErrors?.description}
        placeholder="What must be true before this is done?"
        required
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Adding…">Add criterion</SubmitButton>
    </form>
  );
}

export function CriterionStatusForm({
  criterion,
}: {
  criterion: AcceptanceCriterion;
}) {
  const [state, action] = useActionState(updateCriterionStatusAction, idleState);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={criterion.id} />
      <div className="min-w-36 flex-1">
        <SelectField
          id={`status-${criterion.id}`}
          label="Result"
          name="status"
          defaultValue={criterion.status}
        >
          {ACCEPTANCE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ACCEPTANCE_STATUS_LABEL[status]}
            </option>
          ))}
        </SelectField>
      </div>
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Update
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AddDependencyForm({
  workItemId,
  candidates,
}: {
  workItemId: string;
  candidates: WorkItemSummary[];
}) {
  const [state, action] = useActionState(addDependencyAction, idleState);
  const options = candidates.filter((item) => item.id !== workItemId);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workItemId" value={workItemId} />
      <SelectField
        label="Depends on"
        name="dependsOnId"
        error={state.fieldErrors?.dependsOnId}
      >
        <option value="">Choose a work item</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {WORK_ITEM_TYPE_LABEL[item.type]} · {item.title}
          </option>
        ))}
      </SelectField>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Adding…" variant="outline">
        Add dependency
      </SubmitButton>
    </form>
  );
}

export function RecordDecisionForm({
  productId,
  workItemId,
}: {
  productId: string;
  workItemId?: string;
}) {
  const [state, action] = useActionState(recordDecisionAction, idleState);
  const actor = getCurrentActor();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {workItemId ? (
        <input type="hidden" name="workItemId" value={workItemId} />
      ) : null}
      <TextField label="Title" name="title" error={state.fieldErrors?.title} required />
      <TextAreaField
        label="Context"
        name="description"
        error={state.fieldErrors?.description}
        required
      />
      <TextAreaField
        label="Decision"
        name="decision"
        error={state.fieldErrors?.decision}
        required
      />
      <TextAreaField
        label="Reason"
        name="reason"
        error={state.fieldErrors?.reason}
        required
      />
      <TextField
        label="Decision maker"
        name="decisionMaker"
        defaultValue={actor.name}
        error={state.fieldErrors?.decisionMaker}
        required
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Recording…" variant="outline">
        Record decision
      </SubmitButton>
    </form>
  );
}
