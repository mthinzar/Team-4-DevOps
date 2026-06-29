const express = require('express');
const router = express.Router();
const mockFoods = require('../data/mockFoods');

// TEMP — delete once Jayme's real Food Management API is ready.
router.get('/foods', (req, res) => res.json(mockFoods));

module.exports = router;
