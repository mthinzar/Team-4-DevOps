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
//  Each dish has a `category` used by the menu filter pills.
//  Each dish has a unique `id` used for the dish review page (/dish/:id).
const popularDishes = [
    {
        id: 'hamburger',
        name: 'Hamburger',
        description: 'Grilled beef burger topped with cheese, lettuce and tomato.',
        price: 14.90,
        image: '/images/burger.png',
        category: 'Burgers'
    },
    {
        id: 'cheese-pizza',
        name: 'Cheese Pizza',
        description: 'Crispy crust topped with mozzarella cheese and rich tomato sauce.',
        price: 13.90,
        image: '/images/pizza.png',
        category: 'Burgers'
    },
    {
        id: 'creamy-pasta',
        name: 'Creamy Pasta',
        description: 'Rich creamy pasta served with tender chicken and parmesan.',
        price: 7.90,
        image: '/images/pasta.png',
        category: 'Rice'
    },
    {
        id: 'mala-xiang-guo',
        name: 'Mala Xiang Guo',
        description: 'Bold, spicy stir-fry with fresh seafood and crisp vegetables.',
        price: 9.90,
        image: '/images/mala.png',
        category: 'Rice'
    },
    {
        id: 'ice-lemon-tea',
        name: 'Ice Lemon Tea',
        description: 'Refreshing iced tea infused with fresh lemon and mint.',
        price: 2.90,
        image: '/images/lemontea.png',
        category: 'Drinks'
    }
];

module.exports = { images, popularDishes };
