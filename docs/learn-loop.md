# Learn loop

Learn asks whether the released slice produced the product outcome. The page shows the outcome, its success measure, its target, observations a person entered, the evidence reference, assumptions, a learning note, and the next decision.

## Stage gate

**READY TO MOVE TO LEARN** appears when a non-demo release candidate is deployed, required post-deployment checks are complete, and no high or critical release issue is open. A person moves the product. The factory does not.

## Observations

An observation is a measure, a value, a unit, a source, and who recorded it. The value is entered by a person. The demo uses `DEMO / SAMPLE` and does not invent a measured percentage. Recording an observation does not change the outcome status.

Outcome status stays proposed, confirmed, achieved, or retired. **Achieved** is a separate human action with a rationale. Deployment does not mark an outcome achieved.

## Assumptions

A person can mark a discovery assumption or a requirement assumption validated or invalidated and must supply evidence. The model does not change assumption status.

## Learning decision

A learning record stores the observation, the interpretation, and a decision: continue, iterate, pivot, stop, scale, or investigate. It can propose a discovery question, a requirement, a product slice, a defect, or an improvement. The proposal stays proposed until a person confirms it. Confirmation creates draft, unapproved scope. It does not approve a story, a slice, or a defect.

## Feedback into the next slice

Confirmed scope appears in the existing product model as a draft story, task, defect, proposed slice, or open question. A later Define or Build pass can pick it up through the same human gates as any other scope.
