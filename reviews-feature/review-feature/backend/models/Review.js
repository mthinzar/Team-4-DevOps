const mongoose = require('mongoose');

/**
 * Review
 * ------
 * One review = one customer's rating + comment on ONE food item.
 *
 * References (foodId, merchantId, userId, orderId) are stored as plain
 * ObjectIds rather than populated sub-documents on purpose: this collection
 * should not need to know the internal shape of Jayme's Food model, May's
 * User model, or Justyn's Order model. When the team merges branches, these
 * ids just need to line up with whatever those models use as their _id.
 */
const reviewSchema = new mongoose.Schema(
  {
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // Optional link back to the order that justifies a "Verified" badge.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    verifiedPurchase: {
      type: Boolean,
      default: false,
    },
    // A merchant can respond once to a review on their own listing.
    merchantReply: {
      text: { type: String, trim: true, maxlength: 500 },
      repliedAt: { type: Date },
    },
  },
  { timestamps: true }
);

// One review per customer per food item — stops review-bombing / spam,
// and matches "edit your review" being the path for a second opinion.
reviewSchema.index({ userId: 1, foodId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
