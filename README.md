# AI Product Factory

AI Product Factory is the foundation of an AI-native software product development platform. It takes a product from an initial idea through a human-controlled pipeline:

**Explore → Define → Build → Prove → Ship → Learn**

This repository is the application foundation. Specialised agents, model calls, GitHub integration, autonomous coding, and automated test agents are extension points only. They are not implemented.

Humans remain in control of stage changes, decisions, and approval gates.

## Technology stack

- Next.js (App Router), React, TypeScript
- Tailwind CSS and shadcn/ui
- PostgreSQL and Prisma ORM
- Zod for server-side validation
- Modular monolith: UI, domain services, and data access are separate

Authentication is structured so it can be added later. The app runs without a login. The current actor is **Local user**.

## Architecture

Each domain module exposes a service. Repositories are the only code that talks to Prisma. Pages and API routes call services. Future agents should call those same services, then wait for a person at an approval gate.

See [docs/architecture.md](docs/architecture.md) for the module boundaries and the agent extension point.

## Project structure

```
prisma/                  Schema, migrations, and demo seed
src/app/                 Routes, layouts, and HTTP API
src/components/          Shared interface components
src/domain/              Stages, labels, hierarchy rules, backlog tree
src/modules/             Product, work item, approval, activity, agent, identity
src/server/              Server actions and API helpers
docs/architecture.md     Modular design and future agents
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

No API keys are required. There is no model provider configured.

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
npm run build
npm run db:validate
```

## Seed demo data

```bash
npm run db:seed
```

The seed replaces existing factory data with one sample product, **Claims Management Platform**, in the Define stage. It includes an epic, features, a customer claim story, acceptance criteria, a task, a defect, decisions, approvals, and an activity history.

Agent runs are intentionally empty.

## Future architecture

Agents will be registered against `registerAgentRunner` and will call the existing services. `POST /api/agent-runs` refuses until a runner exists, and it does not invent output. Approval records stay the human gate between a proposal and a change to the product.

Authentication will replace `getCurrentActor()` and the pass-through `src/proxy.ts` without rewriting the domain model.
