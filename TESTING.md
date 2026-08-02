# Testing

Automated tests for FoodHub.

**Nothing here needs MongoDB or Docker.** The tests only cover functions
that work on their own, so `npm test` runs on any laptop with Node
installed, and the CI pipeline is just install, lint, test.

They also use the test runner built into Node, so there is nothing new to
install. No Jest, no Mocha. That matters because adding them would change
`package-lock.json`, and then `npm ci` would break for everyone until they
reinstalled.

---

## How to run them

```bash
npm install        # once
npm test           # lint + all 108 unit tests, about 1 second
```

Other commands:

```bash
npm run test:unit       # just the tests
npm run test:coverage   # tests plus a coverage report
npm run test:watch      # re-runs whenever you save a file
npm run lint            # syntax + template check only
npm run test:issues     # the known bugs (these fail on purpose)
```

---

## What is tested

139 tests across five files.

| Test file | Tests | What it covers |
|---|---|---|
| `tests/unit/pricing.test.js` | `data/pricing.js` | How much a customer is charged |
| `tests/unit/payments.test.js` | `data/payments.js` | Card rules and the PayNow QR code |
| `tests/unit/orderStatus.test.js` | `data/orderStatus.js` | The order steps on the merchant page |
| `tests/unit/validation.test.js` | `data/validation.js` | Every form check on the website |
| `tests/unit/cart.test.js` | `public/js/cart.js` | The shopping cart the customer clicks |

### The most important test

The cart lives in the browser, in localStorage, so anyone can edit it
before it is sent. This test proves that does not matter:

```js
test('priceCart ignores the price sent by the browser', () => {
    const editedCart = [{ foodId: 'western-burger', qty: 2, price: 0.01 }];
    const result = pricing.priceCart(editedCart, menu);

    assert.strictEqual(result.lines[0].price, 6.50);   // from the database
    assert.strictEqual(result.total, 13.00);
});
```

### The shopping cart

`public/js/cart.js` normally runs in the browser, but all of it is plain
functions, so the tests load it in Node with a small stand-in for
`localStorage` and `document` (about 15 lines at the top of
`cart.test.js`). Every place cart.js touches the page is already written
as "if the element exists", so a stand-in that finds nothing is enough.

One line was added to the bottom of `cart.js` so Node can load it. In a
browser `module` does not exist, so the line is skipped and **nothing
about the website changes**.

This covers Add to cart, the + and - buttons, Remove, the badge number,
the total, the Reorder button, and the cart surviving a page refresh.

### Coverage

```
file            | line % | branch % | funcs %
orderStatus.js  | 100.00 |   100.00 |  100.00
payments.js     | 100.00 |    97.67 |  100.00
pricing.js      |  98.02 |    95.56 |  100.00
validation.js   | 100.00 |   100.00 |  100.00
cart.js         |  70.67 |    90.00 |   91.67
```

`cart.js` is at 70% because the parts that draw the cart drawer on
screen (`updateCartUI`, `openCartDrawer`, the page-load handler) need a
real browser. The cart's logic is fully covered; its appearance is not.

The two uncovered lines in `pricing.js` are the `total > 0` check. It
cannot be reached, because `unitPrice()` already refuses any dish that
would price at zero or less. It is a safety net kept on purpose, so
please do not delete it to make the number go up.

---

## Two new files in data/

To test the website's own rules, some logic was moved out of `app.js`
into two new modules. `app.js` now loads them instead of holding its own
copy. **Nothing about how the website behaves has changed** — the code is
the same, it just lives somewhere it can be reached from a test.

**`data/orderStatus.js`** — the order steps.

Moved out of `app.js` lines 595 to 623: `ORDER_FLOW`,
`ORDER_STATUS_LABELS`, `NEXT_STEP`, `CANCELLABLE`, `PAYMENT_LABELS`,
`normaliseStatus`, and the order id and queue number.

Two new functions replace the checks that used to sit inside the status
route, so the same rule is now testable and only written once:

```js
canCancel(current)             // can this order still be cancelled?
canMoveTo(current, requested)  // is this the one step it may take next?
```

**`data/validation.js`** — the form checks.

Moved out of `app.js`: `validPhone`, `merchantStatusMessage`, the email
pattern (which was copied in two places), the six-character password rule
(copied in three), the dish name and price check, the upload type check
and the upload file name. `slugify` moved here from `data/merchants.js`,
which now loads it from here and still exports it, so nothing else
changed.

The email and password rules being in one place instead of five is worth
mentioning on its own — before this, changing the minimum password length
meant remembering three separate lines.

---

## Known bugs

`tests/known-issues/known-issues.test.js` holds tests for bugs we already
know about. They fail on purpose. Each one has a comment saying what is
wrong and the code to fix it.

Run them with `npm run test:issues`. They live in their own folder so they
do not turn the build red, and CI runs them as a separate step that
reports without blocking.

| Test | Where | What to change |
|---|---|---|
| An upload cannot be saved with a web page ending | `data/validation.js` | Work out the file ending from the file type, not the file name |
| An upload always ends in a real picture ending | `data/validation.js` | Same fix |
| Two orders 17 minutes apart get different ids | `data/orderStatus.js` | Use `crypto.randomBytes` and add a unique index |
| An order id has enough characters | `data/orderStatus.js` | Same fix |
| A quantity that is not a number is refused | `data/pricing.js` | Check `typeof qty === 'number'` first |

Once they all pass, move them into `tests/unit` and delete the
`known-issues` job from the workflow file.

### What is NOT tested

Being clear about this, because the numbers look better than the
coverage really is:

| | Tested |
|---|---|
| Routes in `app.js` | **0 of 60** |
| Page templates rendered | **0 of 25** |
| Browser JavaScript inside the `.ejs` pages | **0 of about 2,300 lines** |

Nothing here loads a page, clicks a button, logs anyone in, or writes to
the database. `data/adminStats.js`, `data/merchantStats.js`,
`data/reviews.js`, `data/admins.js` and `data/dishes.js` are not covered
at all, because every function in them talks to MongoDB.

The clearest example of the limit: `canMoveTo('pending', 'completed')`
returns false and is tested from every angle. But the route that uses it
also has to check the order belongs to that merchant's stall. If someone
deleted that check tomorrow, **all 139 tests would still pass.**

Catching that needs integration tests (which need a database), and
catching a broken button or a page that will not load needs browser
tests such as Playwright (which needs both).

### Bugs that unit tests cannot catch

Being honest about the limit of this approach: unit tests check functions
on their own, so they cannot catch bugs that only appear when the routes,
sessions and database work together. These were found by reading the code
and are still open:

- `/orders/:orderId/collect` (`app.js:1616`) does not check the current
  status, so a customer can mark their own order collected the moment
  they place it — which also gets around the rule that you can only
  review food you collected.
- `/merchant/orders/:orderId/preptime` (`app.js:741`) checks the stall
  when it reads the order but not when it writes, so with a repeated
  order id one merchant can change another's order.
- `/auth/send-code` (`app.js:124`) sends the login code back in its own
  reply, so anyone can log in as anyone.
- No login route calls `req.session.regenerate()`.
- The session cookie has no `sameSite` or `secure` setting.
- `index.ejs:1295` writes the user's name into a `<script>` block without
  escaping `<`.

Catching those automatically would need integration tests, which need a
database.

---

## Writing a new test

```js
const test = require('node:test');
const assert = require('node:assert');

const validation = require('../../data/validation');

test('says what it checks', () => {
    assert.strictEqual(validation.validPhone('91234567'), true);
});
```

Two rules:

1. **Never put an assertion inside an `if`.** If the condition is false
   the test passes without checking anything, which is worse than having
   no test at all.
2. Unit tests must not use the network, the database or the file system.
   If you need those, the function probably needs splitting up first.

---

## What runs in CI

`.github/workflows/ci.yml`, on every push and pull request:

```
test           checkout -> npm ci -> lint -> unit tests -> coverage
known-issues   the bugs above (reports only, never blocks)
```

---

## Things to do later

1. Fix the known bugs, then move those tests into `tests/unit`.
2. Add ESLint once someone can run `npm i -D eslint` and commit the
   updated `package-lock.json`.
3. If integration tests are ever wanted, `data/` is already separated
   from the routes, so that is the natural next step.
