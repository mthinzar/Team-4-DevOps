// ============================================================
//  Aggregation queries for the merchant dashboard & stats page.
//  Every query here is scoped to a single stallId — callers must
//  always pass the merchant's own stallId, never trust a client value.
// ============================================================

const { getDB } = require('../db');

const DONE_STATUSES = ['completed', 'collected']; // 'collected' kept for legacy test orders
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

async function getDashboardStats(stallId) {
    const db = getDB();
    const orders = db.collection('orders');
    const today = startOfDay();

    const [ordersToday, allOrders, recentOrders] = await Promise.all([
        orders.find({ stallId, createdAt: { $gte: today }, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        orders.find({ stallId, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        orders.find({ stallId }).sort({ createdAt: -1 }).limit(8).toArray()
    ]);

    const salesToday = ordersToday.reduce((sum, o) => sum + o.total, 0);
    const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0);

    const qtyByDish = {};
    allOrders.forEach(order => {
        order.items.forEach(item => {
            qtyByDish[item.name] = (qtyByDish[item.name] || 0) + item.qty;
        });
    });
    let bestSellingDish = null;
    let bestQty = 0;
    Object.entries(qtyByDish).forEach(([name, qty]) => {
        if (qty > bestQty) {
            bestQty = qty;
            bestSellingDish = name;
        }
    });

    return {
        ordersTodayCount: ordersToday.length,
        salesToday: Math.round(salesToday * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        bestSellingDish,
        bestSellingQty: bestQty,
        recentOrders
    };
}

async function getStatsPageData(stallId) {
    const db = getDB();
    const orders = db.collection('orders');
    const today = startOfDay();
    const weekStart = daysAgo(6); // last 7 days including today

    const [ordersToday, ordersThisWeek, allOrders] = await Promise.all([
        orders.find({ stallId, createdAt: { $gte: today }, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        orders.find({ stallId, createdAt: { $gte: weekStart }, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray(),
        orders.find({ stallId, status: LIVE_STATUSES_EXCLUDING_CANCELLED }).toArray()
    ]);

    const salesToday = ordersToday.reduce((sum, o) => sum + o.total, 0);
    const salesThisWeek = ordersThisWeek.reduce((sum, o) => sum + o.total, 0);
    const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0);

    // Orders by day for the last 7 days (oldest -> newest)
    const dayLabels = [];
    const dayCounts = [];
    for (let i = 6; i >= 0; i--) {
        const dayStart = daysAgo(i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const label = dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const count = ordersThisWeek.filter(o => o.createdAt >= dayStart && o.createdAt < dayEnd).length;
        dayLabels.push(label);
        dayCounts.push(count);
    }

    // Best-selling (all-time) & trending (last 7 days) by quantity sold
    function tallyQty(orderList) {
        const tally = {};
        orderList.forEach(order => {
            order.items.forEach(item => {
                tally[item.name] = (tally[item.name] || 0) + item.qty;
            });
        });
        return Object.entries(tally)
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }

    return {
        ordersTodayCount: ordersToday.length,
        ordersThisWeekCount: ordersThisWeek.length,
        salesToday: Math.round(salesToday * 100) / 100,
        salesThisWeek: Math.round(salesThisWeek * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        ordersByDay: { labels: dayLabels, counts: dayCounts },
        bestSelling: tallyQty(allOrders),
        trending: tallyQty(ordersThisWeek)
    };
}

module.exports = { getDashboardStats, getStatsPageData, startOfDay, daysAgo };
