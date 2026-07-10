require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri);

const stallsData = [
    { id: 'western', name: 'Western Stall', emoji: '🍔', image: '/images/western stall.png', description: 'Burgers, pasta, grills & more' },
    { id: 'chickenrice', name: 'Chicken Rice Stall', emoji: '🍗', image: '/images/chicken rice stall.png', description: 'Classic Hainanese chicken rice' },
    { id: 'drinks', name: 'Drinks Stall', emoji: '☕', image: '/images/drink stall.png', description: 'Hot & cold local beverages' },
    { id: 'malay', name: 'Malay Stall', emoji: '🍱', image: '/images/malay stall.png', description: 'Spicy and aromatic traditional delights' },
    { id: 'chinese', name: 'Chinese Stall', emoji: '🍜', image: '/images/chinese stall.png', description: 'Wok-fried classics and noodle soups' },
    { id: 'dessert', name: 'Dessert Stall', emoji: '🧁', image: '/images/dessert stall.jpg', description: 'Sweet treats & iced local desserts' }
];

const foodsData = [
    // Western
    { id: 'western-burger', stall_id: 'western', name: 'Burger', price: 6.50, image: '/images/burger.png', badge: 'bestseller', options: { sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Double Patty', priceDiff: 2.50 }], spicy: null, addons: [{ name: 'Extra Cheese', priceDiff: 0.50 }, { name: 'Fried Egg', priceDiff: 1.00 }] } },
    { id: 'western-pasta', stall_id: 'western', name: 'Pasta', price: 7.90, image: '/images/pasta.png', badge: '', options: { sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.80 }], spicy: [{ name: 'Non-Spicy' }, { name: 'Mild' }, { name: 'Spicy' }], addons: [{ name: 'Extra Sauce', priceDiff: 0.80 }] } },
    { id: 'western-chicken-chop', stall_id: 'western', name: 'Chicken Chop', price: 8.50, image: '/images/chicken chop.png', badge: '', options: { sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Double Chop', priceDiff: 3.50 }], spicy: null, addons: [{ name: 'Extra Pepper Sauce', priceDiff: 0.50 }, { name: 'Add Sunny Side Egg', priceDiff: 1.00 }] } },
    { id: 'western-fish-chips', stall_id: 'western', name: 'Fish & Chips', price: 9.00, image: '/images/fish and chips.png', badge: '', options: { sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Giant Haddock', priceDiff: 4.00 }], spicy: null, addons: [{ name: 'Extra Tartar Sauce', priceDiff: 0.50 }, { name: 'Cheese Dip', priceDiff: 0.80 }] } },

    // Chicken Rice
    { id: 'chickenrice-roasted', stall_id: 'chickenrice', name: 'Roasted Hainanese Chicken Rice', price: 5.50, image: '/images/roasted chicken rice.png', badge: '', options: { sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.50 }], spicy: null, addons: [{ name: 'Braised Egg', priceDiff: 0.80 }] } },
    { id: 'chickenrice-steamed', stall_id: 'chickenrice', name: 'Steamed Hainanese Chicken Rice', price: 5.50, image: '/images/steamed chicken rice.png', badge: 'bestseller', options: { sizes: [{ name: 'Regular Portion', priceDiff: 0 }, { name: 'Large Portion', priceDiff: 1.50 }], spicy: null, addons: [{ name: 'Braised Egg', priceDiff: 0.80 }, { name: 'Add Tofu', priceDiff: 0.80 }] } },

    // Drinks
    { id: 'drinks-kopi-o', stall_id: 'drinks', name: 'Kopi O', price: 1.50, image: '/images/kopi o.jpg', badge: '', options: { sizes: [{ name: 'Regular Cup', priceDiff: 0 }, { name: 'Large Cup', priceDiff: 0.60 }], spicy: [{ name: 'Hot' }, { name: 'Iced (Peng)', priceDiff: 0.40 }], addons: [{ name: 'Less Sweet', priceDiff: 0 }, { name: 'No Sugar', priceDiff: 0 }] } },
    { id: 'drinks-milo-dinosaur', stall_id: 'drinks', name: 'Milo Dinosaur', price: 2.80, image: '/images/milo dino.png', badge: '', options: { sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Jumbo', priceDiff: 1.00 }], spicy: [{ name: 'Iced (Standard)' }, { name: 'Hot Milo', priceDiff: -0.30 }], addons: [{ name: 'Extra Milo Powder', priceDiff: 0.50 }] } },
    { id: 'drinks-bandung', stall_id: 'drinks', name: 'Bandung', price: 2.00, image: '/images/bandung.jpg', badge: '', options: { sizes: [{ name: 'Regular', priceDiff: 0 }, { name: 'Large', priceDiff: 0.50 }], spicy: null, addons: [{ name: 'Add Grass Jelly (Chin Chow)', priceDiff: 0.60 }] } },

    // Malay
    { id: 'malay-nasi-lemak', stall_id: 'malay', name: 'Nasi Lemak', price: 4.50, image: '/images/nasi lemak.png', badge: 'bestseller', options: { sizes: [{ name: 'Standard Portion', priceDiff: 0 }, { name: 'Double Rice', priceDiff: 0.80 }], spicy: [{ name: 'Standard Sambal' }, { name: 'Extra Sambal', priceDiff: 0.30 }], addons: [{ name: 'Add Fried Chicken Wing', priceDiff: 1.50 }, { name: 'Add Fishcake', priceDiff: 0.80 }] } },
    { id: 'malay-mee-goreng', stall_id: 'malay', name: 'Mee Goreng', price: 5.00, image: '/images/mee goreng.png', badge: '', options: { sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large Noodle', priceDiff: 1.20 }], spicy: [{ name: 'Mild' }, { name: 'Spicy (Standard)' }, { name: 'Extra Spicy', priceDiff: 0.20 }], addons: [{ name: 'Add Sunny Side Egg', priceDiff: 1.00 }] } },

    // Chinese
    { id: 'chinese-fishball-noodles', stall_id: 'chinese', name: 'Fishball Noodles', price: 4.50, image: '/images/fishball noodles.png', badge: 'bestseller', options: { sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large', priceDiff: 1.20 }], spicy: [{ name: 'Non-Spicy (Tomato or Ketchup)' }, { name: 'Mild Chili' }, { name: 'Spicy' }], addons: [{ name: 'Extra Fishballs (3pcs)', priceDiff: 1.20 }, { name: 'Add Minced Meat', priceDiff: 1.00 }] } },
    { id: 'chinese-bak-chor-mee', stall_id: 'chinese', name: 'Bak Chor Mee', price: 5.00, image: '/images/BCM.png', badge: '', options: { sizes: [{ name: 'Standard', priceDiff: 0 }, { name: 'Large Noodle', priceDiff: 1.00 }], spicy: [{ name: 'No Chili (Vinegar only)' }, { name: 'Mild Chili' }, { name: 'Spicy' }], addons: [{ name: 'Add Extra Meatballs (3pcs)', priceDiff: 1.50 }, { name: 'Add Braised Mushrooms', priceDiff: 1.00 }] } },

    // Dessert
    { id: 'dessert-ice-kacang', stall_id: 'dessert', name: 'Ice Kacang', price: 3.20, image: '/images/ice kacang.png', badge: 'bestseller', options: { sizes: [{ name: 'Standard Bowl', priceDiff: 0 }, { name: 'Large Bowl', priceDiff: 1.00 }], spicy: null, addons: [{ name: 'Extra Condensed Milk', priceDiff: 0.40 }, { name: 'Add Attap Chee', priceDiff: 0.80 }] } },
    { id: 'dessert-cheng-teng', stall_id: 'dessert', name: 'Cheng Teng', price: 2.50, image: '/images/cheng teng.jpg', badge: '', options: { sizes: [{ name: 'Standard Bowl', priceDiff: 0 }, { name: 'Large Bowl', priceDiff: 1.00 }], spicy: null, addons: [{ name: 'Extra Longan', priceDiff: 0.50 }, { name: 'Extra White Fungus', priceDiff: 0.50 }] } },
];

async function seedDatabase() {
    try {
        await client.connect();
        const db = client.db("foodhub"); // Ensure this matches your database name

        // Upsert rather than delete+insert: stalls can now be claimed by a
        // merchant (merchantId) and foods can be added by a merchant too, so
        // re-running this script must never wipe that data. Cosmetic fields
        // (name/emoji/image/description/price) stay in sync with this file;
        // merchant-owned fields are only set the first time a doc is created.
        console.log("Upserting stalls...");
        for (const stall of stallsData) {
            await db.collection("stalls").updateOne(
                { id: stall.id },
                {
                    $set: { name: stall.name, emoji: stall.emoji, image: stall.image, description: stall.description },
                    $setOnInsert: { merchantId: null, isOpen: true }
                },
                { upsert: true }
            );
        }

        console.log("Upserting foods...");
        for (const food of foodsData) {
            await db.collection("foods").updateOne(
                { id: food.id },
                {
                    $set: { stall_id: food.stall_id, name: food.name, price: food.price, image: food.image, badge: food.badge, options: food.options },
                    $setOnInsert: { soldOut: false }
                },
                { upsert: true }
            );
        }

        console.log("✅ Success! Your database is now up to date.");
    } catch (err) {
        console.error("❌ Error seeding database:", err);
    } finally {
        await client.close();
    }
}

seedDatabase();