import { getWorkItemDetail } from "@/modules/work-item/detail";
import { updateWorkItem } from "@/modules/work-item/service";
import { updateWorkItemSchema } from "@/modules/work-item/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detail = await getWorkItemDetail(id);
  if (!detail) return jsonError(404, "Work item not found.");
  return jsonData(detail);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await readJson(request);
  const parsed = updateWorkItemSchema.safeParse({ ...(body ?? {}), id });
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  try {
    const item = await updateWorkItem(parsed.data);
    return jsonData(item);
  } catch (error) {
    return toErrorResponse(error);
  }
}
