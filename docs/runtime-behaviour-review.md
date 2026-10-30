# Exact runtime and behavioural review

New managed verification requires a separate signed human runtime review. This does not replace code approval, signed external preservation review, independent tests or final verification approval.

Run the local operator CLI from this framework checkout, using the same source/dependency state as the verification server:

```sh
node --conditions=react-server --import tsx scripts/runtime-review.ts prepare PRODUCT_ID WORKSPACE_ID
node --conditions=react-server --import tsx scripts/runtime-review.ts approve PRODUCT_ID WORKSPACE_ID REVIEWED_DIGEST 'Substantive human review reason'
```

The second command reads the existing operator credential from standard input. Supply it privately through your existing secret-management workflow; never place it in arguments, review reasons, application files, prompts or evidence. The configured `EXTERNAL_REVIEW_APPROVAL_KEY` must be at least 32 bytes. No new credential or public approval endpoint is introduced.

Review the complete manifest before approving. It binds the task and workspace, exact code approval/commit/tree/file hashes, dependency lock, approved execution-plan content, task-owned criteria, runtime commands/behaviour obligations, and the trusted framework runtime/source identity. Prepared manifests grant no authority. A mismatched digest, missing credential, malformed metadata or cross-task criterion is rejected.

Approval appends a `VERIFICATION_RUNTIME` approval and signed `HUMAN_CONFIRMATION` evidence. Existing external review signatures retain their original purpose. Existing records are never backfilled with runtime authority. Old verification approvals remain historical records; they cannot grant current managed-verification, publication or release authority without a bound, versioned result.

Verification snapshots the signed binding in session JSON and uses the frozen validation metadata. It checks current authority before worker code execution, after a test command, during assessment, before final approval and at downstream approval-consumption gates. Source/plan/criteria/runtime changes or revocation block progress. Detected invalidation appends evidence and marks dependent session/verification approvals stale without changing the original human decision. Restoring old content does not resurrect a recorded invalidation; obtain a fresh review.

Independent cases must execute the exact bytes recorded for their case. Their evidence includes a body hash. New final approval fingerprints cover recorded test bodies, commands, adapters, snapshots, HTTP observations and other verdict evidence, not merely pass/fail labels. Final approval recomputes the verdict and checks runtime authority again. Cleanup remains permitted after authorization is revoked.

Runtime identity currently requires the reviewed local framework source checkout and lockfile. Relevant verification, coding, identity, publication, release, guidance and library sources, plus the operator CLI, are hashed along with effective container policy. Changes require a framework restart and fresh review. Missing source or unverifiable installed content fails closed. Supporting source-free deployment packaging would require a separately reviewed artifact mechanism; there is no fallback to an unchecked version label.

No approval is issued automatically for Task 4. It still requires its actual reviewed runtime/coverage amendment and exact manifests, remaining security checks, normal validation, official independent verification and final human verification approval.
