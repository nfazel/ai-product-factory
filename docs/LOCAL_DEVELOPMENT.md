# Local development setup

This machine runs **two separate PostgreSQL installations**. They must stay on different ports so they do not conflict after a Mac restart.

## Two databases (do not mix them)

| Application | Engine | Port | How it runs | Database | Role |
|---|---|---|---|---|---|
| **AI Product Builder** | PostgreSQL 16 | **5433** (host) → 5432 (container) | Docker Compose | `ai_product_factory` | `apf` |
| **Find-a-Friend** (product under Builder) | PostgreSQL 18 | **5432** | Postgres.app | `betmyfriend` | local macOS user |

### Why the ports differ

Both stacks originally tried to use host port `5432`. After a Mac restart, whichever service started first owned that port and the other failed.

Builder’s Compose file maps the container’s internal `5432` to the host as **`5433`**:

```yaml
# docker-compose.yml
ports:
  - "5433:5432"
```

Builder’s `DATABASE_URL` must use host port **5433**. Find-a-Friend continues to use Postgres.app on **5432**. Do not change Find-a-Friend’s database configuration to “fix” a conflict.

Data for Builder lives in the Docker volume `ai-product-factory_apf_postgres`. **Never** run `docker compose down -v` or delete that volume.

---

## Start AI Product Builder after a Mac restart

### 1. Start Docker Desktop

1. Open **Docker** from Applications (or Spotlight: “Docker”).
2. Wait until Docker reports it is running (whale icon idle / `docker info` succeeds).

```bash
docker info >/dev/null && echo "Docker is ready"
```

If `docker info` fails with a socket or connection error, Docker Desktop is not fully started yet.

### 2. Start Builder’s PostgreSQL (Docker)

From the Builder repo:

```bash
cd /Users/nichervanfazel/ai-product-factory
docker compose up -d postgres
```

Expected container name: `ai-product-factory-postgres-1`  
Expected publish: `0.0.0.0:5433->5432/tcp`

Confirm:

```bash
docker ps --filter name=ai-product-factory-postgres
docker volume ls --filter name=apf_postgres
```

### 3. Check database connectivity

Host port:

```bash
nc -z 127.0.0.1 5433 && echo "Builder Postgres port 5433 is open"
```

Query inside the container (does not print credentials):

```bash
docker exec ai-product-factory-postgres-1 \
  psql -U apf -d ai_product_factory -c '\conninfo'
```

Confirm existing product data is still present:

```bash
# public table count (historically ~111)
docker exec ai-product-factory-postgres-1 \
  psql -U apf -d ai_product_factory -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

# product records (historically 3)
docker exec ai-product-factory-postgres-1 \
  psql -U apf -d ai_product_factory -tAc \
  'SELECT count(*) FROM "Product";'
```

`DATABASE_URL` in `.env` / `.env.local` must point at **`127.0.0.1:5433`** (or `localhost:5433`) for database `ai_product_factory`. Do not overwrite those files casually; only verify the port.

### 4. Start the Next.js development server

```bash
cd /Users/nichervanfazel/ai-product-factory
npm run dev
```

Default URL: [http://localhost:4317](http://localhost:4317)

Open [http://localhost:4317/products](http://localhost:4317/products) and confirm the existing products and history appear.

If port `4317` is already in use:

```bash
lsof -iTCP:4317 -sTCP:LISTEN
# stop the old process only if it is a stale Next.js server you own, then:
npm run dev
```

---

## Diagnose common port conflicts

| Symptom | Likely cause | What to do |
|---|---|---|
| Builder cannot connect to the database | Docker Postgres not running, or `DATABASE_URL` still uses `:5432` | `docker compose up -d postgres`; confirm URL uses **`:5433`** |
| `docker compose up` fails: port already allocated | Something else bound to **5433** | `lsof -iTCP:5433 -sTCP:LISTEN` |
| Find-a-Friend / Postgres.app fails on 5432 | Another process took **5432** (e.g. a second Postgres) | `lsof -iTCP:5432 -sTCP:LISTEN` — leave Postgres.app on 5432; keep Builder on 5433 |
| Next.js `EADDRINUSE` on 4317 | Another `next dev` still running | `lsof -iTCP:4317 -sTCP:LISTEN` then stop that PID |
| `docker` permission / socket errors | Docker Desktop not started | Open Docker Desktop and wait for it to finish starting |

Quick port survey:

```bash
lsof -iTCP:5432 -sTCP:LISTEN
lsof -iTCP:5433 -sTCP:LISTEN
lsof -iTCP:4317 -sTCP:LISTEN
```

---

## Start Find-a-Friend (when needed)

Do **not** change this product’s database settings to share Builder’s Docker Postgres.

1. Ensure **Postgres.app** is running and listening on **5432**.
2. Open the product repo:

```bash
cd /Users/nichervanfazel/.ai-product-factory/products/cmv0tsipq0003aappiumgzxgn
```

3. Use that project’s own `.env` / start scripts (database `betmyfriend` on port **5432**).
4. GitHub remote: `https://github.com/nfazel/betmyfriend.git`

Builder coding worktrees for this product are separate from running Find-a-Friend’s own app server.

---

## Safety rules for this environment

- Do **not** delete or recreate either database.
- Do **not** remove Docker volumes (`docker volume rm`, `docker compose down -v`).
- Do **not** run Prisma migrations or `prisma db push` just to “fix” connectivity after a restart.
- Do **not** overwrite `.env` files unless you intend to change configuration deliberately.
- Keep Builder on **5433** and Find-a-Friend / Postgres.app on **5432**.

A known backup of the Builder database (created during the original port split) lives at:

`~/Desktop/ai-product-builder-backup.dump`

Restore from that dump only if the Docker volume is actually lost — not as a routine startup step.

---

## Minimal restart checklist

```bash
# 1. Docker Desktop running
docker info >/dev/null && echo OK

# 2. Builder DB
cd /Users/nichervanfazel/ai-product-factory
docker compose up -d postgres
nc -z 127.0.0.1 5433 && echo "5433 OK"

# 3. Data still there
docker exec ai-product-factory-postgres-1 \
  psql -U apf -d ai_product_factory -tAc 'SELECT count(*) FROM "Product";'

# 4. App
npm run dev
# → http://localhost:4317/products
```
