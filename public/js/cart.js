// ============================================================
//  Shopping cart for FoodHub.
//  The cart is stored in the browser with localStorage, so it
//  stays even after the page is refreshed. Loaded on every page.
//  Supports simple items (name/price/image only) and customized
//  items (with size/spicy/addons/note options), deduped by a
//  generated key so two different customizations of the same
//  dish are tracked as separate lines.
// ============================================================

const CART_KEY = 'foodhub_cart';

// Format a number as a price, e.g. 14.9 -> "$14.90"
function formatPrice(value) {
    return '$' + Number(value).toFixed(2);
}

// Read the cart array from localStorage
function getCart() {
    try {
        const saved = JSON.parse(localStorage.getItem(CART_KEY));
        return Array.isArray(saved) ? saved : [];
    } catch (e) {
        return [];
    }
}

// Save the cart array, then refresh the badge and drawer
function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartUI();
}

// Build a dedupe key from the dish name + its chosen options
function cartItemKey(name, options) {
    let key = name;
    if (options) {
        if (options.size) key += `-${options.size}`;
        if (options.spicy) key += `-${options.spicy}`;
        if (options.addons && options.addons.length) key += `-${options.addons.slice().sort().join(',')}`;
        if (options.note) key += `-${options.note}`;
    }
    return key;
}

// Add a dish (or increase its quantity if the same dish + options combo is already in the cart)
// foodId is carried along so a post-checkout review can be attached to the right dish.
function addToCart(name, price, image, qty, options, foodId) {
    qty = qty || 1;
    options = options || null;
    foodId = foodId || null;
    const key = cartItemKey(name, options);
    const cart = getCart();
    const item = cart.find(d => d.key === key);
    if (item) {
        item.qty += qty;
    } else {
        cart.push({ key: key, name: name, price: Number(price), image: image, qty: qty, options: options, foodId: foodId });
    }
    saveCart(cart);
    openCartDrawer();
}

// Increase or decrease a dish's quantity (removes it at zero)
function changeQty(key, amount) {
    let cart = getCart();
    const item = cart.find(d => d.key === key);
    if (!item) return;
    item.qty += amount;
    if (item.qty <= 0) {
        cart = cart.filter(d => d.key !== key);
    }
    saveCart(cart);
}

function removeFromCart(key) {
    saveCart(getCart().filter(d => d.key !== key));
}

function clearCart() {
    saveCart([]);
}

function cartCount() {
    return getCart().reduce((total, d) => total + d.qty, 0);
}

function cartTotal() {
    return getCart().reduce((total, d) => total + d.price * d.qty, 0);
}

function optionsSummary(options) {
    if (!options) return '';
    const parts = [];
    if (options.size) parts.push(`Size: ${options.size}`);
    if (options.spicy) parts.push(`Spicy: ${options.spicy}`);
    if (options.addons && options.addons.length) parts.push(`Add-ons: ${options.addons.join(', ')}`);
    if (options.note) parts.push(`Note: "${options.note}"`);
    return parts.join(' | ');
}

// Update the badge number and the drawer contents
function updateCartUI() {
    const badge = document.getElementById('cartBadge');
    if (badge) {
        const count = cartCount();
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    const list = document.getElementById('cartItems');
    if (!list) return; // pages without a drawer (e.g. checkout) stop here

    const cart = getCart();
    if (cart.length === 0) {
        list.innerHTML = '<p class="cart-empty">Your cart is empty.<br>Add a dish to get started.</p>';
    } else {
        let html = '';
        cart.forEach(item => {
            const opts = optionsSummary(item.options);
            html += `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}">
                    <div class="flex-grow-1">
                        <div class="cart-item-name">${item.name}</div>
                        ${opts ? `<div style="font-size:0.72rem;color:#6c757d;margin:0.15rem 0 0.4rem;">${opts}</div>` : ''}
                        <div class="cart-item-price">${formatPrice(item.price)}</div>
                        <div class="qty-box">
                            <button type="button" data-action="dec" data-key="${item.key}">&minus;</button>
                            <span>${item.qty}</span>
                            <button type="button" data-action="inc" data-key="${item.key}">+</button>
                        </div>
                    </div>
                    <button type="button" class="cart-remove" data-action="remove" data-key="${item.key}">Remove</button>
                </div>`;
        });
        list.innerHTML = html;
    }

    const subtotal = document.getElementById('cartSubtotal');
    if (subtotal) subtotal.textContent = formatPrice(cartTotal());
}

// Open the slide-out cart (Bootstrap offcanvas)
function openCartDrawer() {
    const drawer = document.getElementById('cartDrawer');
    if (drawer && window.bootstrap) {
        bootstrap.Offcanvas.getOrCreateInstance(drawer).show();
    }
}

// Re-add every item from a past order to the current cart (used by the "Reorder" button on /orders)
function reorderItems(items) {
    const cart = getCart();
    items.forEach(item => {
        const key = cartItemKey(item.name, item.options);
        const existing = cart.find(d => d.key === key);
        if (existing) {
            existing.qty += item.qty;
        } else {
            cart.push({ key: key, name: item.name, price: item.price, image: item.image, qty: item.qty, options: item.options || null, foodId: item.foodId || null });
        }
    });
    saveCart(cart);
}

// Set everything up once the page has loaded
document.addEventListener('DOMContentLoaded', () => {
    const cartButton = document.getElementById('cartButton');
    if (cartButton) {
        cartButton.addEventListener('click', openCartDrawer);
    }

    // Simple "Add to cart" buttons (no customization) read the dish details from their data- attributes
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', () => {
            addToCart(button.dataset.name, button.dataset.price, button.dataset.image, 1, null, button.dataset.foodid || null);
        });
    });

    // Handle the +, - and Remove buttons inside the drawer
    const list = document.getElementById('cartItems');
    if (list) {
        list.addEventListener('click', event => {
            const button = event.target.closest('button[data-key]');
            if (!button) return;
            const key = button.dataset.key;
            if (button.dataset.action === 'inc') changeQty(key, 1);
            else if (button.dataset.action === 'dec') changeQty(key, -1);
            else if (button.dataset.action === 'remove') removeFromCart(key);
        });
    }

    updateCartUI();
});
