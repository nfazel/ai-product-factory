# AI Product Factory

AI Product Factory is the foundation of an AI-native software product development platform. It takes a product from an initial idea through a human-controlled pipeline:

**Explore → Define → Build → Prove → Ship → Learn**

This repository is the product factory with two agents enabled. Product Discovery turns an incomplete idea into a Product Brief during Explore. The Requirements Agent turns an approved brief into an outcome-driven product definition during Define. Architecture, coding, and testing agents are not implemented. GitHub integration is not implemented.

Humans remain in control of stage changes, decisions, and approval gates. Neither agent can approve its own work or move the product stage.

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
src/modules/             Product, discovery, requirements, AI, work item, approval, activity, agent, identity
src/server/              Server actions and API helpers
docs/architecture.md     Modular design
docs/product-discovery-agent.md  Discovery agent, prompt, and approval gate
docs/requirements-agent.md       Requirements agent, proposal workflow, and approval gate
docs/traceability.md     Outcome to story links
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
| `OPENAI_API_KEY` | Server-only key for Product Discovery and the Requirements Agent. Leave empty to run without model calls |
| `OPENAI_MODEL` | Optional. Defaults to `gpt-4.1-mini` |

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

The seed replaces existing factory data with one sample product, **Claims Management Platform**, in the Define stage. It includes an epic, features, a customer claim story, acceptance criteria, a task, a defect, decisions, approvals, and an activity history.

It also includes a **demo** discovery session and product brief, plus demo outcomes, capabilities, a first product slice, non-functional requirements, an open question, and an open definition proposal. That content is labelled demo data. The seed does not create agent runs and does not pretend a model wrote the brief or the definition. The sample brief is ready for review and not approved, so **Generate Product Definition** stays closed until a person approves the brief.

## Product Discovery

Open a product and choose Discovery. With `OPENAI_API_KEY` set, Start Discovery sends the idea to the Product Discovery Agent and builds a brief. Without the key, the page explains that AI is not configured.

A person edits the brief, confirms assumptions, and approves it. Approval does not change the product stage. Move to Define is a separate human action, and only from Explore.

## Product definition

Open a product and choose Definition. **Generate Product Definition** runs only in Define, and only when the current brief is approved and `OPENAI_API_KEY` is set. The result is a proposal. Accept, edit, or reject items, then commit. Committed items become normal backlog work with provenance. Confirm outcomes yourself. Approve the first slice and the product definition yourself. Move to Build stays closed until the brief, the definition, and the first slice are approved.

Tests mock the provider. They do not call OpenAI.

## Later agents

Architecture, coding, and testing agents are not registered. `POST /api/agent-runs` still refuses those types. Authentication will replace `getCurrentActor()` and the pass-through `src/proxy.ts` without rewriting the domain model.
