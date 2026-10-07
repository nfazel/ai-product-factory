import {
  PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
} from "@/domain/constants";
import { createWorkItem, listWorkItems } from "@/modules/work-item/service";
import { createWorkItemSchema } from "@/modules/work-item/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

function oneOf<T extends string>(values: readonly T[], value: string | null) {
  if (!value) return undefined;
  return (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const items = await listWorkItems({
    productId: url.searchParams.get("productId") ?? undefined,
    type: oneOf(WORK_ITEM_TYPES, url.searchParams.get("type")),
    status: oneOf(WORK_ITEM_STATUSES, url.searchParams.get("status")),
    priority: oneOf(PRIORITIES, url.searchParams.get("priority")),
    query: url.searchParams.get("q") ?? undefined,
  });
  return jsonData(items);
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = createWorkItemSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  try {
    const item = await createWorkItem(parsed.data);
    return jsonData(item, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
