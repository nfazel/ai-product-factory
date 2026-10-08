# AI Product Factory

AI Product Factory is the foundation of an AI-native software product development platform. It takes a product from an initial idea through a human-controlled pipeline:

**Explore → Define → Build → Prove → Ship → Learn**

This repository is the product factory with six agents enabled. Product Discovery turns an incomplete idea into a Product Brief during Explore. The Requirements Agent turns an approved brief into an outcome-driven product definition during Define. The Architecture Agent, inside Build, turns an approved definition and an approved first slice into a solution architecture and an implementation plan. The Security & Engineering Governance Agent, also inside Build, independently reviews that approved architecture and plan before coding. The Coding Agent, still inside Build, executes one approved implementation task in an isolated Git worktree. The Testing & Verification Agent independently checks that completed work against the approved acceptance criteria. Task-level verification can start during Build. Prove considers the approved product slice as an integrated release candidate. Ship is where a person approves that candidate and records a deployment the person performed. Learn is where a person records what the release did to the product outcome. The review agent is not implemented. GitHub publication is a human-triggered integration. Automatic merge and autonomous deployment are not implemented.

Humans remain in control of stage changes, decisions, and approval gates. No agent can approve its own work or move the product stage.

## Technology stack

- Next.js (App Router), React, TypeScript
- Tailwind CSS and shadcn/ui
- PostgreSQL and Prisma ORM
- Zod for server-side validation
- Modular monolith: UI, domain services, and data access are separate

Authentication is structured so it can be added later. The app runs without a login. The current actor is **Local user**.

## Architecture

Each domain module exposes a service. Repositories are the only code that talks to Prisma. Pages and API routes call services. Future agents should call those same services, then wait for a person at an approval gate.

See [docs/architecture.md](docs/architecture.md) for the module boundaries, [docs/product-discovery-agent.md](docs/product-discovery-agent.md) for discovery, and [docs/requirements-agent.md](docs/requirements-agent.md) for product definition. [docs/traceability.md](docs/traceability.md) describes how a story links back to an outcome.

## Project structure

```
prisma/                  Schema, migrations, and demo seed
src/app/                 Routes, layouts, and HTTP API
src/components/          Shared interface components
src/domain/              Stages, labels, hierarchy rules, backlog tree
src/modules/             Product, discovery, requirements, architecture, governance, coding, verification, source control, release, AI, work item, approval, activity, agent, identity
src/server/              Server actions and API helpers
docs/architecture.md     Modular design
docs/product-discovery-agent.md  Discovery agent, prompt, and approval gate
docs/requirements-agent.md       Requirements agent, proposal workflow, and approval gate
docs/architecture-agent.md       Architecture agent, solution model, and approval gate
docs/implementation-planning.md  Vertical-slice implementation plans
docs/traceability.md     Outcome to verification links
docs/verification-agent.md       Independent verification, workspace, and verdict
docs/verification-evidence.md    Coverage, evidence, and what is not claimed
docs/github-integration.md       GitHub connection, publication, and evidence
docs/pull-request-lifecycle.md   Pull request readiness and human merge
docs/release-governance.md       Release candidate, evidence, risk, and approval
docs/deployment-governance.md    Human deployment records and rollback
docs/learn-loop.md               Outcome observation and the next decision
```

## Database setup

PostgreSQL 16 is required.

With Docker:

```bash
docker compose up -d
```

Or create the database yourself and point `DATABASE_URL` at it. The local development role used in `.env.example` is:

- user: `apf`
- password: `apf_dev_password`
- database: `ai_product_factory`

Apply migrations:

```bash
npm install
npx prisma migrate dev
```

`npm install` runs `prisma generate`.

## Environment variables

Copy the example file:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma and the Next.js server |
| `OPENAI_API_KEY` | Server-only key for Product Discovery, the Requirements Agent, the Architecture Agent, the Security & Engineering Governance Agent, the Coding Agent, and the Testing & Verification Agent. Leave empty to run without model calls |
| `OPENAI_MODEL` | Optional. Defaults to `gpt-4.1-mini` |
| `CODEBASE_CONTEXT_ROOT` | Optional absolute path. When set, Build can read that directory's `package.json` and top-level folder names. It cannot browse an arbitrary path |
| `PRODUCT_REPOSITORY_ROOT` | Optional absolute path to a local Git repository the Coding Agent and the Testing & Verification Agent may use. The browser cannot set this |
| `PRODUCT_REPOSITORY_ALLOW_FACTORY` | Optional. Set to `true` only when a local demo should use this application's own source tree |
| `GITHUB_TOKEN` | Optional local personal access token. Server-only. Never put this in the browser |
| `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` | Optional GitHub App credentials. Preferred for a real installation. Server-only |
| `GITHUB_OWNER`, `GITHUB_REPOSITORY` | Repository the factory may publish to after **Validate Connection** |
| `GITHUB_MINIMUM_HUMAN_APPROVALS` | Optional. Defaults to 1. Branch protection can require more |
| `GITHUB_SERVICE_ACCOUNT` | Optional login that must not count as a human reviewer |

The key is read only on the server. The browser never receives it. If it is missing, the app still runs and Discovery says that AI is not configured.

## Run locally

```bash
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

The dev server listens on port **4317**.

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

Other commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run db:validate
```

## Seed demo data

```bash
npm run db:seed
```

The seed replaces existing factory data with one sample product, **Claims Management Platform**, in the Define stage. It includes an epic, features, a customer claim story, acceptance criteria, a task, a defect, decisions, approvals, and an activity history. It also includes a labelled demo verification session for the simple claim slice: a positive case, a negative case, an untested non-functional requirement, and a low-severity demo defect. That session does not include command output or an agent run.

It also includes a **demo** discovery session and product brief, plus demo outcomes, capabilities, a first product slice, non-functional requirements, an open question, and an open definition proposal. The Build tab shows a demo solution architecture, architecture decisions, an initial security assessment, and an implementation plan for that slice. That content is labelled demo data. The seed does not create agent runs and does not pretend a model wrote the brief, the definition, or the architecture. The sample brief is ready for review and not approved, the definition is not approved, and the slice is still proposed, so **Generate architecture** stays closed until a person approves those gates and moves the product to Build.

## Product Discovery

Open a product and choose Discovery. With `OPENAI_API_KEY` set, Start Discovery sends the idea to the Product Discovery Agent and builds a brief. Without the key, the page explains that AI is not configured.

A person edits the brief, confirms assumptions, and approves it. Approval does not change the product stage. Move to Define is a separate human action, and only from Explore.

## Product definition

Open a product and choose Definition. **Generate Product Definition** runs only in Define, and only when the current brief is approved and `OPENAI_API_KEY` is set. The result is a proposal. Accept, edit, or reject items, then commit. Committed items become normal backlog work with provenance. Confirm outcomes yourself. Approve the first slice and the product definition yourself. Move to Build stays closed until the brief, the definition, and the first slice are approved.

Tests mock the provider. They do not call OpenAI.

## Build

Open a product and choose Build. Architecture and implementation planning happen here. They are not a new pipeline stage.

**Generate architecture** runs only in Build, and only when the product brief, the product definition, and the first product slice are approved, and `OPENAI_API_KEY` is set. The result is a proposal. A person accepts, edits, or rejects it, then commits a draft. Approve architecture is a separate human action. **Generate implementation plan** stays closed until that approval exists. Approve the plan yourself.

**Run governance review** stays closed until the brief, the definition, the first slice, the solution architecture, and the implementation plan are approved. The governance agent does not approve its own review and does not write code. A person resolves findings, approves the coding policy, and approves the governance review. Coding readiness stays **NOT READY** until those approvals exist and no deterministic governance blocker remains. The label is **CODING READY** only then.

**Start Coding Task** also needs an approved implementation task, a coding-risk mode other than human-only, no unresolved task dependency, and `PRODUCT_REPOSITORY_ROOT`. The Coding Agent works in a Git worktree. A person approves the code and may create a commit. The commit is not pushed or merged.

If an approved requirement changes after the architecture is approved, the page says **Architecture review required** and keeps the approval. If the architecture changes after the plan is approved, the page says **Implementation Plan review required** and keeps that approval. If the architecture or the plan changes after governance is approved, the page says **GOVERNANCE REVIEW REQUIRED** and keeps the approval. If the coding policy changes after it is approved, the page says **CODING POLICY REAPPROVAL REQUIRED** and keeps the approval.

Build also shows a short verification status and a link to Prove. See [docs/security-governance-agent.md](docs/security-governance-agent.md), [docs/coding-policy.md](docs/coding-policy.md), [docs/coding-agent.md](docs/coding-agent.md), [docs/repository-workspace.md](docs/repository-workspace.md), and [docs/coding-execution-contract.md](docs/coding-execution-contract.md).

## Prove

Open a product and choose Prove. The page lists implementation tasks that are waiting for verification, and it lists every blocking entry condition. **Start verification** runs only for a completed task that has a human code approval, a commit SHA, a live coding workspace, a current execution contract, and passing required coding checks.

The Testing & Verification Agent uses its own Git worktree, branched from the approved coding commit. It may add tests under `verification/`. It may not change production code, and it does not fix defects. A person approves the verification. If the implementation commit changes afterwards, the verification and its approval are marked **RE-VERIFICATION REQUIRED**.

When every task in the approved slice has a completed implementation and an approved passing verification, and no critical or high defect is open, the page says **PRODUCT SLICE VERIFIED** and **Ready to move to PROVE**. If the product is already in Prove, it says **Ready for Release Review**. The stage does not move by itself.

See [docs/verification-agent.md](docs/verification-agent.md) and [docs/verification-evidence.md](docs/verification-evidence.md).

## Ship and Learn

Open a product and choose Ship. **Create Release Candidate** runs only when the approved slice is complete: every task is completed, independently verified, and merged, governance and coding policy are current, no critical or high defect is open, and an integrated verification session exists. Gaps in that session stay visible.

A person writes the deployment plan, including rollback, and approves the release. **Record Deployment** stores what that person did outside the factory. The candidate becomes deployed only after the recorded result succeeded and the required post-deployment checks passed. There is no deploy button that ships the software.

Learn shows the product outcome, observations a person enters, and a learning decision. A sample value is labelled `DEMO / SAMPLE`. Marking an outcome achieved is a separate human action. See [docs/release-governance.md](docs/release-governance.md), [docs/deployment-governance.md](docs/deployment-governance.md), and [docs/learn-loop.md](docs/learn-loop.md).

## Demo repository

The Coding Agent does not point itself at this source tree. Create a small Git repository and set `PRODUCT_REPOSITORY_ROOT` to its absolute path:

```bash
mkdir -p "$HOME/apf-demo-repo/src/claims"
cd "$HOME/apf-demo-repo"
git init -b main
printf '%s\n' '{ "name": "demo-claims", "scripts": { "test": "node -e \"process.exit(0)\"" } }' > package.json
printf '%s\n' 'export const claim = "notice"' > src/claims/submit.ts
git add .
git -c user.email=demo@localhost -c user.name="Demo" commit -m "Initial claims helper"
```

Add `PRODUCT_REPOSITORY_ROOT` to `.env`, then restart the server. Approve the upstream Build gates, approve one implementation task, and choose **Start Coding Task**. The seed does not invent Git evidence.

## Later agents

The review agent is not registered. GitHub publication and pull requests are a human-triggered integration: the factory can publish an approved branch and open a pull request, and a person merges it on GitHub. Release approval and deployment recording are also human actions. Automatic merge, autonomous deployment, automatic rollback, browser automation, vulnerability scanning, and performance infrastructure are not implemented. Authentication will replace `getCurrentActor()` and the pass-through `src/proxy.ts` without rewriting the domain model.

See [docs/github-integration.md](docs/github-integration.md) and [docs/pull-request-lifecycle.md](docs/pull-request-lifecycle.md).
