# Traceability

A story should be explainable without reading a paragraph and guessing. AI Product Builder stores the chain as foreign keys. The default view shows Outcome → First Slice → Story → Task. The full technical chain stays available on demand.

When a product starts from existing requirements, the chain can begin at the source. Not every requirement has to appear at every level. A missing link is shown; it is not guessed.

```
Requirement source
  → Source requirement
    → Confirmed interpretation
      → Product outcome or capability
        → Epic
          → Feature
            → Story
              → Acceptance criterion
                → Architecture
                  → Implementation task
                    → Code commit
                      → Verification
                        → Pull request
                          → Release
                            → Deployment
                              → Outcome evidence
```

```
Product Outcome
  → Product Capability
    → Epic
      → Feature
        → Story
          → Acceptance criteria
            → Architecture
              → Implementation task
                → Code commit
                  → Verification test
                    → Verification evidence
                      → Verification verdict
```

Tasks and defects stay under the work item they belong to. They are delivery items, not a new requirements hierarchy. A defect found in verification links back to the story, the acceptance criterion, the implementation task, and the commit.

## Relationships

| From | To | How |
| --- | --- | --- |
| Requirement source | Product | `RequirementSource.productId` |
| Source requirement | Requirement source | `SourceRequirement.sourceId`, plus section, block, and page only when a page was extracted |
| Confirmed interpretation | Source requirement | `confirmedInterpretation` on the same row. The source excerpt stays in `sourceText` |
| Source requirement | Outcome, capability, story, acceptance criterion, or NFR | `RequirementTraceLink`. `AI_PROPOSED` and `HUMAN_CONFIRMED` are different |
| Outcome | Product Brief | `ProductOutcome.sourceBriefId` |
| Capability | Outcome | `ProductCapability.outcomeId` |
| Epic, feature, or story | Capability | `WorkItem.capabilityId` |
| Feature | Epic | `WorkItem.parentId` |
| Story | Feature | `WorkItem.parentId` |
| Acceptance criterion | Story | `AcceptanceCriterion.workItemId` |
| Work in the first slice | Product slice | `WorkItem.sliceId` |
| Implementation task | Story | `ImplementationTask.workItemId` |
| Code commit | Task workspace | `RepositoryWorkspace.headCommit` |
| Verification session | Task and commit | `VerificationSession.implementationTaskId` and `commitSha` |
| Verification test | Acceptance criterion | `VerificationTestCase.acceptanceCriterionId` |
| Verification evidence | Criterion or test | `VerificationEvidence.acceptanceCriterionId` and `testCaseId` |
| Defect | Verification session | `VerificationDefectLink` |

The Requirements Agent proposes these links with temporary ids. They become real ids only when a person commits the proposal, and only after every reference has been checked.

## What you can ask

- Why does this story exist? Follow parent feature → parent epic → capability → outcome → source brief.
- Which feature, epic, capability, and outcome does it support? The same chain, read upwards.
- Which stories serve an outcome? Open Definition → Traceability and start at the outcome.
- What proves an acceptance criterion? Open Prove and read that criterion's coverage, test, and evidence. The chain can be followed back to the story, feature, epic, capability, and outcome.

The story page shows the chain with links. The Definition traceability section starts at each outcome and drills down through capability, epic, feature, story, and acceptance criteria. A hierarchical list is used instead of a graph.

## Existing requirements

Define shows how many supplied requirements are confirmed, need attention, mapped, or deferred. Open a requirement to read the source wording, the interpretation, the findings, the disposition, and the definition links.

A confirmed requirement that is still in scope and has no link is unmapped. Product Definition approval names those requirements and stops until a person maps them or records a disposition. A disposition other than in scope needs a short reason. Analysis does not set that disposition.

An analysis-proposed link is not shown as a link a person confirmed. Confirming the same target replaces the proposal with a human confirmation. A later analysis pass does not change that confirmation back.

## What is not inferred

Titles are not matched, except a confirmed requirement's suggested capability name, which may propose a capability link. That proposal stays `AI_PROPOSED`. If a story link is missing, the story is **NOT READY** and the traceability section says the step is not linked yet.
