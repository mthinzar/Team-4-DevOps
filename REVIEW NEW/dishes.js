// ============================================================
//  Central place for ALL images & dish data.
//  Edit image paths or dish info here — used across the app.
// ============================================================

// --- Site images (logo, hero banner) ---
const images = {
    logo: '/images/logo.png',
    hero: '/images/hero.png'
};

// --- Popular dishes shown on the home page ---
const popularDishes = [
    {
        name: 'Hamburger',
        description: 'Grilled beef burger topped with cheese, lettuce and tomato.',
        price: 14.90,
        image: '/images/burger.png'
    },
    {
        name: 'Cheese Pizza',
        description: 'Crispy crust topped with mozzarella cheese and rich tomato sauce.',
        price: 13.90,
        image: '/images/pizza.png'
    },
    {
        name: 'Creamy Pasta',
        description: 'Rich creamy pasta served with tender chicken and parmesan.',
        price: 7.90,
        image: '/images/pasta.png'
    },
    {
        name: 'Mala Xiang Guo',
        description: 'Bold, spicy stir-fry with fresh seafood and crisp vegetables.',
        price: 9.90,
        image: '/images/mala.png'
    },
    {
        name: 'Ice Lemon Tea',
        description: 'Refreshing iced tea infused with fresh lemon and mint.',
        price: 2.90,
        image: '/images/lemontea.png'
    }
];

// --- Full menu dishes shown on the /menu page ---
// Each dish has a unique `id` (used to build its review page at /dish/:id)
const menuDishes = [
    {
        id: 'burger',
        name: 'Burger',
        description: 'Grilled beef burger with cheese and lettuce',
        price: 6.00,
        category: 'Burgers',
        image: '/images/burger.png'
    },
    {
        id: 'cheese-pizza',
        name: 'Cheese Pizza',
        description: 'Crispy crust with mozzarella and tomato sauce',
        price: 8.00,
        category: 'Burgers',
        image: '/images/pizza.png'
    },
    {
        id: 'creamy-pasta',
        name: 'Creamy Pasta',
        description: 'Rich creamy pasta with tender chicken',
        price: 7.90,
        category: 'Rice',
        image: '/images/pasta.png'
    },
    {
        id: 'mala-xiang-guo',
        name: 'Mala Xiang Guo',
        description: 'Spicy stir-fry with fresh seafood and vegetables',
        price: 9.90,
        category: 'Rice',
        image: '/images/mala.png'
    },
    {
        id: 'ice-lemon-tea',
        name: 'Ice Lemon Tea',
        description: 'Refreshing iced tea with fresh lemon',
        price: 2.90,
        category: 'Drinks',
        image: '/images/lemontea.png'
    }
];

module.exports = { images, popularDishes, menuDishes };
