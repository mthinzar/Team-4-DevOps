const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret';
process.env.REQUIRE_VERIFIED_PURCHASE = 'false';

const app = require('../app');
const Review = require('../models/Review');
const Order = require('../models/Order');

let mongoServer;

const CUSTOMER_ID = '64a000000000000000000201';
const FOOD_ID = '64a000000000000000000001';
const MERCHANT_ID = '64a000000000000000000101';

const customerToken = jwt.sign({ id: CUSTOMER_ID, role: 'customer' }, process.env.JWT_SECRET);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Review.deleteMany({});
  await Order.deleteMany({});
});

describe('Review API', () => {
  test('rejects a rating outside 1-5', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ foodId: FOOD_ID, merchantId: MERCHANT_ID, rating: 7, comment: 'Too good?' });

    expect(res.status).toBe(400);
  });

  test('creates a review successfully', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ foodId: FOOD_ID, merchantId: MERCHANT_ID, rating: 5, comment: 'Amazing!' });

    expect(res.status).toBe(201);
    expect(res.body.rating).toBe(5);
    expect(res.body.verifiedPurchase).toBe(false);
  });

  test('marks a review as verified when a completed order exists', async () => {
    const order = await Order.create({
      userId: CUSTOMER_ID,
      foodId: FOOD_ID,
      merchantId: MERCHANT_ID,
      status: 'Completed',
    });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        foodId: FOOD_ID,
        merchantId: MERCHANT_ID,
        orderId: order._id,
        rating: 4,
        comment: 'Solid.',
      });

    expect(res.status).toBe(201);
    expect(res.body.verifiedPurchase).toBe(true);
  });

  test('blocks a duplicate review on the same food item', async () => {
    await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ foodId: FOOD_ID, merchantId: MERCHANT_ID, rating: 5, comment: 'First review' });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ foodId: FOOD_ID, merchantId: MERCHANT_ID, rating: 3, comment: 'Trying again' });

    expect(res.status).toBe(409);
  });

  test('rejects unauthenticated review creation', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .send({ foodId: FOOD_ID, merchantId: MERCHANT_ID, rating: 5 });

    expect(res.status).toBe(401);
  });

  test('returns average rating and total count for a food item', async () => {
    await Review.create({ foodId: FOOD_ID, merchantId: MERCHANT_ID, userId: CUSTOMER_ID, rating: 4 });
    await Review.create({
      foodId: FOOD_ID,
      merchantId: MERCHANT_ID,
      userId: '64a000000000000000000202',
      rating: 2,
    });

    const res = await request(app).get(`/api/reviews/food/${FOOD_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.totalReviews).toBe(2);
    expect(res.body.averageRating).toBe(3);
  });
});
