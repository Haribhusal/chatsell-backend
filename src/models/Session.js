const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  customerPhone: {
    type: String,
    required: true,
  },
  businessId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  state: {
    type: String,
    enum: ['idle', 'viewing_products', 'ordering', 'collecting_address', 'confirming_order'],
    default: 'idle',
  },
  data: {
    type: Object,
    default: {},
  },
}, { timestamps: true });

// Index for fast lookup
SessionSchema.index({ customerPhone: 1, businessId: 1 }, { unique: true });

module.exports = mongoose.model('Session', SessionSchema);
