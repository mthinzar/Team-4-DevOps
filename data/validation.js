// ============================================================
//  The rules for checking what people type in.
//
//  These were spread around app.js, and a few of them were copied
//  in two or three places. They were moved here so there is one
//  copy of each rule, and so they can be tested without starting
//  the website or the database.
// ============================================================

const path = require('path');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const ALLOWED_IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/;

// A Singapore mobile number: 8 digits starting with 6, 8 or 9.
// Spaces are allowed because people type them that way.
function validPhone(phone) {
    return /^[689]\d{7}$/.test(String(phone || '').replace(/\s+/g, ''));
}

function validEmail(email) {
    return EMAIL_PATTERN.test(String(email || '').trim());
}

function validPassword(password) {
    return String(password || '').length >= MIN_PASSWORD_LENGTH;
}

// The message a merchant sees when their account is not active yet.
function merchantStatusMessage(status) {
    if (status === 'pending') return 'Your merchant application is still awaiting admin approval.';
    if (status === 'rejected') return 'Your merchant application was not approved.';
    if (status === 'suspended') return 'Your merchant account has been suspended.';
    return 'Your merchant account is not currently active.';
}

// Checks the dish form on the merchant menu page. Returns the cleaned
// name and price so the route does not have to tidy them up again.
function validDish(rawName, rawPrice) {
    const name = String(rawName || '').trim();
    const price = parseFloat(rawPrice);

    if (!name || !(price > 0)) {
        return { ok: false, message: 'Enter a dish name and a valid price.' };
    }

    return { ok: true, name: name, price: price };
}

// Turns a name a merchant typed into the id used in the database and
// in the web address, so "Ah Hock's Chicken Rice" becomes
// "ah-hock-s-chicken-rice".
function slugify(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// Only real image uploads are allowed.
function isAllowedImageType(mimetype) {
    return ALLOWED_IMAGE_TYPES.test(String(mimetype || ''));
}

// Builds the name an uploaded picture is saved under.
function uploadFileName(originalName) {
    const ext = path.extname(String(originalName || '')).toLowerCase() || '.jpg';
    return Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
}

module.exports = {
    EMAIL_PATTERN,
    MIN_PASSWORD_LENGTH,
    ALLOWED_IMAGE_TYPES,
    validPhone,
    validEmail,
    validPassword,
    merchantStatusMessage,
    validDish,
    slugify,
    isAllowedImageType,
    uploadFileName
};
