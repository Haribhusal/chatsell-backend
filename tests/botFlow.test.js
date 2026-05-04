const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../src/app');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const Session = require('../src/models/Session');

// Mock Twilio
jest.mock('twilio', () => {
  return jest.fn().mockReturnValue({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'mock_sid' })
    }
  });
});

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  // Override MONGODB_URI for testing
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Bot Flow End-to-End', () => {
  let user;
  let product;
  const customerPhone = 'whatsapp:+1234567890';
  const businessWhatsapp = 'whatsapp:+0987654321';

  beforeEach(async () => {
    await User.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await Session.deleteMany({});

    user = await User.create({
      email: 'test@example.com',
      password: 'password123',
      businessName: 'Test Business',
      whatsappNumber: businessWhatsapp
    });

    product = await Product.create({
      userId: user._id,
      name: 'Test Burger',
      description: 'Delicious burger',
      price: 500,
      category: 'Food'
    });
  });

  it('should handle full order flow: hi -> 1 -> burger -> 2 -> address -> confirm', async () => {
    // 1. Send "hi" to get menu
    const res1 = await request(app)
      .post('/api/webhook/whatsapp')
      .send({
        Body: 'hi',
        From: customerPhone,
        To: businessWhatsapp
      })
      .expect(200);

    let session = await Session.findOne({ customerPhone, businessId: user._id });
    expect(session.state).toBe('idle');

    // 2. Send "1" to view products
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({
        Body: '1',
        From: customerPhone,
        To: businessWhatsapp
      })
      .expect(200);

    session = await Session.findOne({ customerPhone, businessId: user._id });
    expect(session.state).toBe('viewing_products');

    // 3. Select product "Test Burger"
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({
        Body: 'Test Burger',
        From: customerPhone,
        To: businessWhatsapp
      })
      .expect(200);

    session = await Session.findOne({ customerPhone, businessId: user._id });
    expect(session.state).toBe('ordering');
    expect(session.data.productName).toBe('Test Burger');

    // 4. Provide quantity "2"
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({
        Body: '2',
        From: customerPhone,
        To: businessWhatsapp
      })
      .expect(200);

    session = await Session.findOne({ customerPhone, businessId: user._id });
    expect(session.state).toBe('collecting_address');
    expect(session.data.quantity).toBe(2);

    // 5. Provide address "123 Main St"
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({
        Body: '123 Main St',
        From: customerPhone,
        To: businessWhatsapp
      })
      .expect(200);

    session = await Session.findOne({ customerPhone, businessId: user._id });
    expect(session.state).toBe('confirming_order');
    expect(session.data.address).toBe('123 Main St');

    // 6. Confirm order
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({
        Body: 'confirm',
        From: customerPhone,
        To: businessWhatsapp
      })
      .expect(200);

    session = await Session.findOne({ customerPhone, businessId: user._id });
    expect(session.state).toBe('idle');
    
    const orders = await Order.find({ customerPhone, userId: user._id });
    expect(orders.length).toBe(1);
    expect(orders[0].totalAmount).toBe(1000);
    expect(orders[0].address).toBe('123 Main St');
    expect(orders[0].products[0].quantity).toBe(2);
  });

  it('should handle order cancellation', async () => {
    // Start ordering
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({ Body: '2', From: customerPhone, To: businessWhatsapp });
    
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({ Body: 'Test Burger', From: customerPhone, To: businessWhatsapp });
    
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({ Body: '1', From: customerPhone, To: businessWhatsapp });
    
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({ Body: 'Cancel Address', From: customerPhone, To: businessWhatsapp });

    // Now in confirming_order state
    await request(app)
      .post('/api/webhook/whatsapp')
      .send({
        Body: 'cancel',
        From: customerPhone,
        To: businessWhatsapp
      })
      .expect(200);

    const session = await Session.findOne({ customerPhone, businessId: user._id });
    expect(session.state).toBe('idle');
    expect(Object.keys(session.data).length).toBe(0);

    const orders = await Order.find({ customerPhone, userId: user._id });
    expect(orders.length).toBe(0);
  });
});
