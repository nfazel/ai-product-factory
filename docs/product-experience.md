# Product experience

AI Product Builder is the visible name. Internal types such as `FactoryEvent`, table names, and service modules keep their existing identifiers.

The positioning line belongs on Home, an empty product list, and Settings:

> AI Product Builder helps teams take a product idea through discovery, definition, engineering, independent verification, release and learning, while keeping material decisions under human control.

The interaction is AI proposes, rules check, people decide, and evidence remains. That is expressed by the next action, the blocker, and the evidence panel. It is not printed as a slogan on every page.

## Global navigation

Home, Products, Decisions, Settings.

Work items stay available from a product's backlog and from `/work-items`. Approvals at `/approvals` redirect to Decisions. Activity stays at `/activity` and on a product's history. Agents stay at `/agents` as a system view linked from Settings. Planning and Review agents are grouped as agents without a product workflow.

## Product navigation

Overview, Explore, Define, Build, Prove, Ship, Learn, Intelligence.

Backlog is a section of Define and remains at `/products/[id]/backlog`. Design, engineering review, and code are sections of Build. `/products/[id]/architecture` redirects to Build. Activity for a product remains at `/products/[id]/activity`. `/testing` is Prove. `/metrics` is Learn. `/releases` is Ship.

## Next action

`assessGuidance` in `src/modules/guidance/assess.ts` chooses one next action from a snapshot of existing records. It does not call a model. The loader in `load.ts` is the only database boundary, and it reuses release entry and learn blockers.

The same action is shown once on Overview and on the current stage. Move to Define, Build, Prove, Ship, or Learn is offered only when the existing stage gates allow it. The button calls `updateProduct`, which still refuses a move the gates reject. The product does not move itself.

## Blocker

When the next step cannot proceed, the page shows one blocker:

- What is blocked
- Why
- What needs to happen
- Who needs to act
- What happens next

The actor is a role, such as "Engineering decision required", because there is no identity system. Raw governance enums stay in activity labels only after they have been translated, and in technical detail.

## Progress

The strip under the product name is Explore, Define, Build, Prove, Ship, Learn. A stage is Completed only when its gate is satisfied and the product has moved past it. The current stage index alone does not complete earlier stages. Status values are Not started, In progress, Waiting for you, Blocked, Ready to move, and Completed.

## Evidence

Summary is status, next action, blocker, important risk, and why the product is or is not ready. Detail is the artifact for the current stage. Evidence and advanced detail hold versions, approvals, agent runs, commits, contracts, and activity.

"Why this is ready" is calculated from the same snapshot. Sample records are labelled and do not count as ready. A model cannot change that result.

The short trace is Outcome → First Slice → Story → Task. The full chain from outcome through deployment and outcome evidence stays behind a disclosure.

## Human decisions

Decisions lists the real pending human decisions derived from lifecycle state: product, stage, the decision, why it matters, how long it has been waiting, and the blocker when one exists. Opening one goes to the product stage. Historical approval rows are not deleted. The old "request a test approval" form is not on this page.

Approve is a human approval. Confirm is a person accepting proposed content, such as the First Slice. Ask AI to Review is a model review. Prepare for approval is only the separate readiness step that still has to happen before a person approves.

## Stage pages

Explore answers whether the problem is understood well enough to define the product.

For an idea, Explore is the discovery conversation, the Product Brief, open questions, assumptions, and the next action.

For existing requirements, Explore is intake: add the source, analyse it, review findings, answer the questions that block a reliable brief, confirm interpretations, then review and approve a Product Brief drafted from those requirements. The idea conversation is not shown. Both paths use the same Product Brief approval and the same Move to Define gate. A product card can show Explore · Idea or Explore · Existing requirements so the start is visible. It is still one product, not a second product type.

Define answers what is being built first: outcome, capabilities, First Slice, the backlog, open questions, and the next action.

Build is three moments, not new stages: Design, Engineering Review, and Code. Design includes the solution architecture, architecture decisions, and the delivery plan. Engineering review includes security, engineering risk, findings, and coding rules. Code follows one approved task. Worktree paths, execution contracts, and fingerprints stay in Evidence unless they are the blocker.

Prove is Check, then Publish. A task can be checked when it is complete. The First Slice is proven together before release. AI Product Builder does not merge the pull request.

Ship leads with release status, the next action, blockers, important risks, and why the release is or is not ready. Scope, operational readiness, the deployment plan, approval, and the deployment record follow. AI Product Builder does not deploy.

Learn asks whether the outcome moved. Deployed does not mean outcome achieved. The observation a person records is Outcome Evidence.

## Home and Intelligence

Home leads with decisions waiting, blocked products, release, and outcomes. Flow appears only when the metrics have a real sample. Recent products open Overview.

Intelligence for leadership leads with risk, release, and outcome. AI contribution stays available and is not the first story. Engineering still shows the metric catalogue.
