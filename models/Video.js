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

const videoSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  views: { type: Number, default: 0 },
  uploadTime: { type: Date, default: Date.now },
  videoPath: { type: String, required: true }, // Relative path to video file
  thumbnailPath: { type: String }, // Relative path to thumbnail
  category: { type: String, default: 'other' },
  loading: { type: Boolean, default: false }
}, {
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.videoUrl = `/uploads/videos/${path.basename(ret.videoPath)}`;
      if (ret.thumbnailPath) {
        ret.thumbnailUrl = `/uploads/thumbnails/${path.basename(ret.thumbnailPath)}`;
      }
      delete ret.videoPath;
      delete ret.thumbnailPath;
      return ret;
    }
  }
});
