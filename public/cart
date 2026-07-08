// ============================================================
//  Shopping cart for FoodHub.
//  The cart is stored in the browser with localStorage, so it
//  stays even after the page is refreshed. Loaded on every page.
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

// Add a dish (or increase its quantity if it's already in the cart)
function addToCart(name, price, image) {
    const cart = getCart();
    const item = cart.find(d => d.name === name);
    if (item) {
        item.qty += 1;
    } else {
        cart.push({ name: name, price: Number(price), image: image, qty: 1 });
    }
    saveCart(cart);
    openCartDrawer();
}

// Increase or decrease a dish's quantity (removes it at zero)
function changeQty(name, amount) {
    let cart = getCart();
    const item = cart.find(d => d.name === name);
    if (!item) return;
    item.qty += amount;
    if (item.qty <= 0) {
        cart = cart.filter(d => d.name !== name);
    }
    saveCart(cart);
}

function removeFromCart(name) {
    saveCart(getCart().filter(d => d.name !== name));
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
            html += `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}">
                    <div class="flex-grow-1">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">${formatPrice(item.price)}</div>
                        <div class="qty-box">
                            <button type="button" data-action="dec" data-name="${item.name}">&minus;</button>
                            <span>${item.qty}</span>
                            <button type="button" data-action="inc" data-name="${item.name}">+</button>
                        </div>
                    </div>
                    <button type="button" class="cart-remove" data-action="remove" data-name="${item.name}">Remove</button>
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

// Set everything up once the page has loaded
document.addEventListener('DOMContentLoaded', () => {
    const cartButton = document.getElementById('cartButton');
    if (cartButton) {
        cartButton.addEventListener('click', openCartDrawer);
    }

    // "Add to cart" buttons read the dish details from their data- attributes
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', () => {
            addToCart(button.dataset.name, button.dataset.price, button.dataset.image);
        });
    });

    // Handle the +, - and Remove buttons inside the drawer
    const list = document.getElementById('cartItems');
    if (list) {
        list.addEventListener('click', event => {
            const button = event.target.closest('button[data-name]');
            if (!button) return;
            const name = button.dataset.name;
            if (button.dataset.action === 'inc') changeQty(name, 1);
            else if (button.dataset.action === 'dec') changeQty(name, -1);
            else if (button.dataset.action === 'remove') removeFromCart(name);
        });
    }

    updateCartUI();
});
