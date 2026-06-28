const express = require('express');
const path = require('path');

// Central image & dish data (edit images/dishes in data/dishes.js)
const { images, popularDishes } = require('./data/dishes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.render('index', { images, popularDishes });
});

app.get('/menu', (req, res) => {
    const foods = [
        {
            name: 'Burger',
            description: 'Grilled beef burger with cheese and lettuce',
            price: 6.00,
            category: 'Burgers',
            image: '/images/burger.png'
        },
        {
            name: 'Cheese Pizza',
            description: 'Crispy crust with mozzarella and tomato sauce',
            price: 8.00,
            category: 'Burgers',
            image: '/images/pizza.png'
        },
        {
            name: 'Creamy Pasta',
            description: 'Rich creamy pasta with tender chicken',
            price: 7.90,
            category: 'Rice',
            image: '/images/pasta.png'
        },
        {
            name: 'Mala Xiang Guo',
            description: 'Spicy stir-fry with fresh seafood and vegetables',
            price: 9.90,
            category: 'Rice',
            image: '/images/mala.png'
        },
        {
            name: 'Ice Lemon Tea',
            description: 'Refreshing iced tea with fresh lemon',
            price: 2.90,
            category: 'Drinks',
            image: '/images/lemontea.png'
        }
    ];
    res.render('menu', { foods });
});



app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});