const mongoose = require('mongoose');

const MessageLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MessageLog', MessageLogSchema);
