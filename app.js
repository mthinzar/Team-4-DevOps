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
    createAndClaimStall,
    listMerchantsWithStalls,
    setMerchantStatus,
    removeMerchant,
    resetMerchantPassword
} = require('./data/merchants');
const { getDashboardStats, getStatsPageData } = require('./data/merchantStats');
const { priceCart } = require('./data/pricing');
const {
    PAYMENT_METHODS,
    authoriseCard,
    buildPayNowPayload,
    newPaymentReference
} = require('./data/payments');
const QRCode = require('qrcode');
const {
    ORDER_FLOW, ORDER_STATUS_LABELS, NEXT_STEP, CANCELLABLE, PAYMENT_LABELS,
    normaliseStatus, canCancel, canMoveTo, newOrderId, newQueueNumber
} = require('./data/orderStatus');
const {
    validPhone, validEmail, validPassword, merchantStatusMessage,
    validDish, isAllowedImageType, uploadFileName
} = require('./data/validation');
const { findAdminById, createAdmin, verifyAdminPassword, deleteAdmin } = require('./data/admins');
const { getPlatformDashboardStats, getStoreSalesBreakdown, getReportsData, getStoreRatingBreakdown } = require('./data/adminStats');

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

// make the logged-in user available to the EJS pages
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.merchant = req.session.merchant || null;
    res.locals.admin = req.session.admin || null;
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
        filename: (req, file, cb) => cb(null, uploadFileName(file.originalname))
    }),
    fileFilter: (req, file, cb) => {
        if (isAllowedImageType(file.mimetype)) cb(null, true);
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

app.post('/auth/send-code', (req, res) => {
    const phone = String(req.body.phone || '').replace(/\s+/g, '');
    const name = req.body.name ? String(req.body.name).trim() : undefined;

    if (!validPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Enter a valid 8-digit Singapore number (starts with 6, 8 or 9).' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    // demo security code. It is displayed on the website and is not sent through real SMS.
    pendingCodes.set(phone, { code, expiresAt: Date.now() + CODE_TTL_MS, name });

    res.json({ success: true, devCode: code });
});

// Verify code and create/login customer account. If the phone number is new, the user must provide a name
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
            const newUser = { name: name || pending.name || 'Friend', phone, disabled: false, createdAt: new Date() };
            const result = await db.collection('users').insertOne(newUser);
            user = { _id: result.insertedId, ...newUser };
        }

        if (user.disabled) {
            return res.status(403).json({ success: false, message: 'Your account has been disabled. Please contact support.' });
        }

        req.session.user = { id: user._id.toString(), name: user.name, phone: user.phone };
        delete req.session.merchant; // one role at a time per browser session
        delete req.session.admin;
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

// Re-checks approval status fresh from the database on every request
// (rather than trusting the session) so an admin suspending a merchant
// takes effect immediately, not just after their next login.
async function requireMerchant(req, res, next) {
    if (!req.session.merchant) {
        if (req.path.startsWith('/api/') || req.method !== 'GET') {
            return res.status(401).json({ success: false, message: 'Please log in as a merchant.' });
        }
        return res.redirect('/');
    }
    try {
        const db = getDB();
        const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(req.session.merchant.id) });
        if (!merchant) {
            delete req.session.merchant;
            return res.redirect('/');
        }
        const status = merchant.status || 'approved';
        if (status !== 'approved') {
            if (req.path.startsWith('/api/') || req.method !== 'GET') {
                return res.status(403).json({ success: false, message: merchantStatusMessage(status) });
            }
            return res.redirect('/merchant/pending');
        }
        next();
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
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

        if (!validEmail(email)) {
            return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
        }
        if (!validPassword(password)) {
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
        let merchant;

        if (stallMode === 'new') {
            const stallName = String(req.body.newStallName || '').trim();
            if (!stallName) {
                return res.status(400).json({ success: false, message: 'Enter a name for your new stall.' });
            }
            merchant = await createMerchant({ email, password });
            const image = req.file ? `/images/uploads/${req.file.filename}` : null;
            const stall = await createAndClaimStall({ name: stallName, image, merchantId: merchant._id });
            await linkMerchantToStall(merchant._id, stall.id);
            stallId = stall.id;
        } else {
            const chosenStallId = String(req.body.stallId || '');
            if (!chosenStallId) {
                return res.status(400).json({ success: false, message: 'Choose a stall to manage.' });
            }
            merchant = await createMerchant({ email, password });
            const claimed = await claimExistingStall(chosenStallId, merchant._id);
            if (!claimed) {
                await getDB().collection('merchants').deleteOne({ _id: merchant._id });
                return res.status(400).json({ success: false, message: 'That stall was just claimed by someone else. Please pick another.' });
            }
            await linkMerchantToStall(merchant._id, chosenStallId);
            stallId = chosenStallId;
        }

        req.session.merchant = { id: merchant._id.toString(), email, stallId };
        delete req.session.user;
        delete req.session.admin;
        res.json({ success: true, status: merchant.status || 'pending' });
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
        delete req.session.admin;
        res.json({ success: true, status: merchant.status || 'approved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

app.post('/merchant/logout', (req, res) => {
    delete req.session.merchant;
    res.json({ success: true });
});

// Shown to a merchant whose account isn't (or is no longer) approved —
// reachable without triggering requireMerchant's redirect loop.
app.get('/merchant/pending', async (req, res) => {
    if (!req.session.merchant) return res.redirect('/');
    try {
        const db = getDB();
        const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(req.session.merchant.id) });
        const status = merchant ? (merchant.status || 'approved') : 'pending';
        if (status === 'approved') return res.redirect('/merchant/dashboard');
        res.render('merchant/pending', { status, message: merchantStatusMessage(status) });
    } catch (err) {
        console.error(err);
        res.render('merchant/pending', { status: 'pending', message: merchantStatusMessage('pending') });
    }
});

// ------------------------------------------------------------------
// Admin auth: a third, separate session role (adminId + password).
// There is no public signup route — accounts are seeded (see seed.js)
// or created by an existing admin from the Manage Users page.
// ------------------------------------------------------------------

function requireAdmin(req, res, next) {
    if (!req.session.admin) {
        if (req.path.startsWith('/api/') || req.method !== 'GET') {
            return res.status(401).json({ success: false, message: 'Please log in as an admin.' });
        }
        return res.redirect('/admin/login');
    }
    next();
}

app.get('/admin/login', (req, res) => {
    if (req.session.admin) return res.redirect('/admin/dashboard');
    res.render('admin/login');
});

app.post('/admin/login', async (req, res) => {
    try {
        const adminId = String(req.body.adminId || '').trim();
        const password = String(req.body.password || '');

        const admin = await findAdminById(adminId);
        if (!admin || !(await verifyAdminPassword(admin, password))) {
            return res.status(400).json({ success: false, message: 'Incorrect admin ID or password.' });
        }

        req.session.admin = { id: admin._id.toString(), adminId: admin.adminId, name: admin.name };
        delete req.session.user;
        delete req.session.merchant;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

app.post('/admin/logout', (req, res) => {
    delete req.session.admin;
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
        stats.recentOrders.forEach(order => { order.status = normaliseStatus(order.status); });
        res.render('merchant/dashboard', { stall, stats, ORDER_STATUS_LABELS });
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
        const dish = validDish(req.body.name, req.body.price);
        if (!dish.ok) {
            return res.status(400).json({ success: false, message: dish.message });
        }
        const name = dish.name;
        const price = dish.price;

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

// The order lifecycle is a straight line. A merchant can move an order to the
// next step, or cancel it before it is ready — nothing else. The old six-entry
// dropdown let a brand-new order jump straight to "collected", or a finished
// order slide back to the start, which is what made the queue behave oddly.
app.get('/merchant/orders', requireMerchant, attachMerchantStall, async (req, res) => {
    try {
        const db = getDB();
        const orders = await db.collection('orders')
            .find({ stallId: req.session.merchant.stallId })
            .sort({ createdAt: -1 })
            .toArray();

        orders.forEach(order => { order.status = normaliseStatus(order.status); });

        res.render('merchant/orders', {
            orders,
            ORDER_FLOW,
            ORDER_STATUS_LABELS,
            NEXT_STEP,
            CANCELLABLE,
            PAYMENT_LABELS
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load your orders.');
    }
});

// Advances an order one step, or cancels it. Any other move is rejected, so
// the queue can never show an order as collected before it was ever cooked.
app.post('/merchant/orders/:orderId/status', requireMerchant, async (req, res) => {
    const requested = String(req.body.status || '');

    try {
        const db = getDB();
        const order = await db.collection('orders').findOne({
            orderId: req.params.orderId,
            stallId: req.session.merchant.stallId
        });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const current = normaliseStatus(order.status);

        if (requested === 'cancelled') {
            if (!canCancel(current)) {
                return res.status(400).json({
                    success: false,
                    message: 'An order can only be cancelled before it is ready for collection.'
                });
            }
        } else if (!canMoveTo(current, requested)) {
            return res.status(400).json({
                success: false,
                message: `"${ORDER_STATUS_LABELS[current]}" cannot move to that step.`
            });
        }

        const update = { status: requested, statusUpdatedAt: new Date() };
        if (requested === 'completed') update.collectedAt = new Date();

        await db.collection('orders').updateOne({ _id: order._id }, { $set: update });

        const nextStep = NEXT_STEP[requested] || null;
        res.json({
            success: true,
            status: requested,
            label: ORDER_STATUS_LABELS[requested],
            nextStep,
            cancellable: CANCELLABLE.includes(requested)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update order status.' });
    }
});

// Settles a "pay at stall" order once the customer has handed over the money.
app.post('/merchant/orders/:orderId/mark-paid', requireMerchant, async (req, res) => {
    try {
        const result = await getDB().collection('orders').updateOne(
            { orderId: req.params.orderId, stallId: req.session.merchant.stallId, paymentStatus: 'unpaid' },
            { $set: { paymentStatus: 'paid', paidAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'No unpaid order with that ID.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not mark the order as paid.' });
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
// Admin dashboard
// ------------------------------------------------------------------

app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const stats = await getPlatformDashboardStats();
        stats.recentOrders.forEach(o => { o.status = normaliseStatus(o.status); });
        res.render('admin/dashboard', { stats, statusLabels: ORDER_STATUS_LABELS });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load the admin dashboard.');
    }
});

// ------------------------------------------------------------------
// Admin: manage merchants / stores
// ------------------------------------------------------------------

app.get('/admin/merchants', requireAdmin, async (req, res) => {
    try {
        const [merchants, unclaimedStalls] = await Promise.all([
            listMerchantsWithStalls(),
            getUnclaimedStalls()
        ]);
        res.render('admin/merchants', { merchants, unclaimedStalls });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load merchants.');
    }
});

app.post('/admin/merchants/new', requireAdmin, handleUpload('stallImage'), async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const confirmPassword = String(req.body.confirmPassword || '');
        const stallMode = req.body.stallMode === 'new' ? 'new' : 'existing';

        if (!validEmail(email)) {
            return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
        }
        if (!validPassword(password)) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }
        const existing = await findMerchantByEmail(email);
        if (existing) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
        }

        // Admin-added merchants are already vetted, so they skip the pending queue.
        const merchant = await createMerchant({ email, password, status: 'approved' });

        if (stallMode === 'new') {
            const stallName = String(req.body.newStallName || '').trim();
            if (!stallName) {
                await getDB().collection('merchants').deleteOne({ _id: merchant._id });
                return res.status(400).json({ success: false, message: 'Enter a name for the new stall.' });
            }
            const image = req.file ? `/images/uploads/${req.file.filename}` : null;
            const stall = await createAndClaimStall({ name: stallName, image, merchantId: merchant._id });
            await linkMerchantToStall(merchant._id, stall.id);
        } else {
            const chosenStallId = String(req.body.stallId || '');
            if (!chosenStallId) {
                await getDB().collection('merchants').deleteOne({ _id: merchant._id });
                return res.status(400).json({ success: false, message: 'Choose a stall to assign.' });
            }
            const claimed = await claimExistingStall(chosenStallId, merchant._id);
            if (!claimed) {
                await getDB().collection('merchants').deleteOne({ _id: merchant._id });
                return res.status(400).json({ success: false, message: 'That stall was just claimed by someone else.' });
            }
            await linkMerchantToStall(merchant._id, chosenStallId);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not add the merchant.' });
    }
});

app.post('/admin/merchants/:id/approve', requireAdmin, async (req, res) => {
    try {
        const ok = await setMerchantStatus(req.params.id, 'approved');
        if (!ok) return res.status(404).json({ success: false, message: 'Merchant not found.' });
        res.json({ success: true, status: 'approved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not approve merchant.' });
    }
});

app.post('/admin/merchants/:id/reject', requireAdmin, async (req, res) => {
    try {
        const ok = await setMerchantStatus(req.params.id, 'rejected');
        if (!ok) return res.status(404).json({ success: false, message: 'Merchant not found.' });
        res.json({ success: true, status: 'rejected' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not reject merchant.' });
    }
});

// Toggles between 'suspended' and 'approved' depending on current state.
app.post('/admin/merchants/:id/suspend', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(req.params.id) });
        if (!merchant) return res.status(404).json({ success: false, message: 'Merchant not found.' });

        const newStatus = merchant.status === 'suspended' ? 'approved' : 'suspended';
        await setMerchantStatus(req.params.id, newStatus);
        res.json({ success: true, status: newStatus });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update merchant.' });
    }
});

app.post('/admin/merchants/:id/remove', requireAdmin, async (req, res) => {
    try {
        const ok = await removeMerchant(req.params.id);
        if (!ok) return res.status(404).json({ success: false, message: 'Merchant not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not remove merchant.' });
    }
});

app.post('/admin/merchants/:id/edit', requireAdmin, handleUpload('image'), async (req, res) => {
    try {
        const db = getDB();
        const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(req.params.id) });
        if (!merchant || !merchant.stallId) {
            return res.status(404).json({ success: false, message: 'Merchant or stall not found.' });
        }
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ success: false, message: 'Enter a store name.' });

        const update = { name };
        if (req.file) update.image = `/images/uploads/${req.file.filename}`;

        await db.collection('stalls').updateOne({ id: merchant.stallId }, { $set: update });
        res.json({ success: true, image: update.image });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update store details.' });
    }
});

app.post('/admin/merchants/:id/reset-password', requireAdmin, async (req, res) => {
    try {
        const tempPassword = await resetMerchantPassword(req.params.id);
        if (!tempPassword) return res.status(404).json({ success: false, message: 'Merchant not found.' });
        res.json({ success: true, tempPassword });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not reset password.' });
    }
});

// ------------------------------------------------------------------
// Admin: all-store orders, per-store sales, reports & analytics
// ------------------------------------------------------------------

app.get('/admin/orders', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const [orders, stalls] = await Promise.all([
            db.collection('orders').find({}).sort({ createdAt: -1 }).toArray(),
            db.collection('stalls').find({}).sort({ name: 1 }).toArray()
        ]);
        const stallNameById = {};
        stalls.forEach(s => { stallNameById[s.id] = s.name; });
        orders.forEach(o => {
            o.stallName = stallNameById[o.stallId] || o.stallId;
            o.status = normaliseStatus(o.status);
        });

        res.render('admin/orders', { orders, stalls, statuses: [...ORDER_FLOW, 'cancelled'], statusLabels: ORDER_STATUS_LABELS, paymentLabels: PAYMENT_LABELS });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load orders.');
    }
});

app.get('/admin/stores', requireAdmin, async (req, res) => {
    try {
        const breakdown = await getStoreSalesBreakdown();
        res.render('admin/stores', { breakdown });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load store sales.');
    }
});

app.get('/admin/reports', requireAdmin, (req, res) => {
    res.render('admin/reports');
});

app.get('/api/admin/reports-data', requireAdmin, async (req, res) => {
    try {
        const data = await getReportsData();
        res.json({ success: true, ...data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not load reports.' });
    }
});

// ------------------------------------------------------------------
// Admin: reviews & feedback moderation
// ------------------------------------------------------------------

app.get('/admin/reviews', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sort = req.query.sort === 'highest' ? 'highest' : 'newest';
        const sortSpec = sort === 'highest' ? { rating: -1, createdAt: -1 } : { createdAt: -1 };

        const [reviews, foods, stalls, lowRatedStores] = await Promise.all([
            db.collection('reviews').find({}).sort(sortSpec).toArray(),
            db.collection('foods').find({}).toArray(),
            db.collection('stalls').find({}).toArray(),
            getStoreRatingBreakdown()
        ]);

        const foodById = {};
        foods.forEach(f => { foodById[f.id] = f; });
        const stallNameById = {};
        stalls.forEach(s => { stallNameById[s.id] = s.name; });

        reviews.forEach(r => {
            const food = foodById[r.foodId];
            r.foodName = food ? food.name : 'Deleted dish';
            r.stallName = food ? (stallNameById[food.stall_id] || food.stall_id) : 'Unknown store';
        });

        res.render('admin/reviews', { reviews, sort, lowRatedStores });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load reviews.');
    }
});

app.post('/admin/reviews/:reviewId/delete', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const result = await db.collection('reviews').deleteOne({ _id: new ObjectId(req.params.reviewId) });
        if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Review not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not delete review.' });
    }
});

// ------------------------------------------------------------------
// Admin: manage user accounts (customers & fellow admins)
// ------------------------------------------------------------------

app.get('/admin/users', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const [customers, admins] = await Promise.all([
            db.collection('users').find({}).sort({ createdAt: -1 }).toArray(),
            db.collection('admins').find({}).sort({ createdAt: -1 }).toArray()
        ]);
        res.render('admin/users', { customers, admins });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not load users.');
    }
});

app.post('/admin/users/customers/:id/toggle-disable', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.params.id) });
        if (!user) return res.status(404).json({ success: false, message: 'Customer not found.' });

        const disabled = !user.disabled;
        await db.collection('users').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { disabled } });
        res.json({ success: true, disabled });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not update customer.' });
    }
});

app.post('/admin/users/customers/:id/delete', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const result = await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Customer not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not delete customer.' });
    }
});

app.post('/admin/users/admins/new', requireAdmin, async (req, res) => {
    try {
        const adminId = String(req.body.adminId || '').trim();
        const password = String(req.body.password || '');
        const name = String(req.body.name || '').trim();

        if (!adminId || !validPassword(password)) {
            return res.status(400).json({ success: false, message: 'Enter an admin ID and a password of at least 6 characters.' });
        }
        const existing = await findAdminById(adminId);
        if (existing) {
            return res.status(400).json({ success: false, message: 'That admin ID is already taken.' });
        }
        await createAdmin({ adminId, password, name });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not create admin account.' });
    }
});

app.post('/admin/users/admins/:id/delete', requireAdmin, async (req, res) => {
    try {
        if (req.params.id === req.session.admin.id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account while logged in.' });
        }
        const db = getDB();
        const totalAdmins = await db.collection('admins').countDocuments({});
        if (totalAdmins <= 1) {
            return res.status(400).json({ success: false, message: 'At least one admin account must remain.' });
        }
        const ok = await deleteAdmin(req.params.id);
        if (!ok) return res.status(404).json({ success: false, message: 'Admin not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not delete admin.' });
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

    // Only a real number or a plain numeric string counts. The previous check
    // let strings and booleans through and stored them as 5 stars; a bare
    // Number() cast is not enough either, since Number(true) === 1 and
    // Number(['3']) === 3 would both slip past.
    const rawRating = (req.body || {}).rating;
    const rating =
        typeof rawRating === 'number' ? rawRating
        : (typeof rawRating === 'string' && /^[1-5]$/.test(rawRating.trim())) ? Number(rawRating.trim())
        : NaN;
    const comment = (req.body || {}).comment;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Please choose a star rating from 1 to 5.' });
    }

    try {
        const db = getDB();
        const foodId = req.params.foodId;

        // "Pickup-verified": you can only review a dish you actually ordered
        // and collected. This was previously enforced only by the tracking
        // page's UI, so any logged-in user could review any dish.
        const collectedOrder = await db.collection('orders').findOne({
            userId: req.session.user.id,
            status: 'completed',
            'items.foodId': foodId
        });
        if (!collectedOrder) {
            return res.status(403).json({
                success: false,
                message: 'You can only review a dish once you have collected an order containing it.'
            });
        }

        // One review per dish per customer — updating replaces the old one
        // rather than stacking another vote onto the average.
        const alreadyReviewed = await db.collection('reviews').findOne({
            foodId,
            userId: req.session.user.id
        });

        if (alreadyReviewed) {
            await db.collection('reviews').updateOne(
                { _id: alreadyReviewed._id },
                {
                    $set: {
                        rating,
                        comment: comment ? String(comment).trim().slice(0, 500) : '',
                        updatedAt: new Date()
                    }
                }
            );
        } else {
            await addReview(foodId, {
                userId: req.session.user.id,
                userName: req.session.user.name,
                rating,
                comment,
                orderId: collectedOrder.orderId
            });
        }

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

// ------------------------------------------------------------------
// Checkout & payments
//
// Every route below re-prices the cart from the database. The browser's
// cart is a convenience for the shopper, never a source of truth for
// what anything costs.
// ------------------------------------------------------------------

const PAYNOW_WINDOW_MS = 5 * 60 * 1000;   // QR validity, like a real dynamic PayNow code
const PAYNOW_SETTLE_MS = 4000;            // stand-in for the payer completing it in their bank app

// Loads the cart's foods and stalls, re-prices everything server-side and
// checks each stall is still open and each dish still available.
async function prepareCart(items) {
    const db = getDB();

    const foodIds = [...new Set((items || []).map(i => i && i.foodId).filter(Boolean))];
    const foods = foodIds.length
        ? await db.collection('foods').find({ id: { $in: foodIds } }).toArray()
        : [];
    const foodById = {};
    foods.forEach(f => { foodById[f.id] = f; });

    const priced = priceCart(items, foodById);
    if (priced.error) return { error: priced.error };

    const stallIds = [...new Set(foods.map(f => f.stall_id))];
    const stalls = stallIds.length
        ? await db.collection('stalls').find({ id: { $in: stallIds } }).toArray()
        : [];
    const stallById = {};
    stalls.forEach(s => { stallById[s.id] = s; });

    for (const line of priced.lines) {
        const food = foodById[line.foodId];
        if (food.soldOut) {
            return { error: `${food.name} just sold out. Please remove it from your cart.` };
        }
        const stall = stallById[food.stall_id];
        if (stall && stall.isOpen === false) {
            return { error: `${stall.name} is currently closed for new orders.` };
        }
    }

    return { lines: priced.lines, total: priced.total };
}

// Splits a priced cart into one order per stall, so each merchant only ever
// sees the portion of the order that belongs to their own store.
async function createOrders({ lines, userId, customerName, payment }) {
    const db = getDB();

    const groups = {};
    lines.forEach(line => {
        if (!groups[line.stallId]) groups[line.stallId] = [];
        groups[line.stallId].push(line);
    });

    const createdOrders = [];
    let orderIndex = 0;

    for (const [stallId, groupLines] of Object.entries(groups)) {
        orderIndex += 1;
        const groupTotal = Math.round(groupLines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
        const orderId = newOrderId(orderIndex);
        const queueNum = newQueueNumber();
        const prepTimeSeconds = 180 + groupLines.reduce((sum, l) => sum + l.qty * 90, 0);

        const order = {
            orderId,
            userId,
            customerName,
            stallId,
            items: groupLines.map(l => ({
                name: l.name,
                price: l.price,
                qty: l.qty,
                image: l.image,
                foodId: l.foodId,
                options: l.options
            })),
            total: groupTotal,
            paymentMethod: payment.method,
            paymentStatus: payment.status,          // 'paid' | 'unpaid'
            paymentRef: payment.reference || null,
            paymentDetail: payment.detail || null,  // e.g. "Visa ····4242"
            queueNum,
            prepTimeSeconds,
            readyAt: Date.now() + prepTimeSeconds * 1000,
            status: 'pending',
            createdAt: new Date()
        };

        await db.collection('orders').insertOne(order);
        createdOrders.push(order);
    }

    return createdOrders;
}

function orderSummary(orders) {
    return orders.map(o => ({ orderId: o.orderId, queueNum: o.queueNum, readyAt: o.readyAt, total: o.total }));
}

// Step 1 of PayNow: price the cart and hand back a scannable dynamic QR.
// No order exists yet — it is only created once the payment settles.
app.post('/api/payments/paynow', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please log in to complete checkout.' });
    }

    try {
        const prepared = await prepareCart((req.body || {}).items);
        if (prepared.error) {
            return res.status(400).json({ success: false, message: prepared.error });
        }

        const reference = newPaymentReference();
        const now = Date.now();
        const expiresAt = now + PAYNOW_WINDOW_MS;

        const payload = buildPayNowPayload({ amount: prepared.total, reference, expiresAt: new Date(expiresAt) });
        const qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 });

        await getDB().collection('payments').insertOne({
            reference,
            method: 'paynow',
            userId: req.session.user.id,
            amount: prepared.total,
            status: 'pending',
            settlesAt: now + PAYNOW_SETTLE_MS,
            expiresAt: new Date(expiresAt),
            consumed: false,
            createdAt: new Date()
        });

        res.json({
            success: true,
            reference,
            amount: prepared.total,
            qr: qrDataUrl,
            payload,
            expiresAt
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not start the PayNow payment. Please try again.' });
    }
});

// Step 2: the checkout page polls this the way a terminal waits for a bank
// push notification. Settlement is time-based so the demo is reproducible.
app.get('/api/payments/paynow/:reference', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please log in.' });
    }

    try {
        const db = getDB();
        const payment = await db.collection('payments').findOne({
            reference: req.params.reference,
            userId: req.session.user.id
        });

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found.' });
        }

        if (payment.status === 'pending') {
            if (Date.now() > new Date(payment.expiresAt).getTime()) {
                await db.collection('payments').updateOne({ reference: payment.reference }, { $set: { status: 'expired' } });
                return res.json({ success: true, status: 'expired' });
            }
            if (Date.now() >= payment.settlesAt) {
                await db.collection('payments').updateOne(
                    { reference: payment.reference },
                    { $set: { status: 'succeeded', settledAt: new Date() } }
                );
                return res.json({ success: true, status: 'succeeded' });
            }
        }

        res.json({ success: true, status: payment.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not check the payment status.' });
    }
});

// Final step for every method: re-price, take payment, create the orders.
app.post('/pay', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please log in to complete checkout.' });
    }

    const { items, customer, card, method, paymentReference } = req.body || {};
    const payMethod = PAYMENT_METHODS.includes(method) ? method : 'card';

    try {
        const db = getDB();

        // Prices always come from the database, never from the request body.
        const prepared = await prepareCart(items);
        if (prepared.error) {
            return res.status(400).json({ success: false, message: prepared.error });
        }

        const customerName = (customer && String(customer.name || '').trim()) || req.session.user.name;
        let payment;

        if (payMethod === 'card') {
            const auth = authoriseCard(card || {});
            if (!auth.approved) {
                return res.json({ success: false, code: auth.code, message: auth.message });
            }
            payment = {
                method: 'card',
                status: 'paid',
                reference: auth.authCode,
                detail: `${auth.brandLabel} ····${auth.last4}`
            };
            await db.collection('payments').insertOne({
                reference: auth.authCode,
                method: 'card',
                userId: req.session.user.id,
                amount: prepared.total,
                status: 'succeeded',
                brand: auth.brand,
                last4: auth.last4,   // full card number is never stored
                consumed: true,
                createdAt: new Date(),
                settledAt: new Date()
            });

        } else if (payMethod === 'paynow') {
            // The QR must have actually settled, belong to this user, match the
            // amount, and not already have been spent on another order.
            const record = await db.collection('payments').findOne({
                reference: String(paymentReference || ''),
                userId: req.session.user.id,
                method: 'paynow'
            });

            if (!record) {
                return res.status(400).json({ success: false, message: 'We could not find that PayNow payment. Please scan a new QR.' });
            }
            if (record.consumed) {
                return res.status(400).json({ success: false, message: 'That PayNow payment has already been used for an order.' });
            }
            if (record.status !== 'succeeded') {
                return res.status(400).json({ success: false, message: 'We have not received your PayNow transfer yet.' });
            }
            if (Math.abs(record.amount - prepared.total) > 0.005) {
                return res.status(400).json({ success: false, message: 'Your cart changed after the QR was generated. Please scan a new QR.' });
            }

            const claim = await db.collection('payments').updateOne(
                { reference: record.reference, consumed: false },
                { $set: { consumed: true } }
            );
            if (claim.modifiedCount === 0) {
                return res.status(400).json({ success: false, message: 'That PayNow payment has already been used for an order.' });
            }

            payment = { method: 'paynow', status: 'paid', reference: record.reference, detail: 'PayNow' };

        } else {
            // Pay at the stall on collection — the order is placed unpaid and
            // the merchant settles it when the customer picks it up.
            payment = { method: 'counter', status: 'unpaid', reference: null, detail: 'Pay at counter' };
        }

        const createdOrders = await createOrders({
            lines: prepared.lines,
            userId: req.session.user.id,
            customerName,
            payment
        });

        res.json({
            success: true,
            orders: orderSummary(createdOrders),
            total: prepared.total,
            paymentMethod: payment.method,
            paymentStatus: payment.status,
            paymentDetail: payment.detail,
            name: customerName
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not save your order. Please try again.' });
    }
});

// Scoped to the signed-in customer: order IDs are sequential-ish and easy to
// guess, so an order must belong to you before its contents are rendered.
app.get('/track/:orderId', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/?loginRequired=1');
    }
    try {
        const db = getDB();
        const order = await db.collection('orders').findOne({
            orderId: req.params.orderId,
            userId: req.session.user.id
        });
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

        orders.forEach(order => { order.status = normaliseStatus(order.status); });

        // Attach this customer's own review for each dish they've bought, so the
        // rating panel can pre-fill and let them revise a rating instead of
        // posting a second one.
        const foodIds = [...new Set(
            orders.flatMap(o => (o.items || []).map(i => i.foodId)).filter(Boolean)
        )];

        const myReviews = foodIds.length
            ? await db.collection('reviews')
                .find({ userId: req.session.user.id, foodId: { $in: foodIds } })
                .toArray()
            : [];

        const reviewByFood = {};
        myReviews.forEach(r => {
            reviewByFood[r.foodId] = { rating: r.rating, comment: r.comment || '' };
        });

        res.render('orders', { images, orders, reviewByFood });
    } catch (err) {
        console.error(err);
        res.render('orders', { images, orders: [], reviewByFood: {} });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
