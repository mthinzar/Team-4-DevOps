# CI/CD Pipeline

How a code change gets from a laptop to the live EC2 instance, and
who owns which part of that path.

---

## The pipeline

```
Code Push / Pull Request
        │
        ▼
┌────────────────────┐
│        test          │  npm ci -> lint -> test:unit -> test:coverage
│  no DB, no Docker    │  (TESTING.md: "Nothing here needs MongoDB or Docker")
└──────────┬───────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌───────────┐ ┌──────────────┐
│known-issues│ │    docker     │
│continue-on-│ │ build image,   │
│error: true │ │ run it, check  │
│(see below) │ │ HEALTHCHECK    │
└───────────┘ └───────┬───────┘
                       ▼
              ┌─────────────────┐
              │      deploy      │  only on a push to main,
              │  (SSH + Ansible) │  never on a pull request
              └─────────────────┘
```

This is one workflow, `.github/workflows/ci.yml`, so the whole thing
shows up as a single graph in the GitHub Actions tab. A pull request
runs every job except `deploy` — `deploy` needs `test` and `docker`,
and is additionally gated with
`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`,
so a PR always stops at "build" and a merge to `main` always
continues on to "deploy".

`known-issues` runs, but `continue-on-error: true` means it never
fails the pipeline. That is intentional, not a shortcut: those tests
fail on purpose today, documented one by one in
[`TESTING.md`](TESTING.md#known-bugs). Once that table is empty,
deleting that one line turns it into a normal blocking job.

---

## What runs where

| Job | Needs a database? | Blocks the pipeline? | What it actually runs |
|---|---|---|---|
| `test` | No | Yes | `npm run lint`, `npm run test:unit`, `npm run test:coverage` |
| `known-issues` | No | No (`continue-on-error`) | `npm run test:issues` |
| `docker` | Yes (service container) | Yes | `docker build`, run the image, wait for `HEALTHCHECK` |
| `deploy` | No (talks to production DB via Ansible) | — (only reachable after the above) | SSH into EC2, run `ansible-playbook deploy.yml` |

Only `docker` needs a database — `test` and `known-issues` are pure
unit tests against `data/pricing.js`, `data/payments.js`,
`data/orderStatus.js`, `data/validation.js`, and `public/js/cart.js`,
none of which touch MongoDB (see `TESTING.md` for why the test suite
was restructured this way). `docker` spins up its own `mongo:7`
[service container](https://docs.github.com/en/actions/using-containerized-services/about-service-containers)
since it builds and runs the *real* production image, which always
needs a database to serve anything. Nothing in CI ever touches the
real Atlas database.

---

## Deploy: what GitHub Actions does vs. what Ansible does

GitHub Actions' job is deliberately small: **SSH into the EC2 host and
run one command.** Everything about *how* the server gets configured —
installing Docker, cloning the repo, writing `.env`, building and
starting the containers — is owned by `deploy.yml` (Ansible) at the
repo root. The workflow doesn't duplicate any of that; it just
triggers it.

```yaml
script: |
  command -v ansible-playbook >/dev/null 2>&1 || (sudo apt-get update -y && sudo apt-get install -y ansible)
  mkdir -p ~/Team-4-DevOps && cd ~/Team-4-DevOps
  if [ -d .git ]; then git fetch origin main && git reset --hard origin/main
  else git clone https://github.com/mthinzar/Team-4-DevOps.git .
  fi
  ansible-playbook deploy.yml -e "mongodb_uri=${{ secrets.MONGODB_URI }}" -e "session_secret=${{ secrets.SESSION_SECRET }}"
```

This is intentionally idempotent — the same command runs whether it's
the very first deploy to a fresh box or the hundredth deploy that day.

`deploy.yml` was changed in one small way to work with the new
`docker-compose.yml` (see below): it now runs
`docker compose up -d --build app` instead of a bare
`docker compose up -d --build`, and writes `SESSION_SECRET` and
`HOST_PORT=80` into the generated `.env` alongside `MONGODB_URI`.

### Why `docker-compose.yml` needed to change too

`docker-compose.yml` now defines three services — `mongo`, `app`, and
`tests` — so that `TESTING.md`'s documented local workflow
(`docker compose up -d mongo`, `docker compose up app`,
`docker compose run --rm tests`) works. A bare `docker compose up -d --build`
in production would start all three, including a throwaway local
Mongo the app doesn't need and a `tests` service that would try to
seed and run the whole suite against production. Scoping the deploy
command to `app`, and removing `app`'s `depends_on: mongo`, means
production only ever runs the one container it's supposed to,
connected to the real Atlas database via `.env`.

---

## Required GitHub repo secrets

**Settings → Secrets and variables → Actions → New repository secret.**
None of these are set yet — the `deploy` job will fail until they are.

| Secret | Value |
|---|---|
| `EC2_HOST` | The EC2 instance's public IP or DNS name |
| `EC2_SSH_USER` | SSH username for the instance (`ubuntu` for the standard Ubuntu AMI) |
| `EC2_SSH_KEY` | The **private** half of the EC2 key pair, full PEM contents (`-----BEGIN ... KEY-----` through `-----END ... KEY-----`) |
| `MONGODB_URI` | The production MongoDB Atlas connection string |
| `SESSION_SECRET` | A long random string for signing session cookies — **not** the `local-dev-secret` fallback used locally |

A `FoodHub` [environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
is referenced by the `deploy` job (`environment: FoodHub`) — the 5
secrets above live here, as environment secrets, rather than as plain
repository secrets. Creating this environment in **Settings → Environments**
happens automatically the first time it's referenced, but it's
the place to add manual-approval-before-deploy or restrict which
branches can deploy, if the team wants that later.

---

## Who built what

| Area | Owner | What's there |
|---|---|---|
| Docker (base image) | Justyn | The original single-stage `Dockerfile` and `docker-compose.yml` |
| Automated testing | m-AHO | `tests/` (unit tests + known-issues), `scripts/lint.js`, `TESTING.md`, `data/orderStatus.js` and `data/validation.js` (business logic extracted out of `app.js` so it's unit-testable), and the hardened multi-stage production `Dockerfile` |
| Infrastructure as Code / AWS EC2 | Muhammad Raees | `deploy.yml` — the Ansible playbook that provisions a fresh EC2 host end to end |
| **CI/CD pipeline (this doc)** | **May** | `.github/workflows/ci.yml` — wiring test/known-issues/docker/deploy into one pipeline; reconciling `docker-compose.yml` and `deploy.yml` so local dev, CI, and production all use the same files without conflicting; this document |

The reconciliation work above (`docker-compose.yml` serving both local
dev and production, `deploy.yml`'s one-line scoping fix) sits at the
seam between the Docker work and the Ansible work — it only became
visible once both were wired into an actual pipeline, which is why it
landed here rather than in either teammate's original commit.
