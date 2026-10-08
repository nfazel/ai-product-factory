import "server-only";

/**
 * Provider-neutral AI configuration.
 *
 * AI_PROVIDER and AI_MODEL select the connection. Provider credentials stay in
 * their own server variables and are never returned from this module's public
 * view. Task-specific models are not routed yet: resolveModel() is the one
 * place a later change can read a task override without touching product modules.
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

export type AIProviderId = "openai" | "anthropic";

type ProviderSpec = {
  id: AIProviderId;
  label: string;
  credentialEnv: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY";
  rejectsModel: RegExp;
};

const PROVIDERS: Record<AIProviderId, ProviderSpec> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    credentialEnv: "OPENAI_API_KEY",
    rejectsModel: /^(claude|gemini)($|[.-])/i,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    credentialEnv: "ANTHROPIC_API_KEY",
    rejectsModel: /^(gpt-|chatgpt-|o1($|[.-])|o3($|[.-])|o4($|[.-])|gemini($|[.-]))/i,
  },
};

export type AIConfigurationIssue =
  | "ready"
  | "provider_missing"
  | "provider_unsupported"
  | "model_missing"
  | "model_incompatible"
  | "credential_missing";

export type AIConfigurationView = {
  configured: boolean;
  providerId: string | null;
  providerLabel: string | null;
  model: string | null;
  status: "Configured" | "Not configured";
  issue: AIConfigurationIssue;
  setup: string;
};

export function resolveModel(task?: AITask) {
  // Every task uses AI_MODEL until a later change selects a task-specific variable here.
  if (task && !AI_TASKS.includes(task)) return "";
  return process.env.AI_MODEL?.trim() ?? "";
}

export function readProviderCredential(provider: AIProviderId) {
  return process.env[PROVIDERS[provider].credentialEnv]?.trim() ?? "";
}

export function describeAIConfiguration(task?: AITask): AIConfigurationView {
  const rawProvider = process.env.AI_PROVIDER?.trim() ?? "";
  const model = resolveModel(task);
  const provider = resolveProvider(rawProvider);

  if (!rawProvider) {
    return view({
      issue: "provider_missing",
      model,
      setup:
        "Set AI_PROVIDER to openai or anthropic, and set AI_MODEL to a model that provider offers. Add that provider's credential on the server, then restart. Credentials are not shown here.",
    });
  }

  if (!provider) {
    return view({
      issue: "provider_unsupported",
      providerId: publicToken(rawProvider),
      providerLabel: publicToken(rawProvider),
      model,
      setup:
        "That provider is not supported. Supported providers are OpenAI (openai) and Anthropic (anthropic). No other provider is used.",
    });
  }

  if (!model) {
    return view({
      issue: "model_missing",
      providerId: provider.id,
      providerLabel: provider.label,
      setup: `Set AI_MODEL to a model ${provider.label} offers. No default model is substituted.`,
    });
  }

  if (provider.rejectsModel.test(model)) {
    return view({
      issue: "model_incompatible",
      providerId: provider.id,
      providerLabel: provider.label,
      model,
      setup: `${model} cannot be used with ${provider.label}. Set AI_MODEL to a model that provider offers. No other model is substituted.`,
    });
  }

  if (!readProviderCredential(provider.id)) {
    return view({
      issue: "credential_missing",
      providerId: provider.id,
      providerLabel: provider.label,
      model,
      setup: credentialSetup(provider),
    });
  }

  return view({
    issue: "ready",
    providerId: provider.id,
    providerLabel: provider.label,
    model,
    setup: `${provider.label} is connected with ${model}. Discovery, requirements analysis, definition, architecture, governance, coding, verification, release drafting, and metric explanations use this provider and model.`,
  });
}

function credentialSetup(provider: ProviderSpec) {
  if (provider.id === "openai") {
    return "OpenAI is selected and the model is set. Add OPENAI_API_KEY to the server environment, then restart. The key is not shown here.";
  }
  return "Anthropic is selected and the model is set. Add ANTHROPIC_API_KEY to the server environment, then restart. The key is not shown here.";
}

function resolveProvider(raw: string): ProviderSpec | null {
  const id = raw.toLowerCase();
  if (id === "openai" || id === "anthropic") return PROVIDERS[id];
  return null;
}

function publicToken(value: string) {
  if (!value || /sk-|api[_-]?key|bearer|secret/i.test(value)) return null;
  return value.slice(0, 40);
}

function view(input: {
  issue: AIConfigurationIssue;
  providerId?: string | null;
  providerLabel?: string | null;
  model?: string | null;
  setup: string;
}): AIConfigurationView {
  const configured = input.issue === "ready";
  return {
    configured,
    providerId: input.providerId ?? null,
    providerLabel: input.providerLabel ?? null,
    model: input.model?.trim() ? input.model.trim() : null,
    status: configured ? "Configured" : "Not configured",
    issue: input.issue,
    setup: input.setup,
  };
}
