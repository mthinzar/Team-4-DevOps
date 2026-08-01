// ============================================================
//  Admin tests: approving and removing merchants, managing user
//  accounts, deleting reviews and reading the reports.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const { startServer } = require('../helpers/server');
const { createClient } = require('../helpers/client');
const fixtures = require('../helpers/fixtures');

let server;
let admin;
let adminClient;

test.before(async () => {
    server = await startServer();
    admin = await fixtures.createAdmin('Test Super Admin');
    adminClient = createClient();
    await adminClient.loginAsAdmin(admin.adminId, admin.password);
});

test.after(async () => {
    await fixtures.cleanup();
    await fixtures.disconnect();
    await server.stop();
});

// ---- Approving merchants ---------------------------------------------

test('approving a merchant lets them into their dashboard', async () => {
    const merchant = await fixtures.createMerchant('pending');
    const merchantClient = createClient();
    await merchantClient.loginAsMerchant(merchant.email, merchant.password);

    const before = await merchantClient.get('/merchant/dashboard');
    assert.strictEqual(before.location, '/merchant/pending');

    const approve = await adminClient.post('/admin/merchants/' + merchant.id + '/approve');
    assert.strictEqual(approve.status, 200);
    assert.strictEqual(approve.body.status, 'approved');

    const after = await merchantClient.get('/merchant/dashboard');
    assert.strictEqual(after.status, 200);
});

test('the suspend button switches between suspended and approved', async () => {
    const merchant = await fixtures.createMerchant('approved');

    const suspend = await adminClient.post('/admin/merchants/' + merchant.id + '/suspend');
    assert.strictEqual(suspend.body.status, 'suspended');

    const unsuspend = await adminClient.post('/admin/merchants/' + merchant.id + '/suspend');
    assert.strictEqual(unsuspend.body.status, 'approved');
});

test('rejecting a merchant blocks them but keeps the account', async () => {
    const merchant = await fixtures.createMerchant('pending');

    await adminClient.post('/admin/merchants/' + merchant.id + '/reject');

    const stored = await fixtures.findMerchant(merchant.id);
    assert.strictEqual(stored.status, 'rejected');
});

test('removing a merchant frees the stall but keeps the stall itself', async () => {
    const merchant = await fixtures.createMerchant();

    const result = await adminClient.post('/admin/merchants/' + merchant.id + '/remove');
    assert.strictEqual(result.status, 200);

    const stored = await fixtures.findMerchant(merchant.id);
    assert.strictEqual(stored, null);

    const stall = await fixtures.findStall(merchant.stall.id);
    assert.ok(stall, 'the stall and its history should stay');
    assert.strictEqual(stall.merchantId, null, 'the stall can now be claimed again');
});

test('a freed stall appears in the list for the next merchant signup', async () => {
    const merchant = await fixtures.createMerchant('approved', 'Reclaimable Test Stall');
    await adminClient.post('/admin/merchants/' + merchant.id + '/remove');

    const available = await createClient().get('/api/merchant/available-stalls');
    const stallIds = available.body.stalls.map(stall => stall.id);

    assert.ok(stallIds.includes(merchant.stall.id));
});

test('a password reset gives a new password that works', async () => {
    const merchant = await fixtures.createMerchant();

    const reset = await adminClient.post('/admin/merchants/' + merchant.id + '/reset-password');
    assert.strictEqual(reset.status, 200);
    assert.ok(reset.body.tempPassword.length >= 8);

    const oldPassword = await createClient().post('/merchant/login', {
        json: { email: merchant.email, password: merchant.password }
    });
    assert.strictEqual(oldPassword.status, 400, 'the old password should stop working');

    const newPassword = await createClient().post('/merchant/login', {
        json: { email: merchant.email, password: reset.body.tempPassword }
    });
    assert.strictEqual(newPassword.body.success, true);
});

test('actions on a merchant that does not exist give 404, not a crash', async () => {
    const madeUpId = '000000000000000000000000';
    const actions = ['approve', 'reject', 'suspend', 'remove', 'reset-password'];

    for (const action of actions) {
        const result = await adminClient.post('/admin/merchants/' + madeUpId + '/' + action);
        assert.strictEqual(result.status, 404, action + ' should give 404');
    }
});

// ---- Customer accounts -----------------------------------------------------

test('disabling a customer stops their next login', async () => {
    const customer = await fixtures.createCustomer('Test Disable Target');

    const disable = await adminClient.post('/admin/users/customers/' + customer.id + '/toggle-disable');
    assert.strictEqual(disable.body.disabled, true);

    const client = createClient();
    const sent = await client.post('/auth/send-code', { json: { phone: customer.phone } });
    const verify = await client.post('/auth/verify', {
        json: { phone: customer.phone, code: sent.body.devCode }
    });
    assert.strictEqual(verify.status, 403);

    const enable = await adminClient.post('/admin/users/customers/' + customer.id + '/toggle-disable');
    assert.strictEqual(enable.body.disabled, false);
});

test('deleting a customer removes them from the database', async () => {
    const customer = await fixtures.createCustomer('Test Delete Target');

    const result = await adminClient.post('/admin/users/customers/' + customer.id + '/delete');
    assert.strictEqual(result.status, 200);

    const database = await fixtures.connect();
    const stored = await database.collection('users').findOne({ phone: customer.phone });
    assert.strictEqual(stored, null);
});

// ---- Admin accounts ------------------------------------------------------------

test('a new admin can be created and can log in', async () => {
    const newAdminId = fixtures.PREFIX + 'admin-new-' + fixtures.newId();

    const created = await adminClient.post('/admin/users/admins/new', {
        json: { adminId: newAdminId, password: 'strongenough', name: 'Test Created Admin' }
    });
    assert.strictEqual(created.status, 200);

    const login = await createClient().post('/admin/login', {
        json: { adminId: newAdminId, password: 'strongenough' }
    });
    assert.strictEqual(login.body.success, true);
});

test('an admin ID that is already used is refused', async () => {
    const result = await adminClient.post('/admin/users/admins/new', {
        json: { adminId: admin.adminId, password: 'strongenough', name: 'Copy' }
    });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /already taken/i);
});

test('a password shorter than 6 characters is refused', async () => {
    const result = await adminClient.post('/admin/users/admins/new', {
        json: { adminId: fixtures.PREFIX + 'weak-' + fixtures.newId(), password: 'abc', name: 'Weak' }
    });

    assert.strictEqual(result.status, 400);
});

test('an admin cannot delete their own account', async () => {
    const result = await adminClient.post('/admin/users/admins/' + admin.id + '/delete');

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /your own account/i);
});

test('an admin can delete a different admin', async () => {
    const other = await fixtures.createAdmin('Test Deletable Admin');

    const result = await adminClient.post('/admin/users/admins/' + other.id + '/delete');
    assert.strictEqual(result.status, 200);

    const database = await fixtures.connect();
    const stored = await database.collection('admins').findOne({ adminId: other.adminId });
    assert.strictEqual(stored, null);
});

// ---- Reviews ---------------------------------------------------------------------

test('an admin can delete a review', async () => {
    const stall = await fixtures.createStall('Moderation Test Stall');
    const food = await fixtures.createFood(stall.id, 'Test Reviewed Dish', 5.00);
    const reviewId = await fixtures.addReview(food.id, 'Test Reviewer', 1, 'Needs removing');

    const result = await adminClient.post('/admin/reviews/' + reviewId + '/delete');
    assert.strictEqual(result.status, 200);

    const left = await fixtures.countReviews(food.id);
    assert.strictEqual(left, 0);
});

test('deleting a review that does not exist gives 404', async () => {
    const result = await adminClient.post('/admin/reviews/000000000000000000000000/delete');
    assert.strictEqual(result.status, 404);
});

// ---- Reports ------------------------------------------------------------------------

test('the reports page sends back all the numbers it should', async () => {
    const result = await adminClient.get('/api/admin/reports-data');
    assert.strictEqual(result.status, 200);

    const data = result.body;
    assert.strictEqual(data.commissionRate, 0.10);
    assert.strictEqual(data.ordersByDay.labels.length, 7);
    assert.strictEqual(data.ordersByDay.counts.length, 7);
    assert.strictEqual(data.revenueByMonth.labels.length, 6);

    const numbers = ['salesToday', 'salesWeek', 'salesMonth', 'revenueToday', 'cancelledRate'];
    for (const name of numbers) {
        assert.strictEqual(typeof data[name], 'number', name + ' should be a number');
        assert.ok(Number.isFinite(data[name]), name + ' should be a real number');
    }

    assert.ok(data.cancelledRate >= 0);
    assert.ok(data.cancelledRate <= 100);
    assert.deepStrictEqual(Object.keys(data.feedbackSummary.distribution).sort(), ['1', '2', '3', '4', '5']);
});

test('the platform commission is 10 percent of each month sales', async () => {
    const result = await adminClient.get('/api/admin/reports-data');
    const sales = result.body.revenueByMonth.sales;
    const commission = result.body.revenueByMonth.commission;

    for (let i = 0; i < sales.length; i++) {
        const expected = Math.round(sales[i] * 0.10 * 100) / 100;
        const difference = Math.abs(commission[i] - expected);
        assert.ok(difference < 0.011, 'month ' + i + ': ' + commission[i] + ' should be about ' + expected);
    }
});

test('every admin page loads without an error', async () => {
    const pages = [
        '/admin/dashboard',
        '/admin/merchants',
        '/admin/orders',
        '/admin/stores',
        '/admin/reports',
        '/admin/reviews',
        '/admin/users'
    ];

    for (const page of pages) {
        const result = await adminClient.get(page);
        assert.strictEqual(result.status, 200, page + ' gave ' + result.status);
    }
});
