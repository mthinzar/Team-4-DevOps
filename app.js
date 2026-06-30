const express = require('express');
const path = require('path');

// Central image & dish data (edit images/dishes in data/dishes.js)
const { images, popularDishes, foodStores } = require('./data/dishes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Parse JSON request bodies (needed for the checkout / payment endpoint)
app.use(express.json());

app.get('/', (req, res) => {
    res.render('index', { images, foodStores });
});

app.get('/menu', (req, res) => {

    // Unique category list for the filter pills (prefixed with "All")
    const categories = ['All', ...new Set(popularDishes.map(d => d.category))];

    res.render('menu', { images, foods: popularDishes, categories });
});

// Dedicated store listing page (shows all food stores)
app.get('/stores', (req, res) => {
    res.render('stores', { images, foodStores });
});

// Checkout page. The cart itself lives in the browser (localStorage), so this
// route just renders the payment form — the order summary is filled in client-side.
app.get('/checkout', (req, res) => {
    res.render('checkout', { images });
});

// Fake payment endpoint (DEMO ONLY)
// Use test card 4242 4242 4242 4242, other numbers will be declined.
function luhnValid(number) {
    const digits = String(number).replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(digits)) return false;
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = Number(digits[i]);
        if (double) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        double = !double;
    }
    return sum % 10 === 0;
}

app.post('/pay', (req, res) => {
    const { items, customer, card } = req.body || {};

    // 1. Cart must contain something
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Your cart is empty. Add a dish before paying.' });
    }

    // 2. Recalculate the total on the server
    const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
    if (!(total > 0)) {
        return res.status(400).json({ success: false, message: 'Order total is invalid.' });
    }

    // 3. Simulated card check (demo only)
    if (!card || !luhnValid(card.number)) {
        return res.json({ success: false, message: 'Card declined. Check the number and try again.' });
    }

    // 4. Charge successful hand back an order number a tracking system could use later
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