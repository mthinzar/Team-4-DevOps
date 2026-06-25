const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/menu', (req, res) => {

    const foods = [
        {
            name: 'Chicken Rice',
            description: 'Roasted chicken with fragrant rice',
            price: 5.50
        },
        {
            name: 'Nasi Lemak',
            description: 'Coconut rice with sambal',
            price: 4.50
        },
        {
            name: 'Burger',
            description: 'Beef burger with cheese',
            price: 6.00
        }
    ];

    res.render('menu', { foods });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});