import { listDecisions, recordDecision } from "@/modules/decision/service";
import { createDecisionSchema } from "@/modules/decision/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const decisions = await listDecisions({
    productId: url.searchParams.get("productId") ?? undefined,
    workItemId: url.searchParams.get("workItemId") ?? undefined,
  });
  return jsonData(decisions);
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = createDecisionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  try {
    const decision = await recordDecision(parsed.data);
    return jsonData(decision, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
