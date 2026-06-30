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
    // Stalls data (Mala Stall has been completely removed)
    const stalls = [
        {
            id: 'western',
            name: 'Western Stall',
            emoji: '🍔',
            description: 'Burgers, pasta, grills & more',
            foods: [
                { 
                    name: 'Burger', 
                    description: 'Juicy beef or chicken burger', 
                    price: 6.50, 
                    image: '', 
                    badge: 'bestseller',
                    options: {
                        sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Double Patty', priceDiff: 2.50 }],
                        spicy: null,
                        addons: [{ name: 'Extra Cheese', priceDiff: 0.50 }, { name: 'Fried Egg', priceDiff: 1.00 }, { name: 'Bacon Strip', priceDiff: 1.50 }]
                    }
                },
                { 
                    name: 'Pasta', 
                    description: 'Creamy or tomato base pasta', 
                    price: 7.90, 
                    image: '/images/spaghetti.png', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.80 }],
                        spicy: [{ name: 'Non-Spicy' }, { name: 'Mild' }, { name: 'Spicy' }],
                        addons: [{ name: 'Extra Sauce', priceDiff: 0.80 }, { name: 'Add Grilled Chicken', priceDiff: 2.00 }]
                    }
                },
                { 
                    name: 'Chicken Chop', 
                    description: 'Grilled chicken with black pepper sauce', 
                    price: 8.50, 
                    image: '', 
                    badge: 'new',
                    options: {
                        sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Double Chop', priceDiff: 3.50 }],
                        spicy: null,
                        addons: [{ name: 'Extra Pepper Sauce', priceDiff: 0.50 }, { name: 'Add Sunny Side Egg', priceDiff: 1.00 }]
                    }
                },
                { 
                    name: 'Fish & Chips', 
                    description: 'Crispy battered fish with golden fries', 
                    price: 9.00, 
                    image: '', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Giant Haddock', priceDiff: 3.00 }],
                        spicy: null,
                        addons: [{ name: 'Extra Tartar Sauce', priceDiff: 0.50 }, { name: 'Cheese Dip', priceDiff: 1.00 }]
                    }
                },
            ]
        },
        {
            id: 'chickenrice',
            name: 'Chicken Rice Stall',
            emoji: '🍗',
            description: 'Classic Hainanese chicken rice',
            foods: [
                { 
                    name: 'Roasted Chicken Rice', 
                    description: 'Fragrant rice with roasted chicken', 
                    price: 5.50, 
                    image: '', 
                    badge: 'bestseller',
                    options: {
                        sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Rice & Chicken', priceDiff: 1.50 }],
                        spicy: null,
                        addons: [{ name: 'Braised Egg', priceDiff: 0.80 }, { name: 'Add Chicken Liver/Gizzard', priceDiff: 1.00 }]
                    }
                },
                { 
                    name: 'Steam Chicken Rice', 
                    description: 'Silky steamed chicken with ginger sauce', 
                    price: 5.00, 
                    image: '', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Rice & Chicken', priceDiff: 1.50 }],
                        spicy: null,
                        addons: [{ name: 'Braised Egg', priceDiff: 0.80 }, { name: 'Add Tofu', priceDiff: 0.80 }]
                    }
                },
                { 
                    name: 'Drumstick Rice', 
                    description: 'Juicy drumstick with fragrant rice', 
                    price: 6.00, 
                    image: '', 
                    badge: 'new',
                    options: {
                        sizes: [{ name: 'Regular Rice', priceDiff: 0 }, { name: 'Double Rice', priceDiff: 0.80 }],
                        spicy: null,
                        addons: [{ name: 'Braised Egg', priceDiff: 0.80 }]
                    }
                },
            ]
        },
        {
            id: 'drinks',
            name: 'Drinks Stall',
            emoji: '☕',
            description: 'Hot & cold local beverages',
            foods: [
                { 
                    name: 'Kopi O', 
                    description: 'Traditional black coffee', 
                    price: 1.50, 
                    image: '', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Regular Cup', priceDiff: 0 }, { name: 'Large Cup', priceDiff: 0.60 }],
                        spicy: [{ name: 'Hot (Standard)' }, { name: 'Iced (Peng)', priceDiff: 0.40 }],
                        addons: [{ name: 'Less Sweet', priceDiff: 0 }, { name: 'No Sugar (Kosong)', priceDiff: 0 }]
                    }
                },
                { 
                    name: 'Teh Tarik', 
                    description: 'Frothy pulled milk tea', 
                    price: 1.80, 
                    image: '', 
                    badge: 'bestseller',
                    options: {
                        sizes: [{ name: 'Regular Cup', priceDiff: 0 }, { name: 'Large Cup', priceDiff: 0.60 }],
                        spicy: [{ name: 'Hot (Standard)' }, { name: 'Iced (Peng)', priceDiff: 0.40 }],
                        addons: [{ name: 'Less Sweet', priceDiff: 0 }]
                    }
                },
                { 
                    name: 'Milo Dinosaur', 
                    description: 'Iced Milo topped with Milo powder', 
                    price: 2.50, 
                    image: '', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Jumbo', priceDiff: 0.80 }],
                        spicy: [{ name: 'Iced (Standard)' }, { name: 'Hot Milo', priceDiff: -0.30 }],
                        addons: [{ name: 'Extra Milo Powder', priceDiff: 0.50 }]
                    }
                },
                { 
                    name: 'Bandung', 
                    description: 'Rose syrup with evaporated milk', 
                    price: 2.00, 
                    image: '', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Large', priceDiff: 0.60 }],
                        spicy: null,
                        addons: [{ name: 'Add Grass Jelly (Chin Chow)', priceDiff: 0.50 }]
                    }
                },
            ]
        },
        {
            id: 'malay',
            name: 'Malay Stall',
            emoji: '🍱',
            description: 'Nasi lemak, mee goreng & more',
            foods: [
                { 
                    name: 'Nasi Lemak', 
                    description: 'Coconut rice with sambal and egg', 
                    price: 4.50, 
                    image: '', 
                    badge: 'bestseller',
                    options: {
                        sizes: [{ name: 'Standard Portion', priceDiff: 0 }, { name: 'Double Rice', priceDiff: 0.80 }],
                        spicy: [{ name: 'Standard Sambal' }, { name: 'Extra Sambal', priceDiff: 0.20 }],
                        addons: [{ name: 'Add Fried Chicken Wing', priceDiff: 1.80 }, { name: 'Add Fishcake', priceDiff: 0.80 }]
                    }
                },
                { 
                    name: 'Mee Goreng', 
                    description: 'Spicy fried noodles with egg', 
                    price: 4.00, 
                    image: '', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large Noodle', priceDiff: 1.00 }],
                        spicy: [{ name: 'Mild' }, { name: 'Spicy (Standard)' }, { name: 'Extra Spicy' }],
                        addons: [{ name: 'Add Sunny Side Egg', priceDiff: 1.00 }]
                    }
                },
            ]
        },
        {
            id: 'chinese',
            name: 'Chinese Stall',
            emoji: '🍜',
            description: 'Wok-fried classics and noodle soups',
            foods: [
                { 
                    name: 'Char Kway Teow', 
                    description: 'Wok-fried flat noodles with cockles', 
                    price: 5.50, 
                    image: '', 
                    badge: 'bestseller',
                    options: {
                        sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large', priceDiff: 1.20 }],
                        spicy: [{ name: 'Mild' }, { name: 'Medium Spicy' }, { name: 'Extra Spicy' }],
                        addons: [{ name: 'Extra Cockles', priceDiff: 1.50 }, { name: 'Add Fried Egg', priceDiff: 1.00 }]
                    }
                },
                { 
                    name: 'Bak Chor Mee', 
                    description: 'Minced pork noodles with vinegar', 
                    price: 5.00, 
                    image: '', 
                    badge: 'new',
                    options: {
                        sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large Noodle', priceDiff: 1.00 }],
                        spicy: [{ name: 'No Chili (Vinegar only)' }, { name: 'Mild Chili' }, { name: 'Spicy' }],
                        addons: [{ name: 'Add Extra Meatballs (3pcs)', priceDiff: 1.20 }, { name: 'Add Braised Mushrooms', priceDiff: 1.00 }]
                    }
                },
            ]
        },
        {
            id: 'dessert',
            name: 'Dessert Stall',
            emoji: '🧁',
            description: 'Sweet treats and cold desserts',
            foods: [
                { 
                    name: 'Chendol', 
                    description: 'Shaved ice with coconut milk and gula melaka', 
                    price: 3.50, 
                    image: '', 
                    badge: 'bestseller',
                    options: {
                        sizes: [{ name: 'Standard Bowl', priceDiff: 0 }, { name: 'Large Bowl', priceDiff: 1.00 }],
                        spicy: null,
                        addons: [{ name: 'Extra Gula Melaka Drizzle', priceDiff: 0.50 }, { name: 'Add Durian Flesh', priceDiff: 2.00 }]
                    }
                },
                { 
                    name: 'Waffle', 
                    description: 'Crispy waffle with ice cream', 
                    price: 5.00, 
                    image: '', 
                    badge: '',
                    options: {
                        sizes: [{ name: 'Single Waffle', priceDiff: 0 }, { name: 'Double Stacked Waffles', priceDiff: 2.50 }],
                        spicy: null,
                        addons: [{ name: 'Add Chocolate Drizzle', priceDiff: 0.50 }, { name: 'Add Scoop of Vanilla Ice Cream', priceDiff: 1.50 }]
                    }
                },
            ]
        }
    ];

    // Define an empty logo so it doesn't crash looking for images
    const images = { logo: '/images/logo.png' };

    res.render('menu', { images, stalls });
});

// Checkout page
app.get('/checkout', (req, res) => {
    res.render('checkout', { images });
});

// Fake payment validation algorithm (Luhn)
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

// Payment charge endpoint
app.post('/pay', (req, res) => {
    const { items, customer, card } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Your cart is empty. Add a dish before paying.' });
    }

    const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
    if (!(total > 0)) {
        return res.status(400).json({ success: false, message: 'Order total is invalid.' });
    }

    if (!card || !luhnValid(card.number)) {
        return res.json({ success: false, message: 'Card declined. Check the number and try again.' });
    }

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