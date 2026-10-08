import { createHash } from "node:crypto";

export function sourceHash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function excerptIsInSource(source: string, excerpt: string) {
  const quote = excerpt.trim();
  return quote.length > 0 && source.includes(quote);
}
