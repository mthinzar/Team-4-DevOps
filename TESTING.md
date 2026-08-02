# Testing

Automated tests for FoodHub.

They use the test runner that comes built into Node, so there is
**nothing new to install**. No Jest, no Mocha, no Supertest. Adding those
would mean changing `package-lock.json`, and then `npm ci` would fail for
everyone until they reinstalled. Everything here works on a fresh clone.

---

## How to run them

```bash
# Unit tests only. No database needed, takes about a second.
npm run test:unit

# Lint plus unit tests. This is what "npm test" does.
npm test

# All of them, with a local MongoDB
docker compose up -d mongo
npm run seed
npm run test:integration

# Or run everything inside Docker, with no MongoDB installed on your laptop
docker compose run --rm tests
```

---

## What the three folders do

| Folder | Command | Needs MongoDB | Blocks CI |
|---|---|---|---|
| `tests/unit` | `npm run test:unit` | No | Yes |
| `tests/integration` | `npm run test:integration` | Yes | Yes |
| `tests/security` | `npm run test:security` | Yes | Not yet |

### tests/unit

`data/pricing.js` and `data/payments.js` are plain functions that do not
touch the database, so they can be tested on their own. They also hold the
two most important things in the project: how much a customer pays, and
whether a card is accepted.

The most important test in the whole repo is this one:

```js
test('priceCart ignores the price sent by the browser', () => {
    const editedCart = [{ foodId: 'western-burger', qty: 2, price: 0.01 }];
    const result = pricing.priceCart(editedCart, menu);

    assert.strictEqual(result.lines[0].price, 6.50);   // from the database
    assert.strictEqual(result.total, 13.00);
});
```

Coverage from `npm run test:coverage`:

```
file          | line % | branch % | funcs %
payments.js   | 100.00 |    97.67 |  100.00
pricing.js    |  98.02 |    95.56 |  100.00
```

The two uncovered lines in `pricing.js` are the `total > 0` check. It
cannot be reached, because `unitPrice()` already refuses any dish that
would price at zero or less. It is a safety net that is kept on purpose,
so please do not delete it to make the number go up.

### tests/integration

`tests/helpers/server.js` starts the real `app.js` in the background, the
same way `npm start` does, and then the tests send real HTTP requests to
it. Nothing in `app.js` had to be changed to make this work.

`tests/helpers/client.js` remembers cookies, because `fetch()` does not.
One client behaves like one browser, so a test can log in as two
merchants at the same time and check that neither can see the other's
dishes or orders.

What is covered: all three logins and keeping the roles separate,
checkout prices, all three payment methods including PayNow being spent
twice, the merchant menu, the order steps, and the admin pages.

### tests/security

Every test checks what the app **should** do. The ones that fail today
start with `BUG:` — see below.

---

## Important: database safety

`db.js` always calls `client.db('foodhub')`, so the database name inside
`MONGODB_URI` is **ignored**. If you ran these tests with the Atlas
connection string from your `.env`, they would write to the real
database.

So `tests/helpers/server.js` refuses to start unless MongoDB is running
locally:

```
These tests write to the "foodhub" database and would damage real data.
Start a local MongoDB first (docker compose up -d mongo)
```

As a second layer, everything the tests create is named so it can be
found again: stall and dish IDs start with `zztest-`, merchant emails end
with `@test.invalid`, admin IDs start with `zztest-`, and customers are
called `Test something`. `cleanup()` deletes only those, and never drops
a collection, so the demo data from `seed.js` is safe.

---

## Bugs the tests currently catch

These are real bugs. The tests are written the right way round, so once
the bug is fixed the test passes and keeps passing.

The `security` job in CI has `continue-on-error: true` only until this
list is empty. Delete that line as the last step.

| # | Test | Where | What to change |
|---|---|---|---|
| 1 | A customer cannot collect an order that has just been placed | `app.js:1616` | Only allow it when the order is already `ready` |
| 2 | You cannot get around the collected-order rule for reviews | `app.js:1225` | Fixed by #1 |
| 3 | Changing a waiting time cannot touch another stall's order | `app.js:741` | Add `stallId` to the update filter |
| 4 | Order IDs are long enough not to repeat | `app.js:1344` | Add random characters and a unique index. Right now IDs repeat about every 17 minutes |
| 5 | An uploaded file cannot be saved as a web page | `app.js:75` | Work out the file ending from the file type, not the file name |
| 6 | The session ID changes when you log in | `app.js:159, 309, 371` | Call `req.session.regenerate()` before saving the user |
| 7 | The session cookie is limited to our own site | `app.js:48` | Add `sameSite: 'lax'`, `httpOnly: true`, `secure` in production |
| 8 | The login code is not sent back to the browser | `app.js:124` | Only send `devCode` when `NODE_ENV` is not `production` |
| 9 | Asking for codes over and over gets blocked | `app.js:111` | Add `express-rate-limit` |
| 10 | A customer name cannot escape the script block | `index.ejs:1295` | `JSON.stringify(user).replace(/</g, '\\u003c')` |
| 11 | The app will not start in production without a session secret | `app.js:45` | Throw an error instead of using the fallback text |

Suggested order: **#1 and #3 are one-line changes** and fix three tests
between them. Then #5, #8 and #11, which are a few lines each. #4 and #7
need a bit more thought.

---

## What runs in CI

`.github/workflows/ci.yml` runs on every push and pull request:

```
lint ─┬─ unit ─┬─ integration   (real mongo:7 container)
      │        ├─ security      (does not block yet)
      │        └─ docker        (build the image and check it answers)
```

---

## Writing a new test

Unit tests go in `tests/unit` and must not use the network or database.

Integration tests go in `tests/integration`, start with `startServer()`,
and should only make data through `tests/helpers/fixtures.js` so that
cleanup still works.

```js
const test = require('node:test');
const assert = require('node:assert');

const { startServer } = require('../helpers/server');
const { createClient } = require('../helpers/client');
const fixtures = require('../helpers/fixtures');

let server;

test.before(async () => {
    server = await startServer();
});

test.after(async () => {
    await fixtures.cleanup();
    await fixtures.disconnect();
    await server.stop();
});

test('says what it checks', async () => {
    const client = createClient();
    const result = await client.get('/menu');
    assert.strictEqual(result.status, 200);
});
```

Two rules:

1. **Never put an assertion inside an `if`.** If the condition is false
   the test passes without checking anything, which is worse than having
   no test at all.
2. The integration tests run one file at a time (`--test-concurrency=1`)
   because they share one database.

---

## Things to do later

1. Fix the bugs in the table, then make the security job block the build.
2. Add ESLint once someone can run `npm i -D eslint` and commit the new
   `package-lock.json`.
3. Move `normaliseStatus`, `ORDER_FLOW` and `NEXT_STEP` out of `app.js`
   into `data/orderStatus.js`, so the order steps can be unit tested
   directly instead of only through HTTP.
