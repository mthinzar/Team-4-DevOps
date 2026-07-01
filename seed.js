const mongoose = require('./db');
const Stall = require('./models/Stall');
const Food = require('./models/Food');

const stallsData = [
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
                options: { 
                    sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.80 }], 
                    spicy: [{ name: 'Non-Spicy' }, { name: 'Mild' }, { name: 'Spicy' }], 
                    addons: [{ name: 'Extra Sauce', priceDiff: 0.80 }] 
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
                name: 'Roasted Chicken Rice', 
                description: 'Fragrant rice with roasted chicken', 
                price: 5.50, 
                options: { 
                    sizes: [{ name: 'Regular', priceDiff: 0 }], 
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
                options: { 
                    sizes: [{ name: 'Regular', priceDiff: 0 }], 
                    spicy: [{ name: 'Hot' }, { name: 'Iced', priceDiff: 0.40 }], 
                    addons: [{ name: 'Less Sweet', priceDiff: 0 }] 
                } 
            }
        ]
    }
];

async function seed() {
    try {
        // Clear any old data
        await Stall.deleteMany({});
        await Food.deleteMany({});

        // Insert new stalls and dishes
        for (const s of stallsData) {
            const newStall = new Stall({
                id: s.id,
                name: s.name,
                emoji: s.emoji,
                description: s.description
            });
            await newStall.save();

            for (const f of s.foods) {
                const newFood = new Food({
                    ...f,
                    stallId: s.id
                });
                await newFood.save();
            }
        }
        console.log("Database seeded successfully!");
    } catch (err) {
        console.error("Error seeding database:", err);
    } finally {
        mongoose.connection.close();
    }
}

seed();