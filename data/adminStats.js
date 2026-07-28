// ============================================================
//  Platform-wide aggregations for the admin portal. Unlike
//  merchantStats.js (scoped to one stallId), every query here
//  spans all stores — these are only ever reachable behind
//  requireAdmin.
// ============================================================

const { getDB } = require('../db');

// The platform's cut of every order — see admin/reports.ejs for the
// worked example (store earns $100, platform takes 10% = $10).
const COMMISSION_RATE = 0.10;

const LIVE_STATUSES_EXCLUDING_CANCELLED = { $ne: 'cancelled' };

function startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function daysAgo(n) {
    const d = startOfDay();
    d.setDate(d.getDate() - n);
    return d;
}

function startOfMonth(monthsBack = 0) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - monthsBack);
    return d;
}

async function attachStallNames(orders) {
    const db = getDB();
    const stallIds = [...new Set(orders.map(o => o.stallId).filter(Boolean))];
    const stalls = stallIds.length
        ? await db.collection('stalls').find({ id: { $in: stallIds } }).toArray()
        : [];
    const nameById = {};
    stalls.forEach(s => { nameById[s.id] = s.name; });
    orders.forEach(o => { o.stallName = nameById[o.stallId] || o.stallId; });
    return orders;
}

async function getPlatformDashboardStats() {
    const db = getDB();
    const today = startOfDay();

    const [totalStores, totalCustomers, ordersToday, recentOrdersRaw, recentFeedback] = await Promise.all([
        db.collection('stalls').countDocuments({}),
        db.collection('users').countDocuments({}),
        db.collection('orders').find({ createdAt: { $gte: today }, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        db.collection('orders').find({}).sort({ createdAt: -1 }).limit(8).toArray(),
        db.collection('reviews').find({}).sort({ createdAt: -1 }).limit(5).toArray()
    ]);

    const allLiveOrders = await db.collection('orders').find({ status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray();
    const totalOrders = allLiveOrders.length;
    const totalSales = allLiveOrders.reduce((sum, o) => sum + o.total, 0);
    const totalRevenue = totalSales * COMMISSION_RATE;
    const salesToday = ordersToday.reduce((sum, o) => sum + o.total, 0);

    const recentOrders = await attachStallNames(recentOrdersRaw);

    // Attach food + stall name to each recent review for display.
    const foodIds = [...new Set(recentFeedback.map(r => r.foodId).filter(Boolean))];
    const foods = foodIds.length ? await db.collection('foods').find({ id: { $in: foodIds } }).toArray() : [];
    const foodById = {};
    foods.forEach(f => { foodById[f.id] = f; });
    const stallIdsForFeedback = [...new Set(foods.map(f => f.stall_id).filter(Boolean))];
    const stallsForFeedback = stallIdsForFeedback.length
        ? await db.collection('stalls').find({ id: { $in: stallIdsForFeedback } }).toArray()
        : [];
    const stallNameById = {};
    stallsForFeedback.forEach(s => { stallNameById[s.id] = s.name; });
    recentFeedback.forEach(r => {
        const food = foodById[r.foodId];
        r.foodName = food ? food.name : 'Deleted dish';
        r.stallName = food ? (stallNameById[food.stall_id] || food.stall_id) : null;
    });

    return {
        totalStores,
        totalCustomers,
        totalOrders,
        ordersTodayCount: ordersToday.length,
        salesToday: Math.round(salesToday * 100) / 100,
        totalSales: Math.round(totalSales * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        recentOrders,
        recentFeedback
    };
}

// Sales/orders/commission per store, sorted best-selling first — also
// makes the worst performers easy to spot from the tail of the list.
async function getStoreSalesBreakdown() {
    const db = getDB();
    const [stalls, allLiveOrders] = await Promise.all([
        db.collection('stalls').find({}).toArray(),
        db.collection('orders').find({ status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray()
    ]);

    const byStall = {};
    allLiveOrders.forEach(o => {
        if (!byStall[o.stallId]) byStall[o.stallId] = { orderCount: 0, sales: 0 };
        byStall[o.stallId].orderCount += 1;
        byStall[o.stallId].sales += o.total;
    });

    const breakdown = stalls.map(stall => {
        const agg = byStall[stall.id] || { orderCount: 0, sales: 0 };
        return {
            stallId: stall.id,
            name: stall.name,
            image: stall.image,
            isOpen: stall.isOpen !== false,
            hasOwner: !!stall.merchantId,
            orderCount: agg.orderCount,
            sales: Math.round(agg.sales * 100) / 100,
            commission: Math.round(agg.sales * COMMISSION_RATE * 100) / 100
        };
    });

    breakdown.sort((a, b) => b.sales - a.sales);
    return breakdown;
}

async function getReportsData() {
    const db = getDB();
    const today = startOfDay();
    const weekStart = daysAgo(6);
    const monthStart = startOfMonth(0);

    const [ordersToday, ordersWeek, ordersMonth, allLiveOrders, allOrdersIncludingCancelled, reviews, stalls] = await Promise.all([
        db.collection('orders').find({ createdAt: { $gte: today }, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        db.collection('orders').find({ createdAt: { $gte: weekStart }, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        db.collection('orders').find({ createdAt: { $gte: monthStart }, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        db.collection('orders').find({ status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        db.collection('orders').find({}).toArray(),
        db.collection('reviews').find({}).toArray(),
        db.collection('stalls').find({}).toArray()
    ]);

    const stallNameById = {};
    stalls.forEach(s => { stallNameById[s.id] = s.name; });

    const sum = list => list.reduce((s, o) => s + o.total, 0);
    const money = n => Math.round(n * 100) / 100;

    const salesToday = sum(ordersToday);
    const salesWeek = sum(ordersWeek);
    const salesMonth = sum(ordersMonth);

    // Orders by day (last 7 days)
    const dayLabels = [];
    const dayCounts = [];
    for (let i = 6; i >= 0; i--) {
        const dayStart = daysAgo(i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        dayLabels.push(dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
        dayCounts.push(ordersWeek.filter(o => o.createdAt >= dayStart && o.createdAt < dayEnd).length);
    }

    // Revenue by month (last 6 months, oldest -> newest)
    const monthLabels = [];
    const monthSales = [];
    const monthCommission = [];
    for (let i = 5; i >= 0; i--) {
        const mStart = startOfMonth(i);
        const mEnd = startOfMonth(i - 1);
        const monthOrders = allLiveOrders.filter(o => o.createdAt >= mStart && o.createdAt < mEnd);
        const mSales = sum(monthOrders);
        monthLabels.push(mStart.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
        monthSales.push(money(mSales));
        monthCommission.push(money(mSales * COMMISSION_RATE));
    }

    // Revenue by store
    const byStall = {};
    allLiveOrders.forEach(o => {
        if (!byStall[o.stallId]) byStall[o.stallId] = { orderCount: 0, sales: 0 };
        byStall[o.stallId].orderCount += 1;
        byStall[o.stallId].sales += o.total;
    });
    const revenueByStore = Object.entries(byStall)
        .map(([stallId, agg]) => ({
            name: stallNameById[stallId] || stallId,
            orderCount: agg.orderCount,
            sales: money(agg.sales),
            commission: money(agg.sales * COMMISSION_RATE)
        }))
        .sort((a, b) => b.sales - a.sales);

    // Most popular stores (by order count) & dishes (by qty sold)
    const popularStores = Object.entries(byStall)
        .map(([stallId, agg]) => ({ name: stallNameById[stallId] || stallId, orderCount: agg.orderCount }))
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, 5);

    const qtyByDish = {};
    allLiveOrders.forEach(order => {
        order.items.forEach(item => {
            qtyByDish[item.name] = (qtyByDish[item.name] || 0) + item.qty;
        });
    });
    const popularDishes = Object.entries(qtyByDish)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    // Cancelled order rate (share of all orders ever placed, not just live ones)
    const cancelledCount = allOrdersIncludingCancelled.filter(o => o.status === 'cancelled').length;
    const cancelledRate = allOrdersIncludingCancelled.length
        ? Math.round((cancelledCount / allOrdersIncludingCancelled.length) * 1000) / 10
        : 0;

    // Feedback summary
    const totalReviews = reviews.length;
    const avgRating = totalReviews ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews : 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

    return {
        commissionRate: COMMISSION_RATE,
        salesToday: money(salesToday),
        salesWeek: money(salesWeek),
        salesMonth: money(salesMonth),
        revenueToday: money(salesToday * COMMISSION_RATE),
        revenueWeek: money(salesWeek * COMMISSION_RATE),
        revenueMonth: money(salesMonth * COMMISSION_RATE),
        ordersByDay: { labels: dayLabels, counts: dayCounts },
        revenueByMonth: { labels: monthLabels, sales: monthSales, commission: monthCommission },
        revenueByStore,
        popularStores,
        popularDishes,
        cancelledRate,
        feedbackSummary: {
            avgRating: Math.round(avgRating * 10) / 10,
            totalReviews,
            distribution
        }
    };
}

// Average rating per store, worst first — used on the reviews page to
// flag stores that need attention.
async function getStoreRatingBreakdown() {
    const db = getDB();
    const [stalls, foods, reviews] = await Promise.all([
        db.collection('stalls').find({}).toArray(),
        db.collection('foods').find({}).toArray(),
        db.collection('reviews').find({}).toArray()
    ]);

    const stallIdByFoodId = {};
    foods.forEach(f => { stallIdByFoodId[f.id] = f.stall_id; });

    const byStall = {};
    reviews.forEach(r => {
        const stallId = stallIdByFoodId[r.foodId];
        if (!stallId) return;
        if (!byStall[stallId]) byStall[stallId] = { sum: 0, count: 0 };
        byStall[stallId].sum += r.rating;
        byStall[stallId].count += 1;
    });

    return stalls
        .map(stall => {
            const agg = byStall[stall.id];
            return {
                name: stall.name,
                avgRating: agg ? Math.round((agg.sum / agg.count) * 10) / 10 : null,
                reviewCount: agg ? agg.count : 0
            };
        })
        .filter(s => s.reviewCount > 0)
        .sort((a, b) => a.avgRating - b.avgRating);
}

module.exports = {
    COMMISSION_RATE,
    getPlatformDashboardStats,
    getStoreSalesBreakdown,
    getReportsData,
    getStoreRatingBreakdown
};
