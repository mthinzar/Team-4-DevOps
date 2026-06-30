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
    // 1. Define the stalls data
    const stalls = [
        {
            id: 'western',
            name: 'Western Stall',
            emoji: '🍔',
            description: 'Burgers, pasta, grills & more',
            foods: [
                { name: 'Burger', description: 'Juicy beef or chicken burger', price: 6.50, image: '', badge: 'bestseller' },
                { name: 'Pasta', description: 'Creamy or tomato base pasta', price: 7.90, image: '', badge: '' },
                { name: 'Chicken Chop', description: 'Grilled chicken with black pepper sauce', price: 8.50, image: '', badge: 'new' },
                { name: 'Fish & Chips', description: 'Crispy battered fish with golden fries', price: 9.00, image: '', badge: '' },
            ]
        },
        {
            id: 'mala',
            name: 'Mala Stall',
            emoji: '🌶️',
            description: 'Spicy mala hotpot with fresh ingredients',
            foods: [
                { name: 'Beef Slices', description: 'Tender beef in spicy mala broth', price: 9.90, image: '', badge: 'spicy' },
                { name: 'Prawn', description: 'Fresh prawns tossed in mala sauce', price: 11.00, image: '', badge: 'bestseller' },
                { name: 'Tofu', description: 'Soft tofu in rich mala soup base', price: 6.00, image: '', badge: '' },
                { name: 'Mushroom', description: 'Assorted mushrooms in spicy broth', price: 5.50, image: '', badge: '' },
                { name: 'Vegetables', description: 'Fresh seasonal greens', price: 4.50, image: '', badge: '' },
                { name: 'Pork Belly', description: 'Fatty pork belly in mala sauce', price: 8.50, image: '', badge: 'spicy' },
            ]
        },
        {
            id: 'chickenrice',
            name: 'Chicken Rice Stall',
            emoji: '🍗',
            description: 'Classic Hainanese chicken rice',
            foods: [
                { name: 'Roasted Chicken Rice', description: 'Fragrant rice with roasted chicken', price: 5.50, image: '', badge: 'bestseller' },
                { name: 'Steam Chicken Rice', description: 'Silky steamed chicken with ginger sauce', price: 5.00, image: '', badge: '' },
                { name: 'Drumstick Rice', description: 'Juicy drumstick with fragrant rice', price: 6.00, image: '', badge: 'new' },
            ]
        },
        {
            id: 'drinks',
            name: 'Drinks Stall',
            emoji: '☕',
            description: 'Hot & cold local beverages',
            foods: [
                { name: 'Kopi O', description: 'Traditional black coffee', price: 1.50, image: '', badge: '' },
                { name: 'Teh Tarik', description: 'Frothy pulled milk tea', price: 1.80, image: '', badge: 'bestseller' },
                { name: 'Milo Dinosaur', description: 'Iced Milo topped with Milo powder', price: 2.50, image: '', badge: '' },
                { name: 'Bandung', description: 'Rose syrup with evaporated milk', price: 2.00, image: '', badge: '' },
                { name: 'Coke', description: 'Chilled canned Coca-Cola', price: 1.80, image: '', badge: '' },
                { name: 'Lemon Tea', description: 'Refreshing iced tea with lemon', price: 2.90, image: '', badge: '' },
            ]
        },
        {
            id: 'malay',
            name: 'Malay Stall',
            emoji: '🍱',
            description: 'Nasi lemak, mee goreng & more',
            foods: [
                { name: 'Nasi Lemak', description: 'Coconut rice with sambal and egg', price: 4.50, image: '', badge: 'bestseller' },
                { name: 'Mee Goreng', description: 'Spicy fried noodles with egg', price: 4.00, image: '', badge: '' },
                { name: 'Nasi Goreng', description: 'Fragrant fried rice with chicken', price: 4.50, image: '', badge: '' },
                { name: 'Ayam Penyet', description: 'Smashed fried chicken with sambal', price: 6.50, image: '', badge: 'spicy' },
            ]
        },
        {
            id: 'chinese',
            name: 'Chinese Stall',
            emoji: '🍜',
            description: 'Wok-fried classics and noodle soups',
            foods: [
                { name: 'Char Kway Teow', description: 'Wok-fried flat noodles with cockles', price: 5.50, image: '', badge: 'bestseller' },
                { name: 'Hokkien Mee', description: 'Braised noodles in rich prawn broth', price: 6.00, image: '', badge: '' },
                { name: 'Bak Chor Mee', description: 'Minced pork noodles with vinegar', price: 5.00, image: '', badge: 'new' },
                { name: 'Wonton Soup', description: 'Clear soup with pork and shrimp dumplings', price: 4.50, image: '', badge: '' },
            ]
        },
        {
            id: 'dessert',
            name: 'Dessert Stall',
            emoji: '🧁',
            description: 'Sweet treats and cold desserts',
            foods: [
                { name: 'Chendol', description: 'Shaved ice with coconut milk and gula melaka', price: 3.50, image: '', badge: 'bestseller' },
                { name: 'Ice Kacang', description: 'Shaved ice with rainbow toppings', price: 3.50, image: '', badge: '' },
                { name: 'Mango Pudding', description: 'Silky smooth mango pudding', price: 3.00, image: '', badge: 'new' },
                { name: 'Waffle', description: 'Crispy waffle with ice cream', price: 5.00, image: '', badge: '' },
            ]
        }
    ];

    // 2. Define an empty logo so it doesn't crash looking for images
    const images = { logo: '/images/logo.png' };

    res.render('menu', { images, stalls });
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