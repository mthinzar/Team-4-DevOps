// ============================================================
//  Tests for public/js/cart.js
//
//  This is the shopping cart the customer actually uses: the
//  Add to cart button, the + and - buttons, Remove, the number on
//  the cart badge, the total, and the Reorder button on the
//  orders page.
//
//  cart.js normally runs in a browser, so before loading it we
//  give Node a stand-in for the two browser things it uses:
//  localStorage (where the cart is kept) and document (the page).
//  Every place cart.js touches the page is already written as
//  "if the element exists", so a stand-in that finds nothing is
//  enough to run all the cart logic.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

// ---- Stand-ins for the browser -------------------------------------

const store = {};

global.localStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; },
    clear: () => { for (const key of Object.keys(store)) delete store[key]; }
};

global.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
};

global.window = {};

const cart = require('../../public/js/cart.js');

// Empties the cart before each test so they do not affect each other.
function startEmpty() {
    global.localStorage.clear();
}

// ---- formatPrice --------------------------------------------------------

test('formatPrice always shows two decimal places', () => {
    assert.strictEqual(cart.formatPrice(14.9), '$14.90');
    assert.strictEqual(cart.formatPrice(5), '$5.00');
    assert.strictEqual(cart.formatPrice(0), '$0.00');
    assert.strictEqual(cart.formatPrice(1234.5), '$1234.50');
});

test('formatPrice rounds to the nearest cent', () => {
    assert.strictEqual(cart.formatPrice(4.999), '$5.00');
    assert.strictEqual(cart.formatPrice(4.004), '$4.00');
    assert.strictEqual(cart.formatPrice(4.006), '$4.01');
});

test('formatPrice handles an exact half cent the way JavaScript does', () => {
    // 4.005 cannot be stored exactly in binary, and what is stored is a
    // tiny bit under, so toFixed gives 4.00 rather than 4.01. This is
    // normal JavaScript, not a bug here, and it never matters in practice
    // because prices arrive from the database already at two decimals.
    // Written down so nobody is surprised by it later.
    assert.strictEqual(cart.formatPrice(4.005), '$4.00');
});

// ---- Reading a cart that is missing or broken -------------------------------

test('an empty browser gives an empty cart', () => {
    startEmpty();
    assert.deepStrictEqual(cart.getCart(), []);
});

test('a broken saved cart does not crash the page', () => {
    // If something else wrote rubbish into localStorage, the customer
    // should get an empty cart rather than a blank white screen.
    startEmpty();
    global.localStorage.setItem(cart.CART_KEY, 'not json at all');
    assert.deepStrictEqual(cart.getCart(), []);

    global.localStorage.setItem(cart.CART_KEY, '{"not":"an array"}');
    assert.deepStrictEqual(cart.getCart(), []);
});

// ---- Telling two customisations of the same dish apart --------------------------

test('the same dish with no options always makes the same key', () => {
    assert.strictEqual(cart.cartItemKey('Chicken Rice', null), 'Chicken Rice');
    assert.strictEqual(cart.cartItemKey('Chicken Rice', {}), 'Chicken Rice');
});

test('different options make different keys', () => {
    const small = cart.cartItemKey('Milo', { size: 'Regular' });
    const large = cart.cartItemKey('Milo', { size: 'Jumbo' });

    assert.notStrictEqual(small, large);
});

test('the same add-ons in a different order make the same key', () => {
    // Otherwise picking cheese then egg would be a separate line from
    // picking egg then cheese, and the customer would see the dish twice.
    const first = cart.cartItemKey('Burger', { addons: ['Cheese', 'Egg'] });
    const second = cart.cartItemKey('Burger', { addons: ['Egg', 'Cheese'] });

    assert.strictEqual(first, second);
});

test('a different note makes a different key', () => {
    const plain = cart.cartItemKey('Laksa', { note: 'No cockles' });
    const other = cart.cartItemKey('Laksa', { note: 'Extra gravy' });

    assert.notStrictEqual(plain, other);
});

// ---- Add to cart -----------------------------------------------------------------

test('adding a dish puts it in the cart', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'chinese-chicken-rice');

    const items = cart.getCart();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].name, 'Chicken Rice');
    assert.strictEqual(items[0].price, 4.50);
    assert.strictEqual(items[0].qty, 1);
    assert.strictEqual(items[0].foodId, 'chinese-chicken-rice');
});

test('adding the same dish twice raises the quantity instead of listing it twice', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'rice');
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 2, null, 'rice');

    const items = cart.getCart();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].qty, 3);
});

test('the same dish with different options becomes two separate lines', () => {
    startEmpty();
    cart.addToCart('Milo', 2.80, '/images/milo.png', 1, { size: 'Regular' }, 'milo');
    cart.addToCart('Milo', 3.80, '/images/milo.png', 1, { size: 'Jumbo' }, 'milo');

    const items = cart.getCart();
    assert.strictEqual(items.length, 2, 'the customer ordered two different drinks');
});

test('a price given as text is stored as a number', () => {
    // The Add to cart buttons read the price from a data- attribute,
    // which is always text.
    startEmpty();
    cart.addToCart('Chicken Rice', '4.50', '/images/rice.png', 1, null, 'rice');

    assert.strictEqual(cart.getCart()[0].price, 4.50);
});

test('adding with no quantity given adds one', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png');

    assert.strictEqual(cart.getCart()[0].qty, 1);
});

// ---- The plus and minus buttons -----------------------------------------------------

test('the plus button raises the quantity', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'rice');
    const key = cart.getCart()[0].key;

    cart.changeQty(key, 1);
    assert.strictEqual(cart.getCart()[0].qty, 2);
});

test('the minus button lowers the quantity', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 3, null, 'rice');
    const key = cart.getCart()[0].key;

    cart.changeQty(key, -1);
    assert.strictEqual(cart.getCart()[0].qty, 2);
});

test('pressing minus at one takes the dish out of the cart', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'rice');
    const key = cart.getCart()[0].key;

    cart.changeQty(key, -1);
    assert.deepStrictEqual(cart.getCart(), [], 'the cart should now be empty');
});

test('the quantity never goes negative', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'rice');
    const key = cart.getCart()[0].key;

    cart.changeQty(key, -5);
    assert.deepStrictEqual(cart.getCart(), []);
});

test('changing a dish that is not in the cart does nothing', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'rice');

    cart.changeQty('Some Other Dish', 1);
    assert.strictEqual(cart.getCart().length, 1);
    assert.strictEqual(cart.getCart()[0].qty, 1);
});

// ---- Remove and clear ------------------------------------------------------------------

test('Remove takes only that dish out', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'rice');
    cart.addToCart('Milo', 2.80, '/images/milo.png', 1, null, 'milo');

    const riceKey = cart.getCart()[0].key;
    cart.removeFromCart(riceKey);

    const items = cart.getCart();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].name, 'Milo');
});

test('clearing empties the whole cart', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 2, null, 'rice');
    cart.addToCart('Milo', 2.80, '/images/milo.png', 3, null, 'milo');

    cart.clearCart();
    assert.deepStrictEqual(cart.getCart(), []);
});

// ---- The badge number and the total ------------------------------------------------------

test('the cart badge counts every item, not every line', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 2, null, 'rice');
    cart.addToCart('Milo', 2.80, '/images/milo.png', 3, null, 'milo');

    assert.strictEqual(cart.cartCount(), 5);
});

test('the badge shows zero for an empty cart', () => {
    startEmpty();
    assert.strictEqual(cart.cartCount(), 0);
});

test('the total multiplies each price by its quantity', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 2, null, 'rice');
    cart.addToCart('Milo', 2.80, '/images/milo.png', 3, null, 'milo');

    // (4.50 x 2) + (2.80 x 3) = 9.00 + 8.40
    assert.strictEqual(cart.cartTotal(), 17.40);
});

test('the total is zero for an empty cart', () => {
    startEmpty();
    assert.strictEqual(cart.cartTotal(), 0);
});

// ---- The options line shown under each dish -------------------------------------------------

test('optionsSummary lists everything the customer picked', () => {
    const summary = cart.optionsSummary({
        size: 'Jumbo',
        spicy: 'Extra spicy',
        addons: ['Egg', 'Cheese'],
        note: 'No onions'
    });

    assert.ok(summary.includes('Size: Jumbo'));
    assert.ok(summary.includes('Spicy: Extra spicy'));
    assert.ok(summary.includes('Egg, Cheese'));
    assert.ok(summary.includes('No onions'));
});

test('optionsSummary is empty when nothing was picked', () => {
    assert.strictEqual(cart.optionsSummary(null), '');
    assert.strictEqual(cart.optionsSummary({}), '');
});

// ---- The Reorder button on the orders page ----------------------------------------------------

test('Reorder puts every dish from a past order back in the cart', () => {
    startEmpty();

    cart.reorderItems([
        { name: 'Chicken Rice', price: 4.50, image: '/images/rice.png', qty: 2, foodId: 'rice' },
        { name: 'Milo', price: 2.80, image: '/images/milo.png', qty: 1, foodId: 'milo' }
    ]);

    assert.strictEqual(cart.getCart().length, 2);
    assert.strictEqual(cart.cartCount(), 3);
    assert.strictEqual(cart.cartTotal(), 11.80);
});

test('Reorder adds to what is already in the cart instead of replacing it', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 1, null, 'rice');

    cart.reorderItems([
        { name: 'Chicken Rice', price: 4.50, image: '/images/rice.png', qty: 2, foodId: 'rice' }
    ]);

    const items = cart.getCart();
    assert.strictEqual(items.length, 1, 'it is the same dish, so one line');
    assert.strictEqual(items[0].qty, 3, '1 already there plus 2 reordered');
});

test('Reorder keeps the options from the past order', () => {
    startEmpty();

    cart.reorderItems([
        { name: 'Milo', price: 3.80, image: '/images/milo.png', qty: 1, options: { size: 'Jumbo' }, foodId: 'milo' }
    ]);

    assert.deepStrictEqual(cart.getCart()[0].options, { size: 'Jumbo' });
});

// ---- The cart stays after a refresh -------------------------------------------------------------

test('the cart is written to localStorage so a refresh does not lose it', () => {
    startEmpty();
    cart.addToCart('Chicken Rice', 4.50, '/images/rice.png', 2, null, 'rice');

    const saved = JSON.parse(global.localStorage.getItem(cart.CART_KEY));

    assert.ok(Array.isArray(saved));
    assert.strictEqual(saved[0].name, 'Chicken Rice');
    assert.strictEqual(saved[0].qty, 2);
});
