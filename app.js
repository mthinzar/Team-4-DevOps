const express = require('express');
const path = require('path');

// Central image & dish data (edit images/dishes in data/dishes.js)
const { images, popularDishes } = require('./data/dishes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Parse JSON request bodies (needed for the checkout / payment endpoint)
app.use(express.json());

app.get('/', (req, res) => {
    res.render('index', { images, popularDishes });
});

app.get('/menu', (req, res) => {

    // Unique category list for the filter pills (prefixed with "All")
    const categories = ['All', ...new Set(popularDishes.map(d => d.category))];

    res.render('menu', { images, foods: popularDishes, categories });
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

    // 4. Check stock — a dish may have sold out since it was added to the cart
    const outOfStock = [];
    items.forEach(item => {
        const dish = popularDishes.find(d => d.name === item.name);
        if (!dish || dish.stock < Number(item.qty)) {
            outOfStock.push(item.name);
        }
    });

    // 5. Payment goes through (the money is taken). We hand back an order number
    //    plus any out-of-stock items, so the customer can change or refund.
    const orderId = 'FH-' + Date.now().toString().slice(-6);
    return res.json({
        success: true,
        orderId,
        total: Number(total.toFixed(2)),
        name: customer && customer.name ? customer.name : 'Guest',
        outOfStock: outOfStock
    });
});

// Fake refund endpoint (DEMO ONLY) — pretends to send the money back
app.post('/refund', (req, res) => {
    const { orderId, total } = req.body || {};
    if (!orderId) {
        return res.status(400).json({ success: false, message: 'Missing order id.' });
    }
    return res.json({
        success: true,
        orderId: orderId,
        refunded: Number(total) || 0,
        message: 'Refund processed. The money will be returned to your card.'
    });
});

// Order history page. Orders live in the browser (localStorage), so this route
// just renders the page shell; the list is filled in client-side from cart.js.
app.get('/orders', (req, res) => {
    res.render('orders', { images });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});