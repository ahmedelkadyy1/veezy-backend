require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Models
const Video = require('./models/Video');
const ViewedIP = require('./models/ViewedIP');

const app = express();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});

// File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    if (file.fieldname === 'video') uploadPath += 'videos';
    else if (file.fieldname === 'thumbnail') uploadPath += 'thumbnails';
    else if (file.fieldname === 'channelIcon') uploadPath += 'icons';
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1000MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      if (!file.originalname.match(/\.(mp4|webm|mov)$/)) {
        return cb(new Error('Only video files are allowed!'), false);
      }
    } else if (file.fieldname === 'thumbnail' || file.fieldname === 'channelIcon') {
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Only image files are allowed!'), false);
      }
    }
    cb(null, true);
  }
});

// Admin Authentication
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'default-admin-token';
const authenticateAdmin = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  next();
};

// ==================== ROUTES ====================

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Get all videos (Admin-only)
app.get('/videos', authenticateAdmin, async (req, res) => {
  try {
    const videos = await Video.find({}).lean();
    const formattedVideos = {};
    
    videos.forEach(video => {
      formattedVideos[video.videoId] = {
        title: video.title,
        description: video.description,
        channelName: video.channelName,
        views: video.views,
        uploadTime: video.uploadTime.toISOString(),
        thumbnail: video.thumbnail,
        channelIcon: video.channelIcon
      };
    });

    res.json(formattedVideos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Video Upload (Admin-only)
app.post('/admin/upload', authenticateAdmin, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'channelIcon', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files?.video?.[0]) throw new Error('Video file is required');
    if (!req.files?.thumbnail?.[0]) throw new Error('Thumbnail is required');
    if (!req.files?.channelIcon?.[0]) throw new Error('Channel icon is required');

    const videoId = Date.now().toString();
    const newVideo = new Video({
      videoId,
      title: req.body.title,
      description: req.body.description,
      channelName: req.body.channelName,
      channelIcon: req.files.channelIcon[0].filename,
      filename: req.files.video[0].filename,
      thumbnail: req.files.thumbnail[0].filename,
      views: 0,
      uploadTime: new Date()
    });

    await newVideo.save();

    res.status(201).json({
      success: true,
      video: {
        videoId,
        ...newVideo.toObject()
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded files if error occurs
    if (req.files) {
      Object.values(req.files).forEach(files => {
        files.forEach(file => {
          fs.unlink(file.path, () => {});
        });
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Upload failed' 
    });
  }
});

// Video Management Endpoints
app.route('/admin/videos/:id')
  .put(authenticateAdmin, async (req, res) => {
    try {
      const videoId = req.params.id;
      const updates = req.body;

      const allowedUpdates = ['title', 'description', 'channelName'];
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key];
          return obj;
        }, {});

      const updatedVideo = await Video.findOneAndUpdate(
        { videoId },
        { $set: filteredUpdates },
        { new: true, runValidators: true }
      );

      if (!updatedVideo) {
        return res.status(404).json({ error: 'Video not found' });
      }

      res.json({
        success: true,
        video: updatedVideo
      });
    } catch (error) {
      console.error('Update error:', error);
      res.status(500).json({ error: 'Failed to update video' });
    }
  })
  .delete(authenticateAdmin, async (req, res) => {
    try {
      const videoId = req.params.id;
      const video = await Video.findOneAndDelete({ videoId });

      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      // Delete associated files
      const filesToDelete = [
        path.join(__dirname, 'uploads', 'videos', video.filename),
        path.join(__dirname, 'uploads', 'thumbnails', video.thumbnail),
        path.join(__dirname, 'uploads', 'icons', video.channelIcon)
      ];

      filesToDelete.forEach(filePath => {
        fs.unlink(filePath, err => {
          if (err) console.error('Error deleting file:', filePath, err);
        });
      });

      res.json({
        success: true,
        message: `Video ${videoId} deleted`
      });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: 'Failed to delete video' });
    }
  });

// View Tracking
app.post('/videos/:id/view', apiLimiter, async (req, res) => {
  try {
    const videoId = req.params.id;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Check if IP already viewed this video
    const alreadyViewed = await ViewedIP.exists({ videoId, ip: clientIP });
    if (alreadyViewed) {
      return res.json({ 
        alreadyViewed: true,
        views: (await Video.findOne({ videoId }))?.views || 0
      });
    }

    // Record view
    await ViewedIP.create({ videoId, ip: clientIP });
    const updatedVideo = await Video.findOneAndUpdate(
      { videoId },
      { $inc: { views: 1 } },
      { new: true, upsert: true }
    );

    res.json({
      views: updatedVideo.views,
      alreadyViewed: false
    });
  } catch (error) {
    console.error('View tracking error:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// Static Files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Error Handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Server Initialization
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin token: ${ADMIN_TOKEN}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`API Docs: http://localhost:${PORT}/api-docs`);
  }
});

// Graceful Shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});
