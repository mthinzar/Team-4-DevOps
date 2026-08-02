// ============================================================
//  Merchant accounts — email + password auth for stall owners,
//  kept entirely separate from the customer phone-OTP session.
//  Each merchant owns exactly one stall (merchants.stallId ->
//  stalls.id, and stalls.merchantId -> merchants._id).
// ============================================================

const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
const { slugify } = require('./validation');

async function findMerchantByEmail(email) {
    const db = getDB();
    return db.collection('merchants').findOne({ email: String(email).toLowerCase().trim() });
}

// status defaults to 'pending' for self-service signups, so an admin can
// approve/reject them; admin-created merchants pass status:'approved' to
// skip the review queue since the admin already vetted them directly.
async function createMerchant({ email, password, status = 'pending' }) {
    const db = getDB();
    const passwordHash = await bcrypt.hash(password, 10);
    const merchant = {
        email: String(email).toLowerCase().trim(),
        passwordHash,
        stallId: null,
        status,
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

// ------------------------------------------------------------------
// Admin-facing management helpers. Every merchant here is joined with
// its stall (if any) so the admin UI can show store name/status without
// a separate query per row.
// ------------------------------------------------------------------

async function listMerchantsWithStalls() {
    const db = getDB();
    const merchants = await db.collection('merchants').find({}).sort({ createdAt: -1 }).toArray();
    const stallIds = merchants.map(m => m.stallId).filter(Boolean);
    const stalls = stallIds.length
        ? await db.collection('stalls').find({ id: { $in: stallIds } }).toArray()
        : [];
    const stallById = {};
    stalls.forEach(s => { stallById[s.id] = s; });

    return merchants.map(m => ({
        ...m,
        status: m.status || 'approved', // legacy accounts predating the status field
        stall: m.stallId ? stallById[m.stallId] || null : null
    }));
}

async function setMerchantStatus(merchantId, status) {
    const db = getDB();
    const result = await db.collection('merchants').updateOne(
        { _id: new ObjectId(merchantId) },
        { $set: { status } }
    );
    return result.matchedCount === 1;
}

// Removing a merchant frees their stall for someone else to claim, but
// keeps the stall itself (and its order/review history) intact.
async function removeMerchant(merchantId) {
    const db = getDB();
    const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(merchantId) });
    if (!merchant) return false;

    if (merchant.stallId) {
        await db.collection('stalls').updateOne({ id: merchant.stallId }, { $set: { merchantId: null } });
    }
    await db.collection('merchants').deleteOne({ _id: new ObjectId(merchantId) });
    return true;
}

function generateTempPassword() {
    return Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 10);
}

async function resetMerchantPassword(merchantId) {
    const db = getDB();
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const result = await db.collection('merchants').updateOne(
        { _id: new ObjectId(merchantId) },
        { $set: { passwordHash } }
    );
    if (result.matchedCount === 0) return null;
    return tempPassword;
}

module.exports = {
    slugify,
    findMerchantByEmail,
    createMerchant,
    verifyMerchantPassword,
    linkMerchantToStall,
    getUnclaimedStalls,
    claimExistingStall,
    createAndClaimStall,
    listMerchantsWithStalls,
    setMerchantStatus,
    removeMerchant,
    resetMerchantPassword
};
