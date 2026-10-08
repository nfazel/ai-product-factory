import "server-only";

import {
  describeAIConfiguration,
  listProviderSpecs,
  ollamaEndpointIsLocal,
  readProviderCredential,
  type AIConfigurationView,
  type AIProviderId,
} from "@/modules/ai/config";
import { aiNotConfiguredMessage } from "@/modules/ai/errors";
import { AIFailure } from "@/modules/ai/failures";
import { ollamaModelInstalled, probeOllama, type OllamaProbe } from "@/modules/ai/ollama";
import { hasProviderOverride } from "@/modules/ai/provider";
import { ensureAISelection, listAISelectionChanges } from "@/modules/ai/selection";

export type AISurface =
  | { ready: true }
  | { ready: false; kind: "not_configured" | "local_unavailable" | "model_unavailable"; title: string; body: string };

export async function getAISurface(capability: string): Promise<AISurface> {
  if (hasProviderOverride()) return { ready: true };
  await ensureAISelection();
  const view = describeAIConfiguration();
  if (!view.configured || !view.providerId || !view.model) {
    return {
      ready: false,
      kind: "not_configured",
      title: "AI is not configured",
      body: `AI Product Builder needs an AI model connection before it can run ${capability}.`,
    };
  }
  if (view.providerId !== "OLLAMA") return { ready: true };
  const probe = await probeOllama();
  if (!probe.running) {
    return {
      ready: false,
      kind: "local_unavailable",
      title: "Local AI is unavailable",
      body: "Start Ollama on this computer and try again.",
    };
  }
  if (!ollamaModelInstalled(probe.models, view.model)) {
    return {
      ready: false,
      kind: "model_unavailable",
      title: "Model unavailable",
      body: probe.models.length === 0
        ? "No local models are installed. Install a model with Ollama before using this provider."
        : "The selected model is not installed in Ollama. Choose an installed model in Settings.",
    };
  }
  return { ready: true };
}

export async function assertAIReady(capability: string, consequence = "Nothing was generated.") {
  const surface = await getAISurface(capability);
  if (surface.ready) return;
  if (surface.kind === "not_configured") {
    throw new AIFailure(aiNotConfiguredMessage(capability, consequence), "NOT_CONFIGURED");
  }
  const category = surface.kind === "model_unavailable" ? "MODEL_NOT_AVAILABLE" : "PROVIDER_UNAVAILABLE";
  throw new AIFailure(`${surface.title}. ${surface.body} ${consequence}`, category);
}

export async function aiWorkspaceGate(capability: string) {
  const surface = await getAISurface(capability);
  return {
    configured: surface.ready,
    aiNotice: surface.ready ? null : { title: surface.title, body: surface.body },
  };
}

export type ProviderCard = {
  id: AIProviderId;
  label: string;
  description: string;
  status: string;
  detail: string;
};

export async function loadAIConfiguration() {
  await ensureAISelection();
  const described = describeAIConfiguration();
  const ollama = await probeOllama();
  const active = withRuntimeStatus(described, ollama);
  return {
    active,
    cards: providerCards(ollama, described),
    installedModels: ollama.running ? ollama.models : [],
    changes: await listAISelectionChanges(),
  };
}

function withRuntimeStatus(view: AIConfigurationView, ollama: OllamaProbe): AIConfigurationView {
  if (view.providerId !== "OLLAMA" || view.issue !== "ready" || !view.model) return view;
  if (!ollama.running) {
    return {
      ...view,
      configured: false,
      status: "Not running",
      setup: "Ollama is not running. Install Ollama, start it, install a compatible model outside AI Product Builder, then return and select that model.",
    };
  }
  if (!ollamaModelInstalled(ollama.models, view.model)) {
    return {
      ...view,
      configured: false,
      status: "Model unavailable",
      issue: "model_incompatible",
      setup: ollama.models.length === 0
        ? "No local models are installed. Install a model with Ollama before using this provider. AI Product Builder does not download models."
        : `${view.model} is not installed in Ollama. Select an installed model. No other model was substituted.`,
    };
  }
  return view;
}

function providerCards(ollama: OllamaProbe, active: AIConfigurationView): ProviderCard[] {
  return listProviderSpecs().map((spec) => {
    if (spec.id === "OLLAMA") return ollamaCard(spec, ollama, active);
    const configured = Boolean(readProviderCredential(spec.id));
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: configured ? "Configured" : "Not configured",
      detail: configured
        ? "API key configured on server."
        : spec.id === "GOOGLE_GEMINI"
          ? "Add GOOGLE_GEMINI_API_KEY to the server environment and restart AI Product Builder."
          : "Add OPENAI_API_KEY to the server environment and restart AI Product Builder.",
    };
  });
}

function ollamaCard(
  spec: { id: AIProviderId; label: string; description: string },
  ollama: OllamaProbe,
  active: AIConfigurationView,
): ProviderCard {
  if (!ollama.running) {
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: "Not running",
      detail: "Ollama is not running.",
    };
  }
  if (ollama.models.length === 0) {
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: "Available",
      detail: "No local models are installed. Install a model with Ollama before using this provider.",
    };
  }
  if (active.providerId === "OLLAMA" && !active.model) {
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: "No model selected",
      detail: "Select an installed model.",
    };
  }
  if (active.providerId === "OLLAMA" && active.model && !ollamaModelInstalled(ollama.models, active.model)) {
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: "Model unavailable",
      detail: "The selected model is not installed.",
    };
  }
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    status: "Available",
    detail: ollamaEndpointIsLocal() ? "Local endpoint." : "Requests are sent to the configured Ollama endpoint.",
  };
}
