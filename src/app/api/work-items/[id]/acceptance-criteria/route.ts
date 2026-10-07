import { addAcceptanceCriterion } from "@/modules/acceptance/service";
import { createAcceptanceSchema } from "@/modules/acceptance/schema";
import { jsonData, jsonError, readJson, toErrorResponse } from "@/server/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await readJson(request);
  const parsed = createAcceptanceSchema.safeParse({
    ...(body ?? {}),
    workItemId: id,
  });
  if (!parsed.success) return jsonError(400, "Validation failed.", parsed.error.issues);

  try {
    const criterion = await addAcceptanceCriterion(parsed.data);
    return jsonData(criterion, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
