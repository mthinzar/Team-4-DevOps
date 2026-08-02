// ============================================================
//  Creates the test data (stalls, dishes, merchants, admins,
//  customers, orders) and deletes it again afterwards.
//
//  Everything made here is named with "zztest-" or "@test.invalid"
//  so cleanup() only ever deletes its own rows. It never drops a
//  collection, so running the tests will not wipe the demo data
//  from seed.js.
// ============================================================

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const PREFIX = 'zztest-';

let client = null;
let db = null;
let counter = 0;

async function connect() {
    if (db) return db;
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/foodhub';
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('foodhub');   // must match db.js
    return db;
}

async function disconnect() {
    await client.close();
    client = null;
    db = null;
}

// A short id that is different every time.
function newId() {
    counter = counter + 1;
    return Date.now().toString(36) + counter + Math.random().toString(36).slice(2, 6);
}

// A valid Singapore mobile number for a test customer.
function testPhone() {
    return '9' + String(Math.floor(Math.random() * 9000000) + 1000000);
}

// ---- Creating test data -------------------------------------------

async function createStall(name, isOpen) {
    const database = await connect();
    const stall = {
        id: PREFIX + 'stall-' + newId(),
        name: name || 'Test Stall',
        emoji: '🍽️',
        image: '/images/logo.png',
        description: 'Made by the automated tests',
        merchantId: null,
        isOpen: isOpen === false ? false : true
    };
    await database.collection('stalls').insertOne(stall);
    return stall;
}

async function createFood(stallId, name, price, soldOut, options) {
    const database = await connect();
    const food = {
        id: PREFIX + 'food-' + newId(),
        stall_id: stallId,
        name: name || 'Test Dish',
        price: price || 5.00,
        image: '/images/logo.png',
        badge: '',
        options: options || null,
        soldOut: soldOut === true ? true : false
    };
    await database.collection('foods').insertOne(food);
    return food;
}

// Makes a merchant who already owns a stall — the normal situation.
async function createMerchant(status, stallName) {
    const database = await connect();
    const email = 'merchant-' + newId() + '@test.invalid';
    const password = 'testpass123';
    const passwordHash = await bcrypt.hash(password, 4);   // low cost, throwaway

    const result = await database.collection('merchants').insertOne({
        email: email,
        passwordHash: passwordHash,
        stallId: null,
        status: status || 'approved',
        createdAt: new Date()
    });

    const stall = await createStall(stallName || 'Test Stall');
    await database.collection('stalls').updateOne(
        { id: stall.id },
        { $set: { merchantId: result.insertedId } }
    );
    await database.collection('merchants').updateOne(
        { _id: result.insertedId },
        { $set: { stallId: stall.id } }
    );

    return {
        id: result.insertedId.toString(),
        email: email,
        password: password,
        stall: stall
    };
}

async function createAdmin(name) {
    const database = await connect();
    const adminId = PREFIX + 'admin-' + newId();
    const password = 'adminpass123';
    const passwordHash = await bcrypt.hash(password, 4);

    const result = await database.collection('admins').insertOne({
        adminId: adminId,
        passwordHash: passwordHash,
        name: name || 'Test Admin',
        createdAt: new Date()
    });

    return {
        id: result.insertedId.toString(),
        adminId: adminId,
        password: password
    };
}

async function createCustomer(name, disabled) {
    const database = await connect();
    const phone = testPhone();
    const result = await database.collection('users').insertOne({
        name: name || 'Test Customer',
        phone: phone,
        disabled: disabled === true ? true : false,
        createdAt: new Date()
    });
    return { id: result.insertedId.toString(), phone: phone };
}

// Puts an order straight into the database. Used for situations the
// website will not produce on demand, such as two orders sharing an
// order ID.
async function createOrder(orderId, stallId, readyAt) {
    const database = await connect();
    const order = {
        orderId: orderId,
        userId: null,
        customerName: 'Test Customer',
        stallId: stallId,
        items: [],
        total: 10.00,
        paymentMethod: 'counter',
        paymentStatus: 'unpaid',
        queueNum: 101,
        prepTimeSeconds: 300,
        readyAt: readyAt,
        status: 'pending',
        createdAt: new Date()
    };
    await database.collection('orders').insertOne(order);
    return order;
}

// ---- Reading data back --------------------------------------------

async function findOrder(orderId) {
    const database = await connect();
    return database.collection('orders').findOne({ orderId: orderId });
}

async function findOrderForStall(orderId, stallId) {
    const database = await connect();
    return database.collection('orders').findOne({ orderId: orderId, stallId: stallId });
}

async function findFood(foodId) {
    const database = await connect();
    return database.collection('foods').findOne({ id: foodId });
}

async function findStall(stallId) {
    const database = await connect();
    return database.collection('stalls').findOne({ id: stallId });
}

async function findMerchant(merchantId) {
    const database = await connect();
    return database.collection('merchants').findOne({ _id: new ObjectId(merchantId) });
}

async function setMerchantStatus(merchantId, status) {
    const database = await connect();
    await database.collection('merchants').updateOne(
        { _id: new ObjectId(merchantId) },
        { $set: { status: status } }
    );
}

async function addReview(foodId, userName, rating, comment) {
    const database = await connect();
    const result = await database.collection('reviews').insertOne({
        foodId: foodId,
        userId: 'test-user',
        userName: userName,
        rating: rating,
        comment: comment || '',
        createdAt: new Date()
    });
    return result.insertedId.toString();
}

async function countReviews(foodId) {
    const database = await connect();
    return database.collection('reviews').countDocuments({ foodId: foodId });
}

// ---- Cleaning up ----------------------------------------------------

async function cleanup() {
    const database = await connect();

    const stalls = await database.collection('stalls').find({ id: /^zztest-/ }).toArray();
    const foods = await database.collection('foods').find({ id: /^zztest-/ }).toArray();
    const users = await database.collection('users').find({ name: /^Test / }).toArray();

    const stallIds = stalls.map(stall => stall.id);
    const foodIds = foods.map(food => food.id);
    const userIds = users.map(user => user._id.toString());

    await database.collection('orders').deleteMany({ stallId: { $in: stallIds } });
    await database.collection('orders').deleteMany({ userId: { $in: userIds } });
    await database.collection('reviews').deleteMany({ foodId: { $in: foodIds } });
    await database.collection('payments').deleteMany({ userId: { $in: userIds } });
    await database.collection('foods').deleteMany({ id: /^zztest-/ });
    await database.collection('stalls').deleteMany({ id: /^zztest-/ });
    await database.collection('admins').deleteMany({ adminId: /^zztest-/ });
    await database.collection('merchants').deleteMany({ email: /@test\.invalid$/ });
    await database.collection('users').deleteMany({ name: /^Test / });
}

module.exports = {
    connect,
    disconnect,
    cleanup,
    createStall,
    createFood,
    createMerchant,
    createAdmin,
    createCustomer,
    createOrder,
    findOrder,
    findOrderForStall,
    findFood,
    findStall,
    findMerchant,
    setMerchantStatus,
    addReview,
    countReviews,
    testPhone,
    newId,
    PREFIX
};
