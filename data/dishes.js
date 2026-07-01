// ============================================================
//  Central place for ALL images, popular dishes, and stalls data.
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

// --- Stalls shown on the Menu page ---
const stalls = [
    {
        id: 'western',
        name: 'Western Stall',
        emoji: '🍔',
        description: 'Burgers, pasta, grills & more',
        foods: [
            { 
                name: 'Burger', 
                description: 'Juicy beef or chicken burger', 
                price: 6.50, 
                image: '', 
                badge: 'bestseller',
                options: {
                    sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Double Patty', priceDiff: 2.50 }],
                    spicy: null,
                    addons: [{ name: 'Extra Cheese', priceDiff: 0.50 }, { name: 'Fried Egg', priceDiff: 1.00 }]
                }
            },
            { 
                name: 'Pasta', 
                description: 'Creamy or tomato base pasta', 
                price: 7.90, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.80 }],
                    spicy: [{ name: 'Non-Spicy' }, { name: 'Mild' }, { name: 'Spicy' }],
                    addons: [{ name: 'Extra Sauce', priceDiff: 0.80 }]
                }
            },
            { 
                name: 'Chicken Chop', 
                description: 'Grilled chicken with black pepper sauce', 
                price: 8.50, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Double Chop', priceDiff: 3.50 }],
                    spicy: null,
                    addons: [{ name: 'Extra Pepper Sauce', priceDiff: 0.50 }, { name: 'Add Sunny Side Egg', priceDiff: 1.00 }]
                }
            },
            { 
                name: 'Fish & Chips', 
                description: 'Crispy battered fish with golden fries', 
                price: 9.00, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Giant Haddock', priceDiff: 4.00 }],
                    spicy: null,
                    addons: [{ name: 'Extra Tartar Sauce', priceDiff: 0.50 }, { name: 'Cheese Dip', priceDiff: 0.80 }]
                }
            }
        ]
    },
    {
        id: 'chickenrice',
        name: 'Chicken Rice Stall',
        emoji: '🍗',
        description: 'Classic Hainanese chicken rice',
        foods: [
            { 
                name: 'Roasted Hainanese Chicken Rice', 
                description: 'Fragrant rice with roasted chicken', 
                price: 5.50, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.50 }],
                    spicy: null,
                    addons: [{ name: 'Braised Egg', priceDiff: 0.80 }]
                }
            },
            { 
                name: 'Steamed Hainanese Chicken Rice', 
                description: 'Fragrant rice with tender steamed chicken', 
                price: 5.50, 
                image: '', 
                badge: 'bestseller',
                options: {
                    sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.50 }],
                    spicy: null,
                    addons: [{ name: 'Braised Egg', priceDiff: 0.80 }, { name: 'Add Tofu', priceDiff: 0.80 }]
                }
            },
            { 
                name: 'Drumstick Hainanese Rice', 
                description: 'Hainanese chicken rice with chicken drumstick', 
                price: 6.50, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular Rice', priceDiff: 0 }, { name: 'Double Rice', priceDiff: 0.80 }],
                    spicy: null,
                    addons: [{ name: 'Braised Egg', priceDiff: 0.80 }]
                }
            }
        ]
    },
    {
        id: 'drinks',
        name: 'Drinks Stall',
        emoji: '☕',
        description: 'Hot & cold local beverages',
        foods: [
            { 
                name: 'Kopi O', 
                description: 'Traditional black coffee', 
                price: 1.50, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular Cup', priceDiff: 0 }, { name: 'Large Cup', priceDiff: 0.60 }],
                    spicy: [{ name: 'Hot' }, { name: 'Iced (Peng)', priceDiff: 0.40 }],
                    addons: [{ name: 'Less Sweet', priceDiff: 0 }, { name: 'No Sugar', priceDiff: 0 }]
                }
            },
            { 
                name: 'Teh Tarik', 
                description: 'Frothy local pulled milk tea', 
                price: 1.80, 
                image: '', 
                badge: 'bestseller',
                options: {
                    sizes: [{ name: 'Regular Cup', priceDiff: 0 }, { name: 'Large Cup', priceDiff: 0.60 }],
                    spicy: [{ name: 'Hot' }, { name: 'Iced (Peng)', priceDiff: 0.40 }],
                    addons: [{ name: 'Less Sweet', priceDiff: 0 }]
                }
            },
            { 
                name: 'Milo Dinosaur', 
                description: 'Iced chocolate malt drink topped with Milo powder', 
                price: 2.80, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Jumbo', priceDiff: 1.00 }],
                    spicy: [{ name: 'Iced (Standard)' }, { name: 'Hot Milo', priceDiff: -0.30 }],
                    addons: [{ name: 'Extra Milo Powder', priceDiff: 0.50 }]
                }
            },
            { 
                name: 'Bandung', 
                description: 'Sweet rose syrup drink with condensed milk', 
                price: 2.00, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Large', priceDiff: 0.50 }],
                    spicy: null,
                    addons: [{ name: 'Add Grass Jelly (Chin Chow)', priceDiff: 0.60 }]
                }
            }
        ]
    },
    {
        id: 'malay',
        name: 'Malay Stall',
        emoji: '🍱',
        description: 'Spicy and aromatic traditional delights',
        foods: [
            { 
                name: 'Nasi Lemak', 
                description: 'Coconut rice with sambal, egg, anchovies & peanuts', 
                price: 4.50, 
                image: '', 
                badge: 'bestseller',
                options: {
                    sizes: [{ name: 'Standard Portion', priceDiff: 0 }, { name: 'Double Rice', priceDiff: 0.80 }],
                    spicy: [{ name: 'Standard Sambal' }, { name: 'Extra Sambal', priceDiff: 0.30 }],
                    addons: [{ name: 'Add Fried Chicken Wing', priceDiff: 1.50 }, { name: 'Add Fishcake', priceDiff: 0.80 }]
                }
            },
            { 
                name: 'Mee Goreng', 
                description: 'Spicy wok-fried yellow noodles', 
                price: 5.00, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large Noodle', priceDiff: 1.20 }],
                    spicy: [{ name: 'Mild' }, { name: 'Spicy (Standard)' }, { name: 'Extra Spicy', priceDiff: 0.20 }],
                    addons: [{ name: 'Add Sunny Side Egg', priceDiff: 1.00 }]
                }
            }
        ]
    },
    {
        id: 'chinese',
        name: 'Chinese Stall',
        emoji: '🍜',
        description: 'Wok-fried classics and noodle soups',
        foods: [
            { 
                name: 'Char Kway Teow', 
                description: 'Wok-fried flat noodles with cockles', 
                price: 5.50, 
                image: '', 
                badge: 'bestseller',
                options: {
                    sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large', priceDiff: 1.20 }],
                    spicy: [{ name: 'Mild' }, { name: 'Medium Spicy' }, { name: 'Extra Spicy' }],
                    addons: [{ name: 'Extra Cockles', priceDiff: 1.50 }, { name: 'Add Fried Egg', priceDiff: 1.00 }]
                }
            },
            { 
                name: 'Bak Chor Mee', 
                description: 'Minced pork noodles with mushrooms', 
                price: 5.00, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large Noodle', priceDiff: 1.00 }],
                    spicy: [{ name: 'No Chili (Vinegar only)' }, { name: 'Mild Chili' }, { name: 'Spicy' }],
                    addons: [{ name: 'Add Extra Meatballs (3pcs)', priceDiff: 1.50 }, { name: 'Add Braised Mushrooms', priceDiff: 1.00 }]
                }
            }
        ]
    },
    {
        id: 'dessert',
        name: 'Dessert Stall',
        emoji: '🧁',
        description: 'Sweet treats & iced local desserts',
        foods: [
            { 
                name: 'Chendol', 
                description: 'Shaved ice with coconut milk, palm sugar & green jelly', 
                price: 3.20, 
                image: '', 
                badge: 'bestseller',
                options: {
                    sizes: [{ name: 'Standard Bowl', priceDiff: 0 }, { name: 'Large Bowl', priceDiff: 1.00 }],
                    spicy: null,
                    addons: [{ name: 'Extra Gula Melaka Drizzle', priceDiff: 0.40 }, { name: 'Add Durian Flesh', priceDiff: 2.00 }]
                }
            },
            { 
                name: 'Waffle', 
                description: 'Freshly baked waffle with choice of spread', 
                price: 2.50, 
                image: '', 
                badge: '',
                options: {
                    sizes: [{ name: 'Single Waffle', priceDiff: 0 }, { name: 'Double Stacked Waffles', priceDiff: 2.00 }],
                    spicy: null,
                    addons: [{ name: 'Add Chocolate Drizzle', priceDiff: 0.50 }, { name: 'Add Scoop of Vanilla Ice Cream', priceDiff: 1.50 }]
                }
            }
        ]
    }
];

module.exports = { images, popularDishes, stalls };