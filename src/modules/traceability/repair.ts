import type { ZodType } from "zod";

import type { AIChatMessage, AIGenerateResult, AIProvider } from "@/modules/ai/provider";
import { DomainError } from "@/modules/shared/errors";

export async function generateResolved<T>(
  provider: AIProvider,
  request: {
    systemPrompt: string;
    messages: AIChatMessage[];
    responseSchema: ZodType<T>;
    schemaName: string;
    purpose: string;
    temperature?: number;
  },
  translate: (data: T) => { data: T; errors: string[] },
  refusal: string,
): Promise<AIGenerateResult<T>> {
  const first = await provider.generate(request);
  const initial = request.responseSchema.safeParse(first.data);
  if (!initial.success) throw new DomainError(refusal);
  const translated = translate(initial.data);
  if (translated.errors.length === 0) return { ...first, data: translated.data };

  const repaired = await provider.generate({
    ...request,
    messages: [
      ...request.messages,
      { role: "assistant", content: JSON.stringify(initial.data) },
      {
        role: "user",
        content: `The previous response failed reference checks. ${translated.errors.slice(0, 6).join(" ")} Return the corrected complete structure. Do not add business facts. Use only the reference codes supplied in the context, and leave a link empty when it does not apply.`,
      },
    ],
  });
  const second = request.responseSchema.safeParse(repaired.data);
  if (!second.success) throw new DomainError(refusal);
  const again = translate(second.data);
  if (again.errors.length > 0) throw new DomainError(again.errors[0] ?? refusal);
  return { ...repaired, data: again.data };
}
