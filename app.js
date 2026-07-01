const express = require('express');
const path = require('path');

// Connect to MongoDB Atlas
require('./db');
const Stall = require('./models/Stall');
const Food = require('./models/Food');

// Import images & home page dishes
const { images, popularDishes } = require('./data/dishes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Parse JSON request bodies (needed for checkout / payment)
app.use(express.json());

// Main home page route
app.get('/', (req, res) => {
    res.render('index', { images, popularDishes });
});

// GET /menu - Dynamically query stalls and food items from MongoDB Atlas
app.get('/menu', async (req, res) => {
    try {
        const dbStalls = await Stall.find().lean();
        const dbFoods = await Food.find().lean();

        // Dynamically map foods into their stalls so your menu.ejs runs without modifications
        const stalls = dbStalls.map(stall => {
            return {
                ...stall,
                foods: dbFoods.filter(food => food.stallId === stall.id)
            };
        });

        res.render('menu', { images, stalls });
    } catch (err) {
        console.error("Error loading menu from DB:", err);
        res.status(500).send("Database error loading menu");
    }
});

// GET /checkout - Render the checkout screen
app.get('/checkout', (req, res) => {
    res.render('checkout', { images });
});

// POST /pay - Handle simulated payment
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

// ============================================================
//  Merchant Control Panel Routes (Add & Delete Items)
// ============================================================

// GET /merchant - View menu table
app.get('/merchant', async (req, res) => {
    try {
        const stalls = await Stall.find().lean();
        const foods = await Food.find().lean();
        res.render('merchant', { stalls, foods });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading merchant portal");
    }
});

// POST /merchant/add-food - Add a new dish
app.post('/merchant/add-food', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        const { name, stallId, price, description, badge } = req.body;
        
        const newFood = new Food({
            name,
            stallId,
            price: parseFloat(price),
            description,
            badge
        });
        await newFood.save();
        res.redirect('/merchant');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding menu item");
    }
});

// POST /merchant/delete-food/:id - Delete a dish
app.post('/merchant/delete-food/:id', async (req, res) => {
    try {
        await Food.findByIdAndDelete(req.params.id);
        res.redirect('/merchant');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting menu item");
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});