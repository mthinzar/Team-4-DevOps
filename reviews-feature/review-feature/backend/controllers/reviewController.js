const mongoose = require('mongoose');
const Review = require('../models/Review');
const Order = require('../models/Order');

/**
 * POST /api/reviews
 * Customer creates a review for a food item.
 */
async function createReview(req, res) {
  try {
    const { foodId, merchantId, orderId, rating, comment } = req.body;

    if (!foodId || !merchantId || rating === undefined) {
      return res
        .status(400)
        .json({ message: 'foodId, merchantId and rating are required.' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }

    // One review per customer per food item.
    const existing = await Review.findOne({ userId: req.user.id, foodId });
    if (existing) {
      return res.status(409).json({
        message: 'You already reviewed this item. Edit your existing review instead.',
      });
    }

    // Check whether this review is backed by a completed order.
    let verifiedPurchase = false;
    if (orderId) {
      const order = await Order.findOne({
        _id: orderId,
        userId: req.user.id,
        foodId,
        status: 'Completed',
      });
      verifiedPurchase = !!order;
    }

    if (process.env.REQUIRE_VERIFIED_PURCHASE === 'true' && !verifiedPurchase) {
      return res.status(403).json({
        message: 'Only customers with a completed order for this item can leave a review.',
      });
    }

    const review = await Review.create({
      foodId,
      merchantId,
      orderId: orderId || null,
      userId: req.user.id,
      rating,
      comment,
      verifiedPurchase,
    });

    res.status(201).json(review);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You already reviewed this item.' });
    }
    res.status(500).json({ message: 'Could not create review.', error: err.message });
  }
}

/**
 * GET /api/reviews/food/:foodId
 * Public — anyone viewing a food item can see its reviews + average rating.
 */
async function getFoodReviews(req, res) {
  try {
    const { foodId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!mongoose.Types.ObjectId.isValid(foodId)) {
      return res.status(400).json({ message: 'Invalid foodId.' });
    }

    const reviews = await Review.find({ foodId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const stats = await Review.aggregate([
      { $match: { foodId: new mongoose.Types.ObjectId(foodId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const { averageRating = 0, totalReviews = 0 } = stats[0] || {};

    res.json({
      reviews,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch reviews.', error: err.message });
  }
}

/**
 * GET /api/reviews/merchant/:merchantId
 * Public — powers a merchant's storefront review summary.
 */
async function getMerchantReviews(req, res) {
  try {
    const { merchantId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      return res.status(400).json({ message: 'Invalid merchantId.' });
    }

    const reviews = await Review.find({ merchantId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const stats = await Review.aggregate([
      { $match: { merchantId: new mongoose.Types.ObjectId(merchantId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const { averageRating = 0, totalReviews = 0 } = stats[0] || {};

    res.json({
      reviews,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch reviews.', error: err.message });
  }
}

/**
 * PUT /api/reviews/:id
 * Owner only — edit your own rating/comment.
 */
async function updateReview(req, res) {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });

    if (review.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit your own review.' });
    }

    const { rating, comment } = req.body;

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
      }
      review.rating = rating;
    }

    if (comment !== undefined) review.comment = comment;

    await review.save();
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: 'Could not update review.', error: err.message });
  }
}

/**
 * DELETE /api/reviews/:id
 * Owner or admin only.
 */
async function deleteReview(req, res) {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });

    const isOwner = review.userId.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'You are not allowed to delete this review.' });
    }

    await review.deleteOne();
    res.json({ message: 'Review deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete review.', error: err.message });
  }
}

/**
 * PATCH /api/reviews/:id/reply
 * Merchant (or admin) replies once to a review on their own listing.
 */
async function replyToReview(req, res) {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });

    const isMerchantOwner =
      req.user.role === 'merchant' && review.merchantId.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isMerchantOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: 'Only the merchant who owns this listing can reply.' });
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Reply text is required.' });
    }

    review.merchantReply = { text: text.trim(), repliedAt: new Date() };
    await review.save();
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: 'Could not save reply.', error: err.message });
  }
}

module.exports = {
  createReview,
  getFoodReviews,
  getMerchantReviews,
  updateReview,
  deleteReview,
  replyToReview,
};
