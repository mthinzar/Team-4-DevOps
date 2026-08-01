// ============================================================
//  Merchant tests: managing the menu and moving orders along.
//
//  Two merchants are logged in at the same time, Alice and Bob,
//  because most of these tests are about making sure one merchant
//  cannot see or change anything belonging to the other one.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const { startServer } = require('../helpers/server');
const { createClient } = require('../helpers/client');
const fixtures = require('../helpers/fixtures');

let server;
let alice;
let bob;
let aliceClient;
let bobClient;

test.before(async () => {
    server = await startServer();

    alice = await fixtures.createMerchant('approved', 'Alice Test Stall');
    bob = await fixtures.createMerchant('approved', 'Bob Test Stall');

    aliceClient = createClient();
    bobClient = createClient();
    await aliceClient.loginAsMerchant(alice.email, alice.password);
    await bobClient.loginAsMerchant(bob.email, bob.password);
});

test.after(async () => {
    await fixtures.cleanup();
    await fixtures.disconnect();
    await server.stop();
});

// Builds the form the merchant menu page sends.
function dishForm(name, price, badge) {
    const form = new FormData();
    form.append('name', name);
    form.append('price', String(price));
    form.append('badge', badge || '');
    return form;
}

// Makes a customer buy a dish, and returns the order id.
async function customerBuys(food) {
    const client = createClient();
    await client.loginAsCustomer(fixtures.testPhone(), 'Test Diner');

    const result = await client.post('/pay', {
        json: { items: [{ foodId: food.id, qty: 1 }], method: 'counter' }
    });

    return result.body.orders[0].orderId;
}

// ---- Who can get in ------------------------------------------------

test('merchant pages send visitors who are not logged in to the home page', async () => {
    const pages = ['/merchant/dashboard', '/merchant/menu', '/merchant/orders', '/merchant/stats'];

    for (const page of pages) {
        const result = await createClient().get(page);
        assert.strictEqual(result.status, 302, page + ' should redirect');
        assert.strictEqual(result.location, '/');
    }
});

test('merchant actions answer 401 when nobody is logged in', async () => {
    const result = await createClient().post('/merchant/shop-status');

    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.body.success, false);
});

// ---- Adding and changing dishes -----------------------------------------

test('a merchant can add a dish and it belongs to their own stall', async () => {
    const result = await aliceClient.post('/merchant/menu', {
        form: dishForm('Alice Signature Noodles', 8.40, 'bestseller')
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.success, true);

    const food = await fixtures.findFood(result.body.id);
    assert.strictEqual(food.stall_id, alice.stall.id);
    assert.strictEqual(food.price, 8.40);
    assert.strictEqual(food.soldOut, false);
});

test('a dish with no name or a bad price is refused', async () => {
    const badDishes = [
        ['', 5.00],
        ['No Price Dish', 0],
        ['Negative Dish', -4],
        ['Not A Number Dish', 'free']
    ];

    for (const dish of badDishes) {
        const result = await aliceClient.post('/merchant/menu', { form: dishForm(dish[0], dish[1]) });
        assert.strictEqual(result.status, 400, 'should refuse: ' + dish[0] + ' at ' + dish[1]);
    }
});

test('Bob cannot edit, hide or delete Alice dishes', async () => {
    const created = await aliceClient.post('/merchant/menu', {
        form: dishForm('Alice Private Dish', 6.00)
    });
    const foodId = created.body.id;

    const edit = await bobClient.post('/merchant/menu/' + foodId, {
        form: dishForm('Stolen Dish', 0.10)
    });
    assert.strictEqual(edit.status, 404);

    const toggle = await bobClient.post('/merchant/menu/' + foodId + '/toggle-soldout');
    assert.strictEqual(toggle.status, 404);

    const remove = await bobClient.post('/merchant/menu/' + foodId + '/delete');
    assert.strictEqual(remove.status, 404);

    // Check nothing actually changed.
    const food = await fixtures.findFood(foodId);
    assert.strictEqual(food.name, 'Alice Private Dish');
    assert.strictEqual(food.price, 6.00);
    assert.strictEqual(food.soldOut, false);
});

test('sold out can be switched on and off again', async () => {
    const created = await aliceClient.post('/merchant/menu', {
        form: dishForm('Alice Toggle Dish', 3.00)
    });

    const soldOut = await aliceClient.post('/merchant/menu/' + created.body.id + '/toggle-soldout');
    assert.strictEqual(soldOut.body.soldOut, true);

    const backOn = await aliceClient.post('/merchant/menu/' + created.body.id + '/toggle-soldout');
    assert.strictEqual(backOn.body.soldOut, false);
});

test('deleting a dish also deletes its reviews', async () => {
    const created = await aliceClient.post('/merchant/menu', {
        form: dishForm('Alice Doomed Dish', 4.00)
    });
    const foodId = created.body.id;

    await fixtures.addReview(foodId, 'Test Reviewer', 5, 'Very nice');
    const before = await fixtures.countReviews(foodId);
    assert.strictEqual(before, 1);

    await aliceClient.post('/merchant/menu/' + foodId + '/delete');

    const after = await fixtures.countReviews(foodId);
    assert.strictEqual(after, 0);

    const food = await fixtures.findFood(foodId);
    assert.strictEqual(food, null);
});

test('the menu page only shows the merchant own dishes', async () => {
    await aliceClient.post('/merchant/menu', { form: dishForm('Alice Visible Dish', 5.00) });
    await bobClient.post('/merchant/menu', { form: dishForm('Bob Visible Dish', 5.00) });

    const page = await aliceClient.get('/merchant/menu');

    assert.ok(page.text.includes('Alice Visible Dish'));
    assert.strictEqual(page.text.includes('Bob Visible Dish'), false);
});

// ---- Opening and closing the shop --------------------------------------------

test('the shop open switch changes the stall in the database', async () => {
    const first = await aliceClient.post('/merchant/shop-status');
    const second = await aliceClient.post('/merchant/shop-status');

    assert.notStrictEqual(first.body.isOpen, second.body.isOpen);

    const stall = await fixtures.findStall(alice.stall.id);
    assert.strictEqual(stall.isOpen, second.body.isOpen);
});

// ---- Moving orders along ---------------------------------------------------------

test('an order goes through the steps one at a time', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Flow Dish', 5.00);
    const orderId = await customerBuys(food);

    const preparing = await aliceClient.post('/merchant/orders/' + orderId + '/status', {
        json: { status: 'preparing' }
    });
    assert.strictEqual(preparing.status, 200);
    assert.strictEqual(preparing.body.label, 'Preparing');

    const ready = await aliceClient.post('/merchant/orders/' + orderId + '/status', {
        json: { status: 'ready' }
    });
    assert.strictEqual(ready.status, 200);
    assert.strictEqual(ready.body.label, 'Ready for collection');

    const collected = await aliceClient.post('/merchant/orders/' + orderId + '/status', {
        json: { status: 'completed' }
    });
    assert.strictEqual(collected.status, 200);
    assert.strictEqual(collected.body.label, 'Collected');

    const order = await fixtures.findOrder(orderId);
    assert.strictEqual(order.status, 'completed');
    assert.ok(order.collectedAt);
});

test('an order cannot jump straight to collected', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Skip Dish', 5.00);
    const orderId = await customerBuys(food);

    const result = await aliceClient.post('/merchant/orders/' + orderId + '/status', {
        json: { status: 'completed' }
    });

    assert.strictEqual(result.status, 400);

    const order = await fixtures.findOrder(orderId);
    assert.strictEqual(order.status, 'pending');
});

test('an order cannot go backwards', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Rewind Dish', 5.00);
    const orderId = await customerBuys(food);

    await aliceClient.post('/merchant/orders/' + orderId + '/status', { json: { status: 'preparing' } });

    const backwards = await aliceClient.post('/merchant/orders/' + orderId + '/status', {
        json: { status: 'pending' }
    });
    assert.strictEqual(backwards.status, 400);

    const order = await fixtures.findOrder(orderId);
    assert.strictEqual(order.status, 'preparing');
});

test('an order can be cancelled early but not once it is ready', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Cancel Dish', 5.00);

    const earlyOrderId = await customerBuys(food);
    const cancelledEarly = await aliceClient.post('/merchant/orders/' + earlyOrderId + '/status', {
        json: { status: 'cancelled' }
    });
    assert.strictEqual(cancelledEarly.status, 200);

    const lateOrderId = await customerBuys(food);
    await aliceClient.post('/merchant/orders/' + lateOrderId + '/status', { json: { status: 'preparing' } });
    await aliceClient.post('/merchant/orders/' + lateOrderId + '/status', { json: { status: 'ready' } });

    const cancelledLate = await aliceClient.post('/merchant/orders/' + lateOrderId + '/status', {
        json: { status: 'cancelled' }
    });
    assert.strictEqual(cancelledLate.status, 400);

    const order = await fixtures.findOrder(lateOrderId);
    assert.strictEqual(order.status, 'ready');
});

test('a made up status is refused', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Bad Status Dish', 5.00);
    const orderId = await customerBuys(food);

    const badStatuses = ['delivered', 'refunded', '', 'PENDING', 'free'];

    for (const status of badStatuses) {
        const result = await aliceClient.post('/merchant/orders/' + orderId + '/status', {
            json: { status: status }
        });
        assert.strictEqual(result.status, 400, '"' + status + '" should be refused');
    }
});

test('Bob cannot change the status of Alice orders', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Isolation Dish', 5.00);
    const orderId = await customerBuys(food);

    const result = await bobClient.post('/merchant/orders/' + orderId + '/status', {
        json: { status: 'preparing' }
    });
    assert.strictEqual(result.status, 404);

    const order = await fixtures.findOrder(orderId);
    assert.strictEqual(order.status, 'pending');
});

test('the orders page only shows the merchant own orders', async () => {
    const aliceDish = await fixtures.createFood(alice.stall.id, 'Alice Queue Dish', 5.00);
    const bobDish = await fixtures.createFood(bob.stall.id, 'Bob Queue Dish', 5.00);

    await customerBuys(aliceDish);
    await customerBuys(bobDish);

    const page = await aliceClient.get('/merchant/orders');

    assert.ok(page.text.includes('Alice Queue Dish'));
    assert.strictEqual(page.text.includes('Bob Queue Dish'), false);
});

// ---- Taking payment at the stall -----------------------------------------------

test('mark as paid works once and not twice', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Counter Dish', 5.00);
    const orderId = await customerBuys(food);

    const first = await aliceClient.post('/merchant/orders/' + orderId + '/mark-paid');
    assert.strictEqual(first.status, 200);

    const order = await fixtures.findOrder(orderId);
    assert.strictEqual(order.paymentStatus, 'paid');

    const second = await aliceClient.post('/merchant/orders/' + orderId + '/mark-paid');
    assert.strictEqual(second.status, 404, 'an order should not be paid twice');
});

// ---- Waiting time ----------------------------------------------------------------

test('waiting time can be changed and never goes into the past', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Prep Dish', 5.00);
    const orderId = await customerBuys(food);

    const later = await aliceClient.post('/merchant/orders/' + orderId + '/preptime', {
        json: { deltaMinutes: 10 }
    });
    assert.strictEqual(later.status, 200);
    assert.ok(later.body.readyAt > Date.now());

    const muchEarlier = await aliceClient.post('/merchant/orders/' + orderId + '/preptime', {
        json: { deltaMinutes: -999 }
    });
    assert.ok(muchEarlier.body.readyAt >= Date.now() - 1000, 'ready time should stop at now');
    assert.ok(muchEarlier.body.prepTimeSeconds >= 60, 'prep time should not go below 60 seconds');
});

test('a waiting time change that is not a number is refused', async () => {
    const food = await fixtures.createFood(alice.stall.id, 'Test Bad Prep Dish', 5.00);
    const orderId = await customerBuys(food);

    const result = await aliceClient.post('/merchant/orders/' + orderId + '/preptime', {
        json: { deltaMinutes: 'lots' }
    });

    assert.strictEqual(result.status, 400);
});

// ---- Statistics --------------------------------------------------------------------

test('merchant statistics only count their own stall', async () => {
    const bobDish = await fixtures.createFood(bob.stall.id, 'Bob Stats Dish', 99.00);
    await customerBuys(bobDish);

    const stats = await aliceClient.get('/api/merchant/stats-data');
    assert.strictEqual(stats.status, 200);

    const dishNames = stats.body.bestSelling.map(dish => dish.name);
    assert.strictEqual(dishNames.includes('Bob Stats Dish'), false,
        'another merchant dish should not appear here');
});
