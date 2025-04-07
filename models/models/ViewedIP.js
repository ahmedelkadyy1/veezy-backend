const mongoose = require('mongoose');

const ViewedIPSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true
  },
  ip: {
    type: String,
    required: true
  }
});

// Compound index to ensure unique combinations
ViewedIPSchema.index({ videoId: 1, ip: 1 }, { unique: true });

module.exports = mongoose.model('ViewedIP', ViewedIPSchema);