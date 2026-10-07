"use client";

import { useActionState } from "react";

import {
  PRODUCT_STAGES,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABEL,
  STAGE_META,
} from "@/domain/constants";
import { idleState } from "@/lib/action-state";
import {
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/forms/fields";
import type { Product } from "@/modules/product/types";
import {
  createProductAction,
  updateProductAction,
} from "@/server/actions/products";

export function CreateProductForm() {
  const [state, action] = useActionState(createProductAction, idleState);

  return (
    <form action={action} className="space-y-5">
      <TextField
        label="Product name"
        name="name"
        error={state.fieldErrors?.name}
        required
        autoFocus
      />
      <TextAreaField
        label="Short description"
        name="description"
        error={state.fieldErrors?.description}
        required
      />
      <TextAreaField
        label="Product vision"
        name="vision"
        error={state.fieldErrors?.vision}
        required
      />
      <TextAreaField
        label="Problem statement"
        name="problemStatement"
        error={state.fieldErrors?.problemStatement}
        required
      />
      <TextAreaField
        label="Target users"
        name="targetUsers"
        error={state.fieldErrors?.targetUsers}
        required
      />
      <FormMessage state={state} />
      <p className="text-xs text-muted-foreground">
        New products start as Active in Explore. Move the stage when the work
        is ready.
      </p>
      <SubmitButton pendingLabel="Creating product…">Create product</SubmitButton>
    </form>
  );
}

export function StageControlForm({ product }: { product: Product }) {
  const [state, action] = useActionState(updateProductAction, idleState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="name" value={product.name} />
      <input type="hidden" name="description" value={product.description} />
      <input type="hidden" name="vision" value={product.vision} />
      <input type="hidden" name="problemStatement" value={product.problemStatement} />
      <input type="hidden" name="targetUsers" value={product.targetUsers} />
      <SelectField label="Status" name="status" defaultValue={product.status}>
        {PRODUCT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {PRODUCT_STATUS_LABEL[status]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Current stage"
        name="currentStage"
        defaultValue={product.currentStage}
        hint="Humans move the stage. Agents will not advance it on their own."
      >
        {PRODUCT_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_META[stage].label}
          </option>
        ))}
      </SelectField>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Update stage</SubmitButton>
    </form>
  );
}

export function EditProductForm({ product }: { product: Product }) {
  const [state, action] = useActionState(updateProductAction, idleState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={product.id} />
      <TextField
        label="Product name"
        name="name"
        defaultValue={product.name}
        error={state.fieldErrors?.name}
        required
      />
      <TextAreaField
        label="Short description"
        name="description"
        defaultValue={product.description}
        error={state.fieldErrors?.description}
        required
      />
      <TextAreaField
        label="Product vision"
        name="vision"
        defaultValue={product.vision}
        error={state.fieldErrors?.vision}
        required
      />
      <TextAreaField
        label="Problem statement"
        name="problemStatement"
        defaultValue={product.problemStatement}
        error={state.fieldErrors?.problemStatement}
        required
      />
      <TextAreaField
        label="Target users"
        name="targetUsers"
        defaultValue={product.targetUsers}
        error={state.fieldErrors?.targetUsers}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Status" name="status" defaultValue={product.status}>
          {PRODUCT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PRODUCT_STATUS_LABEL[status]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Current stage"
          name="currentStage"
          defaultValue={product.currentStage}
        >
          {PRODUCT_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_META[stage].label}
            </option>
          ))}
        </SelectField>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save product</SubmitButton>
    </form>
  );
}
