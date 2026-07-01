const express = require('express');
const path = require('path');

// Import images, popular dishes, and menu stalls from central data file
const { images, popularDishes, stalls } = require('./data/dishes');

const app = report = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Parse JSON request bodies (needed for checkout / payment)
app.use(express.json());

// 1. Home Page Route
app.get('/', (req, res) => {
    res.render('index', { images, popularDishes });
});

// 2. Menu Page Route
app.get('/menu', (req, res) => {
    res.render('menu', { images, stalls });
});

// 3. Checkout Page Route
app.get('/checkout', (req, res) => {
    res.render('checkout', { images });
});

// 4. Payment Endpoint
app.post('/pay', (req, res) => {
    const { items, customer } = req.body;
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
    const orderId = 'FH-' + Date.now().toString().slice(-6);
    return res.json({
        success: true,
        orderId,
        total: Number(total.toFixed(2)),
        name: customer && customer.name ? customer.name : 'Guest',
        status: 'paid'
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});