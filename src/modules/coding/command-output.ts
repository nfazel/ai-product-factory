const OUTPUT_LIMIT = 4_000;

const SECRET_ASSIGNMENT =
  /\b(?:api[_-]?key|secret|token|password|database_url)\b\s*[=:]\s*(?:"[^"]*"|'[^']*'|\S+)/gi;
const CONNECTION_URL = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s'"]+/gi;

export function safeCommandOutput(stdout: string, stderr: string) {
  const text = `${stdout}\n${stderr}`
    .replace(CONNECTION_URL, "[redacted-url]")
    .replace(SECRET_ASSIGNMENT, (match) => match.replace(/([=:]\s*)(?:"[^"]*"|'[^']*'|\S+)/, "$1[redacted]"))
    .trim();
  if (text.length <= OUTPUT_LIMIT) return text;
  return `${text.slice(0, OUTPUT_LIMIT)}\n[output truncated]`;
}

export function commandOutputFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("output" in metadata)) return "";
  const output = (metadata as { output?: unknown }).output;
  return typeof output === "string" ? safeCommandOutput(output, "") : "";
}
