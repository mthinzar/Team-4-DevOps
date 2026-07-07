require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db = null;

async function connectDB() {
    if (db) return db;
    await client.connect();
    db = client.db('foodhub');
    console.log('Connected to MongoDB Atlas successfully!');
    return db;
}

function getDB() {
    if (!db) throw new Error('Database not connected yet — call connectDB() first.');
    return db;
}

module.exports = { connectDB, getDB };
