const express = require('express');
const path = require('path');

// Central image & dish data (edit images/dishes in data/dishes.js)
const { images, popularDishes } = require('./data/dishes');
// Review helpers (in-memory store — see data/reviews.js)
const { getReviews, addReview, getAverageRating, getReviewCount } = require('./data/reviews');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // needed to parse review form POST body

app.get('/', (req, res) => {
    res.render('index', { images, popularDishes });
});

app.get('/menu', (req, res) => {
    // Unique category list for the filter pills (prefixed with "All")
    const categories = ['All', ...new Set(popularDishes.map(d => d.category))];

    // Attach live rating info to each dish for display on menu cards
    const foods = popularDishes.map(dish => ({
        ...dish,
        avgRating:   getAverageRating(dish.id),
        reviewCount: getReviewCount(dish.id)
    }));

    res.render('menu', { images, foods, categories });
});

// --- Dish detail + reviews ---

app.get('/dish/:id', (req, res) => {
    const dish = popularDishes.find(d => d.id === req.params.id);
    if (!dish) return res.status(404).send('Dish not found');

    res.render('dish', {
        images,
        dish,
        reviews:     getReviews(dish.id),
        avgRating:   getAverageRating(dish.id),
        reviewCount: getReviewCount(dish.id)
    });
});

app.post('/dish/:id/reviews', (req, res) => {
    const dish = popularDishes.find(d => d.id === req.params.id);
    if (!dish) return res.status(404).send('Dish not found');

    const { name, rating, comment } = req.body;
    addReview(dish.id, { name, rating, comment });

    res.redirect(`/dish/${dish.id}`);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
