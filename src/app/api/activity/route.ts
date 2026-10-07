import { isActivityType } from "@/domain/constants";
import { listActivity } from "@/modules/activity/service";
import { jsonData } from "@/server/http";

function parseDate(value: string | null, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const activity = await listActivity({
    productId: url.searchParams.get("productId") ?? undefined,
    workItemId: url.searchParams.get("workItemId") ?? undefined,
    workItemQuery: url.searchParams.get("workItem") ?? undefined,
    actor: url.searchParams.get("actor") ?? undefined,
    type: type && isActivityType(type) ? type : undefined,
    from: parseDate(url.searchParams.get("from"), false),
    to: parseDate(url.searchParams.get("to"), true),
  });
  return jsonData(activity);
}
