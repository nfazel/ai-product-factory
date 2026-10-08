export { AINotConfiguredError, aiNotConfiguredMessage, safeErrorMessage } from "@/modules/ai/errors";
export { describeAIConfiguration } from "@/modules/ai/config";
export {
  getAIProvider,
  isAIConfigured,
  setAIProviderForTests,
} from "@/modules/ai/provider";
export type {
  AIChatMessage,
  AIGenerateRequest,
  AIGenerateResult,
  AIProvider,
  AIUsage,
} from "@/modules/ai/provider";
export type { AIConfigurationView, AITask } from "@/modules/ai/config";
