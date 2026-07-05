// ============================================================
//  Central place for ALL images & dish data.
//  Edit image paths or dish info here — used across the app.
// ============================================================

// --- Site images (logo, hero banner) ---
const images = {
    logo: '/images/logo.png',
    hero: '/images/hero.png'
};

// --- Dishes shown on the home page & menu page ---
//  Each dish has a `category` used by the menu filter pills, and a
//  `stock` count. When stock reaches 0 the dish is sold out, and the
//  payment step will ask the customer to change their order or refund.
const popularDishes = [
    {
        name: 'Hamburger',
        description: 'Grilled beef burger topped with cheese, lettuce and tomato.',
        price: 14.90,
        image: '/images/burger.png',
        category: 'Burgers',
        stock: 20
    },
    {
        name: 'Cheese Pizza',
        description: 'Crispy crust topped with mozzarella cheese and rich tomato sauce.',
        price: 13.90,
        image: '/images/pizza.png',
        category: 'Burgers',
        stock: 12
    },
    {
        name: 'Creamy Pasta',
        description: 'Rich creamy pasta served with tender chicken and parmesan.',
        price: 7.90,
        image: '/images/pasta.png',
        category: 'Rice',
        stock: 8
    },
    {
        name: 'Mala Xiang Guo',
        description: 'Bold, spicy stir-fry with fresh seafood and crisp vegetables.',
        price: 9.90,
        image: '/images/mala.png',
        category: 'Rice',
        stock: 0
    },
    {
        name: 'Ice Lemon Tea',
        description: 'Refreshing iced tea infused with fresh lemon and mint.',
        price: 2.90,
        image: '/images/lemontea.png',
        category: 'Drinks',
        stock: 30
    }
];

module.exports = { images, popularDishes };
