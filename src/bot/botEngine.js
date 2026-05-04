const Session = require('../models/Session');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const MessageLog = require('../models/MessageLog');
const socket = require('../utils/socket');
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendMessage = async (to, from, body) => {
  try {
    await client.messages.create({
      body,
      to,
      from,
    });
    return true;
  } catch (error) {
    console.error('Twilio Error:', error);
    return false;
  }
};

const botEngine = async (incomingMsg, customerPhone, businessId, businessWhatsapp) => {
  // Find or create session
  let session = await Session.findOne({ customerPhone, businessId });
  if (!session) {
    session = await Session.create({ customerPhone, businessId });
  }

  // Find or create customer
  let customer = await Customer.findOne({ userId: businessId, phone: customerPhone });
  if (!customer) {
    customer = await Customer.create({ userId: businessId, phone: customerPhone });
  }

  // Log incoming message
  await MessageLog.create({
    userId: businessId,
    customerPhone,
    message: incomingMsg,
    direction: 'incoming',
  });

  const msg = incomingMsg.toLowerCase().trim();
  let response = '';

  // State Machine logic
  switch (session.state) {
    case 'idle':
      if (msg === 'hi' || msg === 'hello' || msg === 'menu') {
        response = "Welcome to ChatSell! How can we help you today?\n\n1. View Products\n2. Place Order\n3. Order Status\n4. Talk to Human";
        session.state = 'idle'; // Stay in idle for menu
      } else if (msg === '1') {
        const products = await Product.find({ userId: businessId });
        if (products.length === 0) {
          response = "Sorry, we don't have any products available at the moment.";
        } else {
          response = "Our Products:\n" + products.map((p, i) => `${i + 1}. ${p.name} - NPR ${p.price}`).join('\n') + "\n\nReply with the product name to start ordering.";
          session.state = 'viewing_products';
        }
      } else if (msg === '2') {
        response = "Please type the name of the product you want to order.";
        session.state = 'ordering';
      } else if (msg === '3') {
        const lastOrder = await Order.findOne({ userId: businessId, customerPhone }).sort({ createdAt: -1 });
        if (lastOrder) {
          response = `Your last order status is: ${lastOrder.status}. Total Amount: NPR ${lastOrder.totalAmount}`;
        } else {
          response = "You haven't placed any orders yet.";
        }
      } else if (msg === '4') {
        response = "A human agent will be with you shortly. Thank you for your patience!";
      } else {
        response = "I'm sorry, I didn't understand that. Type 'hi' to see the menu.";
      }
      break;

    case 'viewing_products':
      const product = await Product.findOne({
        userId: businessId,
        name: { $regex: new RegExp(`^${msg}$`, 'i') },
      });

      if (product) {
        session.data.productId = product._id;
        session.data.productName = product.name;
        session.data.productPrice = product.price;
        response = `Great choice! How many ${product.name} would you like to order?`;
        session.state = 'ordering';
        session.markModified('data');
      } else if (msg === 'menu') {
        response = "1. View Products\n2. Place Order\n3. Order Status\n4. Talk to Human";
        session.state = 'idle';
      } else {
        response = "I couldn't find that product. Please type the exact name or type 'menu' to go back.";
      }
      break;

    case 'ordering':
      if (session.data.productId) {
        const quantity = parseInt(msg);
        if (!isNaN(quantity) && quantity > 0) {
          session.data.quantity = quantity;
          response = "Got it! Please provide your delivery address.";
          session.state = 'collecting_address';
          session.markModified('data');
        } else {
          response = "Please enter a valid quantity (number greater than 0).";
        }
      } else {
        // Find product first if coming from menu 2
        const p = await Product.findOne({
          userId: businessId,
          name: { $regex: new RegExp(`^${msg}$`, 'i') },
        });

        if (p) {
          session.data.productId = p._id;
          session.data.productName = p.name;
          session.data.productPrice = p.price;
          response = `How many ${p.name} would you like to order?`;
          session.markModified('data');
        } else {
          response = "Product not found. Please type the product name or 'menu'.";
        }
      }
      break;

    case 'collecting_address':
      session.data.address = incomingMsg; // Keep original case for address
      const total = session.data.productPrice * session.data.quantity;
      response = `Order Summary:\nProduct: ${session.data.productName}\nQuantity: ${session.data.quantity}\nTotal: NPR ${total}\nAddress: ${incomingMsg}\n\nReply with 'confirm' to place your order or 'cancel' to start over.`;
      session.state = 'confirming_order';
      session.markModified('data');
      break;

    case 'confirming_order':
      if (msg === 'confirm') {
        const totalAmount = session.data.productPrice * session.data.quantity;
        const order = await Order.create({
          userId: businessId,
          customerPhone,
          products: [
            {
              productId: session.data.productId,
              quantity: session.data.quantity,
            },
          ],
          totalAmount,
          address: session.data.address,
          status: 'pending',
        });

        // Emit real-time notification
        try {
          const io = socket.getIO();
          io.to(businessId.toString()).emit('new_order', order);
        } catch (err) {
          // Silently fail if socket is not initialized (e.g. in some tests)
        }

        response = "Thank you! Your order has been placed successfully. We will contact you soon.";
        session.state = 'idle';
        session.data = {};
      } else if (msg === 'cancel') {
        response = "Order cancelled. Type 'hi' to see the menu.";
        session.state = 'idle';
        session.data = {};
      } else {
        response = "Please reply with 'confirm' or 'cancel'.";
      }
      break;

    default:
      session.state = 'idle';
      response = "Something went wrong. Let's start over. Type 'hi'.";
  }

  await session.save();

  // Log outgoing message
  await MessageLog.create({
    userId: businessId,
    customerPhone,
    message: response,
    direction: 'outgoing',
  });

  // Send the actual message via Twilio
  await sendMessage(customerPhone, businessWhatsapp, response);
};

module.exports = botEngine;
