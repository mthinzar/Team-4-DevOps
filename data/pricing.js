// ============================================================
//  Server-side price calculation.
//
//  The browser cart lives in localStorage, so every price and quantity
//  it sends is attacker-controlled. Nothing here trusts the client's
//  numbers: prices are rebuilt from the food document in the database
//  plus the option price differences defined alongside it, and the
//  result is what gets charged and stored on the order.
// ============================================================

const MAX_QTY_PER_LINE = 20;

// Options arrive from the cart as { size, spicy, addons: [], note }.
// The authoritative price differences live on the food document as
// { sizes: [{name, priceDiff}], spicy: [...], addons: [...] }.
function optionPriceDiff(food, chosen) {
    if (!food.options || !chosen) return 0;

    let diff = 0;

    const matchDiff = (list, name) => {
        if (!Array.isArray(list) || !name) return 0;
        const found = list.find(entry => entry.name === name);
        return found && Number.isFinite(Number(found.priceDiff)) ? Number(found.priceDiff) : 0;
    };

    diff += matchDiff(food.options.sizes, chosen.size);
    diff += matchDiff(food.options.spicy, chosen.spicy);

    if (Array.isArray(chosen.addons)) {
        // Dedupe so the same add-on can't be sent twice to inflate a discount.
        [...new Set(chosen.addons)].forEach(addonName => {
            diff += matchDiff(food.options.addons, addonName);
        });
    }

    return diff;
}

function unitPrice(food, chosen) {
    const base = Number(food.price);
    if (!Number.isFinite(base) || base < 0) return null;
    const price = base + optionPriceDiff(food, chosen);
    // An option set that somehow nets out negative is a data error, not a discount.
    return price > 0 ? Math.round(price * 100) / 100 : null;
}

function validQty(qty) {
    const n = Number(qty);
    return Number.isInteger(n) && n >= 1 && n <= MAX_QTY_PER_LINE;
}

// Rebuilds the cart against the database. Returns either
// { error: 'message' } or { lines: [...], total } where each line carries
// the server's own price — never the client's.
function priceCart(items, foodById) {
    if (!Array.isArray(items) || items.length === 0) {
        return { error: 'Your cart is empty. Add a dish before paying.' };
    }
    if (items.length > 50) {
        return { error: 'That is too many different items for one order.' };
    }

    const lines = [];

    for (const item of items) {
        const food = item && item.foodId ? foodById[item.foodId] : null;
        if (!food) {
            return { error: 'One of the items in your cart is no longer available. Please refresh and try again.' };
        }
        if (!validQty(item.qty)) {
            return { error: `Choose a quantity between 1 and ${MAX_QTY_PER_LINE} for ${food.name}.` };
        }

        const price = unitPrice(food, item.options);
        if (price === null) {
            return { error: `We could not price ${food.name}. Please remove it and try again.` };
        }

        const qty = Number(item.qty);
        lines.push({
            foodId: food.id,
            stallId: food.stall_id,
            name: food.name,
            image: food.image || null,
            options: item.options || null,
            price,
            qty,
            lineTotal: Math.round(price * qty * 100) / 100
        });
    }

    const total = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
    if (!(total > 0)) {
        return { error: 'Order total is invalid.' };
    }

    return { lines, total };
}

module.exports = { priceCart, unitPrice, optionPriceDiff, validQty, MAX_QTY_PER_LINE };
