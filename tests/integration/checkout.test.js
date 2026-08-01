// ============================================================
//  Checkout and payment tests.
//
//  The unit tests already check that data/pricing.js works on its
//  own. These check that the /pay route actually uses it, and that
//  the order saved in the database has the server's prices in it
//  and not the browser's.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const { startServer } = require('../helpers/server');
const { createClient } = require('../helpers/client');
const fixtures = require('../helpers/fixtures');

// A card expiry two years from now, so these tests do not expire.
function goodExpiry() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear() % 100).padStart(2, '0');
    return month + '/' + year;
}

const EXPIRY = goodExpiry();

let server;
let stall;
let dish;

test.before(async () => {
    server = await startServer();
    stall = await fixtures.createStall('Checkout Test Stall');
    dish = await fixtures.createFood(stall.id, 'Test Laksa', 7.30);
});

test.after(async () => {
    await fixtures.cleanup();
    await fixtures.disconnect();
    await server.stop();
});

// Logs in a fresh customer and returns their client.
async function newCustomer(name) {
    const client = createClient();
    await client.loginAsCustomer(fixtures.testPhone(), name || 'Test Buyer');
    return client;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Waits for a PayNow payment to settle, the same way checkout.ejs does.
async function waitForPayNow(client, reference) {
    for (let i = 0; i < 60; i++) {
        await wait(250);
        const result = await client.get('/api/payments/paynow/' + reference);
        if (result.body.status === 'succeeded') return 'succeeded';
        if (result.body.status === 'expired') return 'expired';
    }
    return 'timed out';
}

// ---- Who is allowed to pay ------------------------------------------

test('you cannot pay without logging in', async () => {
    const client = createClient();
    const items = [{ foodId: dish.id, qty: 1 }];

    const pay = await client.post('/pay', { json: { items: items, method: 'counter' } });
    assert.strictEqual(pay.status, 401);

    const paynow = await client.post('/api/payments/paynow', { json: { items: items } });
    assert.strictEqual(paynow.status, 401);
});

// ---- Prices come from the database ------------------------------------

test('a price edited in the browser is ignored', async () => {
    const client = await newCustomer();

    const result = await client.post('/pay', {
        json: {
            items: [{ foodId: dish.id, qty: 2, price: 0.01, name: 'Free Laksa' }],
            method: 'counter'
        }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.success, true);
    assert.strictEqual(result.body.total, 14.60);

    const order = await fixtures.findOrder(result.body.orders[0].orderId);
    assert.strictEqual(order.total, 14.60);
    assert.strictEqual(order.items[0].price, 7.30);
    assert.strictEqual(order.items[0].name, 'Test Laksa');
});

test('an option that does not exist on the dish is ignored', async () => {
    const optionDish = await fixtures.createFood(stall.id, 'Test Set Meal', 5.00, false, {
        sizes: [{ name: 'Large', priceDiff: 1.50 }],
        spicy: null,
        addons: []
    });

    const client = await newCustomer();
    const result = await client.post('/pay', {
        json: {
            items: [{ foodId: optionDish.id, qty: 1, options: { size: 'Free Upgrade', priceDiff: -99 } }],
            method: 'counter'
        }
    });

    assert.strictEqual(result.body.total, 5.00);
});

test('a quantity outside 1 to 20 is refused', async () => {
    const client = await newCustomer();
    const badQuantities = [0, -3, 21, 1000];

    for (const qty of badQuantities) {
        const result = await client.post('/pay', {
            json: { items: [{ foodId: dish.id, qty: qty }], method: 'counter' }
        });
        assert.strictEqual(result.status, 400, 'quantity ' + qty + ' should be refused');
    }
});

test('an empty cart is refused', async () => {
    const client = await newCustomer();
    const result = await client.post('/pay', { json: { items: [], method: 'counter' } });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /empty/i);
});

test('a dish that does not exist is refused', async () => {
    const client = await newCustomer();
    const result = await client.post('/pay', {
        json: { items: [{ foodId: 'made-up-dish', qty: 1 }], method: 'counter' }
    });

    assert.strictEqual(result.status, 400);
});

// ---- Sold out and closed ------------------------------------------------

test('a sold out dish cannot be ordered', async () => {
    const soldOutDish = await fixtures.createFood(stall.id, 'Test Sold Out Dish', 5.00, true);
    const client = await newCustomer();

    const result = await client.post('/pay', {
        json: { items: [{ foodId: soldOutDish.id, qty: 1 }], method: 'counter' }
    });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /sold out/i);
});

test('a closed stall cannot take orders', async () => {
    const closedStall = await fixtures.createStall('Test Closed Stall', false);
    const closedDish = await fixtures.createFood(closedStall.id, 'Test Closed Dish', 5.00);
    const client = await newCustomer();

    const result = await client.post('/pay', {
        json: { items: [{ foodId: closedDish.id, qty: 1 }], method: 'counter' }
    });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /closed/i);
});

// ---- One order per stall ---------------------------------------------------

test('a cart with two stalls becomes two separate orders', async () => {
    const secondStall = await fixtures.createStall('Second Test Stall');
    const secondDish = await fixtures.createFood(secondStall.id, 'Test Rojak', 4.20);

    const client = await newCustomer();
    const result = await client.post('/pay', {
        json: {
            items: [
                { foodId: dish.id, qty: 1 },
                { foodId: secondDish.id, qty: 2 }
            ],
            method: 'counter'
        }
    });

    assert.strictEqual(result.body.orders.length, 2);
    assert.strictEqual(result.body.total, 15.70);   // 7.30 + 8.40

    const firstOrder = await fixtures.findOrderForStall(result.body.orders[0].orderId, stall.id);
    const secondOrder = await fixtures.findOrderForStall(result.body.orders[1].orderId, secondStall.id);

    assert.strictEqual(firstOrder.total, 7.30);
    assert.strictEqual(secondOrder.total, 8.40);

    // Each merchant should only see their own dishes.
    assert.strictEqual(firstOrder.items.length, 1);
    assert.strictEqual(secondOrder.items[0].name, 'Test Rojak');
});

// ---- Card payments ------------------------------------------------------------

test('a good card creates a paid order and only keeps the last 4 digits', async () => {
    const client = await newCustomer();

    const result = await client.post('/pay', {
        json: {
            items: [{ foodId: dish.id, qty: 1 }],
            method: 'card',
            card: { number: '4242424242424242', expiry: EXPIRY, cvv: '123' }
        }
    });

    assert.strictEqual(result.body.success, true);
    assert.strictEqual(result.body.paymentStatus, 'paid');

    const order = await fixtures.findOrder(result.body.orders[0].orderId);
    assert.strictEqual(order.paymentMethod, 'card');
    assert.strictEqual(order.paymentStatus, 'paid');
    assert.match(order.paymentDetail, /4242$/);

    const orderAsText = JSON.stringify(order);
    assert.strictEqual(orderAsText.includes('4242424242424242'), false, 'the card number must not be saved');
    assert.strictEqual(orderAsText.includes('"cvv"'), false, 'the CVV must not be saved');
});

test('each declined card gives its own reason and makes no order', async () => {
    const declines = {
        '4000000000000002': 'card_declined',
        '4000000000009995': 'insufficient_funds',
        '4000000000000127': 'incorrect_cvc'
    };

    for (const number of Object.keys(declines)) {
        const client = await newCustomer();
        const result = await client.post('/pay', {
            json: {
                items: [{ foodId: dish.id, qty: 1 }],
                method: 'card',
                card: { number: number, expiry: EXPIRY, cvv: '123' }
            }
        });

        assert.strictEqual(result.body.success, false, number + ' should be declined');
        assert.strictEqual(result.body.code, declines[number]);
        assert.strictEqual(result.body.orders, undefined, 'a declined card must not create an order');
    }
});

// ---- Pay at the stall -------------------------------------------------------------

test('a pay at stall order is saved as unpaid', async () => {
    const client = await newCustomer();

    const result = await client.post('/pay', {
        json: { items: [{ foodId: dish.id, qty: 1 }], method: 'counter' }
    });

    const order = await fixtures.findOrder(result.body.orders[0].orderId);
    assert.strictEqual(order.paymentMethod, 'counter');
    assert.strictEqual(order.paymentStatus, 'unpaid');
    assert.strictEqual(order.status, 'pending');
});

test('a made up payment method does not get a free order', async () => {
    const client = await newCustomer();

    const result = await client.post('/pay', {
        json: { items: [{ foodId: dish.id, qty: 1 }], method: 'free-please', card: {} }
    });

    assert.strictEqual(result.body.success, false);
});

// ---- PayNow ---------------------------------------------------------------------------

test('a PayNow QR is created, settles, and can only be spent once', async () => {
    const client = await newCustomer();
    const items = [{ foodId: dish.id, qty: 2 }];

    const qr = await client.post('/api/payments/paynow', { json: { items: items } });
    assert.strictEqual(qr.status, 200);
    assert.strictEqual(qr.body.amount, 14.60);
    assert.ok(qr.body.qr.startsWith('data:image/png;base64,'));
    assert.ok(qr.body.payload.includes('SG.PAYNOW'));

    const settled = await waitForPayNow(client, qr.body.reference);
    assert.strictEqual(settled, 'succeeded');

    const firstUse = await client.post('/pay', {
        json: { items: items, method: 'paynow', paymentReference: qr.body.reference }
    });
    assert.strictEqual(firstUse.body.success, true);
    assert.strictEqual(firstUse.body.paymentStatus, 'paid');

    // The important part: the same payment must not buy a second order.
    const secondUse = await client.post('/pay', {
        json: { items: items, method: 'paynow', paymentReference: qr.body.reference }
    });
    assert.strictEqual(secondUse.status, 400);
    assert.match(secondUse.body.message, /already been used/i);
});

test('a PayNow payment that has not arrived yet cannot be used', async () => {
    const client = await newCustomer();
    const items = [{ foodId: dish.id, qty: 1 }];

    const qr = await client.post('/api/payments/paynow', { json: { items: items } });

    const tooEarly = await client.post('/pay', {
        json: { items: items, method: 'paynow', paymentReference: qr.body.reference }
    });

    assert.strictEqual(tooEarly.status, 400);
    assert.match(tooEarly.body.message, /not received/i);
});

test('you cannot use someone else PayNow payment', async () => {
    const alice = await newCustomer('Test Alice');
    const bob = await newCustomer('Test Bob');
    const items = [{ foodId: dish.id, qty: 1 }];

    const qr = await alice.post('/api/payments/paynow', { json: { items: items } });

    const stolen = await bob.post('/pay', {
        json: { items: items, method: 'paynow', paymentReference: qr.body.reference }
    });
    assert.strictEqual(stolen.status, 400);
    assert.match(stolen.body.message, /could not find/i);

    const peek = await bob.get('/api/payments/paynow/' + qr.body.reference);
    assert.strictEqual(peek.status, 404, 'you should not see another customer payment');
});

test('changing the cart after making the QR is refused', async () => {
    const client = await newCustomer();

    const qr = await client.post('/api/payments/paynow', {
        json: { items: [{ foodId: dish.id, qty: 1 }] }
    });

    const settled = await waitForPayNow(client, qr.body.reference);
    assert.strictEqual(settled, 'succeeded');

    const changed = await client.post('/pay', {
        json: {
            items: [{ foodId: dish.id, qty: 5 }],
            method: 'paynow',
            paymentReference: qr.body.reference
        }
    });

    assert.strictEqual(changed.status, 400);
    assert.match(changed.body.message, /cart changed/i);
});

// ---- Seeing your own orders -----------------------------------------------------------

test('you cannot track another customer order', async () => {
    const alice = await newCustomer('Test Alice');
    const bob = await newCustomer('Test Bob');

    const placed = await alice.post('/pay', {
        json: { items: [{ foodId: dish.id, qty: 1 }], method: 'counter' }
    });
    const orderId = placed.body.orders[0].orderId;

    const page = await bob.get('/track/' + orderId);
    assert.strictEqual(page.status, 200);
    assert.strictEqual(page.text.includes(orderId), false, 'the order must not be shown');

    const api = await bob.get('/api/orders/' + orderId + '/status');
    assert.strictEqual(api.status, 404);
});
