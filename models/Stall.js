const mongoose = require('mongoose');

const stallSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // e.g., 'western', 'drinks'
    name: { type: String, required: true },
    emoji: { type: String, required: true },
    description: { type: String, required: true }
});

module.exports = mongoose.model('Stall', stallSchema);