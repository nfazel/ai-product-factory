import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { loadDefinitionCandidateInspection } from "@/modules/requirements/candidate-inspection";
import { selectDefinitionCandidate } from "@/modules/requirements/candidate-selection";
import { generateProductDefinition } from "@/modules/requirements/service";
import { requirementsFixture } from "@/modules/requirements/testing";

const created: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;
const provider: AIProvider = { async generate<T>() { return { data: requirementsFixture() as T, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock", provider: "anthropic" }; } };

/** A product in Define with an approved brief and one sealed candidate, as generation leaves it. */
async function withCandidate(stage: "DEFINE" | "BUILD" = "DEFINE") {
  process.env.OPENAI_API_KEY = "test-key";
  const product = await db.product.create({ data: { name: `Candidate ${randomUUID()}`, description: "T", vision: "T", problemStatement: "T", targetUsers: "T", status: "ACTIVE", currentStage: "DEFINE" } });
  created.push(product.id);
  const session = await db.discoverySession.create({ data: { productId: product.id, status: "APPROVED" } });
  await db.productBrief.create({ data: { productId: product.id, sessionId: session.id, version: 1, status: "APPROVED", problemStatement: "Handlers rebuild each claim.", productVision: "Captured once.", valueProposition: "No call centre.", fieldOrigins: {}, inScope: [], outOfScope: [] } });
  setAIProviderForTests(provider);
  await generateProductDefinition(product.id);
  const publication = await db.planningPublication.findFirstOrThrow({ where: { productId: product.id, purpose: "DEFINITION_PROPOSAL" } });
  if (stage !== "DEFINE") await db.product.update({ where: { id: product.id }, data: { currentStage: stage } });
  return { product, publication };
}

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  // Products with a selection cannot be deleted (the records are append-only), so these tests leave them in the test database.
  created.length = 0;
});

describe("selecting a sealed definition candidate", () => {
  it("makes a normal open proposal that carries the candidate's identity, recorded as selected by whoever selected it", async () => {
    const { product, publication } = await withCandidate();
    const result = await selectDefinitionCandidate({ productId: product.id, publicationId: publication.id, selector: { name: "Local user", kind: "PERSON" } });
    expect(result).toMatchObject({ proposalId: publication.artifactId, alreadySelected: false });

    const proposal = await db.definitionProposal.findUniqueOrThrow({ where: { id: publication.artifactId } });
    expect(proposal).toMatchObject({ status: "OPEN", productId: product.id, seededDemo: false });
    expect((proposal.payload as { outcomes?: unknown[] }).outcomes?.length).toBeGreaterThan(0);
    const selection = await db.definitionCandidateSelection.findUniqueOrThrow({ where: { publicationId: publication.id } });
    expect(selection).toMatchObject({ proposalId: publication.artifactId, contentDigest: publication.contentDigest, selectedBy: "Local user", selectedByKind: "PERSON" });
    expect((await db.productDefinition.findUniqueOrThrow({ where: { productId: product.id } })).status).toBe("IN_PROGRESS");
  }, 60_000);

  it("approves and confirms nothing", async () => {
    const { product, publication } = await withCandidate();
    await selectDefinitionCandidate({ productId: product.id, publicationId: publication.id, selector: { name: "Plan run", kind: "PLAN_RUN" } });
    expect(await db.approval.count({ where: { productId: product.id, approvalType: "PRODUCT_DEFINITION" } })).toBe(0);
    expect(await db.productOutcome.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.workItem.count({ where: { productId: product.id } })).toBe(0);
  }, 60_000);

  it("is safe to repeat and returns the same proposal", async () => {
    const { product, publication } = await withCandidate();
    const first = await selectDefinitionCandidate({ productId: product.id, publicationId: publication.id, selector: { name: "Local user", kind: "PERSON" } });
    const again = await selectDefinitionCandidate({ productId: product.id, publicationId: publication.id, selector: { name: "Someone else", kind: "PERSON" } });
    expect(again).toMatchObject({ proposalId: first.proposalId, alreadySelected: true });
    expect(await db.definitionCandidateSelection.count({ where: { productId: product.id } })).toBe(1);
  }, 60_000);

  it("shows the candidate as selected, by whom, in the read-only inspection", async () => {
    const { product, publication } = await withCandidate();
    expect((await loadDefinitionCandidateInspection(product.id, publication.id)).selected).toBe(false);
    await selectDefinitionCandidate({ productId: product.id, publicationId: publication.id, selector: { name: "Local user", kind: "PERSON" } });
    const inspected = await loadDefinitionCandidateInspection(product.id, publication.id);
    expect(inspected.selected).toBe(true);
    expect(inspected.selection).toMatchObject({ selectedBy: "Local user", selectedByKind: "PERSON" });
    expect(inspected.approved).toBe(false);
  }, 60_000);

  it("refuses outside Define, for another product's candidate, and without saying who selected it", async () => {
    const outside = await withCandidate("BUILD");
    await expect(selectDefinitionCandidate({ productId: outside.product.id, publicationId: outside.publication.id, selector: { name: "Local user", kind: "PERSON" } })).rejects.toThrow(/Define/);
    const a = await withCandidate();
    const b = await withCandidate();
    await expect(selectDefinitionCandidate({ productId: a.product.id, publicationId: b.publication.id, selector: { name: "Local user", kind: "PERSON" } })).rejects.toThrow();
    await expect(selectDefinitionCandidate({ productId: a.product.id, publicationId: a.publication.id, selector: { name: "  ", kind: "PERSON" } })).rejects.toThrow(/who/);
    expect(await db.definitionProposal.count({ where: { productId: a.product.id } })).toBe(0);
  }, 120_000);
});

describe("what the database refuses on its own", () => {
  it("refuses a proposal carrying a sealed candidate's identity unless the candidate was selected", async () => {
    const { product, publication } = await withCandidate();
    await expect(db.definitionProposal.create({ data: { id: publication.artifactId, productId: product.id, summary: "x", payload: {}, status: "OPEN" } })).rejects.toThrow(/selection record/);
  }, 60_000);

  it("refuses a selection that names the wrong proposal, digest or product, and any rewrite or deletion", async () => {
    const { product, publication } = await withCandidate();
    const base = { id: randomUUID(), productId: product.id, publicationId: publication.id, proposalId: publication.artifactId, contentDigest: publication.contentDigest, selectedBy: "Local user", selectedByKind: "PERSON" };
    await expect(db.definitionCandidateSelection.create({ data: { ...base, proposalId: randomUUID() } })).rejects.toThrow(/sealed definition candidate/);
    await expect(db.definitionCandidateSelection.create({ data: { ...base, contentDigest: "f".repeat(64) } })).rejects.toThrow(/sealed definition candidate/);
    await expect(db.definitionCandidateSelection.create({ data: { ...base, selectedByKind: "AGENT" } })).rejects.toThrow();
    await db.definitionProposal.create({ data: { id: publication.artifactId, productId: product.id, summary: "x", payload: {}, status: "OPEN" } }).catch(() => undefined);
    const good = await db.definitionCandidateSelection.create({ data: base });
    await expect(db.definitionCandidateSelection.update({ where: { id: good.id }, data: { selectedBy: "Other" } })).rejects.toThrow();
    await expect(db.definitionCandidateSelection.delete({ where: { id: good.id } })).rejects.toThrow();
  }, 60_000);
});
