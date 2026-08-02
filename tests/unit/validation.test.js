// ============================================================
//  Tests for data/validation.js
//
//  These are the checks the website runs on everything a person
//  types: the phone number on the login box, the email and
//  password on the merchant signup form, the dish name and price
//  on the merchant menu page, and the picture they upload.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const validation = require('../../data/validation');

// ---- Phone numbers (customer login) --------------------------------

test('validPhone accepts Singapore mobile numbers', () => {
    const goodNumbers = ['91234567', '81234567', '61234567', '99999999'];

    for (const phone of goodNumbers) {
        assert.strictEqual(validation.validPhone(phone), true, phone + ' should be accepted');
    }
});

test('validPhone allows spaces because people type them', () => {
    assert.strictEqual(validation.validPhone('9123 4567'), true);
    assert.strictEqual(validation.validPhone(' 9123  4567 '), true);
});

test('validPhone refuses numbers that are the wrong length', () => {
    assert.strictEqual(validation.validPhone('9123456'), false);    // 7 digits
    assert.strictEqual(validation.validPhone('912345678'), false);  // 9 digits
});

test('validPhone refuses numbers that start with the wrong digit', () => {
    const badStarts = ['71234567', '01234567', '11234567', '51234567'];

    for (const phone of badStarts) {
        assert.strictEqual(validation.validPhone(phone), false, phone + ' should be refused');
    }
});

test('validPhone refuses anything that is not digits', () => {
    const rubbish = ['abcdefgh', '9123456a', '+6591234567', '', null, undefined, {}];

    for (const phone of rubbish) {
        assert.strictEqual(validation.validPhone(phone), false, String(phone) + ' should be refused');
    }
});

// ---- Emails (merchant signup and login) --------------------------------

test('validEmail accepts normal email addresses', () => {
    const goodEmails = [
        'stall@example.com',
        'first.last@example.com.sg',
        'merchant+test@example.co',
        'a@b.c'
    ];

    for (const email of goodEmails) {
        assert.strictEqual(validation.validEmail(email), true, email + ' should be accepted');
    }
});

test('validEmail refuses addresses with a piece missing', () => {
    const badEmails = [
        'no-at-sign.com',
        '@example.com',
        'nothing@',
        'no@dot',
        'two@@example.com',
        'spaces in@example.com',
        '',
        null,
        undefined
    ];

    for (const email of badEmails) {
        assert.strictEqual(validation.validEmail(email), false, String(email) + ' should be refused');
    }
});

test('validEmail ignores spaces around the address', () => {
    assert.strictEqual(validation.validEmail('  stall@example.com  '), true);
});

// ---- Passwords (merchant and admin) -------------------------------------

test('validPassword needs at least six characters', () => {
    assert.strictEqual(validation.MIN_PASSWORD_LENGTH, 6);
    assert.strictEqual(validation.validPassword('abcdef'), true);
    assert.strictEqual(validation.validPassword('a-much-longer-password'), true);
});

test('validPassword refuses anything shorter than six', () => {
    const tooShort = ['abcde', 'abc', 'a', '', null, undefined];

    for (const password of tooShort) {
        assert.strictEqual(validation.validPassword(password), false,
            String(password) + ' should be refused');
    }
});

// ---- Merchant account messages ---------------------------------------------

test('merchantStatusMessage explains each account state', () => {
    assert.match(validation.merchantStatusMessage('pending'), /awaiting admin approval/i);
    assert.match(validation.merchantStatusMessage('rejected'), /not approved/i);
    assert.match(validation.merchantStatusMessage('suspended'), /suspended/i);
});

test('merchantStatusMessage still says something for an unknown state', () => {
    const message = validation.merchantStatusMessage('something-else');

    assert.strictEqual(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.match(message, /not currently active/i);
});

// ---- The dish form on the merchant menu page -----------------------------------

test('validDish accepts a normal dish and tidies it up', () => {
    const dish = validation.validDish('  Chicken Rice  ', '4.50');

    assert.strictEqual(dish.ok, true);
    assert.strictEqual(dish.name, 'Chicken Rice');   // spaces trimmed off
    assert.strictEqual(dish.price, 4.50);            // text turned into a number
});

test('validDish refuses a dish with no name', () => {
    const noName = validation.validDish('', '4.50');
    const onlySpaces = validation.validDish('     ', '4.50');

    assert.strictEqual(noName.ok, false);
    assert.strictEqual(onlySpaces.ok, false);
    assert.match(noName.message, /dish name/i);
});

test('validDish refuses a price of zero or less', () => {
    const badPrices = ['0', '0.00', '-5', '-0.01'];

    for (const price of badPrices) {
        const dish = validation.validDish('Chicken Rice', price);
        assert.strictEqual(dish.ok, false, 'price ' + price + ' should be refused');
    }
});

test('validDish refuses a price that is not a number', () => {
    const badPrices = ['free', '', 'abc', null, undefined, {}];

    for (const price of badPrices) {
        const dish = validation.validDish('Chicken Rice', price);
        assert.strictEqual(dish.ok, false, String(price) + ' should be refused');
    }
});

test('validDish never returns a price without a name or the other way round', () => {
    const rejected = validation.validDish('', 'free');

    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(rejected.name, undefined);
    assert.strictEqual(rejected.price, undefined);
});

// ---- Picture uploads --------------------------------------------------------------

test('isAllowedImageType accepts the four picture types we support', () => {
    const goodTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

    for (const type of goodTypes) {
        assert.strictEqual(validation.isAllowedImageType(type), true, type + ' should be allowed');
    }
});

test('isAllowedImageType refuses everything else', () => {
    const badTypes = [
        'image/svg+xml',            // can contain scripts
        'text/html',
        'application/x-sh',
        'application/pdf',
        'video/mp4',
        'image/png; charset=utf-8',
        '',
        null,
        undefined
    ];

    for (const type of badTypes) {
        assert.strictEqual(validation.isAllowedImageType(type), false,
            String(type) + ' should be refused');
    }
});

test('uploadFileName keeps files apart even when uploaded together', () => {
    const first = validation.uploadFileName('photo.png');
    const second = validation.uploadFileName('photo.png');

    assert.notStrictEqual(first, second, 'two uploads must not overwrite each other');
});

test('uploadFileName falls back to .jpg when there is no file ending', () => {
    assert.ok(validation.uploadFileName('photo').endsWith('.jpg'));
    assert.ok(validation.uploadFileName('').endsWith('.jpg'));
});

test('uploadFileName makes the file ending lower case', () => {
    assert.ok(validation.uploadFileName('PHOTO.PNG').endsWith('.png'));
    assert.ok(validation.uploadFileName('photo.JPEG').endsWith('.jpeg'));
});

// ---- Turning names into ids (stalls and dishes) -------------------------------------
//
// slugify turns a name a merchant typed into the id used in the database
// and in the web address.

test('slugify makes a plain name lower case with dashes', () => {
    assert.strictEqual(validation.slugify('Western Stall'), 'western-stall');
    assert.strictEqual(validation.slugify('Chicken Rice'), 'chicken-rice');
});

test('slugify replaces anything that is not a letter or number', () => {
    assert.strictEqual(validation.slugify("Ah Hock's Chicken Rice"), 'ah-hock-s-chicken-rice');
    assert.strictEqual(validation.slugify('Nasi Lemak & Teh'), 'nasi-lemak-teh');
    assert.strictEqual(validation.slugify('Mee Goreng (Spicy)'), 'mee-goreng-spicy');
});

test('slugify does not leave a dash at the start or the end', () => {
    assert.strictEqual(validation.slugify('  Spaces Both Sides  '), 'spaces-both-sides');
    assert.strictEqual(validation.slugify('!!!Excited!!!'), 'excited');
    assert.strictEqual(validation.slugify('---dashes---'), 'dashes');
});

test('slugify never puts two dashes together', () => {
    const result = validation.slugify('Too   Many    Spaces');

    assert.strictEqual(result, 'too-many-spaces');
    assert.strictEqual(result.includes('--'), false);
});

test('slugify keeps numbers', () => {
    assert.strictEqual(validation.slugify('Stall 12'), 'stall-12');
    assert.strictEqual(validation.slugify('Level 3 Drinks'), 'level-3-drinks');
});

test('slugify returns an empty string when there is nothing usable', () => {
    // app.js checks for this and uses 'dish' or 'stall' instead.
    const nothingUsable = ['', '   ', '!!!', null, undefined];

    for (const name of nothingUsable) {
        assert.strictEqual(validation.slugify(name), '', String(name) + ' should give an empty id');
    }
});

test('slugify gives an id that is safe to put in a web address', () => {
    const messyNames = [
        'Stall / Kitchen',
        'Drinks & More!',
        'Cafe  Corner',
        '<script>alert(1)</script>'
    ];

    for (const name of messyNames) {
        const result = validation.slugify(name);
        assert.match(result, /^[a-z0-9-]*$/, name + ' gave an unsafe id: ' + result);
    }
});

test('slugify gives the same answer for the same name every time', () => {
    // app.js adds -2, -3 and so on when an id is already taken, so the
    // starting point has to be steady.
    assert.strictEqual(validation.slugify('Chicken Rice'), validation.slugify('Chicken Rice'));
    assert.strictEqual(validation.slugify('Chicken Rice'), validation.slugify('  CHICKEN   RICE  '));
});
