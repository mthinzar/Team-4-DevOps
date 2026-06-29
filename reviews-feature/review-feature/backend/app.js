const express = require('express');
const cors = require('cors');

const reviewRoutes = require('./routes/reviewRoutes');
const devAuthRoutes = require('./routes/devAuthRoutes');
const mockRoutes = require('./routes/mockRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'review-feature' }));

app.use('/api/reviews', reviewRoutes);
app.use('/api/dev', devAuthRoutes); // TEMP — remove once real login is merged
app.use('/api/mock', mockRoutes); // TEMP — remove once real Food API is merged

app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

module.exports = app;
