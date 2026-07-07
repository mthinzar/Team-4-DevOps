require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { connectDB, getDB } = require('./db');
const { images, popularDishes } = require('./data/dishes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'foodhub-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

connectDB().catch(err => {
    console.error('Database connection failed', err);
});

// ------------------------------------------------------------------
// Auth: real server-side sessions, phone + one-time-code (no SMS
// provider — the code is handed back in the response and shown
// on-screen, same "Demo" UX pattern the original branch used, but
// now genuinely generated & verified server-side).
// ------------------------------------------------------------------

const pendingCodes = new Map(); // phone -> { code, expiresAt, name }
const CODE_TTL_MS = 5 * 60 * 1000;

function validPhone(phone) {
    return /^[689]\d{7}$/.test(String(phone || '').replace(/\s+/g, ''));
}

app.post('/auth/send-code', (req, res) => {
    const phone = String(req.body.phone || '').replace(/\s+/g, '');
    const name = req.body.name ? String(req.body.name).trim() : undefined;

    if (!validPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Enter a valid 8-digit Singapore number (starts with 6, 8 or 9).' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    pendingCodes.set(phone, { code, expiresAt: Date.now() + CODE_TTL_MS, name });

    res.json({ success: true, devCode: code });
});

app.post('/auth/verify', async (req, res) => {
    const phone = String(req.body.phone || '').replace(/\s+/g, '');
    const code = String(req.body.code || '').trim();
    const name = req.body.name ? String(req.body.name).trim() : undefined;

    const pending = pendingCodes.get(phone);
    if (!pending || pending.expiresAt < Date.now()) {
        return res.status(400).json({ success: false, message: 'Code expired. Please request a new one.' });
    }
    if (pending.code !== code) {
        return res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });
    }
    pendingCodes.delete(phone);

    try {
        const db = getDB();
        let user = await db.collection('users').findOne({ phone });

        if (!user) {
            if (!name && !pending.name) {
                return res.status(400).json({ success: false, message: 'No account found for this number. Please sign up first.' });
            }
            const newUser = { name: name || pending.name || 'Friend', phone, createdAt: new Date() };
            const result = await db.collection('users').insertOne(newUser);
            user = { _id: result.insertedId, ...newUser };
        }

        req.session.user = { id: user._id.toString(), name: user.name, phone: user.phone };
        res.json({ success: true, name: user.name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// ------------------------------------------------------------------
// Pages
// ------------------------------------------------------------------

app.get('/', async (req, res) => {
    try {
        const db = getDB();
        const stalls = await db.collection('stalls').find({}).limit(6).toArray();
        res.render('index', { images, popularDishes, stalls });
    } catch (err) {
        console.error(err);
        res.render('index', { images, popularDishes, stalls: [] });
    }
});

app.get('/menu', async (req, res) => {
    try {
        const db = getDB();
        const stallsData = await db.collection('stalls').find({}).toArray();
        const foodsData = await db.collection('foods').find({}).toArray();

        stallsData.forEach(stall => {
            stall.foods = foodsData.filter(food => food.stall_id === stall.id);
        });

        res.render('menu', { images, stalls: stallsData });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading menu from database');
    }
});

app.get('/checkout', (req, res) => {
    res.render('checkout', { images });
});

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

app.post('/pay', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please log in to complete checkout.' });
    }

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
    const queueNum = Math.floor(Math.random() * 899) + 101;
    const prepTimeSeconds = 180 + items.reduce((sum, item) => sum + (Number(item.qty) || 1) * 90, 0);
    const readyAt = Date.now() + prepTimeSeconds * 1000;

    try {
        const db = getDB();
        await db.collection('orders').insertOne({
            orderId,
            userId: req.session.user.id,
            customerName: (customer && customer.name) || req.session.user.name,
            items: items.map(i => ({ name: i.name, price: Number(i.price), qty: Number(i.qty), image: i.image || null })),
            total: Number(total.toFixed(2)),
            queueNum,
            prepTimeSeconds,
            readyAt,
            createdAt: new Date()
        });

        res.json({
            success: true,
            orderId,
            queueNum,
            readyAt,
            total: Number(total.toFixed(2)),
            name: (customer && customer.name) || req.session.user.name
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not save your order. Please try again.' });
    }
});

app.get('/track/:orderId', async (req, res) => {
    try {
        const db = getDB();
        const order = await db.collection('orders').findOne({ orderId: req.params.orderId });
        res.render('track', { images, order });
    } catch (err) {
        console.error(err);
        res.render('track', { images, order: null });
    }
});

app.get('/orders', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/?loginRequired=1');
    }
    try {
        const db = getDB();
        const orders = await db.collection('orders')
            .find({ userId: req.session.user.id })
            .sort({ createdAt: -1 })
            .toArray();
        res.render('orders', { images, orders });
    } catch (err) {
        console.error(err);
        res.render('orders', { images, orders: [] });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
