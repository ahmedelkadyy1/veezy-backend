// Add this at the top of server.js
const path = require('path');
const fs = require('fs');

// Store viewed IPs (in production, use a database instead)
const viewedIPs = {};

// Middleware to check IP
app.post('/videos/:id/view', (req, res) => {
  const videoId = req.params.id;
  const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (!videos[videoId]) {
    videos[videoId] = { views: 0, uploadTime: new Date().toISOString() };
  }

  // Check if IP already viewed
  if (!viewedIPs[videoId]) viewedIPs[videoId] = new Set();
  if (!viewedIPs[videoId].has(clientIP)) {
    videos[videoId].views++;
    viewedIPs[videoId].add(clientIP);
    fs.writeFileSync('viewedIPs.json', JSON.stringify(viewedIPs)); // Persist data
  }

  res.json({ views: videos[videoId].views });
});
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simple database (in-memory for now)
const videos = {
    1: { views: 142, uploadTime: '2023-05-15T10:00:00Z' },
    2: { views: 87, uploadTime: '2023-06-20T14:30:00Z' },
    3: { views: 256, uploadTime: '2023-07-10T09:15:00Z' }
};

// API Endpoint: Get video data
app.get('/videos/:id', (req, res) => {
    const videoId = req.params.id;
    const videoData = videos[videoId] || { 
        views: 0, 
        uploadTime: new Date().toISOString() 
    };
    res.json(videoData);
});

// API Endpoint: Increment view count
app.post('/videos/:id/view', (req, res) => {
    const videoId = req.params.id;
    if (!videos[videoId]) {
        videos[videoId] = { 
            views: 0, 
            uploadTime: new Date().toISOString() 
        };
    }
    videos[videoId].views++;
    res.json({ success: true });
});

// Start the server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
// Admin-only endpoint to set upload time
app.post('/admin/videos/:id/set-upload-time', (req, res) => {
  const videoId = req.params.id;
  const { newTime } = req.body; // Expects ISO string like "2023-10-01T12:00:00Z"
  
  if (!videos[videoId]) {
    videos[videoId] = { views: 0 };
  }
  
  videos[videoId].uploadTime = newTime;
  res.json({ success: true });
});
