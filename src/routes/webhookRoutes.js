const express = require('express');
const router = express.Router();
const { whatsappWebhook } = require('../controllers/webhookController');

router.post('/whatsapp', whatsappWebhook);

module.exports = router;
