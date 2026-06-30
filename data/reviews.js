// ============================================================
//  In-memory dish review store.
//  Reviews reset on server restart.
//  Swap for a database later if persistence is needed.
// ============================================================

// Shape: { [dishId]: [ { id, name, rating, comment, date } ] }
const reviewsByDish = {};

/** Get all reviews for a dish, newest first. */
function getReviews(dishId) {
    return reviewsByDish[dishId] || [];
}

/** Add a review for a dish. Returns the saved review. */
function addReview(dishId, { name, rating, comment }) {
    const review = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: name && name.trim() ? name.trim() : 'Anonymous',
        rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
        comment: comment ? comment.trim() : '',
        date: new Date()
    };
    if (!reviewsByDish[dishId]) reviewsByDish[dishId] = [];
    reviewsByDish[dishId].unshift(review);
    return review;
}

/** Average rating for a dish, rounded to 1 decimal. Returns 0 if no reviews. */
function getAverageRating(dishId) {
    const reviews = getReviews(dishId);
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    return Math.round((total / reviews.length) * 10) / 10;
}

/** Number of reviews for a dish. */
function getReviewCount(dishId) {
    return getReviews(dishId).length;
}

module.exports = { getReviews, addReview, getAverageRating, getReviewCount };
