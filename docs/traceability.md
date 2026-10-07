# Traceability

A story should be explainable without reading a paragraph and guessing. AI Product Factory stores the chain as foreign keys.

```
Product Outcome
  → Product Capability
    → Epic
      → Feature
        → Story
          → Acceptance criteria
```

Tasks and defects stay under the work item they belong to. They are delivery items, not a new requirements hierarchy.

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

The Requirements Agent proposes these links with temporary ids. They become real ids only when a person commits the proposal, and only after every reference has been checked.

## What you can ask

- Why does this story exist? Follow parent feature → parent epic → capability → outcome → source brief.
- Which feature, epic, capability, and outcome does it support? The same chain, read upwards.
- Which stories serve an outcome? Open Definition → Traceability and start at the outcome.

The story page shows the chain with links. The Definition traceability section starts at each outcome and drills down through capability, epic, feature, story, and acceptance criteria. A hierarchical list is used instead of a graph.

## What is not inferred

Titles are not matched. If a link is missing, the story is **NOT READY** and the traceability section says the step is not linked yet.
