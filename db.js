// Polyfill global crypto for Node.js compatibility
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = require('node:crypto');
}

const mongoose = require('mongoose');

// Connect to MongoDB Atlas Cloud
const mongoURI = 'mongodb+srv://myAtlasDBUser:Justyn@test-devops.4wkhh2g.mongodb.net/foodhub?retryWrites=true&w=majority';

mongoose.connect(mongoURI)
  .then(() => console.log('Successfully connected to MongoDB Atlas...'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

module.exports = mongoose;