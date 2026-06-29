const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const router = express.Router();

/**
 * TEMP ROUTE — delete this whole file once May's real login/JWT system
 * is merged in. Its only job is to hand out a working token so reviews
 * can be created/edited/deleted without waiting on the real login flow.
 *
 * POST /api/dev/dev-token   body: { "role": "customer" | "merchant" | "admin", "id"?: string }
 * Returns: { token, id, role }
 *
 * If "id" isn't supplied (or isn't a valid Mongo ObjectId), a fresh one
 * is generated so you always get something Review.userId can store.
 */
router.post('/dev-token', (req, res) => {
  const role = req.body.role || 'customer';
  const id =
    req.body.id && mongoose.Types.ObjectId.isValid(req.body.id)
      ? req.body.id
      : new mongoose.Types.ObjectId().toString();

  const token = jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, id, role });
});

module.exports = router;
