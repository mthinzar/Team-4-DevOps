// ============================================================
//  KNOWN ISSUES
//
//  These tests check what the code SHOULD do. They fail right
//  now, on purpose. They are bug reports you can run: fix the
//  code and the test turns green and stays green.
//
//  They are kept in their own folder so they do not turn the
//  build red. CI runs them as a separate step that reports the
//  result without blocking anything.
//
//      npm run test:issues
//
//  Once they all pass, move them into tests/unit and delete the
//  extra step from the workflow file.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const validation = require('../../data/validation');
const orderStatus = require('../../data/orderStatus');

// ==================================================================
//  1. Picture uploads keep the file ending the browser sends
//     (data/validation.js, uploadFileName)
// ==================================================================

// THE BUG
// Two different things decide whether an upload is safe:
//   - isAllowedImageType() looks at the file TYPE the browser claims
//   - uploadFileName()     takes the file ENDING from the file NAME
// The browser controls both, and they are never checked against each
// other. So a browser can say "this is image/png" while calling the
// file "attack.html". The type check passes, and the file is saved as
// attack.html inside public/images/uploads, which the website then
// serves as a real web page.
//
// THE FIX
// Work out the ending from the type we already checked, instead of
// from the file name:
//
//   const ENDINGS = {
//       'image/png': '.png',
//       'image/jpeg': '.jpg',
//       'image/jpg': '.jpg',
//       'image/webp': '.webp',
//       'image/gif': '.gif'
//   };
//   function uploadFileName(mimetype) {
//       return Date.now() + '-' + Math.round(Math.random() * 1e9) + ENDINGS[mimetype];
//   }
//
// app.js would then call uploadFileName(file.mimetype) instead of
// uploadFileName(file.originalname).

test('BUG: an upload cannot be saved with a web page ending', () => {
    const dangerous = ['attack.html', 'attack.htm', 'attack.svg', 'attack.js', 'attack.xhtml'];

    for (const name of dangerous) {
        const saved = validation.uploadFileName(name);
        assert.doesNotMatch(saved, /\.(html|htm|svg|js|xhtml)$/i,
            name + ' was saved as ' + saved + ', which the website will run as a web page');
    }
});

test('BUG: an upload always ends in a real picture ending', () => {
    const names = ['photo.png', 'photo.jpeg', 'photo.exe', 'photo', 'photo.php'];

    for (const name of names) {
        const saved = validation.uploadFileName(name);
        assert.match(saved, /\.(png|jpe?g|webp|gif)$/i,
            name + ' was saved as ' + saved);
    }
});

// ==================================================================
//  2. Order ids repeat (data/orderStatus.js, newOrderId)
// ==================================================================

// THE BUG
// newOrderId keeps only the last 6 digits of the clock. Those 6 digits
// count up in milliseconds, so they start again from the beginning
// every 1,000,000 ms, which is about 16 minutes and 40 seconds. Two
// orders placed that far apart get the same id, and there is no unique
// index on the orders collection to stop it.
//
// THE FIX
// Add random characters so the id does not depend on the clock alone:
//
//   const crypto = require('crypto');
//   function newOrderId() {
//       return 'FH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
//   }
//
// and add a unique index in seed.js:
//   db.collection('orders').createIndex({ orderId: 1 }, { unique: true });

test('BUG: two orders about 17 minutes apart get different ids', () => {
    const realNow = Date.now;
    const startTime = 1770000000000;

    try {
        Date.now = () => startTime;
        const firstOrder = orderStatus.newOrderId(0);

        // 1,000,000 ms later, which is 16 minutes 40 seconds.
        Date.now = () => startTime + 1000000;
        const laterOrder = orderStatus.newOrderId(0);

        assert.notStrictEqual(firstOrder, laterOrder,
            'both orders got the id ' + firstOrder + ', so one will be lost');
    } finally {
        Date.now = realNow;
    }
});

test('BUG: an order id has enough characters not to repeat', () => {
    const id = orderStatus.newOrderId(0);
    const characters = id.replace('FH-', '');

    assert.ok(characters.length >= 8,
        'the id is only ' + characters.length + ' characters long and comes from the clock');
});

// ==================================================================
//  3. Quantity accepts true as 1 (data/pricing.js, validQty)
// ==================================================================

// THE BUG
// validQty uses Number(qty), and Number(true) is 1. So a cart sending
// "qty": true is quietly treated as one item instead of being refused.
// It is not dangerous on its own, because it only ever means 1, but a
// value that is not a number should not get through a check whose job
// is to make sure it is one.
//
// THE FIX
// Refuse anything that is not already a number:
//
//   function validQty(qty) {
//       if (typeof qty !== 'number') return false;
//       return Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY_PER_LINE;
//   }

test('BUG: a quantity that is not a number is refused', () => {
    const pricing = require('../../data/pricing');
    const notNumbers = [true, false, '3', [3]];

    for (const value of notNumbers) {
        assert.strictEqual(pricing.validQty(value), false,
            JSON.stringify(value) + ' is not a number and should be refused');
    }
});
