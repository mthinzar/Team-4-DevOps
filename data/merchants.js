// ============================================================
//  Merchant accounts — email + password auth for stall owners,
//  kept entirely separate from the customer phone-OTP session.
//  Each merchant owns exactly one stall (merchants.stallId ->
//  stalls.id, and stalls.merchantId -> merchants._id).
// ============================================================

const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');

function slugify(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

async function findMerchantByEmail(email) {
    const db = getDB();
    return db.collection('merchants').findOne({ email: String(email).toLowerCase().trim() });
}

async function createMerchant({ email, password }) {
    const db = getDB();
    const passwordHash = await bcrypt.hash(password, 10);
    const merchant = {
        email: String(email).toLowerCase().trim(),
        passwordHash,
        stallId: null,
        createdAt: new Date()
    };
    const result = await db.collection('merchants').insertOne(merchant);
    return { _id: result.insertedId, ...merchant };
}

async function verifyMerchantPassword(merchant, password) {
    return bcrypt.compare(password, merchant.passwordHash);
}

async function linkMerchantToStall(merchantId, stallId) {
    const db = getDB();
    await db.collection('merchants').updateOne(
        { _id: new ObjectId(merchantId) },
        { $set: { stallId } }
    );
}

// Stalls nobody has claimed yet — offered as a dropdown on merchant signup.
async function getUnclaimedStalls() {
    const db = getDB();
    return db.collection('stalls').find({ merchantId: null }).toArray();
}

// Atomically claims a stall for a merchant. Fails (matchedCount 0) if the
// stall was claimed by someone else between page load and form submit.
async function claimExistingStall(stallId, merchantId) {
    const db = getDB();
    const result = await db.collection('stalls').updateOne(
        { id: stallId, merchantId: null },
        { $set: { merchantId: new ObjectId(merchantId) } }
    );
    return result.modifiedCount === 1;
}

async function createAndClaimStall({ name, image, merchantId }) {
    const db = getDB();
    let id = slugify(name);
    if (!id) id = 'stall';

    // Guarantee a unique id even if two stalls share a similar name.
    let candidate = id;
    let suffix = 1;
    while (await db.collection('stalls').findOne({ id: candidate })) {
        suffix += 1;
        candidate = `${id}-${suffix}`;
    }

    const stall = {
        id: candidate,
        name: String(name).trim(),
        emoji: '🍽️',
        image: image || '/images/logo.png',
        description: '',
        merchantId: new ObjectId(merchantId),
        isOpen: true
    };
    await db.collection('stalls').insertOne(stall);
    return stall;
}

module.exports = {
    slugify,
    findMerchantByEmail,
    createMerchant,
    verifyMerchantPassword,
    linkMerchantToStall,
    getUnclaimedStalls,
    claimExistingStall,
    createAndClaimStall
};
