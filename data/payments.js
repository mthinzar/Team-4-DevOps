// ============================================================
//  Payments for FoodHub.
//
//  No real money moves here — but the shapes, rules and failure modes
//  mirror how a Singapore food-court checkout actually behaves:
//
//    * PayNow  — a real SGQR/EMVCo-format payload, scannable by any
//                banking app, confirmed out-of-band like a bank push.
//    * Card    — brand detection, brand-aware CVV/length rules, Luhn,
//                and specific issuer decline reasons.
//    * Counter — pay the stall directly; the order is placed unpaid
//                and the merchant marks it settled on collection.
//
//  Card numbers are never stored. Only the brand and last four digits
//  are kept on the payment record, which is what a real PSP returns.
// ============================================================

const crypto = require('crypto');

const PAYMENT_METHODS = ['paynow', 'card', 'counter'];

// ------------------------------------------------------------------
// Card brands
// ------------------------------------------------------------------

const CARD_BRANDS = [
    { brand: 'amex',       label: 'American Express', pattern: /^3[47]/,                      lengths: [15],         cvv: 4, gaps: [4, 10] },
    { brand: 'visa',       label: 'Visa',             pattern: /^4/,                          lengths: [16, 19],     cvv: 3, gaps: [4, 8, 12, 16] },
    { brand: 'mastercard', label: 'Mastercard',       pattern: /^(5[1-5]|2[2-7])/,            lengths: [16],         cvv: 3, gaps: [4, 8, 12] },
    { brand: 'unionpay',   label: 'UnionPay',         pattern: /^62/,                         lengths: [16, 17, 18, 19], cvv: 3, gaps: [4, 8, 12, 16] }
];

function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
}

function detectCardBrand(number) {
    const digits = digitsOnly(number);
    return CARD_BRANDS.find(entry => entry.pattern.test(digits)) || null;
}

function luhnValid(number) {
    const digits = digitsOnly(number);
    if (!/^\d{12,19}$/.test(digits)) return false;

    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = Number(digits[i]);
        if (double) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        double = !double;
    }
    return sum % 10 === 0;
}

function expiryValid(value) {
    const match = String(value || '').match(/^(\d{2})\s*\/?\s*(\d{2})$/);
    if (!match) return false;

    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) return false;

    // A card is good through the last day of its expiry month.
    return new Date(year, month, 1) > new Date();
}

// ------------------------------------------------------------------
// Card authorisation (simulated)
//
// Behaviour is driven by the card number so the same input always gives
// the same outcome — which is what makes a demo reproducible. The test
// numbers below follow the conventions most payment providers use.
// ------------------------------------------------------------------

const TEST_CARD_OUTCOMES = {
    '4242424242424242': { approved: true },
    '5555555555554444': { approved: true },
    '378282246310005':  { approved: true },
    '6250947000000014': { approved: true },
    '4000000000000002': { approved: false, code: 'card_declined',     message: 'Your bank declined this card. Try another payment method.' },
    '4000000000009995': { approved: false, code: 'insufficient_funds', message: 'Insufficient funds. Try another card or pay with PayNow.' },
    '4000000000000069': { approved: false, code: 'expired_card',      message: 'That card has expired. Check the expiry date and try again.' },
    '4000000000000127': { approved: false, code: 'incorrect_cvc',     message: 'The security code (CVV) is incorrect.' },
    '4000000000000119': { approved: false, code: 'processing_error',  message: 'The bank could not be reached. Please try again in a moment.' }
};

function authoriseCard({ number, expiry, cvv }) {
    const digits = digitsOnly(number);
    const brandInfo = detectCardBrand(digits);

    if (!brandInfo) {
        return { approved: false, code: 'unsupported_brand', message: 'We accept Visa, Mastercard, American Express and UnionPay.' };
    }
    if (!brandInfo.lengths.includes(digits.length) || !luhnValid(digits)) {
        return { approved: false, code: 'invalid_number', message: 'That card number is not valid. Please check and re-enter it.' };
    }
    if (!expiryValid(expiry)) {
        return { approved: false, code: 'invalid_expiry', message: 'Enter a valid expiry date in the future (MM/YY).' };
    }
    if (!new RegExp(`^\\d{${brandInfo.cvv}}$`).test(digitsOnly(cvv))) {
        return {
            approved: false,
            code: 'invalid_cvc',
            message: `${brandInfo.label} security codes are ${brandInfo.cvv} digits.`
        };
    }

    const outcome = TEST_CARD_OUTCOMES[digits] || { approved: true };
    const base = { brand: brandInfo.brand, brandLabel: brandInfo.label, last4: digits.slice(-4) };

    if (!outcome.approved) {
        return { ...base, approved: false, code: outcome.code, message: outcome.message };
    }

    return {
        ...base,
        approved: true,
        code: 'approved',
        authCode: crypto.randomBytes(3).toString('hex').toUpperCase(),
        message: 'Approved'
    };
}

// ------------------------------------------------------------------
// PayNow — SGQR / EMVCo QR payload
//
// Built to the EMVCo merchant-presented QR spec that PayNow uses, so the
// string below is structurally what a real PayNow QR encodes (right down
// to the CRC), even though the UEN is a demo one.
// ------------------------------------------------------------------

const PAYNOW_UEN = process.env.PAYNOW_UEN || '202512345KFOODHUB';
const MERCHANT_NAME = 'FOODHUB';
const MERCHANT_CITY = 'Singapore';
const MCC_RESTAURANTS = '5812';
const CURRENCY_SGD = '702';
const COUNTRY_SG = 'SG';

// EMVCo fields are ID + 2-digit length + value, nested the same way.
function tlv(id, value) {
    const str = String(value);
    return `${id}${String(str.length).padStart(2, '0')}${str}`;
}

// CRC-16/CCITT-FALSE over the payload including the "6304" header.
function crc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildPayNowPayload({ amount, reference, expiresAt }) {
    const merchantAccount =
        tlv('00', 'SG.PAYNOW') +
        tlv('01', '2') +                 // proxy type 2 = UEN
        tlv('02', PAYNOW_UEN) +
        tlv('03', '1') +                 // amount is fixed, not editable by payer
        tlv('04', formatExpiry(expiresAt));

    const payload =
        tlv('00', '01') +                            // payload format indicator
        tlv('01', '12') +                            // dynamic QR (single use)
        tlv('26', merchantAccount) +
        tlv('52', MCC_RESTAURANTS) +
        tlv('53', CURRENCY_SGD) +
        tlv('54', amount.toFixed(2)) +
        tlv('58', COUNTRY_SG) +
        tlv('59', MERCHANT_NAME) +
        tlv('60', MERCHANT_CITY) +
        tlv('62', tlv('01', reference)) +            // bill / order reference
        '6304';

    return payload + crc16(payload);
}

function formatExpiry(date) {
    const d = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Human-readable reference printed under the QR and echoed on the receipt,
// so a customer can match the bank notification to the order.
function newPaymentReference() {
    return 'FH' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

module.exports = {
    PAYMENT_METHODS,
    CARD_BRANDS,
    detectCardBrand,
    luhnValid,
    expiryValid,
    authoriseCard,
    buildPayNowPayload,
    newPaymentReference,
    crc16,
    PAYNOW_UEN
};
