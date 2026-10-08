import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import { DomainError } from "@/modules/shared/errors";

export const MAX_REQUIREMENT_BYTES = 2 * 1024 * 1024;
export const MAX_PASTE_CHARS = 200_000;
export const MIN_EXTRACTED_CHARS = 20;

const ALLOWED = new Set(["txt", "md", "docx", "pdf"]);
const ROOT = path.resolve(process.cwd(), "data", "requirement-uploads");

export function displayFilename(input: string) {
  const base = input.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 180);
  return cleaned || "document";
}

export function extensionOf(filename: string) {
  const display = displayFilename(filename);
  const ext = display.includes(".") ? display.split(".").pop()?.toLowerCase() ?? "" : "";
  return ext;
}

export function assertAllowedUpload(filename: string, bytes: number) {
  if (bytes <= 0) throw new DomainError("The file is empty.");
  if (bytes > MAX_REQUIREMENT_BYTES) {
    throw new DomainError("The file is too large. The limit is 2 MB.");
  }
  const ext = extensionOf(filename);
  if (!ALLOWED.has(ext)) {
    throw new DomainError("That file type is not supported. Use .txt, .md, .docx, or .pdf.");
  }
  return ext;
}

export async function extractRequirementText(ext: string, bytes: Buffer) {
  if (ext === "txt" || ext === "md") {
    const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
    assertReadable(text, "Readable text could not be extracted from this file.");
    return { text, pageCount: 0 };
  }
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: bytes });
    const text = result.value ?? "";
    assertReadable(text, "Readable text could not be extracted from this document.");
    return { text, pageCount: 0 };
  }
  if (ext === "pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const extracted = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(extracted.text) ? extracted.text.map((page) => String(page)) : [String(extracted.text ?? "")];
      const text = pages.map((page) => page.trim()).filter(Boolean).join("\n\n");
      assertReadable(
        text,
        "Readable text could not be extracted. If this PDF is a scan, AI Product Builder cannot read it.",
      );
      return { text, pageCount: pages.filter((page) => page.trim()).length };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("Readable text could not be extracted. If this PDF is a scan, AI Product Builder cannot read it.");
    }
  }
  throw new DomainError("That file type is not supported. Use .txt, .md, .docx, or .pdf.");
}

function assertReadable(text: string, message: string) {
  if (text.trim().length < MIN_EXTRACTED_CHARS) throw new DomainError(message);
}

export function storageName() {
  return `${randomUUID()}.bin`;
}

export async function writeStoredUpload(productId: string, bytes: Buffer) {
  if (!/^[a-z0-9]+$/i.test(productId)) throw new DomainError("Invalid product.");
  const name = storageName();
  const dir = path.resolve(ROOT, productId);
  const full = path.resolve(dir, name);
  if (!full.startsWith(`${ROOT}${path.sep}`)) throw new DomainError("Unsafe storage path.");
  await mkdir(dir, { recursive: true });
  await writeFile(full, bytes);
  return name;
}
