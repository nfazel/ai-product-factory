"use client";

import { useActionState, useState } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import { saveAIConfigurationAction } from "@/server/actions/ai-configuration";

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AIConfigurationForm({
  provider,
  model,
  installedModels,
}: {
  provider: string;
  model: string;
  installedModels: string[];
}) {
  const [selected, setSelected] = useState(provider);
  const [state, action] = useActionState(saveAIConfigurationAction, idleState);
  const ollamaChoices = selected === "OLLAMA" ? installedModels : [];

  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Active provider</span>
        <select
          className={controlClass}
          name="provider"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Select a provider</option>
          <option value="GOOGLE_GEMINI">Google Gemini</option>
          <option value="OLLAMA">Ollama</option>
          <option value="OPENAI">OpenAI</option>
        </select>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Model</span>
        {ollamaChoices.length > 0 ? (
          <select key={selected} className={controlClass} name="model" defaultValue={ollamaChoices.includes(model) ? model : ollamaChoices[0]}>
            {ollamaChoices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={selected}
            className={controlClass}
            name="model"
            defaultValue={selected === provider ? model : ""}
            placeholder={selected === "OLLAMA" ? "No installed model to select" : "Model identifier"}
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save AI configuration</SubmitButton>
    </form>
  );
}
