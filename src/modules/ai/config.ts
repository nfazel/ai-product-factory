import "server-only";

/**
 * Provider-neutral AI configuration.
 *
 * The active provider and model come from a saved administrator choice when one
 * exists, otherwise from AI_PROVIDER and AI_MODEL. Credentials stay in their
 * own server variables and are never returned from the public view.
 *
 * resolveModel(task) is the one place a later change can choose a task-specific
 * model. Today every task uses the one active model. A future verification
 * model can differ from the coding model without product modules branching on
 * the provider. Different models do not guarantee correctness.
 */

export const AI_TASKS = [
  "discovery",
  "requirements",
  "definition",
  "architecture",
  "coding",
  "verification",
  "insights",
] as const;

export type AITask = (typeof AI_TASKS)[number];

export const AI_PROVIDER_IDS = ["GOOGLE_GEMINI", "OLLAMA", "OPENAI"] as const;

export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AIFailureCategory =
  | "NOT_CONFIGURED"
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_NOT_AVAILABLE"
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "SCHEMA_VALIDATION_FAILED";

type ProviderSpec = {
  id: AIProviderId;
  label: string;
  description: string;
  privacy: string;
  rejectsModel: RegExp;
};

const PROVIDERS: Record<AIProviderId, ProviderSpec> = {
  GOOGLE_GEMINI: {
    id: "GOOGLE_GEMINI",
    label: "Google Gemini",
    description: "Cloud AI provider. Requires a Gemini API key.",
    privacy: "Data is sent to the configured cloud AI provider.",
    rejectsModel: /^(gpt-|chatgpt-|o1($|[.:/-])|o3($|[.:/-])|o4($|[.:/-])|claude($|[.:/-])|llama($|[.:/-]))/i,
  },
  OLLAMA: {
    id: "OLLAMA",
    label: "Ollama",
    description: "Runs supported models locally. No API key required for normal local use.",
    privacy: "Requests are sent to the configured Ollama endpoint.",
    rejectsModel: /^(gpt-|chatgpt-|o1($|[.:/-])|o3($|[.:/-])|o4($|[.:/-])|gemini($|[.:/-])|claude($|[.:/-]))/i,
  },
  OPENAI: {
    id: "OPENAI",
    label: "OpenAI",
    description: "Cloud AI provider. Requires an OpenAI API key.",
    privacy: "Data is sent to the configured cloud AI provider.",
    rejectsModel: /^(gemini($|[.:/-])|claude($|[.:/-])|llama($|[.:/-]))/i,
  },
};

const ALIASES: Record<string, AIProviderId> = {
  GOOGLE_GEMINI: "GOOGLE_GEMINI",
  GEMINI: "GOOGLE_GEMINI",
  GOOGLE: "GOOGLE_GEMINI",
  OLLAMA: "OLLAMA",
  OPENAI: "OPENAI",
};

export type AIConfigurationIssue =
  | "ready"
  | "provider_missing"
  | "provider_unsupported"
  | "model_missing"
  | "model_incompatible"
  | "credential_missing"
  | "endpoint_invalid";

export type AIConfigurationView = {
  configured: boolean;
  providerId: AIProviderId | null;
  providerLabel: string | null;
  model: string | null;
  status: "Configured" | "Not configured" | "Not running" | "Model unavailable" | "No model selected";
  issue: AIConfigurationIssue;
  source: "settings" | "environment";
  description: string;
  privacy: string;
  localEndpoint: boolean;
  setup: string;
};

export type AISelectionSource = {
  provider: string;
  model: string;
  source: "settings" | "environment";
};

let cachedSelection: AISelectionSource | null = null;

export function rememberAISelection(selection: AISelectionSource | null) {
  cachedSelection = selection;
}

export function currentAISelection(): AISelectionSource {
  if (process.env.AI_SELECTION_DISABLE_STORE === "1") {
    return selectionFromEnvironment();
  }
  return cachedSelection ?? selectionFromEnvironment();
}

export function selectionFromEnvironment(): AISelectionSource {
  return {
    provider: process.env.AI_PROVIDER?.trim() ?? "",
    model: process.env.AI_MODEL?.trim() ?? "",
    source: "environment",
  };
}

export function canonicalProviderId(raw: string): AIProviderId | null {
  const id = ALIASES[raw.trim().toUpperCase()];
  return id ?? null;
}

export function providerSpec(id: AIProviderId) {
  return PROVIDERS[id];
}

export function listProviderSpecs() {
  return AI_PROVIDER_IDS.map((id) => PROVIDERS[id]);
}

export function resolveModel(task?: AITask) {
  if (task && !AI_TASKS.includes(task)) return "";
  return currentAISelection().model.trim();
}

export function readProviderCredential(provider: AIProviderId) {
  if (provider === "OPENAI") return process.env.OPENAI_API_KEY?.trim() ?? "";
  if (provider === "GOOGLE_GEMINI") return process.env.GOOGLE_GEMINI_API_KEY?.trim() ?? "";
  return "";
}

export function modelFitsProvider(provider: AIProviderId, model: string) {
  const value = model.trim();
  if (!/^[\w./:@+-]{1,200}$/.test(value)) return false;
  if (/sk-|AIza|bearer|api[_-]?key|secret/i.test(value)) return false;
  return !PROVIDERS[provider].rejectsModel.test(value);
}

export function describeAIConfiguration(task?: AITask): AIConfigurationView {
  const selected = currentAISelection();
  const model = resolveModel(task);
  const provider = canonicalProviderId(selected.provider);

  if (!selected.provider.trim()) {
    return view({
      issue: "provider_missing",
      source: selected.source,
      model,
      setup:
        "Choose Google Gemini, Ollama, or OpenAI in Settings, or set AI_PROVIDER and AI_MODEL on the server. No provider is assumed.",
    });
  }

  if (!provider) {
    return view({
      issue: "provider_unsupported",
      source: selected.source,
      providerLabel: publicToken(selected.provider),
      model,
      setup: "That provider is not supported. Supported providers are Google Gemini, Ollama, and OpenAI. No other provider is used.",
    });
  }

  const spec = PROVIDERS[provider];
  if (!model) {
    return view({
      issue: "model_missing",
      source: selected.source,
      providerId: provider,
      providerLabel: spec.label,
      status: "No model selected",
      setup: `Set a model for ${spec.label}. No default model is substituted.`,
    });
  }

  if (!modelFitsProvider(provider, model)) {
    const credentialLike = /sk-|AIza|bearer|api[_-]?key|secret/i.test(model);
    return view({
      issue: "model_incompatible",
      source: selected.source,
      providerId: provider,
      providerLabel: spec.label,
      model: credentialLike ? null : model,
      status: "Model unavailable",
      setup: credentialLike
        ? "The model identifier was rejected because it looks like a credential. Set a model id. Nothing was sent."
        : `${model} cannot be used with ${spec.label}. Choose a model that provider offers. No other model is substituted.`,
    });
  }

  if (provider === "OLLAMA") {
    const endpoint = ollamaEndpointIssue();
    if (endpoint) {
      return view({
        issue: "endpoint_invalid",
        source: selected.source,
        providerId: provider,
        providerLabel: spec.label,
        model,
        setup: endpoint,
      });
    }
  } else if (!readProviderCredential(provider)) {
    return view({
      issue: "credential_missing",
      source: selected.source,
      providerId: provider,
      providerLabel: spec.label,
      model,
      setup: credentialSetup(provider),
    });
  }

  return view({
    issue: "ready",
    source: selected.source,
    providerId: provider,
    providerLabel: spec.label,
    model,
    setup: `${spec.label} is the active provider with ${model}. Every AI Product Builder capability uses this provider and model until an administrator changes it.`,
  });
}

export function ollamaEndpointIssue() {
  const raw = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "OLLAMA_BASE_URL must be an http or https address set on the server.";
    }
    if (url.username || url.password) {
      return "OLLAMA_BASE_URL must not include a username or password.";
    }
    return null;
  } catch {
    return "OLLAMA_BASE_URL is not a valid server address.";
  }
}

export function ollamaOrigin() {
  const raw = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  return new URL(raw).origin;
}

export function ollamaEndpointIsLocal() {
  try {
    const host = new URL(ollamaOrigin()).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function credentialSetup(provider: AIProviderId) {
  if (provider === "GOOGLE_GEMINI") {
    return "Google Gemini is selected and the model is set. Add GOOGLE_GEMINI_API_KEY to the server environment and restart AI Product Builder. The key is not shown here.";
  }
  return "OpenAI is selected and the model is set. Add OPENAI_API_KEY to the server environment and restart AI Product Builder. The key is not shown here. A ChatGPT subscription does not by itself provide this API credential.";
}

function publicToken(value: string) {
  if (!value || /sk-|api[_-]?key|bearer|secret|AIza/i.test(value)) return null;
  return value.slice(0, 40);
}

function view(input: {
  issue: AIConfigurationIssue;
  source: "settings" | "environment";
  providerId?: AIProviderId | null;
  providerLabel?: string | null;
  model?: string | null;
  status?: AIConfigurationView["status"];
  setup: string;
}): AIConfigurationView {
  const provider = input.providerId ? PROVIDERS[input.providerId] : null;
  const configured = input.issue === "ready";
  const localEndpoint = input.providerId === "OLLAMA" && ollamaEndpointIsLocal();
  return {
    configured,
    providerId: input.providerId ?? null,
    providerLabel: input.providerLabel ?? null,
    model: input.model?.trim() ? input.model.trim() : null,
    status: input.status ?? (configured ? "Configured" : "Not configured"),
    issue: input.issue,
    source: input.source,
    description: provider?.description ?? "",
    privacy: provider
      ? provider.id === "OLLAMA" && localEndpoint
        ? "Requests are sent to the configured Ollama endpoint. Local endpoint."
        : provider.privacy
      : "",
    localEndpoint,
    setup: input.setup,
  };
}
