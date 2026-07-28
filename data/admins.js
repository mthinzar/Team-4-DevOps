// ============================================================
//  Admin accounts — platform-staff auth, kept entirely separate
//  from both the customer phone-OTP session and the merchant
//  email+password session. There is no public admin signup route;
//  accounts are seeded once (see seed.js) and can create each
//  other from the Manage Users page.
// ============================================================

const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');

async function findAdminById(adminId) {
    const db = getDB();
    return db.collection('admins').findOne({ adminId: String(adminId).trim() });
}

async function createAdmin({ adminId, password, name }) {
    const db = getDB();
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = {
        adminId: String(adminId).trim(),
        passwordHash,
        name: String(name || adminId).trim(),
        createdAt: new Date()
    };
    const result = await db.collection('admins').insertOne(admin);
    return { _id: result.insertedId, ...admin };
}

async function verifyAdminPassword(admin, password) {
    return bcrypt.compare(password, admin.passwordHash);
}

async function deleteAdmin(id) {
    const db = getDB();
    const result = await db.collection('admins').deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
}

module.exports = { findAdminById, createAdmin, verifyAdminPassword, deleteAdmin };
