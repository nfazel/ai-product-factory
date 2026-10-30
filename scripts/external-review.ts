/** Local operator CLI only. Deliberately absent from the Coding Agent command catalog. */
import "dotenv/config";
import fs from "node:fs";
import { getCurrentActor } from "../src/modules/identity/actor";
import { db } from "../src/lib/db";
import { prepareExternalReview, approveExternalReview, importExternalCommit } from "../src/modules/coding/external-review";
import { manifestDigest } from "../src/modules/coding/external-manifest";

async function main() {
  const [action, productId, workspaceId, sourceCommit, digest, reason] = process.argv.slice(2);
  if (!["prepare", "approve", "import"].includes(action) || !productId || !workspaceId || !sourceCommit) throw new Error("Usage: external-review.ts prepare|approve|import productId workspaceId fullCommitSha [reviewedDigest] [humanReviewReason]. Approval/import credential is read from stdin, never arguments.");
  const manifest = await prepareExternalReview(productId, workspaceId, sourceCommit);
  if (action === "prepare") { process.stdout.write(JSON.stringify({ manifest, digest: manifestDigest(manifest) }, null, 2) + "\n"); return; }
  if (!digest) throw new Error("Supply the exact digest that was reviewed.");
  const credential = fs.readFileSync(0, "utf8").trim();
  const result = action === "approve"
    ? await approveExternalReview({ productId, workspaceId, sourceCommit, digest, credential, actor: getCurrentActor(), reason: reason ?? "" , reviewedIssues: manifest.files.flatMap(file => file.issues.map(reason => ({ path: file.path, reason }))) })
    : await importExternalCommit({ productId, workspaceId, sourceCommit, digest, credential });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "External review failed."); process.exitCode = 1; }).finally(() => db.$disconnect());
