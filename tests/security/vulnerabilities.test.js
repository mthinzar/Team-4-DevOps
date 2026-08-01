// ============================================================
//  SECURITY TESTS
//
//  Every test here checks what the app SHOULD do. Some of them
//  fail right now, on purpose. They are bug reports you can run:
//  fix the code and the test turns green and stays green.
//
//  Tests that fail today start with "BUG:" and the comment above
//  them says which file and line to change. In CI this file runs
//  as its own job that does not block anything, until the list is
//  finished. See TESTING.md.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');

const { startServer } = require('../helpers/server');
const { createClient } = require('../helpers/client');
const fixtures = require('../helpers/fixtures');

let server;
let stall;
let dish;

test.before(async () => {
    server = await startServer();
    stall = await fixtures.createStall('Security Test Stall');
    dish = await fixtures.createFood(stall.id, 'Test Security Dish', 5.00);
});

test.after(async () => {
    await fixtures.cleanup();
    await fixtures.disconnect();
    await server.stop();
});

async function newCustomer(name) {
    const client = createClient();
    await client.loginAsCustomer(fixtures.testPhone(), name || 'Test Security Customer');
    return client;
}

async function buyDish(client) {
    const result = await client.post('/pay', {
        json: { items: [{ foodId: dish.id, qty: 1 }], method: 'counter' }
    });
    return result.body.orders[0].orderId;
}

// ==================================================================
//  1. Orders — app.js line 1616
// ==================================================================

// BUG: /orders/:orderId/collect sets the status to 'completed' without
// checking what the status is now. So a customer can mark an order as
// collected the second they place it, before the stall has even seen it.
// FIX: only allow it when the order is already 'ready'.
test('BUG: a customer cannot collect an order that has just been placed', async () => {
    const client = await newCustomer();
    const orderId = await buyDish(client);

    const result = await client.post('/orders/' + orderId + '/collect');
    assert.notStrictEqual(result.status, 200, 'collecting a new order should be refused');

    const order = await fixtures.findOrder(orderId);
    assert.strictEqual(order.status, 'pending');
});

// BUG: app.js line 1225 correctly says you can only review a dish from an
// order you collected. But because of the bug above, a customer can set
// that status themselves, so the check can be walked around completely.
// FIX: the same fix as above.
test('BUG: you cannot get around the rule about only reviewing collected orders', async () => {
    const client = await newCustomer();
    const orderId = await buyDish(client);

    await client.post('/orders/' + orderId + '/collect');

    const review = await client.post('/api/foods/' + dish.id + '/reviews', {
        json: { rating: 5, comment: 'I never actually collected this' }
    });

    assert.strictEqual(review.status, 403, 'collecting it yourself should not let you review');
});

test('you cannot collect an order that belongs to someone else', async () => {
    const alice = await newCustomer('Test Alice');
    const bob = await newCustomer('Test Bob');
    const orderId = await buyDish(alice);

    const result = await bob.post('/orders/' + orderId + '/collect');
    assert.strictEqual(result.status, 404);
});

test('you cannot review a dish you never ordered', async () => {
    const client = await newCustomer();

    const result = await client.post('/api/foods/' + dish.id + '/reviews', {
        json: { rating: 5 }
    });

    assert.strictEqual(result.status, 403);
    assert.match(result.body.message, /collected/i);
});

test('a star rating outside 1 to 5 is refused', async () => {
    const client = await newCustomer();
    const badRatings = [0, 6, -1, 2.5, true, '5 ', ['5'], null, {}];

    for (const rating of badRatings) {
        const result = await client.post('/api/foods/' + dish.id + '/reviews', {
            json: { rating: rating }
        });
        assert.strictEqual(result.status, 400, JSON.stringify(rating) + ' should be refused');
    }
});

// ==================================================================
//  2. Order IDs — app.js lines 1344 and 741
// ==================================================================

// BUG: the order ID is 'FH-' plus the last 6 digits of the clock, which
// repeats about every 17 minutes, and there is no unique index. At the
// same time the preptime route checks the stall when it reads the order
// but then updates using the order ID only, without the stall.
// So one merchant can change another merchant's order.
// FIX: put stallId in the update filter, and give the order ID more
// random characters plus a unique index.
test('BUG: changing a waiting time cannot touch another stall order', async () => {
    const merchantA = await fixtures.createMerchant('approved', 'Collision Stall A');
    const merchantB = await fixtures.createMerchant('approved', 'Collision Stall B');

    // Two orders that share an ID, which the clock will produce on its own
    // eventually. Here we make it happen on purpose so the test is reliable.
    const sharedOrderId = 'FH-T' + Date.now().toString().slice(-5);
    const originalReadyAt = Date.now() + 600000;

    await fixtures.createOrder(sharedOrderId, merchantA.stall.id, originalReadyAt);
    await fixtures.createOrder(sharedOrderId, merchantB.stall.id, originalReadyAt);

    const clientA = createClient();
    await clientA.loginAsMerchant(merchantA.email, merchantA.password);
    await clientA.post('/merchant/orders/' + sharedOrderId + '/preptime', {
        json: { deltaMinutes: 45 }
    });

    const orderB = await fixtures.findOrderForStall(sharedOrderId, merchantB.stall.id);
    assert.strictEqual(orderB.readyAt, originalReadyAt,
        'merchant A changed merchant B order');
});

// BUG: same cause as above. An order ID made only from the clock is not
// unique for long enough.
test('BUG: order IDs are long enough not to repeat', async () => {
    const client = await newCustomer();
    const orderId = await buyDish(client);
    const numberPart = orderId.replace('FH-', '');

    assert.ok(numberPart.length >= 8,
        'order IDs are only ' + numberPart.length + ' characters and come from the clock, ' +
        'so they repeat about every 17 minutes');
});

// ==================================================================
//  3. Uploads — app.js lines 75 to 83
// ==================================================================

// BUG: the upload check looks at the file type the browser claims, but
// takes the file ending from the file name the browser sends. The browser
// controls both. So saying "image/png" while naming the file .html saves
// an HTML file inside public/images/uploads, which the site then serves
// as a real web page.
// FIX: work out the file ending from the file type we already checked.
test('BUG: an uploaded file cannot be saved as a web page', async () => {
    const merchant = await fixtures.createMerchant('approved', 'Upload Test Stall');
    const client = createClient();
    await client.loginAsMerchant(merchant.email, merchant.password);

    const form = new FormData();
    form.append('name', 'Test Upload Dish');
    form.append('price', '5.00');
    form.append('image', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'attack.html');

    const result = await client.post('/merchant/menu', { form: form });
    assert.strictEqual(result.status, 200, 'a png upload should be accepted');

    const food = await fixtures.findFood(result.body.id);
    assert.doesNotMatch(food.image, /\.(html|htm|svg|js)$/i,
        'the file was saved as ' + food.image + ' and will run as a web page');
});

test('a file that is not an image is refused', async () => {
    const merchant = await fixtures.createMerchant('approved', 'Upload Reject Stall');
    const client = createClient();
    await client.loginAsMerchant(merchant.email, merchant.password);

    const form = new FormData();
    form.append('name', 'Test Bad Upload');
    form.append('price', '5.00');
    form.append('image', new Blob(['#!/bin/sh'], { type: 'application/x-sh' }), 'script.sh');

    const result = await client.post('/merchant/menu', { form: form });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /image/i);
});

// ==================================================================
//  4. Sessions — app.js lines 159, 309, 371 and 48
// ==================================================================

// BUG: none of the three login routes call req.session.regenerate(), so
// the session ID stays the same after logging in. If someone managed to
// set a session ID in your browser first, it would still be valid once
// you log in.
// FIX: regenerate the session before saving the user into it.
test('BUG: the session ID changes when you log in as someone else', async () => {
    const merchant = await fixtures.createMerchant();
    const client = createClient();

    await client.loginAsCustomer(fixtures.testPhone(), 'Test Session Person');
    const customerSession = client.sessionId();
    assert.notStrictEqual(customerSession, '', 'a session cookie should be set');

    await client.loginAsMerchant(merchant.email, merchant.password);
    const merchantSession = client.sessionId();

    assert.notStrictEqual(merchantSession, customerSession,
        'the session ID should change when the user changes');
});

test('the session cookie cannot be read by JavaScript', async () => {
    const client = createClient();
    const login = await client.loginAsCustomer(fixtures.testPhone(), 'Test Cookie Person');

    const sessionCookie = login.setCookie.find(cookie => cookie.startsWith('connect.sid'));
    assert.ok(sessionCookie, 'logging in should set a session cookie');
    assert.match(sessionCookie, /HttpOnly/i);
});

// BUG: app.js line 48 only sets maxAge on the cookie. Without SameSite,
// another website can make a logged-in user's browser send merchant and
// admin form requests. The multipart forms are the risky ones because
// the browser sends them without asking the server first.
// FIX: cookie: { httpOnly: true, sameSite: 'lax', secure: in production }
// and add a CSRF token to the forms.
test('BUG: the session cookie is limited to our own site', async () => {
    const client = createClient();
    const login = await client.loginAsCustomer(fixtures.testPhone(), 'Test SameSite Person');

    const sessionCookie = login.setCookie.find(cookie => cookie.startsWith('connect.sid'));
    assert.ok(sessionCookie, 'logging in should set a session cookie');
    assert.match(sessionCookie, /SameSite/i);
});

// ==================================================================
//  5. The one time code — app.js line 124
// ==================================================================

// BUG: /auth/send-code sends the code back in its own reply as devCode,
// and the page prints it on screen. That means anybody can log in as
// anybody else just by typing their phone number.
// FIX for now: only include devCode when NODE_ENV is not 'production'.
// Real fix: send it by SMS and never put it in the reply.
test('BUG: the login code is not sent back to whoever asked for it', async () => {
    const result = await createClient().post('/auth/send-code', {
        json: { phone: fixtures.testPhone() }
    });

    assert.strictEqual(result.body.devCode, undefined,
        'the code must not travel back to the browser');
});

// BUG: there is no limit on how often codes can be asked for. Once real
// SMS is connected this also costs money.
// FIX: add express-rate-limit to this route.
test('BUG: asking for codes over and over gets blocked', async () => {
    const client = createClient();
    const phone = fixtures.testPhone();
    let blocked = false;

    for (let i = 0; i < 30; i++) {
        const result = await client.post('/auth/send-code', { json: { phone: phone } });
        if (result.status === 429) blocked = true;
    }

    assert.strictEqual(blocked, true,
        '30 requests in a row should hit a rate limit somewhere');
});

// ==================================================================
//  6. Escaping — index.ejs line 1295
// ==================================================================

// BUG: index.ejs writes the user object straight into a <script> block.
// JSON.stringify does not escape the "/" character, so a name containing
// </script> closes the block early and whatever comes next is read as
// HTML by the browser.
// FIX: JSON.stringify(user).replace(/</g, '\\u003c')
test('BUG: a customer name cannot escape from the script block', async () => {
    const client = createClient();
    await client.loginAsCustomer(fixtures.testPhone(), 'Test </script><img src=x onerror=alert(1)>');

    const page = await client.get('/');
    assert.strictEqual(page.status, 200);
    assert.strictEqual(page.text.includes('</script><img src=x'), false,
        'the name broke out of the script block');
});

test('the public review list does not leak internal user IDs', async () => {
    await fixtures.addReview(dish.id, 'Test Reviewer', 5, 'Very nice');

    const result = await createClient().get('/api/foods/' + dish.id + '/reviews');
    assert.strictEqual(result.status, 200);

    const asText = JSON.stringify(result.body.reviews);
    assert.strictEqual(asText.includes('userId'), false, 'userId should be hidden');
    assert.strictEqual(asText.includes('_id'), false, 'the database id should be hidden');
});

// ==================================================================
//  7. Settings — app.js line 45
// ==================================================================

// BUG: if SESSION_SECRET is missing, app.js quietly uses the text
// 'foodhub-dev-secret' instead. If that ever runs in production, anybody
// who reads the code can make their own valid session cookies.
// FIX: throw an error and stop, instead of using the fallback.
test('BUG: the app will not start in production without a session secret', async () => {
    const settings = Object.assign({}, process.env);
    settings.NODE_ENV = 'production';
    settings.PORT = '3199';
    delete settings.SESSION_SECRET;

    const child = spawn('node', ['app.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: settings
    });

    const stopped = await new Promise(resolve => {
        const timer = setTimeout(() => {
            child.kill();
            resolve(false);      // still running after 4 seconds
        }, 4000);

        child.once('exit', () => {
            clearTimeout(timer);
            resolve(true);       // stopped by itself, which is what we want
        });
    });

    assert.strictEqual(stopped, true,
        'the app started in production mode with no SESSION_SECRET');
});
