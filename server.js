require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const app = express();

// Configure CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, WebM and MOV videos are allowed!'));
    }
  }
});

// Middleware
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// In-memory database for demo (replace with real DB in production)
let videos = {
  1: {
    views: 0,
    uploadTime: new Date().toISOString(),
    title: "Blanx an E-commerce Website",
    filename: "blanx-demo.mp4"
  },
  2: {
    views: 0,
    uploadTime: new Date().toISOString(),
    title: "WatchNest a Movie Website",
    filename: "watchnest-demo.mp4"
  }
};

// Routes
app.get('/videos', (req, res) => {
  res.json(videos);
});

app.get('/videos/:id', (req, res) => {
  const video = videos[req.params.id];
  if (video) {
    res.json(video);
  } else {
    res.status(404).json({ error: 'Video not found' });
  }
});

app.post('/videos/:id/view', (req, res) => {
  if (videos[req.params.id]) {
    videos[req.params.id].views += 1;
    res.json({ success: true, views: videos[req.params.id].views });
  } else {
    res.status(404).json({ error: 'Video not found' });
  }
});

// Enhanced Upload Endpoint
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    // Create new video entry
    const videoId = Object.keys(videos).length + 1;
    const videoTitle = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, "");

    videos[videoId] = {
      views: 0,
      uploadTime: new Date().toISOString(),
      title: videoTitle,
      filename: req.file.filename
    };

    res.status(201).json({
      success: true,
      videoId,
      videoUrl: `/uploads/${req.file.filename}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up failed upload
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }

    res.status(500).json({ 
      error: 'Video upload failed',
      details: error.message 
    });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ 
      error: 'File upload error',
      details: err.code === 'LIMIT_FILE_SIZE' 
        ? 'File too large (max 100MB)' 
        : err.message 
    });
  }

  res.status(500).json({ error: 'Something broke!' });
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload directory: ${uploadDir}`);
});