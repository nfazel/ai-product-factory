# AI Product Factory

AI Product Factory is the foundation of an AI-native software product development platform. It takes a product from an initial idea through a human-controlled pipeline:

**Explore → Define → Build → Prove → Ship → Learn**

This repository is the product factory with the first agent enabled: Product Discovery. It turns an incomplete idea into a Product Brief during Explore. Requirements, architecture, coding, and testing agents are not implemented. GitHub integration is not implemented.

Humans remain in control of stage changes, decisions, and approval gates. The discovery agent cannot approve its own brief or move Explore to Define.

## Technology stack

- Next.js (App Router), React, TypeScript
- Tailwind CSS and shadcn/ui
- PostgreSQL and Prisma ORM
- Zod for server-side validation
- Modular monolith: UI, domain services, and data access are separate

Authentication is structured so it can be added later. The app runs without a login. The current actor is **Local user**.

## Architecture

Each domain module exposes a service. Repositories are the only code that talks to Prisma. Pages and API routes call services. Future agents should call those same services, then wait for a person at an approval gate.

See [docs/architecture.md](docs/architecture.md) for the module boundaries and [docs/product-discovery-agent.md](docs/product-discovery-agent.md) for the discovery agent.

## Project structure

```
prisma/                  Schema, migrations, and demo seed
src/app/                 Routes, layouts, and HTTP API
src/components/          Shared interface components
src/domain/              Stages, labels, hierarchy rules, backlog tree
src/modules/             Product, discovery, AI, work item, approval, activity, agent, identity
src/server/              Server actions and API helpers
docs/architecture.md     Modular design
docs/product-discovery-agent.md  Discovery agent, prompt, and approval gate
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
| `OPENAI_API_KEY` | Server-only key for Product Discovery. Leave empty to run without model calls |
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

It also includes a **demo** discovery session and product brief so the Discovery tab can be reviewed without a live model. That transcript is labelled demo data. The seed does not create agent runs and does not pretend a model wrote the brief.

## Product Discovery

Open a product and choose Discovery. With `OPENAI_API_KEY` set, Start Discovery sends the idea to the Product Discovery Agent and builds a brief. Without the key, the page explains that AI is not configured.

A person edits the brief, confirms assumptions, and approves it. Approval does not change the product stage. Move to Define is a separate human action, and only from Explore.

Tests mock the provider. They do not call OpenAI.

## Later agents

Requirements, architecture, coding, and testing agents are not registered. `POST /api/agent-runs` still refuses those types. Authentication will replace `getCurrentActor()` and the pass-through `src/proxy.ts` without rewriting the domain model.
