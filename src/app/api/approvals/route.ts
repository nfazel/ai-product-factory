import {
  listApprovalGroups,
  requestApproval,
} from "@/modules/approval/service";
import { createApprovalSchema } from "@/modules/approval/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const groups = await listApprovalGroups({
    productId: url.searchParams.get("productId") ?? undefined,
    workItemId: url.searchParams.get("workItemId") ?? undefined,
  });
  return jsonData(groups);
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = createApprovalSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  try {
    const approval = await requestApproval(parsed.data);
    return jsonData(approval, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
