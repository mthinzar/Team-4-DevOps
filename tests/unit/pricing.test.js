// ============================================================
//  Tests for data/pricing.js
//
//  This is the file that decides how much a customer pays, so it
//  is the most important one to test. The cart is kept in the
//  browser's localStorage, which means anybody can edit it before
//  it is sent. These tests check that nothing the browser sends
//  can change the price.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const pricing = require('../../data/pricing');

// ---- Test dishes ----------------------------------------------

const burger = {
    id: 'western-burger',
    stall_id: 'western',
    name: 'Burger',
    price: 6.50,
    image: '/images/burger.png',
    options: {
        sizes: [
            { name: 'Regular', priceDiff: 0 },
            { name: 'Double Patty', priceDiff: 2.50 }
        ],
        spicy: null,
        addons: [
            { name: 'Extra Cheese', priceDiff: 0.50 },
            { name: 'Fried Egg', priceDiff: 1.00 }
        ]
    }
};

const milo = {
    id: 'drinks-milo-dinosaur',
    stall_id: 'drinks',
    name: 'Milo Dinosaur',
    price: 2.80,
    options: {
        sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Jumbo', priceDiff: 1.00 }],
        // Hot costs less than iced, so a negative difference is normal here.
        spicy: [{ name: 'Iced (Standard)' }, { name: 'Hot Milo', priceDiff: -0.30 }],
        addons: [{ name: 'Extra Milo Powder', priceDiff: 0.50 }]
    }
};

const rice = {
    id: 'plain-rice',
    stall_id: 'chinese',
    name: 'Plain Rice',
    price: 1.00,
    options: null
};

// The same shape app.js builds before calling priceCart().
const menu = {
    'western-burger': burger,
    'drinks-milo-dinosaur': milo,
    'plain-rice': rice
};

// ---- validQty ---------------------------------------------------

test('validQty accepts 1 up to the maximum', () => {
    assert.strictEqual(pricing.validQty(1), true);
    assert.strictEqual(pricing.validQty(pricing.MAX_QTY_PER_LINE), true);
});

test('validQty rejects zero, negative, decimal and too-large amounts', () => {
    const badValues = [0, -1, 1.5, pricing.MAX_QTY_PER_LINE + 1, 9999];
    for (const value of badValues) {
        assert.strictEqual(pricing.validQty(value), false, value + ' should be rejected');
    }
});

test('validQty rejects things that are not numbers', () => {
    const badValues = [null, undefined, 'abc', {}, [], NaN, Infinity];
    for (const value of badValues) {
        assert.strictEqual(pricing.validQty(value), false, 'should be rejected');
    }
});

// ---- optionPriceDiff ----------------------------------------------

test('optionPriceDiff returns 0 for a dish with no options', () => {
    assert.strictEqual(pricing.optionPriceDiff(rice, { size: 'Large' }), 0);
});

test('optionPriceDiff adds up size, spicy and add-on differences', () => {
    const difference = pricing.optionPriceDiff(burger, {
        size: 'Double Patty',
        addons: ['Extra Cheese', 'Fried Egg']
    });
    assert.strictEqual(difference, 4.00);
});

test('optionPriceDiff ignores option names that are not on the dish', () => {
    // Somebody making up a discount in their cart must change nothing.
    const difference = pricing.optionPriceDiff(burger, {
        size: 'Free Size',
        spicy: 'Free Spicy',
        addons: ['Everything Free']
    });
    assert.strictEqual(difference, 0);
});

test('optionPriceDiff only counts the same add-on once', () => {
    const once = pricing.optionPriceDiff(burger, { addons: ['Extra Cheese'] });
    const threeTimes = pricing.optionPriceDiff(burger, {
        addons: ['Extra Cheese', 'Extra Cheese', 'Extra Cheese']
    });
    assert.strictEqual(once, 0.50);
    assert.strictEqual(threeTimes, 0.50);
});

test('optionPriceDiff does not break if addons is not a list', () => {
    assert.strictEqual(pricing.optionPriceDiff(burger, { addons: 'Extra Cheese' }), 0);
});

// ---- unitPrice ------------------------------------------------------

test('unitPrice takes off a real negative difference', () => {
    assert.strictEqual(pricing.unitPrice(milo, { spicy: 'Hot Milo' }), 2.50);
});

test('unitPrice rounds to cents instead of showing decimal errors', () => {
    const dish = { price: 0.1, options: { addons: [{ name: 'x', priceDiff: 0.2 }] } };
    // Without rounding this would be 0.30000000000000004
    assert.strictEqual(pricing.unitPrice(dish, { addons: ['x'] }), 0.3);
});

test('unitPrice returns null when the options bring the price to zero or less', () => {
    const brokenDish = { price: 1.00, options: { addons: [{ name: 'bug', priceDiff: -5 }] } };
    assert.strictEqual(pricing.unitPrice(brokenDish, { addons: ['bug'] }), null);
});

test('unitPrice returns null when the dish price itself is wrong', () => {
    assert.strictEqual(pricing.unitPrice({ price: 'free', options: null }, null), null);
    assert.strictEqual(pricing.unitPrice({ price: -3, options: null }, null), null);
});

// ---- priceCart: carts that must be refused -----------------------------

test('priceCart refuses an empty or broken cart', () => {
    assert.ok(pricing.priceCart([], menu).error);
    assert.ok(pricing.priceCart(null, menu).error);
    assert.ok(pricing.priceCart('not a cart', menu).error);
});

test('priceCart refuses a cart with too many different dishes', () => {
    const bigCart = [];
    for (let i = 0; i < 51; i++) {
        bigCart.push({ foodId: 'plain-rice', qty: 1 });
    }
    assert.ok(pricing.priceCart(bigCart, menu).error);
});

test('priceCart refuses a dish that is not on the menu', () => {
    const result = pricing.priceCart([{ foodId: 'made-up-dish', qty: 1 }], menu);
    assert.ok(result.error);
    assert.strictEqual(result.lines, undefined);
});

test('priceCart refuses a quantity that is out of range', () => {
    const result = pricing.priceCart([{ foodId: 'western-burger', qty: 999 }], menu);
    assert.ok(result.error);
    assert.match(result.error, /quantity/i);
});

test('priceCart refuses a dish it cannot price instead of charging nothing', () => {
    const brokenDish = {
        id: 'broken',
        stall_id: 'western',
        name: 'Broken Dish',
        price: 2.00,
        options: { sizes: [], spicy: null, addons: [{ name: 'bad', priceDiff: -10 }] }
    };
    const result = pricing.priceCart(
        [{ foodId: 'broken', qty: 1, options: { addons: ['bad'] } }],
        { broken: brokenDish }
    );

    assert.ok(result.error);
    assert.match(result.error, /could not price/i);
    assert.strictEqual(result.total, undefined);
});

test('priceCart refuses an order that would come to nothing', () => {
    const freeDish = { id: 'free', stall_id: 'western', name: 'Free', price: 0, options: null };
    const result = pricing.priceCart([{ foodId: 'free', qty: 1 }], { free: freeDish });
    assert.ok(result.error);
});

// ---- priceCart: the important part ---------------------------------------

test('priceCart ignores the price sent by the browser', () => {
    // This is the most important test in the project. Someone editing
    // their cart in localStorage must not be able to pay 1 cent.
    const editedCart = [{
        foodId: 'western-burger',
        qty: 2,
        price: 0.01,
        lineTotal: 0.02,
        name: 'Free Burger'
    }];

    const result = pricing.priceCart(editedCart, menu);

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.lines[0].price, 6.50);
    assert.strictEqual(result.lines[0].lineTotal, 13.00);
    assert.strictEqual(result.lines[0].name, 'Burger');   // name comes from the database too
    assert.strictEqual(result.total, 13.00);
});

test('priceCart ignores the stall sent by the browser', () => {
    // Otherwise a customer could send their order to the wrong merchant.
    const editedCart = [{ foodId: 'western-burger', qty: 1, stallId: 'some-other-stall' }];
    const result = pricing.priceCart(editedCart, menu);
    assert.strictEqual(result.lines[0].stallId, 'western');
});

test('priceCart prices options from the database, not from the cart', () => {
    const editedCart = [{
        foodId: 'western-burger',
        qty: 1,
        options: { size: 'Double Patty', addons: ['Extra Cheese'], priceDiff: -100 }
    }];
    const result = pricing.priceCart(editedCart, menu);
    assert.strictEqual(result.lines[0].price, 9.50);
});

// ---- priceCart: normal carts -------------------------------------------------

test('priceCart adds up a cart from more than one stall', () => {
    const cart = [
        { foodId: 'western-burger', qty: 2 },
        { foodId: 'drinks-milo-dinosaur', qty: 1, options: { size: 'Jumbo' } },
        { foodId: 'plain-rice', qty: 3 }
    ];
    const result = pricing.priceCart(cart, menu);

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.lines.length, 3);
    // 2 burgers = 13.00, jumbo Milo = 3.80, 3 rice = 3.00
    assert.strictEqual(result.total, 19.80);

    // The stall id must survive so app.js can split the order per merchant.
    assert.strictEqual(result.lines[0].stallId, 'western');
    assert.strictEqual(result.lines[1].stallId, 'drinks');
    assert.strictEqual(result.lines[2].stallId, 'chinese');
});

test('priceCart totals stay exact over many lines', () => {
    const oddDish = { id: 'odd', stall_id: 'western', name: 'Odd', price: 0.07, options: null };
    const cart = [];
    for (let i = 0; i < 10; i++) {
        cart.push({ foodId: 'odd', qty: 3 });
    }
    const result = pricing.priceCart(cart, { odd: oddDish });
    assert.strictEqual(result.total, 2.10);
});

test('priceCart keeps the foodId so a review can be linked later', () => {
    const result = pricing.priceCart([{ foodId: 'western-burger', qty: 1 }], menu);
    assert.strictEqual(result.lines[0].foodId, 'western-burger');
});

test('priceCart uses null when a dish has no picture', () => {
    const noPicture = { id: 'nopic', stall_id: 'western', name: 'No Picture', price: 3, options: null };
    const result = pricing.priceCart([{ foodId: 'nopic', qty: 1 }], { nopic: noPicture });
    assert.strictEqual(result.lines[0].image, null);
});
