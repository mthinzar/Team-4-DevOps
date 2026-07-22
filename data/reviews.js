// ============================================================
//  Food reviews — ratings & comments left by logged-in customers.
//  Stored against a food's stable `id` (see seed.js) rather than its
//  MongoDB _id, so reviews survive a re-seed of the stalls/foods.
// ============================================================

const { getDB } = require('../db');

// Internal ids (userId, the Mongo _id) are deliberately projected out — this
// feeds a public endpoint and only the display fields belong on the wire.
async function getReviewsForFood(foodId) {
    const db = getDB();
    return db.collection('reviews')
        .find({ foodId }, { projection: { _id: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
}

async function addReview(foodId, { userId, userName, rating, comment, orderId }) {
    const db = getDB();

    // Callers validate the rating; anything that still isn't a whole 1-5 is a
    // bug rather than a 5-star review, so fail loudly instead of defaulting.
    const parsed = Number(rating);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        throw new Error(`addReview: invalid rating ${JSON.stringify(rating)}`);
    }

    const review = {
        foodId,
        userId,
        orderId: orderId || null,   // ties the review to the collected order
        userName: userName || 'Anonymous',
        rating: parsed,
        comment: comment ? String(comment).trim().slice(0, 500) : '',
        createdAt: new Date()
    };
    await db.collection('reviews').insertOne(review);
    return review;
}

async function getRatingSummary(foodId) {
    const db = getDB();
    const result = await db.collection('reviews').aggregate([
        { $match: { foodId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]).toArray();

    if (result.length === 0) return { avgRating: 0, reviewCount: 0 };
    return { avgRating: Math.round(result[0].avg * 10) / 10, reviewCount: result[0].count };
}

// Batch version of getRatingSummary — one aggregate query for a whole
// stall page instead of one query per dish.
async function getRatingSummariesForFoods(foodIds) {
    const db = getDB();
    if (!foodIds || foodIds.length === 0) return {};

    const results = await db.collection('reviews').aggregate([
        { $match: { foodId: { $in: foodIds } } },
        { $group: { _id: '$foodId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]).toArray();

    const summaries = {};
    results.forEach(r => {
        summaries[r._id] = { avgRating: Math.round(r.avg * 10) / 10, reviewCount: r.count };
    });
    return summaries;
}

module.exports = { getReviewsForFood, addReview, getRatingSummary, getRatingSummariesForFoods };
