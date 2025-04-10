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

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  channelName: { type: String, required: true },
  channelIcon: { type: String, required: true }, // Filename
  filename: { type: String, required: true },    // Video filename
  thumbnail: { type: String, required: true },   // Thumbnail filename
  views: { type: Number, default: 0 },
  uploadTime: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', VideoSchema);