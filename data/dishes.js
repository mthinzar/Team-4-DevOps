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

// --- Food stores shown on the home page ---
//  Each store links through to the menu. Placeholder data for now —
//  swap names / images / ratings for real vendors later.
const foodStores = [
    {
        name: 'Burger Barn',
        cuisine: 'Burgers & Fast Food',
        image: '/images/burger.png',
        rating: 4.7,
        prepTime: '20-30 min'
    },
    {
        name: 'Pizza Corner',
        cuisine: 'Pizza & Italian',
        image: '/images/pizza.png',
        rating: 4.5,
        prepTime: '25-35 min'
    },
    {
        name: 'Pasta House',
        cuisine: 'Pasta & Western',
        image: '/images/pasta.png',
        rating: 4.6,
        prepTime: '20-30 min'
    },
    {
        name: 'Mala Kitchen',
        cuisine: 'Chinese & Spicy',
        image: '/images/mala.png',
        rating: 4.8,
        prepTime: '30-40 min'
    },
    {
        name: 'Sip & Sweet',
        cuisine: 'Drinks & Desserts',
        image: '/images/lemontea.png',
        rating: 4.4,
        prepTime: '15-25 min'
    },
    {
        name: 'The Grill Shack',
        cuisine: 'Burgers & BBQ',
        image: '/images/burger.png',
        rating: 4.6,
        prepTime: '20-30 min'
    },
    {
        name: 'Spice Wok',
        cuisine: 'Asian & Noodles',
        image: '/images/mala.png',
        rating: 4.7,
        prepTime: '25-35 min'
    },
    {
        name: 'Bubble Bar',
        cuisine: 'Bubble Tea & Drinks',
        image: '/images/lemontea.png',
        rating: 4.5,
        prepTime: '10-20 min'
    },
    {
        name: 'Slice Heaven',
        cuisine: 'Pizza & Sides',
        image: '/images/pizza.png',
        rating: 4.3,
        prepTime: '25-35 min'
    }
];

module.exports = { images, popularDishes, foodStores };
