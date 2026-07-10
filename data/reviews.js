// ============================================================
//  Food reviews — ratings & comments left by logged-in customers.
//  Stored against a food's stable `id` (see seed.js) rather than its
//  MongoDB _id, so reviews survive a re-seed of the stalls/foods.
// ============================================================

const { getDB } = require('../db');

async function getReviewsForFood(foodId) {
    const db = getDB();
    return db.collection('reviews')
        .find({ foodId })
        .sort({ createdAt: -1 })
        .toArray();
}

async function addReview(foodId, { userId, userName, rating, comment }) {
    const db = getDB();
    const review = {
        foodId,
        userId,
        userName: userName || 'Anonymous',
        rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
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
