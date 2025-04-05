require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// NEW: Enhanced CORS for frontend-backend sync
app.use(cors({
  origin: [
    'https://veezy-frontend.vercel.app', // Your frontend
    'http://localhost:3000'              // For local dev
  ],
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  credentials: true
}));

app.use(helmet());
app.use(bodyParser.json({ limit: '10kb' }));

// NEW: Rate limiting for API protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per window
});
app.use('/api/', limiter);

// NEW: Persistent data storage with auto-backup
const DATA_FILE = path.join(__dirname, 'data.json');
let videos = {};
let viewedIPs = {};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const rawData = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(rawData);
      videos = data.videos || {};
      viewedIPs = data.viewedIPs || {};
    } else {
      // Initialize with sample data
      videos = {
        1: { views: 142, uploadTime: new Date().toISOString() },
        2: { views: 87, uploadTime: new Date().toISOString() }
      };
      saveData();
    }
  } catch (err) {
    console.error('Data load error:', err);
    videos = {};
    viewedIPs = {};
  }
}

function saveData() {
  const data = { videos, viewedIPs };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  console.log('Data saved at:', new Date().toISOString());
}

// NEW: Auto-save every 5 minutes
setInterval(saveData, 5 * 60 * 1000);

// Authentication
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '227001';

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  next();
};

// NEW: Health endpoint with data stats
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    videoCount: Object.keys(videos).length,
    dataSize: `${JSON.stringify(videos).length / 1024} KB`
  });
});

// API Endpoints
app.get('/videos/:id', (req, res) => {
  const videoId = req.params.id;
  res.json(videos[videoId] || { views: 0, uploadTime: new Date().toISOString() });
});

app.post('/videos/:id/view', (req, res) => {
  const videoId = req.params.id;
  const clientIP = req.ip || req.headers['x-forwarded-for'];

  if (!videos[videoId]) {
    videos[videoId] = { views: 0, uploadTime: new Date().toISOString() };
  }

  if (!viewedIPs[videoId]) viewedIPs[videoId] = new Set();
  if (!viewedIPs[videoId].has(clientIP)) {
    videos[videoId].views++;
    viewedIPs[videoId].add(clientIP);
  }

  res.json({ 
    views: videos[videoId].views,
    alreadyViewed: viewedIPs[videoId].has(clientIP)
  });
});

// NEW: Admin endpoints with forced data persistence
app.post('/admin/videos/:id/set-upload-time', authenticateAdmin, (req, res) => {
  const videoId = req.params.id;
  const { newTime } = req.body;

  if (!videos[videoId]) videos[videoId] = { views: 0 };
  videos[videoId].uploadTime = newTime;
  saveData(); // NEW: Force immediate save

  res.json({ success: true, newTime });
});

// ... (Keep other admin endpoints from your original file, but add `saveData()` after each modification)

// NEW: Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error' });
});

// Initialize
loadData();
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin panel: https://veezy-backend.onrender.com/admin`);
});

// NEW: Graceful shutdown handling
process.on('SIGINT', () => {
  saveData();
  process.exit(0);
});
