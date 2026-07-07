// ============================================================
//  Central place for images and popular dishes shown on the home page.
//  (Stall/food data lives in MongoDB — see seed.js and db.js.)
// ============================================================

const images = {
    logo: '/images/logo.png',
    hero: '/images/hero.png'
};

const popularDishes = [
    {
        name: 'Hamburger',
        description: 'Grilled beef burger topped with cheese, lettuce and tomato.',
        price: 14.90,
        image: '/images/burger.png',
        category: 'Burgers'
    },
    {
        name: 'Cheese Pizza',
        description: 'Crispy crust topped with mozzarella cheese and rich tomato sauce.',
        price: 13.90,
        image: '/images/pizza.png',
        category: 'Burgers'
    },
    {
        name: 'Creamy Pasta',
        description: 'Rich creamy pasta served with tender chicken and parmesan.',
        price: 7.90,
        image: '/images/pasta.png',
        category: 'Rice'
    },
    {
        name: 'Mala Xiang Guo',
        description: 'Bold, spicy stir-fry with fresh seafood and crisp vegetables.',
        price: 9.90,
        image: '/images/mala.png',
        category: 'Rice'
    },
    {
        name: 'Ice Lemon Tea',
        description: 'Refreshing iced tea infused with fresh lemon and mint.',
        price: 2.90,
        image: '/images/lemontea.png',
        category: 'Drinks'
    }
];

module.exports = { images, popularDishes };
