// ============================================================
//  Tests for data/orderStatus.js
//
//  These are the rules the merchant orders page runs on. An order
//  must go pending -> preparing -> ready -> completed one step at a
//  time, and can only be cancelled before it is ready.
//
//  Getting this wrong would let a stall mark food as collected
//  before it was even cooked, so it is worth checking properly.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const orderStatus = require('../../data/orderStatus');

// ---- The list of steps ------------------------------------------

test('there are four steps in the order flow, in the right order', () => {
    assert.deepStrictEqual(orderStatus.ORDER_FLOW,
        ['pending', 'preparing', 'ready', 'completed']);
});

test('every status has a label to show on screen', () => {
    const allStatuses = orderStatus.ORDER_FLOW.concat(['cancelled']);

    for (const status of allStatuses) {
        const label = orderStatus.ORDER_STATUS_LABELS[status];
        assert.strictEqual(typeof label, 'string', status + ' should have a label');
        assert.ok(label.length > 0, status + ' should not have an empty label');
    }
});

test('the last step has no button after it', () => {
    assert.strictEqual(orderStatus.NEXT_STEP.completed, undefined);
    assert.strictEqual(orderStatus.NEXT_STEP.cancelled, undefined);
});

test('every button points at the step that comes next', () => {
    assert.strictEqual(orderStatus.NEXT_STEP.pending.status, 'preparing');
    assert.strictEqual(orderStatus.NEXT_STEP.preparing.status, 'ready');
    assert.strictEqual(orderStatus.NEXT_STEP.ready.status, 'completed');
});

test('the three payment methods all have a label', () => {
    assert.strictEqual(orderStatus.PAYMENT_LABELS.paynow, 'PayNow');
    assert.strictEqual(orderStatus.PAYMENT_LABELS.card, 'Card');
    assert.strictEqual(orderStatus.PAYMENT_LABELS.counter, 'Pay at stall');
});

// ---- normaliseStatus ----------------------------------------------

test('normaliseStatus leaves the four normal steps alone', () => {
    for (const status of orderStatus.ORDER_FLOW) {
        assert.strictEqual(orderStatus.normaliseStatus(status), status);
    }
    assert.strictEqual(orderStatus.normaliseStatus('cancelled'), 'cancelled');
});

test('normaliseStatus turns the two old names into the new ones', () => {
    // Orders saved by the older version of the site used these words.
    assert.strictEqual(orderStatus.normaliseStatus('accepted'), 'preparing');
    assert.strictEqual(orderStatus.normaliseStatus('collected'), 'completed');
});

test('normaliseStatus treats anything it does not recognise as pending', () => {
    const strangeValues = ['delivered', '', null, undefined, 123, 'PENDING', {}];

    for (const value of strangeValues) {
        assert.strictEqual(orderStatus.normaliseStatus(value), 'pending',
            String(value) + ' should fall back to pending');
    }
});

// ---- canCancel ------------------------------------------------------

test('an order can be cancelled while it is pending or being prepared', () => {
    assert.strictEqual(orderStatus.canCancel('pending'), true);
    assert.strictEqual(orderStatus.canCancel('preparing'), true);
});

test('an order cannot be cancelled once the food is ready', () => {
    // The food is already cooked by then, so the stall would lose it.
    assert.strictEqual(orderStatus.canCancel('ready'), false);
    assert.strictEqual(orderStatus.canCancel('completed'), false);
    assert.strictEqual(orderStatus.canCancel('cancelled'), false);
});

// ---- canMoveTo -------------------------------------------------------

test('an order can move forward one step at a time', () => {
    assert.strictEqual(orderStatus.canMoveTo('pending', 'preparing'), true);
    assert.strictEqual(orderStatus.canMoveTo('preparing', 'ready'), true);
    assert.strictEqual(orderStatus.canMoveTo('ready', 'completed'), true);
});

test('an order cannot skip a step', () => {
    assert.strictEqual(orderStatus.canMoveTo('pending', 'ready'), false);
    assert.strictEqual(orderStatus.canMoveTo('pending', 'completed'), false);
    assert.strictEqual(orderStatus.canMoveTo('preparing', 'completed'), false);
});

test('an order cannot go backwards', () => {
    assert.strictEqual(orderStatus.canMoveTo('preparing', 'pending'), false);
    assert.strictEqual(orderStatus.canMoveTo('ready', 'preparing'), false);
    assert.strictEqual(orderStatus.canMoveTo('completed', 'ready'), false);
});

test('a finished or cancelled order cannot move anywhere', () => {
    const endStatuses = ['completed', 'cancelled'];
    const targets = ['pending', 'preparing', 'ready', 'completed'];

    for (const from of endStatuses) {
        for (const to of targets) {
            assert.strictEqual(orderStatus.canMoveTo(from, to), false,
                from + ' should not be able to move to ' + to);
        }
    }
});

test('cancelling follows the cancel rule, not the step rule', () => {
    assert.strictEqual(orderStatus.canMoveTo('pending', 'cancelled'), true);
    assert.strictEqual(orderStatus.canMoveTo('preparing', 'cancelled'), true);
    assert.strictEqual(orderStatus.canMoveTo('ready', 'cancelled'), false);
    assert.strictEqual(orderStatus.canMoveTo('completed', 'cancelled'), false);
});

test('a status that does not exist is refused', () => {
    const madeUpStatuses = ['delivered', 'refunded', '', 'PENDING', null, undefined];

    for (const status of madeUpStatuses) {
        assert.strictEqual(orderStatus.canMoveTo('pending', status), false,
            String(status) + ' should be refused');
    }
});

test('a whole order from start to finish is allowed at every step', () => {
    // Walks the same path the merchant orders page does.
    let current = 'pending';

    for (let i = 0; i < 3; i++) {
        const next = orderStatus.NEXT_STEP[current];
        assert.ok(next, 'there should be a next step from ' + current);
        assert.strictEqual(orderStatus.canMoveTo(current, next.status), true);
        current = next.status;
    }

    assert.strictEqual(current, 'completed');
    assert.strictEqual(orderStatus.NEXT_STEP[current], undefined);
});

// ---- Order references and queue numbers ------------------------------

test('newOrderId starts with FH- so customers can recognise it', () => {
    assert.match(orderStatus.newOrderId(0), /^FH-\d+$/);
});

test('newOrderId keeps the orders in one cart apart', () => {
    // A cart split across three stalls becomes three orders at the same
    // moment, so the index is what stops them clashing.
    const first = orderStatus.newOrderId(0);
    const second = orderStatus.newOrderId(1);
    const third = orderStatus.newOrderId(2);

    assert.notStrictEqual(first, second);
    assert.notStrictEqual(second, third);
    assert.notStrictEqual(first, third);
});

test('newQueueNumber is always between 101 and 999', () => {
    // Three digits, so it fits on the screen at the stall.
    for (let i = 0; i < 500; i++) {
        const number = orderStatus.newQueueNumber();

        assert.ok(Number.isInteger(number), 'should be a whole number');
        assert.ok(number >= 101, number + ' is too low');
        assert.ok(number <= 999, number + ' is too high');
    }
});
