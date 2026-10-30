# Human review and import of external implementations

This local-operator mechanism accepts a committed implementation in the product repository and imports it into the existing coding lifecycle. It does not grant a validation pass, final code approval, or verification approval.

## Local authorization boundary

Configure `EXTERNAL_REVIEW_APPROVAL_KEY` with a random secret of at least 32 bytes in the framework server environment. There is no fallback and no public approval endpoint. Keep the key private and stable; missing/rotated keys fail closed. Product commands do not inherit it. This is an explicitly opted-in single-user local operator boundary. It is not multi-user authentication or enterprise RBAC. The framework's existing `Local user` identity alone is insufficient to approve external exceptions.

The local CLI reads the operator credential from stdin, never a command argument. Use a private credential provider or protected local terminal input; do not paste the key into a prompt, review artifact, log or source file. Never expose these server-only approval/import functions as unauthenticated server actions. The Coding Agent command catalog deliberately does not include this CLI.

Run with the installed TS runtime and server-only condition, for example:

```
NODE_OPTIONS=--conditions=react-server node --import tsx scripts/external-review.ts prepare PRODUCT_ID WORKSPACE_ID FULL_COMMIT_SHA
```

Review the actual Git diff, affected files, all flagged reasons and the printed manifest digest. `approve` requires that exact digest and a substantive human review reason; `import` also requires the digest. For approval/import only, provide the operator credential on stdin:

```
NODE_OPTIONS=--conditions=react-server node --import tsx scripts/external-review.ts approve PRODUCT_ID WORKSPACE_ID FULL_COMMIT_SHA REVIEWED_DIGEST "Human review reason"
NODE_OPTIONS=--conditions=react-server node --import tsx scripts/external-review.ts import PRODUCT_ID WORKSPACE_ID FULL_COMMIT_SHA REVIEWED_DIGEST
```

These commands record the credential holder's local-operator decision. An actor name is attribution, not authorization. Automated tools may record an already explicit human decision only on the human's behalf and only for the reviewed digest; they must never infer human consent from a model's claim of safety.

## What an approval binds

The manifest binds product, task, coding workspace, original baseline, approved plan version and approved scope, source commit/tree, every affected path and Git mode, before/after SHA-256 content hashes, and each explicitly reviewed preservation issue. Existing Approval and CodingEvidence records store a signed, append-only attestation. The configured server key verifies it at each gate; forged payloads and unrelated approvals do not qualify.

Only authentication-related and SQL review flags are reviewable in this version. The mechanism does not waive scope/path restrictions, secret/CI restrictions, symlinks/submodules, weakened checks, malformed application source, existing model/field/relationship removal, or other preservation violations. Unsupported transformations still escalate. A SQL review is a human review of the exact SQL, not an automated claim of migration safety; test migrations on disposable databases before any separately approved production operation.

## Import without data loss

The source must be a full commit SHA in the product repository and descend from the original task baseline. Import is allowed only for an idle failed coding workspace. It creates a fresh isolated worktree at that SHA. The original worktree, dirty files, branch and head remain untouched; an import evidence record retains their prior path and status. The workspace's current checkout path/head change through the audited import transition, but its baseline and original approval history do not change. Failed/racing imports retain the new checkout for inspection instead of discarding work.

Dependencies must be prepared separately in accordance with approved setup commands. A local dependency cache may be reused only when its lockfile matches; copy it without following or absolutizing symlinks (`verbatimSymlinks: true` with Node copy). Do not link back to another application's dependency tree. Existing application commits and source files must remain unchanged during environment repair.

## Normal lifecycle still applies

After import, use Validate Existing Implementation. The ordinary authorized command catalog, setup/check evidence, scope checks and preservation checks remain in force. Exact signed review accounts only for the explicitly acknowledged flags. A command failure and a preservation-policy block are reported separately in tool metadata/output.

Once checks pass, obtain normal human code approval and use the existing commit operation. Its existing-commit path reuses the imported commit rather than creating another implementation commit. Independent verification then runs against that approved SHA through the existing adapters and disposable database lifecycle. A passing independent verdict still requires its normal human review. Coding-stage `COMPLETED` is not a substitute for approved verification.

## Changes invalidate review

At validation, code approval, commit reuse and verification entry, re-read current source and scope. A changed commit, dirty source tree, changed plan/contract scope, rejected/revoked approval, changed flag or missing/rotated signing key fails closed. A detected invalidation appends a record and marks dependent code/verification approvals stale and returns an idle coding workspace to FAILED for a fresh audited import, preserving their original history and evidence. Reverting a detected change does not resurrect the old grant; prepare and explicitly approve a fresh review and import. Generated/ignored runtime caches are not reviewed application source.

There are no global trusted files or model-controlled exceptions. Unsupported alias/auth mechanisms and semantic equivalence still need regression tests and human judgment. Package-script OS containment remains a separate execution-model concern; this mechanism does not make untrusted scripts sandboxed.
