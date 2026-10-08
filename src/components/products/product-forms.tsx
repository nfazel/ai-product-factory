"use client";

import { useActionState } from "react";

import {
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABEL,
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
        label="What problem are you trying to solve?"
        name="problemStatement"
        error={state.fieldErrors?.problemStatement}
        required
      />
      <FormMessage state={state} />
      <p className="text-xs text-muted-foreground">
        New products start in Explore. Discovery will shape the brief. You do not need a vision or a solution yet.
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
      <input type="hidden" name="currentStage" value={product.currentStage} />
      <SelectField label="Status" name="status" defaultValue={product.status}>
        {PRODUCT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {PRODUCT_STATUS_LABEL[status]}
          </option>
        ))}
      </SelectField>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save status</SubmitButton>
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
      />
      <TextAreaField
        label="Vision, if discovery has already settled it"
        name="vision"
        defaultValue={product.vision}
        error={state.fieldErrors?.vision}
      />
      <TextAreaField
        label="Problem statement"
        name="problemStatement"
        defaultValue={product.problemStatement}
        error={state.fieldErrors?.problemStatement}
        required
      />
      <TextAreaField
        label="Target users, if discovery has already settled them"
        name="targetUsers"
        defaultValue={product.targetUsers}
        error={state.fieldErrors?.targetUsers}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Status" name="status" defaultValue={product.status}>
          {PRODUCT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PRODUCT_STATUS_LABEL[status]}
            </option>
          ))}
        </SelectField>
        <input type="hidden" name="currentStage" value={product.currentStage} />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save product</SubmitButton>
    </form>
  );
}
