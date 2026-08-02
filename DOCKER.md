# Docker

How to build and run FoodHub with Docker, locally or in production.
For how this fits into the CI/CD pipeline and EC2 deployment, see
[`CICD.md`](CICD.md); for the test suite itself, see [`TESTING.md`](TESTING.md).

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running (includes Docker Compose v2 — check with `docker compose version`)
- A MongoDB connection string, either:
  - a **local** one (the `mongo` service below provides this for you), or
  - your own **MongoDB Atlas** URI, if you want to test against real data

No other local installs are required — Node, npm, and all dependencies are installed *inside* the containers.

---

## The two files

| File | Purpose |
|---|---|
| [`Dockerfile`](Dockerfile) | Builds the production image: a multi-stage build so the final image only contains production dependencies, and runs as a non-root `node` user |
| [`docker-compose.yml`](docker-compose.yml) | Defines three services — `mongo`, `app`, `tests` — used for local development, running the test suite, and (scoped to just `app`) production |

---

## Quick start — run the app locally

```bash
# 1. Start a local MongoDB container
docker compose up -d mongo

# 2. Build and start the app (connects to the mongo container above)
docker compose up app
```

Then open **http://localhost:3000**.

- `mongo` runs detached (`-d`) since you don't need to watch its logs.
- `app` runs in the foreground so you can see server logs directly; add `-d` to run it detached too, and check logs later with `docker compose logs -f app`.
- Stop everything with `docker compose down` (add `-v` to also delete the local Mongo data volume and start fresh next time).

### Using your own MongoDB Atlas URI instead of the local `mongo` container

Create a `.env` file in the project root (see [`.env.example`](.env.example) if present, or the table below) with your own `MONGODB_URI`, then run just the app service:

```bash
docker compose up -d --build app
```

Compose automatically loads `.env` for the `${...}` variables in `docker-compose.yml`, so no extra flags are needed.

---

## Running the test suite in Docker

> **Known issue:** the `tests` service currently fails. It was written
> for an older version of the test suite and still runs
> `npm run test:integration`, a script that no longer exists — the
> suite was restructured into pure unit tests that need neither
> MongoDB nor Docker (see [`TESTING.md`](TESTING.md)). Confirmed
> locally: `test:unit` passes (139/139), then the command errors on
> `npm error Missing script: "test:integration"`.
>
> Until `docker-compose.yml`'s `tests` service is updated to match,
> just run tests directly with Node — no Docker needed at all:
> ```bash
> npm ci
> npm test
> ```

```bash
docker compose up -d mongo
docker compose run --rm tests
```

This *should* run `npm ci && npm run seed && npm run test:unit && npm run test:integration` inside a plain Node container against the `mongo` service, using a bind mount so no rebuild is needed after editing test files — but see the note above.

---

## Environment variables

| Variable | Used by | Default if unset | Notes |
|---|---|---|---|
| `MONGODB_URI` | `app` | `mongodb://mongo:27017/foodhub` (the local container) | Set your own Atlas URI in `.env` to point at a real database |
| `SESSION_SECRET` | `app` | `local-dev-secret` | Used to sign session cookies — production uses a real secret, never this fallback |
| `PORT` | `app` (inside the container) | `3000` | The app always listens on `3000` inside the container |
| `HOST_PORT` | `app` (compose only) | `3000` | Which port on **your machine** maps to the container's `3000`. Production sets this to `80` |

---

## Building the image directly (without Compose)

```bash
docker build -t foodhub .
docker run -d -p 3000:3000 --env-file .env foodhub
```

Useful for a quick sanity check of the `Dockerfile` alone, without spinning up `mongo`/`tests`.

---

## Checking the container is healthy

The image defines a `HEALTHCHECK` that hits `/admin/login` every 30s. Check its status with:

```bash
docker inspect --format='{{.State.Health.Status}}' foodhub-app
```

This should report `healthy` once the app has started and connected to MongoDB — the same check the CI `docker` job (see `CICD.md`) waits on before it will pass.

---

## Common commands

| Command | What it does |
|---|---|
| `docker compose up -d mongo` | Start just the local database, detached |
| `docker compose up app` | Build (if needed) and start the app, attached |
| `docker compose up -d --build app` | Rebuild and start the app, detached |
| `docker compose run --rm tests` | Run the full test suite once, then remove the container |
| `docker compose logs -f app` | Follow the app's logs |
| `docker compose down` | Stop and remove all containers + the network |
| `docker compose down -v` | Also delete the local Mongo data volume (fresh database next start) |
| `docker compose ps` | List what's currently running |

---

## Troubleshooting

**`MongoServerSelectionError` / `ECONNRESET` when connecting to Atlas** — this is almost always the machine's current public IP not being in Atlas's Network Access allow-list, not a Docker problem. Check your IP (`curl https://api.ipify.org`) and add it under **Atlas → Network Access → Add IP Address**. This can also happen on networks that block outbound port `27017` entirely (some school/corporate Wi-Fi) — try a different network to confirm.

**Port `3000` (or `27017`) already in use** — something else on your machine is using that port. Either stop it, or change `HOST_PORT` (for the app) in `.env`.

**Changes to `package.json` not showing up** — rebuild the image so `npm ci` reruns: `docker compose up -d --build app`.

**`tests` service can't connect to Mongo** — make sure `mongo` is started first (`docker compose up -d mongo`) and its healthcheck has passed; `tests` waits on `depends_on: mongo: condition: service_healthy`, but only if `mongo` was actually started in the same project.
