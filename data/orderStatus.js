// ============================================================
//  The order steps.
//
//  An order goes pending -> preparing -> ready -> completed, one
//  step at a time, and can be cancelled only before it is ready.
//  This used to live inside app.js. It was moved here so the rules
//  can be tested on their own without starting the website or the
//  database.
// ============================================================

const ORDER_FLOW = ['pending', 'preparing', 'ready', 'completed'];

const ORDER_STATUS_LABELS = {
    pending: 'New order',
    preparing: 'Preparing',
    ready: 'Ready for collection',
    completed: 'Collected',
    cancelled: 'Cancelled'
};

// The single action button shown on each order, keyed by its current status.
const NEXT_STEP = {
    pending:   { status: 'preparing', label: 'Accept & start preparing' },
    preparing: { status: 'ready',     label: 'Mark ready for collection' },
    ready:     { status: 'completed', label: 'Mark collected' }
};

const CANCELLABLE = ['pending', 'preparing'];

const PAYMENT_LABELS = { paynow: 'PayNow', card: 'Card', counter: 'Pay at stall' };

// Older orders were saved with 'accepted' and 'collected'. Turn them into
// the four steps above when we read them, so old orders still work without
// having to change the database.
function normaliseStatus(status) {
    if (status === 'accepted') return 'preparing';
    if (status === 'collected') return 'completed';
    if (status === 'cancelled' || ORDER_FLOW.includes(status)) return status;
    return 'pending';
}

// Can an order at this status still be cancelled?
function canCancel(current) {
    return CANCELLABLE.includes(current);
}

// Is this the one step the order is allowed to take next?
function canMoveTo(current, requested) {
    if (requested === 'cancelled') return canCancel(current);

    const next = NEXT_STEP[current];
    return Boolean(next) && next.status === requested;
}

// Builds the reference a customer sees, like "FH-482913".
// orderIndex keeps the ids apart when one cart is split across stalls.
function newOrderId(orderIndex) {
    return 'FH-' + (Date.now() + orderIndex).toString().slice(-6);
}

// The number called out at the stall.
function newQueueNumber() {
    return Math.floor(Math.random() * 899) + 101;
}

module.exports = {
    ORDER_FLOW,
    ORDER_STATUS_LABELS,
    NEXT_STEP,
    CANCELLABLE,
    PAYMENT_LABELS,
    normaliseStatus,
    canCancel,
    canMoveTo,
    newOrderId,
    newQueueNumber
};
