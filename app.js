require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const { connectDB, getDB } = require('./db');
const { images } = require('./data/dishes');
const { getReviewsForFood, addReview, getRatingSummary, getRatingSummariesForFoods } = require('./data/reviews');
const {
    slugify,
    findMerchantByEmail,
    createMerchant,
    verifyMerchantPassword,
    linkMerchantToStall,
    getUnclaimedStalls,
    claimExistingStall,
    createAndClaimStall
} = require('./data/merchants');
const { getDashboardStats, getStatsPageData } = require('./data/merchantStats');

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
    res.locals.merchant = req.session.merchant || null;
    next();
});

connectDB().catch(err => {
    console.error('Database connection failed', err);
});

// ------------------------------------------------------------------
// Image uploads (stall pictures, dish photos) — stored on disk under
// public/images/uploads and served through the existing static middleware.
// ------------------------------------------------------------------

const uploadDir = path.join(__dirname, 'public', 'images', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        if (/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files (png, jpg, webp, gif) are allowed.'));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Wraps multer so upload errors come back as clean JSON instead of an
// Express default HTML error page.
function handleUpload(fieldName) {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, err => {
            if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
            next();
        });
    };
}

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
        delete req.session.merchant; // one role at a time per browser session
        res.json({ success: true, name: user.name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

app.post('/auth/logout', (req, res) => {
    delete req.session.user;
    res.json({ success: true });
});

// ------------------------------------------------------------------
// Merchant auth: email + password, kept entirely separate from the
// customer phone-OTP session above.
// ------------------------------------------------------------------

function requireMerchant(req, res, next) {
    if (!req.session.merchant) {
        if (req.path.startsWith('/api/') || req.method !== 'GET') {
            return res.status(401).json({ success: false, message: 'Please log in as a merchant.' });
        }
        return res.redirect('/');
    }
    next();
}

// Makes the merchant's own stall available to every merchant page view
// (nav chip with store name/picture) without each route re-fetching it.
async function attachMerchantStall(req, res, next) {
    try {
        const db = getDB();
        res.locals.merchantStall = await db.collection('stalls').findOne({ id: req.session.merchant.stallId });
    } catch (err) {
        res.locals.merchantStall = null;
    }
    next();
}

app.get('/api/merchant/available-stalls', async (req, res) => {
    try {
        const stalls = await getUnclaimedStalls();
        res.json({ success: true, stalls: stalls.map(s => ({ id: s.id, name: s.name, emoji: s.emoji })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not load stalls.' });
    }
});

app.post('/merchant/signup', handleUpload('stallImage'), async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const confirmPassword = String(req.body.confirmPassword || '');
        const stallMode = req.body.stallMode === 'new' ? 'new' : 'existing';

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        const existing = await findMerchantByEmail(email);
        if (existing) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
        }

        let stallId;

        if (stallMode === 'new') {
            const stallName = String(req.body.newStallName || '').trim();
            if (!stallName) {
                return res.status(400).json({ success: false, message: 'Enter a name for your new stall.' });
            }
            const merchant = await createMerchant({ email, password });
            const image = req.file ? `/images/uploads/${req.file.filename}` : null;
            const stall = await createAndClaimStall({ name: stallName, image, merchantId: merchant._id });
            await linkMerchantToStall(merchant._id, stall.id);
            stallId = stall.id;
            req.session.merchant = { id: merchant._id.toString(), email, stallId };
        } else {
            const chosenStallId = String(req.body.stallId || '');
            if (!chosenStallId) {
                return res.status(400).json({ success: false, message: 'Choose a stall to manage.' });
            }
            const merchant = await createMerchant({ email, password });
            const claimed = await claimExistingStall(chosenStallId, merchant._id);
            if (!claimed) {
                await getDB().collection('merchants').deleteOne({ _id: merchant._id });
                return res.status(400).json({ success: false, message: 'That stall was just claimed by someone else. Please pick another.' });
            }
            await linkMerchantToStall(merchant._id, chosenStallId);
            stallId = chosenStallId;
            req.session.merchant = { id: merchant._id.toString(), email, stallId };
        }

        delete req.session.user;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

app.post('/merchant/login', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        const merchant = await findMerchantByEmail(email);
        if (!merchant || !(await verifyMerchantPassword(merchant, password))) {
            return res.status(400).json({ success: false, message: 'Incorrect email or password.' });
        }

        req.session.merchant = { id: merchant._id.toString(), email: merchant.email, stallId: merchant.stallId };
        delete req.session.user;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

app.post('/merchant/logout', (req, res) => {
    delete req.session.merchant;
    res.json({ success: true });
});

// ------------------------------------------------------------------
// Merchant dashboard, profile & shop status
// ------------------------------------------------------------------

app.get('/merchant/dashboard', requireMerchant, attachMerchantStall, async (req, res) => {
    try {
        const db = getDB();
        const stallId = req.session.merchant.stallId;
        const stall = await db.collection('stalls').findOne({ id: stallId });
        const stats = await getDashboardStats(stallId);
        res.render('merchant/dashboard', { stall, stats });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load your dashboard.');
    }
});

app.post('/merchant/shop-status', requireMerchant, async (req, res) => {
    try {
        const db = getDB();
        const stall = await db.collection('stalls').findOne({ id: req.session.merchant.stallId });
        if (!stall) return res.status(404).json({ success: false, message: 'Stall not found.' });

        const isOpen = !stall.isOpen;
        await db.collection('stalls').updateOne({ id: req.session.merchant.stallId }, { $set: { isOpen } });
        res.json({ success: true, isOpen });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update shop status.' });
    }
});

app.get('/merchant/profile', requireMerchant, attachMerchantStall, async (req, res) => {
    try {
        const db = getDB();
        const stall = await db.collection('stalls').findOne({ id: req.session.merchant.stallId });
        res.render('merchant/profile', { stall });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load your profile.');
    }
});

app.post('/merchant/profile', requireMerchant, handleUpload('image'), async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'Enter a store name.' });
        }
        const update = { name };
        if (req.file) update.image = `/images/uploads/${req.file.filename}`;

        const db = getDB();
        await db.collection('stalls').updateOne(
            { id: req.session.merchant.stallId, merchantId: new ObjectId(req.session.merchant.id) },
            { $set: update }
        );
        res.json({ success: true, image: update.image });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update your store profile.' });
    }
});

// ------------------------------------------------------------------
// Merchant menu management (CRUD) — every query is filtered by the
// merchant's own stall_id, so one merchant can never read or write
// another merchant's dishes.
// ------------------------------------------------------------------

app.get('/merchant/menu', requireMerchant, attachMerchantStall, async (req, res) => {
    try {
        const db = getDB();
        const foods = await db.collection('foods')
            .find({ stall_id: req.session.merchant.stallId })
            .sort({ name: 1 })
            .toArray();
        res.render('merchant/menu', { foods });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load your menu.');
    }
});

app.post('/merchant/menu', requireMerchant, handleUpload('image'), async (req, res) => {
    try {
        const stallId = req.session.merchant.stallId;
        const name = String(req.body.name || '').trim();
        const price = parseFloat(req.body.price);

        if (!name || !(price > 0)) {
            return res.status(400).json({ success: false, message: 'Enter a dish name and a valid price.' });
        }

        let options = null;
        try {
            options = req.body.options ? JSON.parse(req.body.options) : null;
        } catch (e) {
            options = null;
        }

        const db = getDB();
        const base = slugify(`${stallId}-${name}`) || 'dish';
        let candidate = base;
        let suffix = 1;
        while (await db.collection('foods').findOne({ id: candidate })) {
            suffix += 1;
            candidate = `${base}-${suffix}`;
        }

        const image = req.file ? `/images/uploads/${req.file.filename}` : '/images/logo.png';

        await db.collection('foods').insertOne({
            id: candidate,
            stall_id: stallId,
            name,
            price,
            image,
            badge: String(req.body.badge || '').trim(),
            options,
            soldOut: false
        });

        res.json({ success: true, id: candidate });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not create the dish.' });
    }
});

app.post('/merchant/menu/:foodId', requireMerchant, handleUpload('image'), async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const price = parseFloat(req.body.price);
        if (!name || !(price > 0)) {
            return res.status(400).json({ success: false, message: 'Enter a dish name and a valid price.' });
        }

        let options = null;
        try {
            options = req.body.options ? JSON.parse(req.body.options) : null;
        } catch (e) {
            options = null;
        }

        const update = { name, price, badge: String(req.body.badge || '').trim(), options };
        if (req.file) update.image = `/images/uploads/${req.file.filename}`;

        const db = getDB();
        const result = await db.collection('foods').updateOne(
            { id: req.params.foodId, stall_id: req.session.merchant.stallId },
            { $set: update }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Dish not found.' });
        }
        res.json({ success: true, image: update.image });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update the dish.' });
    }
});

app.post('/merchant/menu/:foodId/delete', requireMerchant, async (req, res) => {
    try {
        const db = getDB();
        const result = await db.collection('foods').deleteOne({
            id: req.params.foodId,
            stall_id: req.session.merchant.stallId
        });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Dish not found.' });
        }
        await db.collection('reviews').deleteMany({ foodId: req.params.foodId });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not delete the dish.' });
    }
});

app.post('/merchant/menu/:foodId/toggle-soldout', requireMerchant, async (req, res) => {
    try {
        const db = getDB();
        const food = await db.collection('foods').findOne({
            id: req.params.foodId,
            stall_id: req.session.merchant.stallId
        });
        if (!food) {
            return res.status(404).json({ success: false, message: 'Dish not found.' });
        }
        const soldOut = !food.soldOut;
        await db.collection('foods').updateOne({ id: req.params.foodId }, { $set: { soldOut } });
        res.json({ success: true, soldOut });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update the dish.' });
    }
});

// ------------------------------------------------------------------
// Merchant order management — scoped to the merchant's own stallId.
// ------------------------------------------------------------------

const ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];

app.get('/merchant/orders', requireMerchant, attachMerchantStall, async (req, res) => {
    try {
        const db = getDB();
        const orders = await db.collection('orders')
            .find({ stallId: req.session.merchant.stallId })
            .sort({ createdAt: -1 })
            .toArray();
        res.render('merchant/orders', { orders, statuses: ORDER_STATUSES });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load your orders.');
    }
});

app.post('/merchant/orders/:orderId/status', requireMerchant, async (req, res) => {
    const status = req.body.status;
    if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    try {
        const db = getDB();
        const update = { status, statusUpdatedAt: new Date() };
        if (status === 'completed') update.collectedAt = new Date();

        const result = await db.collection('orders').updateOne(
            { orderId: req.params.orderId, stallId: req.session.merchant.stallId },
            { $set: update }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update order status.' });
    }
});

// Queue management: nudge an order's prep time earlier/later (in minutes).
app.post('/merchant/orders/:orderId/preptime', requireMerchant, async (req, res) => {
    const deltaMinutes = parseInt(req.body.deltaMinutes, 10);
    if (!Number.isFinite(deltaMinutes)) {
        return res.status(400).json({ success: false, message: 'Invalid adjustment.' });
    }
    try {
        const db = getDB();
        const order = await db.collection('orders').findOne({
            orderId: req.params.orderId,
            stallId: req.session.merchant.stallId
        });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const now = Date.now();
        let newReadyAt = (order.readyAt || now) + deltaMinutes * 60 * 1000;
        if (newReadyAt < now) newReadyAt = now;
        const newPrepTimeSeconds = Math.max(60, (order.prepTimeSeconds || 0) + deltaMinutes * 60);

        await db.collection('orders').updateOne(
            { orderId: req.params.orderId },
            { $set: { readyAt: newReadyAt, prepTimeSeconds: newPrepTimeSeconds } }
        );
        res.json({ success: true, readyAt: newReadyAt, prepTimeSeconds: newPrepTimeSeconds });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not adjust preparation time.' });
    }
});

// ------------------------------------------------------------------
// Merchant statistics & reviews
// ------------------------------------------------------------------

app.get('/merchant/stats', requireMerchant, attachMerchantStall, (req, res) => {
    res.render('merchant/stats');
});

app.get('/api/merchant/stats-data', requireMerchant, async (req, res) => {
    try {
        const data = await getStatsPageData(req.session.merchant.stallId);
        res.json({ success: true, ...data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not load statistics.' });
    }
});

app.get('/merchant/reviews', requireMerchant, attachMerchantStall, async (req, res) => {
    try {
        const db = getDB();
        const stallId = req.session.merchant.stallId;
        const sort = req.query.sort === 'highest' ? 'highest' : 'newest';

        const foods = await db.collection('foods').find({ stall_id: stallId }).toArray();
        const foodMap = {};
        foods.forEach(f => { foodMap[f.id] = f.name; });
        const foodIds = foods.map(f => f.id);

        const sortSpec = sort === 'highest' ? { rating: -1, createdAt: -1 } : { createdAt: -1 };
        const reviews = foodIds.length
            ? await db.collection('reviews').find({ foodId: { $in: foodIds } }).sort(sortSpec).toArray()
            : [];
        reviews.forEach(r => { r.foodName = foodMap[r.foodId] || 'Deleted dish'; });

        res.render('merchant/reviews', { reviews, sort });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load reviews.');
    }
});

// ------------------------------------------------------------------
// Customer-facing pages
// ------------------------------------------------------------------

app.get('/', async (req, res) => {
    try {
        const db = getDB();
        const stalls = await db.collection('stalls').find({}).limit(3).toArray();
        res.render('index', { images, stalls });
    } catch (err) {
        console.error(err);
        res.render('index', { images, stalls: [] });
    }
});

app.get('/menu', async (req, res) => {
    try {
        const db = getDB();
        const stallsData = await db.collection('stalls').find({}).toArray();
        const foodsData = await db.collection('foods').find({}).toArray();

        // Attach each dish's average rating & review count (one aggregate
        // query for the whole page, not one per dish).
        const foodIds = foodsData.map(food => food.id).filter(Boolean);
        const ratingSummaries = await getRatingSummariesForFoods(foodIds);
        foodsData.forEach(food => {
            const summary = ratingSummaries[food.id] || { avgRating: 0, reviewCount: 0 };
            food.avgRating = summary.avgRating;
            food.reviewCount = summary.reviewCount;
        });

        stallsData.forEach(stall => {
            stall.foods = foodsData.filter(food => food.stall_id === stall.id);
        });

        res.render('menu', { images, stalls: stallsData });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading menu from database');
    }
});

// Reviews for a single dish — used by the customize/review modal on the
// stall page. Viewing is public; posting a review requires login.
app.get('/api/foods/:foodId/reviews', async (req, res) => {
    try {
        const [reviews, summary] = await Promise.all([
            getReviewsForFood(req.params.foodId),
            getRatingSummary(req.params.foodId)
        ]);
        res.json({ success: true, reviews, ...summary });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not load reviews.' });
    }
});

app.post('/api/foods/:foodId/reviews', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please log in to leave a review.' });
    }

    const { rating, comment } = req.body || {};
    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Please choose a star rating.' });
    }

    try {
        await addReview(req.params.foodId, {
            userId: req.session.user.id,
            userName: req.session.user.name,
            rating,
            comment
        });

        const [reviews, summary] = await Promise.all([
            getReviewsForFood(req.params.foodId),
            getRatingSummary(req.params.foodId)
        ]);
        res.json({ success: true, reviews, ...summary });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not save your review.' });
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

// Payment splits the cart into one order per stall, so each merchant only
// ever sees the portion of the order that belongs to their own store.
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

    try {
        const db = getDB();

        // Re-verify stock/shop status server-side — never trust the client's
        // cart for this.
        const foodIds = items.map(i => i.foodId).filter(Boolean);
        const foods = foodIds.length ? await db.collection('foods').find({ id: { $in: foodIds } }).toArray() : [];
        const foodById = {};
        foods.forEach(f => { foodById[f.id] = f; });

        const stallIds = [...new Set(foods.map(f => f.stall_id))];
        const stalls = stallIds.length ? await db.collection('stalls').find({ id: { $in: stallIds } }).toArray() : [];
        const stallById = {};
        stalls.forEach(s => { stallById[s.id] = s; });

        for (const item of items) {
            const food = item.foodId ? foodById[item.foodId] : null;
            if (food && food.soldOut) {
                return res.status(400).json({ success: false, message: `${item.name} just sold out. Please remove it from your cart.` });
            }
            const stall = food ? stallById[food.stall_id] : null;
            if (stall && stall.isOpen === false) {
                return res.status(400).json({ success: false, message: `${stall.name} is currently closed for new orders.` });
            }
        }

        // Group cart items by stall so each stall gets its own order document.
        const groups = {};
        items.forEach(item => {
            const food = item.foodId ? foodById[item.foodId] : null;
            const stallId = food ? food.stall_id : 'unknown';
            if (!groups[stallId]) groups[stallId] = [];
            groups[stallId].push(item);
        });

        const createdOrders = [];
        let orderIndex = 0;
        for (const [stallId, groupItems] of Object.entries(groups)) {
            orderIndex += 1;
            const groupTotal = groupItems.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
            const orderId = 'FH-' + (Date.now() + orderIndex).toString().slice(-6);
            const queueNum = Math.floor(Math.random() * 899) + 101;
            const prepTimeSeconds = 180 + groupItems.reduce((sum, item) => sum + (Number(item.qty) || 1) * 90, 0);
            const readyAt = Date.now() + prepTimeSeconds * 1000;

            const order = {
                orderId,
                userId: req.session.user.id,
                customerName: (customer && customer.name) || req.session.user.name,
                stallId,
                items: groupItems.map(i => ({ name: i.name, price: Number(i.price), qty: Number(i.qty), image: i.image || null, foodId: i.foodId || null })),
                total: Number(groupTotal.toFixed(2)),
                paymentMethod: 'Card',
                queueNum,
                prepTimeSeconds,
                readyAt,
                status: 'pending',
                createdAt: new Date()
            };
            await db.collection('orders').insertOne(order);
            createdOrders.push(order);
        }

        res.json({
            success: true,
            orders: createdOrders.map(o => ({ orderId: o.orderId, queueNum: o.queueNum, readyAt: o.readyAt, total: o.total })),
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

// Lightweight polling endpoint so the tracker picks up merchant-driven
// status/prep-time changes without the customer needing to refresh.
app.get('/api/orders/:orderId/status', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false });
    }
    try {
        const db = getDB();
        const order = await db.collection('orders').findOne(
            { orderId: req.params.orderId, userId: req.session.user.id },
            { projection: { status: 1, readyAt: 1, prepTimeSeconds: 1 } }
        );
        if (!order) return res.status(404).json({ success: false });
        res.json({ success: true, status: order.status, readyAt: order.readyAt, prepTimeSeconds: order.prepTimeSeconds });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// Marks an order as collected once the customer has picked it up (button on
// the tracking page, shown once the order is ready). This is what stops the
// nav's "Track Order" shortcut from following that order around forever.
app.post('/orders/:orderId/collect', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please log in.' });
    }
    try {
        const db = getDB();
        const result = await db.collection('orders').updateOne(
            { orderId: req.params.orderId, userId: req.session.user.id },
            { $set: { status: 'completed', collectedAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update your order.' });
    }
});

// The logged-in user's most recent order that isn't finished yet — powers
// the small "Track Order" shortcut shown in the nav on every page, so
// closing the tracker never means losing track of an order in progress.
app.get('/api/orders/active', async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: true, order: null });
    }
    try {
        const db = getDB();
        const order = await db.collection('orders').find(
            { userId: req.session.user.id, status: { $nin: ['completed', 'collected', 'cancelled'] } }
        ).sort({ createdAt: -1 }).limit(1).next();

        res.json({
            success: true,
            order: order ? { orderId: order.orderId, queueNum: order.queueNum, readyAt: order.readyAt } : null
        });
    } catch (err) {
        console.error(err);
        res.json({ success: true, order: null });
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
