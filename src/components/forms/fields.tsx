"use client";

import { useFormStatus } from "react-dom";

import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  error,
  hint,
  ...props
}: React.ComponentProps<"input"> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  id?: string;
}) {
  const fieldId = props.id ?? name;
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint}>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className="h-9"
        {...props}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  ...props
}: React.ComponentProps<"textarea"> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  id?: string;
}) {
  const fieldId = props.id ?? name;
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint}>
      <Textarea
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        className="min-h-24"
        {...props}
      />
    </Field>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  children,
  defaultValue,
  onChange,
  id,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  id?: string;
}) {
  const fieldId = id ?? name;
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint}>
      <select
        id={fieldId}
        name={name}
        defaultValue={defaultValue}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        className={cn(controlClass)}
      >
        {children}
      </select>
    </Field>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role="status"
      className={
        state.status === "success"
          ? "text-sm text-emerald-700"
          : "text-sm text-destructive"
      }
    >
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "default",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "outline" | "secondary" | "destructive";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name={name} value={value} size="lg" disabled={pending} variant={variant}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
