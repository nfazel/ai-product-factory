import "server-only";

import {
  describeAIConfiguration,
  listProviderSpecs,
  ollamaEndpointIsLocal,
  ollamaEndpointLabel,
  type AIConfigurationView,
  type AIProviderId,
} from "@/modules/ai/config";
import { encryptionAvailable, ensureProviderCredentials, listPublicCredentials, type PublicCredential } from "@/modules/ai/credentials";
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
  await ensureProviderCredentials();
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
  credentialSource: string | null;
  connectionLabel: string | null;
  endpoint: string | null;
};

export async function loadAIConfiguration() {
  await ensureAISelection();
  await ensureProviderCredentials();
  const described = describeAIConfiguration();
  const ollama = await probeOllama();
  const active = withRuntimeStatus(described, ollama);
  const credentials = await listPublicCredentials();
  return {
    active,
    cards: providerCards(ollama, active, credentials),
    credentials,
    encryptionAvailable: encryptionAvailable(),
    ollamaEndpoint: ollamaEndpointLabel(),
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

function providerCards(ollama: OllamaProbe, active: AIConfigurationView, credentials: PublicCredential[]): ProviderCard[] {
  return listProviderSpecs().map((spec) => {
    if (spec.id === "OLLAMA") return ollamaCard(spec, ollama, active);
    const credential = credentials.find((item) => item.provider === spec.id);
    const configured = credential?.configured ?? false;
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: configured ? "Configured" : "Not configured",
      detail: cloudDetail(credential),
      credentialSource: credential?.sourceLabel ?? "Not configured",
      connectionLabel: credential?.connectionLabel ?? "Connection not tested",
      endpoint: null,
    };
  });
}

function cloudDetail(credential: PublicCredential | undefined) {
  if (!credential || credential.source === "none") {
    return "Save an API key in Settings, or set the server environment variable. The key is not shown here.";
  }
  if (credential.source === "unreadable") {
    return "The stored credential could not be read. Check AI_CREDENTIAL_ENCRYPTION_KEY and save the key again.";
  }
  if (credential.source === "application") return "API key saved in application configuration.";
  return "API key configured in the server environment.";
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
      credentialSource: null,
      connectionLabel: null,
      endpoint: ollamaEndpointLabel(),
    };
  }
  if (ollama.models.length === 0) {
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: "Available",
      detail: "No local models are installed. Install a model with Ollama before using this provider.",
      credentialSource: null,
      connectionLabel: null,
      endpoint: ollamaEndpointLabel(),
    };
  }
  if (active.providerId === "OLLAMA" && !active.model) {
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: "No model selected",
      detail: "Select an installed model.",
      credentialSource: null,
      connectionLabel: null,
      endpoint: ollamaEndpointLabel(),
    };
  }
  if (active.providerId === "OLLAMA" && active.model && !ollamaModelInstalled(ollama.models, active.model)) {
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: "Model unavailable",
      detail: "The selected model is not installed.",
      credentialSource: null,
      connectionLabel: null,
      endpoint: ollamaEndpointLabel(),
    };
  }
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    status: "Available",
    detail: ollamaEndpointIsLocal() ? "Local endpoint." : "Requests are sent to the configured Ollama endpoint.",
    credentialSource: null,
    connectionLabel: null,
    endpoint: ollamaEndpointLabel(),
  };
}
