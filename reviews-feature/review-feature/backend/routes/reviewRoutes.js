const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createReview,
  getFoodReviews,
  getMerchantReviews,
  updateReview,
  deleteReview,
  replyToReview,
} = require('../controllers/reviewController');

// Public — anyone can view reviews.
router.get('/food/:foodId', getFoodReviews);
router.get('/merchant/:merchantId', getMerchantReviews);

// Logged-in only — writing always requires a valid token.
router.post('/', protect, createReview);
router.put('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);
router.patch('/:id/reply', protect, replyToReview);

module.exports = router;
