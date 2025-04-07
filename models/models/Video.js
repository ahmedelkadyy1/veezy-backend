const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    unique: true
  },
  views: {
    type: Number,
    default: 0
  },
  uploadTime: {
    type: Date,
    default: Date.now
  },
  title: {
    type: String,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('Video', VideoSchema);