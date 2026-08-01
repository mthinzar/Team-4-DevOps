// ============================================================
//  Tests for data/payments.js
//
//  Two jobs:
//    1. Check the card rules — Luhn, brand, length, CVV, expiry —
//       and that each test card gives the decline reason it should.
//    2. Check the PayNow QR string is built correctly. A wrong QR
//       does not show an error, it just fails silently inside the
//       banking app, so it is worth testing properly.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const payments = require('../../data/payments');

// Builds an expiry like "08/28" a number of months from today, so
// these tests do not start failing when the year changes.
function expiryIn(months) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear() % 100).padStart(2, '0');
    return month + '/' + year;
}

const GOOD_EXPIRY = expiryIn(12);

// ---- Payment methods ----------------------------------------------

test('there are exactly three payment methods', () => {
    assert.deepStrictEqual(payments.PAYMENT_METHODS.slice().sort(), ['card', 'counter', 'paynow']);
});

// ---- Luhn check ------------------------------------------------------

test('luhnValid accepts the standard test card numbers', () => {
    const numbers = ['4242424242424242', '5555555555554444', '378282246310005', '6250947000000014'];
    for (const number of numbers) {
        assert.strictEqual(payments.luhnValid(number), true, number + ' should pass');
    }
});

test('luhnValid rejects a card number with one digit changed', () => {
    assert.strictEqual(payments.luhnValid('4242424242424241'), false);
});

test('luhnValid rejects numbers that are too short or too long', () => {
    assert.strictEqual(payments.luhnValid('4242'), false);
    assert.strictEqual(payments.luhnValid('44444444444444444444'), false);
});

test('luhnValid ignores spaces and dashes that people type', () => {
    assert.strictEqual(payments.luhnValid('4242 4242 4242 4242'), true);
    assert.strictEqual(payments.luhnValid('4242-4242-4242-4242'), true);
});

// ---- Card brands -------------------------------------------------------

test('detectCardBrand knows each card type we accept', () => {
    assert.strictEqual(payments.detectCardBrand('4242424242424242').brand, 'visa');
    assert.strictEqual(payments.detectCardBrand('5555555555554444').brand, 'mastercard');
    assert.strictEqual(payments.detectCardBrand('2223003122003222').brand, 'mastercard');
    assert.strictEqual(payments.detectCardBrand('378282246310005').brand, 'amex');
    assert.strictEqual(payments.detectCardBrand('6250947000000014').brand, 'unionpay');
});

test('detectCardBrand returns null for a card type we do not accept', () => {
    assert.strictEqual(payments.detectCardBrand('3056930009020004'), null);   // Diners
    assert.strictEqual(payments.detectCardBrand(''), null);
});

// ---- Expiry date ---------------------------------------------------------

test('expiryValid accepts a date in the future', () => {
    assert.strictEqual(payments.expiryValid(GOOD_EXPIRY), true);
});

test('expiryValid accepts this month, because a card lasts to month end', () => {
    assert.strictEqual(payments.expiryValid(expiryIn(0)), true);
});

test('expiryValid rejects last month', () => {
    assert.strictEqual(payments.expiryValid(expiryIn(-1)), false);
});

test('expiryValid rejects a month that does not exist', () => {
    assert.strictEqual(payments.expiryValid('13/30'), false);
    assert.strictEqual(payments.expiryValid('00/30'), false);
});

test('expiryValid rejects text that is not a date', () => {
    const badValues = ['', '2030-12', 'MM/YY', '1/30', null, undefined];
    for (const value of badValues) {
        assert.strictEqual(payments.expiryValid(value), false, String(value) + ' should be rejected');
    }
});

test('expiryValid allows the slash to be left out', () => {
    // "1230" means December 2030. This is on purpose, so a customer
    // who types the numbers without a slash is not blocked.
    assert.strictEqual(payments.expiryValid(GOOD_EXPIRY.replace('/', '')), true);
});

// ---- Card checks before the bank is asked ---------------------------------

test('authoriseCard rejects a card type we do not accept', () => {
    const result = payments.authoriseCard({ number: '3056930009020004', expiry: GOOD_EXPIRY, cvv: '123' });
    assert.strictEqual(result.approved, false);
    assert.strictEqual(result.code, 'unsupported_brand');
});

test('authoriseCard rejects a card number that fails the Luhn check', () => {
    const result = payments.authoriseCard({ number: '4242424242424241', expiry: GOOD_EXPIRY, cvv: '123' });
    assert.strictEqual(result.approved, false);
    assert.strictEqual(result.code, 'invalid_number');
});

test('authoriseCard rejects a Visa with the wrong number of digits', () => {
    // This 13-digit number passes Luhn but Visa cards must be 16 or 19.
    const result = payments.authoriseCard({ number: '4222222222222', expiry: GOOD_EXPIRY, cvv: '123' });
    assert.strictEqual(result.approved, false);
    assert.strictEqual(result.code, 'invalid_number');
});

test('authoriseCard rejects an expired card', () => {
    const result = payments.authoriseCard({ number: '4242424242424242', expiry: expiryIn(-2), cvv: '123' });
    assert.strictEqual(result.approved, false);
    assert.strictEqual(result.code, 'invalid_expiry');
});

test('authoriseCard wants 4 CVV digits for Amex and 3 for the rest', () => {
    const amexShort = payments.authoriseCard({ number: '378282246310005', expiry: GOOD_EXPIRY, cvv: '123' });
    assert.strictEqual(amexShort.approved, false);
    assert.strictEqual(amexShort.code, 'invalid_cvc');

    const amexOk = payments.authoriseCard({ number: '378282246310005', expiry: GOOD_EXPIRY, cvv: '1234' });
    assert.strictEqual(amexOk.approved, true);

    const visaLong = payments.authoriseCard({ number: '4242424242424242', expiry: GOOD_EXPIRY, cvv: '1234' });
    assert.strictEqual(visaLong.approved, false);
    assert.strictEqual(visaLong.code, 'invalid_cvc');
});

// ---- The test cards -------------------------------------------------------

test('authoriseCard approves the cards that are meant to work', () => {
    const numbers = ['4242424242424242', '5555555555554444', '6250947000000014'];
    for (const number of numbers) {
        const result = payments.authoriseCard({ number: number, expiry: GOOD_EXPIRY, cvv: '123' });
        assert.strictEqual(result.approved, true, number + ' should be approved');
        assert.strictEqual(result.code, 'approved');
        assert.match(result.authCode, /^[0-9A-F]{6}$/);
        assert.strictEqual(result.last4, number.slice(-4));
    }
});

test('authoriseCard gives the right decline reason for each test card', () => {
    const expected = {
        '4000000000000002': 'card_declined',
        '4000000000009995': 'insufficient_funds',
        '4000000000000069': 'expired_card',
        '4000000000000127': 'incorrect_cvc',
        '4000000000000119': 'processing_error'
    };

    for (const number of Object.keys(expected)) {
        const result = payments.authoriseCard({ number: number, expiry: GOOD_EXPIRY, cvv: '123' });
        assert.strictEqual(result.approved, false, number + ' should be declined');
        assert.strictEqual(result.code, expected[number]);
        assert.ok(result.message.length > 0, 'a decline needs a message for the customer');
    }
});

test('authoriseCard gives the same answer every time for the same card', () => {
    const first = payments.authoriseCard({ number: '4000000000009995', expiry: GOOD_EXPIRY, cvv: '123' });
    const second = payments.authoriseCard({ number: '4000000000009995', expiry: GOOD_EXPIRY, cvv: '123' });
    assert.strictEqual(first.code, second.code);
    assert.strictEqual(first.approved, second.approved);
});

test('authoriseCard never sends the card number or CVV back', () => {
    const result = payments.authoriseCard({ number: '4242424242424242', expiry: GOOD_EXPIRY, cvv: '123' });
    const asText = JSON.stringify(result);
    assert.strictEqual(asText.includes('4242424242424242'), false);
    assert.strictEqual(asText.includes('"cvv"'), false);
});

// ---- The QR code checksum ---------------------------------------------------

test('crc16 gives the known answer for the standard test text', () => {
    // Every correct CRC-16/CCITT-FALSE gives 29B1 for "123456789".
    assert.strictEqual(payments.crc16('123456789'), '29B1');
});

test('crc16 always returns four hex characters', () => {
    const inputs = ['', 'a', 'FoodHub', '0'.repeat(500)];
    for (const input of inputs) {
        assert.match(payments.crc16(input), /^[0-9A-F]{4}$/);
    }
});

// ---- The PayNow QR string -------------------------------------------------------
//
// The QR is built from small blocks: a 2-digit tag, then a 2-digit
// length, then the value. So the amount 12.50 becomes "54" + "05" +
// "12.50". That is why the tests below look for those exact pieces
// of text inside the payload.

function makePayload(amount, reference) {
    return payments.buildPayNowPayload({
        amount: amount,
        reference: reference,
        expiresAt: new Date('2026-08-01T10:00:00Z')
    });
}

test('buildPayNowPayload starts with the standard header', () => {
    const payload = makePayload(12.5, 'FHDEADBEEF');
    assert.ok(payload.startsWith('000201'), 'payload format indicator');
    assert.ok(payload.includes('010212'), 'single-use QR code');
});

test('buildPayNowPayload says Singapore dollars from a food stall', () => {
    const payload = makePayload(12.5, 'FHDEADBEEF');
    assert.ok(payload.includes('5303702'), 'currency 702 = SGD');
    assert.ok(payload.includes('52045812'), 'merchant category 5812 = restaurant');
    assert.ok(payload.includes('5802SG'), 'country SG');
});

test('buildPayNowPayload includes the PayNow account details', () => {
    const payload = makePayload(12.5, 'FHDEADBEEF');
    assert.ok(payload.includes('0009SG.PAYNOW'), 'this is a PayNow QR');
    assert.ok(payload.includes('01012'), 'proxy type 2 = UEN');
    assert.ok(payload.includes('03011'), 'the payer cannot change the amount');
    assert.ok(payload.includes(payments.PAYNOW_UEN), 'our UEN');
});

test('buildPayNowPayload writes the amount with two decimal places', () => {
    assert.ok(makePayload(12.5, 'FHTEST123').includes('540512.50'));
    assert.ok(makePayload(3, 'FHTEST123').includes('54043.00'));
    assert.ok(makePayload(0.05, 'FHTEST123').includes('54040.05'));
    assert.ok(makePayload(1234.56, 'FHTEST123').includes('54071234.56'));
});

test('buildPayNowPayload includes the payment reference', () => {
    const payload = makePayload(12.5, 'FHDEADBEEF');
    assert.ok(payload.includes('0110FHDEADBEEF'), 'reference is stored as the bill number');
});

test('buildPayNowPayload ends with a checksum that matches the rest', () => {
    const payload = makePayload(12.5, 'FHDEADBEEF');
    const body = payload.slice(0, -4);
    const checksum = payload.slice(-4);

    assert.strictEqual(body.slice(-4), '6304', 'the checksum tag comes first');
    assert.strictEqual(checksum, payments.crc16(body), 'checksum must cover everything before it');
});

test('buildPayNowPayload gives a different checksum when the amount changes', () => {
    const ten = makePayload(10, 'FHAAAAAAAA');
    const twenty = makePayload(20, 'FHAAAAAAAA');
    assert.notStrictEqual(ten.slice(-4), twenty.slice(-4));
});

// ---- Payment reference -----------------------------------------------------------

test('newPaymentReference looks like FH plus 8 hex characters', () => {
    assert.match(payments.newPaymentReference(), /^FH[0-9A-F]{8}$/);
});

test('newPaymentReference does not repeat itself', () => {
    const seen = {};
    let count = 0;
    for (let i = 0; i < 5000; i++) {
        const reference = payments.newPaymentReference();
        if (!seen[reference]) {
            seen[reference] = true;
            count = count + 1;
        }
    }
    assert.strictEqual(count, 5000, 'all 5000 references should be different');
});
