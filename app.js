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

    // Unique category list for the filter pills (prefixed with "All")
    const categories = ['All', ...new Set(popularDishes.map(d => d.category))];

    res.render('menu', { images, foods: popularDishes, categories });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});