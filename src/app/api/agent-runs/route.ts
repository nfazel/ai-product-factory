import { executeAgent, listAgentRuns } from "@/modules/agent/service";
import { AGENT_TYPES } from "@/domain/constants";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runs = await listAgentRuns({
    productId: url.searchParams.get("productId") ?? undefined,
    workItemId: url.searchParams.get("workItemId") ?? undefined,
  });
  return jsonData(runs);
}

export async function POST(request: Request) {
  const body = (await readJson(request)) as {
    productId?: string;
    workItemId?: string;
    agentType?: string;
    input?: Record<string, unknown>;
  } | null;

  const agentType = body?.agentType;
  if (!agentType || !(AGENT_TYPES as readonly string[]).includes(agentType)) {
    return jsonError(400, "Unknown agent type.");
  }
  if (!body?.productId) return jsonError(400, "productId is required.");

  try {
    const result = await executeAgent({
      productId: body.productId,
      workItemId: body.workItemId,
      agentType: agentType as (typeof AGENT_TYPES)[number],
      input: body.input ?? {},
    });
    return jsonData(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
