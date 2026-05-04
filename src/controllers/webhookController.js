const User = require('../models/User');
const botEngine = require('../bot/botEngine');

// @desc    WhatsApp Webhook
// @route   POST /api/webhook/whatsapp
// @access  Public (Validated by Twilio signature)
exports.whatsappWebhook = async (req, res) => {
  try {
    const { Body, From, To } = req.body;

    if (!Body || !From || !To) {
      return res.status(400).send('Invalid request');
    }

    // Find user by their WhatsApp number (To)
    // In Twilio sandbox, this is usually our sandbox number
    // For MVP, if we only have one user, we can fall back to the first user
    // or use a specific env var.
    let user = await User.findOne({ whatsappNumber: To });

    // Fallback for development/sandbox testing if whatsappNumber is not set
    if (!user) {
      user = await User.findOne(); // Get first user as fallback
    }

    if (!user) {
      console.error('No business found for:', To);
      return res.status(200).send('No business found');
    }

    // Run bot logic
    await botEngine(Body, From, user._id, To);

    // Twilio expects an empty TwiML response if we send messages via REST API
    res.set('Content-Type', 'text/xml');
    res.status(200).send('<Response></Response>');
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
};
