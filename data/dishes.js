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
const popularDishes = [
    {
        name: 'Hamburger',
        description: 'Grilled beef burger topped with cheese, lettuce and tomato.',
        price: 14.90,
        image: '/images/burger.png',
        category: 'Burgers',
        options: {
            sizes: [
                { name: 'Regular', priceDiff: 0 },
                { name: 'Double Patty', priceDiff: 3.50 }
            ],
            spicy: null,
            addons: [
                { name: 'Extra Cheese', priceDiff: 0.50 },
                { name: 'Fried Egg', priceDiff: 1.00 },
                { name: 'Bacon Strip', priceDiff: 1.50 }
            ]
        }
    },
    {
        name: 'Cheese Pizza',
        description: 'Crispy crust topped with mozzarella cheese and rich tomato sauce.',
        price: 13.90,
        image: '/images/pizza.png',
        category: 'Burgers',
        options: {
            sizes: [
                { name: 'Personal (8")', priceDiff: 0 },
                { name: 'Medium (12")', priceDiff: 4.00 },
                { name: 'Large (16")', priceDiff: 8.00 }
            ],
            spicy: null,
            addons: [
                { name: 'Extra Cheese', priceDiff: 1.00 },
                { name: 'Stuffed Crust', priceDiff: 3.00 }
            ]
        }
    },
    {
        name: 'Creamy Pasta',
        description: 'Rich creamy pasta served with tender chicken and parmesan.',
        price: 7.90,
        image: '/images/pasta.png',
        category: 'Rice',
        options: {
            sizes: [
                { name: 'Regular Portion', priceDiff: 0 },
                { name: 'Large Portion', priceDiff: 1.80 }
            ],
            spicy: [
                { name: 'Non-Spicy' },
                { name: 'Mild' },
                { name: 'Spicy' }
            ],
            addons: [
                { name: 'Extra Sauce', priceDiff: 0.80 },
                { name: 'Add Grilled Chicken', priceDiff: 2.00 }
            ]
        }
    },
    {
        name: 'Ice Lemon Tea',
        description: 'Refreshing iced tea infused with fresh lemon and mint.',
        price: 2.90,
        image: '/images/lemontea.png',
        category: 'Drinks',
        options: {
            sizes: [
                { name: 'Regular Cup', priceDiff: 0 },
                { name: 'Large Cup', priceDiff: 0.60 }
            ],
            spicy: [
                { name: 'Iced (Standard)' },
                { name: 'Hot Tea', priceDiff: -0.30 }
            ],
            addons: [
                { name: 'Less Sweet', priceDiff: 0 },
                { name: 'No Sugar', priceDiff: 0 }
            ]
        }
    }
];

module.exports = { images, popularDishes };