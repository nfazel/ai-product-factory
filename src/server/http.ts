import { ZodError } from "zod";

import { AgentNotConfiguredError } from "@/modules/agent/service";
import { DomainError } from "@/modules/shared/errors";

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function jsonData(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

export function jsonError(status: number, message: string, issues?: unknown) {
  return Response.json(
    { error: { message, issues: issues ?? null } },
    { status },
  );
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AgentNotConfiguredError) {
    return jsonError(501, error.message);
  }
  if (error instanceof DomainError) {
    const status =
      error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
    return jsonError(status, error.message);
  }
  if (error instanceof ZodError) {
    return jsonError(400, "Validation failed.", error.issues);
  }
  console.error(error);
  return jsonError(500, "Unexpected error.");
}
