"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import { assignProductRepository } from "@/modules/source-control/github-account";
import { getCurrentActor } from "@/modules/identity/actor";
import {
  connectExistingRepository,
  createRemoteRepository,
  initializeGreenfieldRepository,
} from "@/modules/source-control/product-repository";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

const productId = z.object({ productId: z.string().trim().min(1) });

function selectedRepository(value: { repository?: string; owner?: string; repositoryName?: string }) {
  const selected = value.repository?.split("/") ?? [];
  if (selected.length === 2 && selected[0] && selected[1] && !selected[0].includes("..") && !selected[1].includes("..")) {
    return { owner: selected[0], repositoryName: selected[1] };
  }
  if (value.owner && value.repositoryName) return { owner: value.owner, repositoryName: value.repositoryName };
  return null;
}

function done(id: string, message: string): ActionState {
  refreshWorkspace(id);
  return { status: "success", message };
}

export async function initializeRepositoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productId.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await initializeGreenfieldRepository(parsed.data.productId);
    return done(parsed.data.productId, "Local repository ready. No remote repository was created and no code was published.");
  } catch (error) {
    return actionFailure(error);
  }
}

const connectSchema = z.object({
  productId: z.string().trim().min(1),
  localPath: z.string().trim().min(1, "Enter the absolute path of the Git repository."),
});

export async function connectRepositoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = connectSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await connectExistingRepository(parsed.data.productId, parsed.data.localPath);
    return done(parsed.data.productId, "Existing repository connected. No code was published.");
  } catch (error) {
    return actionFailure(error);
  }
}

const remoteSchema = z.object({
  productId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  visibility: z.enum(["private", "public"]),
  defaultBranch: z.string().trim().min(1),
  confirmed: z.string().optional(),
}).superRefine((value, context) => {
  if (value.confirmed !== "yes") {
    context.addIssue({
      code: "custom",
      path: ["confirmed"],
      message: "Confirm creation before a GitHub repository is created.",
    });
  }
});

const mappingSchema = z.object({
  productId: z.string().trim().min(1),
  repository: z.string().trim().optional(),
  owner: z.string().trim().optional(),
  repositoryName: z.string().trim().optional(),
});

export async function assignProductRepositoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = mappingSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  const selected = selectedRepository(parsed.data);
  if (!selected) {
    return { status: "error", message: "Choose a repository from the GitHub App installation." };
  }
  try {
    const mapped = await assignProductRepository({
      productId: parsed.data.productId,
      owner: selected.owner,
      repositoryName: selected.repositoryName,
      actor: getCurrentActor().name,
    });
    return done(
      parsed.data.productId,
      mapped.conflict
        ? mapped.message
        : `Associated ${mapped.owner}/${mapped.repositoryName}. Nothing was created, pushed, or merged.`,
    );
  } catch (error) {
    return actionFailure(error);
  }
}

export async function refreshInstallationRepositoriesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productId.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  refreshWorkspace(parsed.data.productId);
  return {
    status: "success",
    message: "Repository list refreshed from the GitHub App installation. Nothing was changed.",
  };
}

export async function createRemoteRepositoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = remoteSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await createRemoteRepository(parsed.data.productId, { ...parsed.data, confirmed: true });
    return done(parsed.data.productId, "GitHub repository created. Generated code was not published.");
  } catch (error) {
    return actionFailure(error);
  }
}
