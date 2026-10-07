import { resolveApproval } from "@/modules/approval/service";
import { resolveApprovalSchema } from "@/modules/approval/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await readJson(request);
  const parsed = resolveApprovalSchema.safeParse({ ...(body ?? {}), id });
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  const status = (body as { status?: string } | null)?.status;
  if (status !== "APPROVED" && status !== "REJECTED") {
    return jsonError(400, "Status must be APPROVED or REJECTED.");
  }

  try {
    const approval = await resolveApproval(id, status, parsed.data);
    return jsonData(approval);
  } catch (error) {
    return toErrorResponse(error);
  }
}
