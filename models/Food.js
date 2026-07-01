const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    image: { type: String, default: '' },
    badge: { type: String, default: '' },
    stallId: { type: String, required: true }, // Links to Stall.id
    options: {
        sizes: [
            { name: { type: String }, priceDiff: { type: Number } }
        ],
        spicy: [
            { name: { type: String } }
        ],
        addons: [
            { name: { type: String }, priceDiff: { type: Number } }
        ]
    }
});

module.exports = mongoose.model('Food', foodSchema);