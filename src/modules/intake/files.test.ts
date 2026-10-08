import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  assertAllowedUpload,
  displayFilename,
  extensionOf,
  extractRequirementText,
  MAX_REQUIREMENT_BYTES,
  storageName,
  writeStoredUpload,
} from "@/modules/intake/files";
import { excerptIsInSource, sourceHash } from "@/modules/intake/hash";

const TEXT = "Customer can create a claim and retain an audit trail.";

describe("requirement file safety", () => {
  it("keeps the display name and drops a traversal path", () => {
    expect(displayFilename("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(displayFilename("..\\claims.exe")).toBe("claims.exe");
    expect(extensionOf("../../secret.md")).toBe("md");
    expect(storageName()).toMatch(/^[0-9a-f-]{36}\.bin$/);
  });

  it("rejects empty, oversized, and unsupported uploads", () => {
    expect(() => assertAllowedUpload("notes.txt", 0)).toThrow(/empty/i);
    expect(() => assertAllowedUpload("notes.txt", MAX_REQUIREMENT_BYTES + 1)).toThrow(/too large/i);
    expect(() => assertAllowedUpload("macro.docm", 40)).toThrow(/not supported/i);
    expect(() => assertAllowedUpload("script.exe", 40)).toThrow(/not supported/i);
    expect(assertAllowedUpload("claims.md", 40)).toBe("md");
  });

  it("extracts text and refuses a file with no readable text", async () => {
    const text = await extractRequirementText("txt", Buffer.from(`\uFEFF${TEXT}`));
    expect(text.text).toBe(TEXT);
    expect(text.pageCount).toBe(0);
    await expect(extractRequirementText("md", Buffer.from("too short"))).rejects.toThrow(/readable text/i);
    await expect(extractRequirementText("pdf", Buffer.from("%PDF-1.4\nnot a real document"))).rejects.toThrow(/readable text/i);
  });

  it("extracts docx text without executing the document", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${TEXT}</w:t></w:r></w:p></w:body></w:document>`);
    const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const extracted = await extractRequirementText("docx", bytes);
    expect(extracted.text).toContain("Customer can create a claim");
    expect(extracted.pageCount).toBe(0);
  });

  it("stores bytes under a generated name inside the product directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "req-"));
    const productId = "productupload1";
    const name = await writeStoredUpload(productId, Buffer.from(TEXT));
    expect(name.endsWith(".bin")).toBe(true);
    expect(name).not.toContain("passwd");
    await rm(path.resolve(process.cwd(), "data", "requirement-uploads", productId), { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
    await expect(writeStoredUpload("../etc", Buffer.from(TEXT))).rejects.toThrow(/invalid product/i);
  });

  it("hashes the exact source text", () => {
    expect(sourceHash("R-01 Customer can create a claim.")).toBe(sourceHash("R-01 Customer can create a claim."));
    expect(sourceHash("R-01 Customer can create a claim.")).not.toBe(sourceHash("R-01 Customer can create a claim. "));
    expect(excerptIsInSource(TEXT, "Customer can create a claim")).toBe(true);
    expect(excerptIsInSource(TEXT, "A paraphrased claim rule")).toBe(false);
  });
});
