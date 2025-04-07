require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
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
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'https://veezy-frontend.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10kb' }));

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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      if (!file.originalname.match(/\.(mp4|webm|mov)$/)) {
        return cb(new Error('Only video files are allowed!'));
      }
    } else if (file.fieldname === 'thumbnail' || file.fieldname === 'channelIcon') {
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Only image files are allowed!'));
      }
    }
    cb(null, true);
  }
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '227001';
const authenticateAdmin = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Invalid admin token' });
  next();
};

// In-memory cache
let videos = {};
let viewedIPs = {};
// In your server.js
app.post('/admin/upload', upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'channelIcon', maxCount: 1 }
  ]), async (req, res) => {
    const newVideo = new Video({
      title: req.body.title,
      description: req.body.description,
      channelName: req.body.channelName,
      channelIcon: req.files['channelIcon'][0].filename,
      filename: req.files['video'][0].filename,
      thumbnail: req.files['thumbnail'][0].filename
    });
    await newVideo.save();
  });
// ========== Data Loading ==========
async function loadData() {
  try {
    const videoDocs = await Video.find();
    videos = {};
    videoDocs.forEach(doc => {
      videos[doc.videoId] = {
        views: doc.views,
        uploadTime: doc.uploadTime.toISOString(),
        title: doc.title,
        description: doc.description,
        channelName: doc.channelName,
        channelIcon: doc.channelIcon,
        thumbnail: doc.thumbnail,
        loading: doc.loading || false
      };
    });

    // Default videos
    const defaultVideos = [
      {
        videoId: '1',
        title: "Blanx an E-commerce Website",
        views: 0,
        uploadTime: new Date(),
        loading: false
      },
      {
        videoId: '2',
        title: "WatchNest a Movie Website", 
        views: 0,
        uploadTime: new Date(),
        loading: false
      }
    ];

    for (const defaultVideo of defaultVideos) {
      await Video.updateOne(
        { videoId: defaultVideo.videoId },
        { $setOnInsert: defaultVideo },
        { upsert: true }
      );
    }

    // Load viewed IPs
    const ipDocs = await ViewedIP.find();
    viewedIPs = {};
    ipDocs.forEach(doc => {
      if (!viewedIPs[doc.videoId]) viewedIPs[doc.videoId] = new Set();
      viewedIPs[doc.videoId].add(doc.ip);
    });

    console.log('Data loaded from MongoDB');
  } catch (err) {
    console.error('Failed to load data:', err);
    throw err;
  }
}

// ========== Routes ==========
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    videoCount: Object.keys(videos).length
  });
});

app.get('/videos', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.json(videos);
});

app.get('/videos/:id', apiLimiter, (req, res) => {
  const videoId = req.params.id;
  const video = videos[videoId];
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.set('Cache-Control', 'no-store, max-age=0');
  res.json({ ...video, loading: video.loading || false });
});

app.post('/videos/:id/view', apiLimiter, async (req, res) => {
  const videoId = req.params.id;
  const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (!videos[videoId]) {
    videos[videoId] = {
      views: 0,
      uploadTime: new Date().toISOString(),
      title: `Video ${videoId}`,
      loading: true
    };
  }

  if (!viewedIPs[videoId]) viewedIPs[videoId] = new Set();

  videos[videoId].loading = true;

  try {
    if (!viewedIPs[videoId].has(clientIP)) {
      videos[videoId].views++;
      viewedIPs[videoId].add(clientIP);

      await Video.updateOne({ videoId }, { $inc: { views: 1 } });
      await ViewedIP.create({ videoId, ip: clientIP });
    }

    res.json({
      views: videos[videoId].views,
      loading: false,
      alreadyViewed: viewedIPs[videoId].has(clientIP)
    });
  } catch (error) {
    console.error('Error incrementing views:', error);
    res.status(500).json({ error: 'Failed to increment views', loading: false });
  } finally {
    videos[videoId].loading = false;
  }
});

// ========== Admin Routes ==========
app.get('/admin/videos', authenticateAdmin, (req, res) => res.json(videos));

app.post('/admin/upload', authenticateAdmin, upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'channelIcon', maxCount: 1 }
  ]), async (req, res) => {
    try {
      if (!req.files) {
        throw new Error('No files were uploaded');
      }
  
      const videoId = Date.now().toString();
      const newVideo = new Video({
        videoId,
        title: req.body.title,
        description: req.body.description,
        channelName: req.body.channelName,
        channelIcon: req.files['channelIcon'][0].filename,
        filename: req.files['video'][0].filename,
        thumbnail: req.files['thumbnail'][0].filename,
        views: 0,
        uploadTime: new Date()
      });
  
      await newVideo.save();
  
      // Update in-memory cache
      videos[videoId] = {
        title: req.body.title,
        description: req.body.description,
        channelName: req.body.channelName,
        channelIcon: req.files['channelIcon'][0].filename,
        thumbnail: req.files['thumbnail'][0].filename,
        views: 0,
        uploadTime: new Date().toISOString(),
        loading: false
      };
  
      res.json({ success: true, video: newVideo });
  
    } catch (error) {
      // Clean up uploaded files if error occurs
      if (req.files) {
        Object.values(req.files).forEach(files => {
          files.forEach(file => {
            fs.unlink(file.path, () => {});
          });
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

app.post('/admin/videos/:id/set-upload-time', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { newTime } = req.body;

  if (!newTime || isNaN(new Date(newTime).getTime()))
    return res.status(400).json({ error: 'Invalid timestamp format' });

  if (new Date(newTime) > new Date())
    return res.status(400).json({ error: 'Upload time cannot be in the future' });

  if (!videos[id]) videos[id] = { views: 0, title: `Video ${id}`, loading: false };

  videos[id].uploadTime = newTime;
  await Video.updateOne({ videoId: id }, { uploadTime: new Date(newTime) }, { upsert: true });
  res.json({ success: true, video: videos[id] });
});

app.post('/admin/videos/bulk-update-times', authenticateAdmin, async (req, res) => {
  const updates = req.body.updates;
  const now = new Date();
  const results = [], errors = [];

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Expected array of updates' });
  }

  for (const { id, newTime } of updates) {
    if (!id || !newTime || isNaN(new Date(newTime).getTime())) {
      errors.push(`Invalid update for ID: ${id}`);
      continue;
    }

    if (new Date(newTime) > now) {
      errors.push(`Future date not allowed for ID: ${id}`);
      continue;
    }

    if (!videos[id]) videos[id] = { views: 0, title: `Video ${id}`, loading: false };
    videos[id].uploadTime = newTime;
    await Video.updateOne({ videoId: id }, { uploadTime: new Date(newTime) }, { upsert: true });
    results.push({ id, status: 'updated', newTime });
  }

  res.json({
    success: errors.length === 0,
    updatedCount: results.length,
    errorCount: errors.length,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
});

app.post('/admin/videos/:id/set-views', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { views: newViews } = req.body;

  if (newViews === undefined || isNaN(parseInt(newViews)))
    return res.status(400).json({ error: 'Invalid view count' });

  if (!videos[id]) {
    videos[id] = { uploadTime: new Date().toISOString(), title: `Video ${id}`, loading: false };
  }

  videos[id].views = parseInt(newViews);
  await Video.updateOne({ videoId: id }, { views: parseInt(newViews) }, { upsert: true });

  res.json({ success: true, video: videos[id] });
});

app.delete('/admin/videos/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  if (!videos[id]) return res.status(404).json({ error: 'Video not found' });

  delete videos[id];
  delete viewedIPs[id];

  await Video.deleteOne({ videoId: id });
  await ViewedIP.deleteMany({ videoId: id });

  res.json({ success: true, message: `Video ${id} deleted` });
});

// ========== Static Files ==========
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ========== Error Handling ==========
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ========== Initialization ==========
loadData().catch(err => {
  console.error('Failed to load initial data:', err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Admin token: ${ADMIN_TOKEN}`);
  }
});

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('Closing MongoDB connection and shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing MongoDB connection and shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});
