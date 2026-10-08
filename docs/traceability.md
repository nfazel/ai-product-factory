# Traceability

A story should be explainable without reading a paragraph and guessing. AI Product Factory stores the chain as foreign keys.

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

## What is not inferred

Titles are not matched. If a link is missing, the story is **NOT READY** and the traceability section says the step is not linked yet.
