const mongoose = require('mongoose');

/**
 * PLACEHOLDER MODEL — delete this file once Justyn's real Order model is
 * merged, and point reviewController.js at his model instead.
 *
 * This only exists so the "verified purchase" check has something real to
 * query against while the team works in parallel. It only needs to be
 * shaped closely enough to support that one check.
 */
const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    foodId: { type: mongoose.Schema.Types.ObjectId, required: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
