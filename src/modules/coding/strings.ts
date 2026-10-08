import { ALWAYS_RESTRICTED } from "@/modules/coding/policy";

export { ALWAYS_RESTRICTED };

export function asStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function clip(value: string, max = 4000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…`;
}
