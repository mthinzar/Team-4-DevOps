// ============================================================
//  Login tests for all three types of user: customer (phone
//  code), merchant (email + password) and admin (ID + password).
//
//  Needs MongoDB running. See TESTING.md.
// ============================================================

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

// ---- Customer: phone code ---------------------------------------

test('send-code refuses a phone number that is not a Singapore mobile', async () => {
    const badNumbers = ['12345678', '9123', '712345678', 'abcdefgh', ''];

    for (const phone of badNumbers) {
        const result = await createClient().post('/auth/send-code', { json: { phone: phone } });
        assert.strictEqual(result.status, 400, phone + ' should be refused');
        assert.strictEqual(result.body.success, false);
    }
});

test('send-code accepts numbers starting with 6, 8 or 9', async () => {
    const goodNumbers = ['61234567', '8123 4567', '9123 4567'];

    for (const phone of goodNumbers) {
        const result = await createClient().post('/auth/send-code', { json: { phone: phone } });
        assert.strictEqual(result.status, 200, phone + ' should be accepted');
        assert.match(String(result.body.devCode), /^\d{6}$/);
    }
});

test('verify refuses the wrong code', async () => {
    const client = createClient();
    const phone = fixtures.testPhone();

    const sent = await client.post('/auth/send-code', { json: { phone: phone, name: 'Test Person' } });
    const wrongCode = String((Number(sent.body.devCode) + 1) % 1000000).padStart(6, '0');

    const result = await client.post('/auth/verify', {
        json: { phone: phone, code: wrongCode, name: 'Test Person' }
    });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /incorrect/i);
});

test('verify refuses a code that was never sent to that number', async () => {
    const result = await createClient().post('/auth/verify', {
        json: { phone: fixtures.testPhone(), code: '000000' }
    });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /expired|new one/i);
});

test('a new phone number cannot log in without giving a name', async () => {
    const client = createClient();
    const phone = fixtures.testPhone();

    const sent = await client.post('/auth/send-code', { json: { phone: phone } });
    const result = await client.post('/auth/verify', {
        json: { phone: phone, code: sent.body.devCode }
    });

    assert.strictEqual(result.status, 400);
    assert.match(result.body.message, /sign up/i);
});

test('a new customer account is made the first time they log in', async () => {
    const client = createClient();
    const phone = fixtures.testPhone();

    const login = await client.loginAsCustomer(phone, 'Test Newcomer');
    assert.strictEqual(login.body.success, true);

    const database = await fixtures.connect();
    const user = await database.collection('users').findOne({ phone: phone });

    assert.ok(user, 'the user should now be in the database');
    assert.strictEqual(user.name, 'Test Newcomer');
    assert.strictEqual(user.disabled, false);
});

test('a customer who has been disabled cannot log in', async () => {
    const customer = await fixtures.createCustomer('Test Blocked Person', true);
    const client = createClient();

    const sent = await client.post('/auth/send-code', { json: { phone: customer.phone } });
    const result = await client.post('/auth/verify', {
        json: { phone: customer.phone, code: sent.body.devCode }
    });

    assert.strictEqual(result.status, 403);
    assert.match(result.body.message, /disabled/i);
});

test('a code can only be used once', async () => {
    const client = createClient();
    const phone = fixtures.testPhone();

    const sent = await client.post('/auth/send-code', { json: { phone: phone, name: 'Test Replay' } });

    const first = await client.post('/auth/verify', {
        json: { phone: phone, code: sent.body.devCode, name: 'Test Replay' }
    });
    assert.strictEqual(first.body.success, true);

    const second = await createClient().post('/auth/verify', {
        json: { phone: phone, code: sent.body.devCode }
    });
    assert.strictEqual(second.status, 400, 'the same code must not work twice');
});

test('logging out ends the customer session', async () => {
    const client = createClient();
    await client.loginAsCustomer(fixtures.testPhone(), 'Test Logout');

    await client.post('/auth/logout');

    const orders = await client.get('/orders');
    assert.strictEqual(orders.status, 302);
    assert.match(orders.location, /loginRequired/);
});

// ---- Merchant: email and password ---------------------------------------

test('merchant login gives the same message for a wrong password and an unknown email', async () => {
    const merchant = await fixtures.createMerchant();

    const wrongPassword = await createClient().post('/merchant/login', {
        json: { email: merchant.email, password: 'wrong-password' }
    });
    const unknownEmail = await createClient().post('/merchant/login', {
        json: { email: 'nobody-' + fixtures.newId() + '@test.invalid', password: 'anything' }
    });

    assert.strictEqual(wrongPassword.status, 400);
    assert.strictEqual(unknownEmail.status, 400);
    assert.strictEqual(wrongPassword.body.message, unknownEmail.body.message,
        'the same message stops people finding out which emails exist');
});

test('merchant signup refuses a bad email, a short password or a mismatch', async () => {
    const badSignups = [
        { email: 'not-an-email', password: 'abcdef', confirmPassword: 'abcdef' },
        { email: 'short-' + fixtures.newId() + '@test.invalid', password: 'abc', confirmPassword: 'abc' },
        { email: 'nomatch-' + fixtures.newId() + '@test.invalid', password: 'abcdef', confirmPassword: 'ghijkl' }
    ];

    for (const signup of badSignups) {
        const form = new FormData();
        form.append('email', signup.email);
        form.append('password', signup.password);
        form.append('confirmPassword', signup.confirmPassword);
        form.append('stallMode', 'new');
        form.append('newStallName', 'Test Stall');

        const result = await createClient().post('/merchant/signup', { form: form });
        assert.strictEqual(result.status, 400, signup.email + ' should be refused');
    }
});

test('a merchant waiting for approval is sent to the pending page', async () => {
    const merchant = await fixtures.createMerchant('pending');
    const client = createClient();
    await client.loginAsMerchant(merchant.email, merchant.password);

    const dashboard = await client.get('/merchant/dashboard');

    assert.strictEqual(dashboard.status, 302);
    assert.strictEqual(dashboard.location, '/merchant/pending');
});

test('suspending a merchant blocks them straight away, not at their next login', async () => {
    // app.js checks the merchant status in the database on every request
    // instead of trusting the session. This test proves that works.
    const merchant = await fixtures.createMerchant('approved');
    const client = createClient();
    await client.loginAsMerchant(merchant.email, merchant.password);

    const before = await client.get('/merchant/dashboard');
    assert.strictEqual(before.status, 200);

    await fixtures.setMerchantStatus(merchant.id, 'suspended');

    const after = await client.get('/merchant/dashboard');
    assert.strictEqual(after.status, 302);
    assert.strictEqual(after.location, '/merchant/pending');
});

// ---- Admin --------------------------------------------------------------

test('admin login refuses a wrong password', async () => {
    const admin = await fixtures.createAdmin();

    const result = await createClient().post('/admin/login', {
        json: { adminId: admin.adminId, password: 'wrong-password' }
    });

    assert.strictEqual(result.status, 400);
});

test('admin pages send visitors who are not logged in to the login page', async () => {
    const pages = ['/admin/dashboard', '/admin/merchants', '/admin/orders', '/admin/users', '/admin/reports'];

    for (const page of pages) {
        const result = await createClient().get(page);
        assert.strictEqual(result.status, 302, page + ' should redirect');
        assert.strictEqual(result.location, '/admin/login');
    }
});

test('admin API addresses answer 401 instead of redirecting', async () => {
    const result = await createClient().get('/api/admin/reports-data');

    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.body.success, false);
});

// ---- One role at a time ----------------------------------------------------

test('logging in as one type of user logs you out of the others', async () => {
    const merchant = await fixtures.createMerchant();
    const admin = await fixtures.createAdmin();
    const client = createClient();

    await client.loginAsCustomer(fixtures.testPhone(), 'Test Switcher');
    const asCustomer = await client.get('/orders');
    assert.strictEqual(asCustomer.status, 200);

    await client.loginAsMerchant(merchant.email, merchant.password);
    const stillCustomer = await client.get('/orders');
    assert.strictEqual(stillCustomer.status, 302, 'the customer session should be gone');

    await client.loginAsAdmin(admin.adminId, admin.password);
    const stillMerchant = await client.get('/merchant/dashboard');
    assert.strictEqual(stillMerchant.status, 302, 'the merchant session should be gone');

    const asAdmin = await client.get('/admin/dashboard');
    assert.strictEqual(asAdmin.status, 200);
});

test('a customer cannot reach merchant or admin pages', async () => {
    const client = createClient();
    await client.loginAsCustomer(fixtures.testPhone(), 'Test Customer Only');

    const merchantPage = await client.get('/merchant/dashboard');
    assert.strictEqual(merchantPage.location, '/');

    const adminPage = await client.get('/admin/dashboard');
    assert.strictEqual(adminPage.location, '/admin/login');

    const adminApi = await client.get('/api/admin/reports-data');
    assert.strictEqual(adminApi.status, 401);

    const merchantApi = await client.get('/api/merchant/stats-data');
    assert.strictEqual(merchantApi.status, 401);
});
