# Review & Rating Feature — LaunchLab

This is the **Review Function** module: customers rate food items 1–5 stars,
leave a comment, see reviews on a food/merchant page, and merchants can
reply. It's built to run **standalone** right now, and to merge cleanly
into the rest of the team's app later.

Stack used (not specified by the team yet, so I picked the most common,
Docker-friendly option for this kind of project):
- **Backend:** Node.js + Express + MongoDB (Mongoose)
- **Frontend:** plain HTML/CSS/JS — no framework, so it drops into whatever
  the team ends up using, or runs standalone for a demo.

---

## Why it has "fake" login and food data baked in

Your Order Management / Login / Food Management parts aren't necessarily
done yet, but the Review Function still needs *something* to attach to.
So this includes two clearly-marked placeholders:

| File | What it's for | Delete it when... |
|---|---|---|
| `backend/routes/devAuthRoutes.js` | Hands out a working JWT for "customer" / "merchant" without a real login | May's real login/JWT system is merged |
| `backend/data/mockFoods.js` + `backend/routes/mockRoutes.js` | 3 fake dishes so reviews have something to attach to | Jayme's real Food Management API is merged |
| `backend/models/Order.js` | Minimal stand-in so "verified purchase" can be tested | Justyn's real Order model is merged |

None of this touches the actual `Review` model or its logic — when you
swap these out, the review code itself doesn't change. Just make sure
whoever owns Login signs JWTs with at least `{ id, role }` in the payload,
since that's all `middleware/auth.js` expects.

---

## Running it locally (no Docker)

```bash
cd backend
cp .env.example .env
npm install
npm run dev          # needs a local MongoDB running on localhost:27017
```

Then open `frontend/index.html` directly in your browser (or serve it with
any static server). Click **"Log in as Customer"**, pick a dish, and leave
a review.

## Running it with Docker (one command)

```bash
docker compose up --build
```

This starts MongoDB + the backend together. Open `frontend/index.html` in
your browser as before — it talks to `http://localhost:5000`.

## Running the tests

```bash
cd backend
npm test
```

Uses an in-memory MongoDB (`mongodb-memory-server`), so no real database
is needed — just internet access the first time, to download the small
mongod binary it uses internally. This is exactly the kind of test suite
you'll want your Phase 2 CI/CD pipeline (GitHub Actions, Jenkins, etc.) to
run automatically on every push.

---

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/reviews/food/:foodId` | Public | Reviews + average rating for one dish |
| GET | `/api/reviews/merchant/:merchantId` | Public | Reviews + average rating for one merchant |
| POST | `/api/reviews` | Customer | Create a review |
| PUT | `/api/reviews/:id` | Owner | Edit your own review |
| DELETE | `/api/reviews/:id` | Owner / Admin | Delete a review |
| PATCH | `/api/reviews/:id/reply` | Merchant (owner) / Admin | Reply to a review |
| POST | `/api/dev/dev-token` | — | **TEMP** — get a test JWT |
| GET | `/api/mock/foods` | — | **TEMP** — sample dish list |

**Create a review — example body:**
```json
{
  "foodId": "64a000000000000000000001",
  "merchantId": "64a000000000000000000101",
  "orderId": "optional - only if you want the Verified badge",
  "rating": 5,
  "comment": "Really good char kway teow!"
}
```

---

## Design decisions worth mentioning in your presentation

- **One review per customer per food item** — enforced with a unique
  compound index (`userId` + `foodId`), not just app logic. Stops
  duplicate/spam reviews and pushes a second opinion toward "edit your
  review" instead.
- **Verified purchase is optional, not hard-required, by default**
  (`REQUIRE_VERIFIED_PURCHASE=false` in `.env`). This lets you demo the
  feature before Order Management exists. Flip it to `true` once Justyn's
  real order system is wired in, and only people with a completed order
  will be able to review.
- **Average rating is computed on read**, via a MongoDB aggregation, not
  stored and cached on the Food document. Simpler and always correct;
  fine at this scale. If you want to talk about scalability in your
  presentation, this is a natural "what we'd change at higher volume"
  point — a cached `averageRating` field on Food, updated on write.
- **Merchant reply** is a small bonus on top of the brief: it's one extra
  CRUD-ish action gated by role + ownership, which is a good thing to
  walk through individually since it touches auth, ownership checks, and
  the data model in one place.

---

## What's already DevOps-aware (for Phase 1 grading)

- `Dockerfile` for the backend, plus a root `docker-compose.yml` that
  brings up Mongo + the backend together — this is exactly the kind of
  "initial Docker exploration" the assignment asks for in Phase 1, ready
  to extend with your team's other services in Phase 2.
- A real test suite (`backend/tests/review.test.js`) that runs without a
  shared database, which is what a CI pipeline needs to run tests on
  every push without flaking.
- Clear `.env.example` instead of hardcoded secrets, so config differs
  cleanly between local/Docker/CI later.
