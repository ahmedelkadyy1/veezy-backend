const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Database setup
const videos = {
    1: { views: 142, uploadTime: '2023-05-15T10:00:00Z' },
    2: { views: 87, uploadTime: '2023-06-20T14:30:00Z' },
};

// IP tracking for view protection
const viewedIPs = {};

// Load persisted IP data if exists
if (fs.existsSync('viewedIPs.json')) {
    const data = fs.readFileSync('viewedIPs.json', 'utf8');
    Object.assign(viewedIPs, JSON.parse(data));
}

// Authentication middleware
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '227001';

const authenticateAdmin = (req, res, next) => {
    const authToken = req.headers['authorization'];
    
    if (authToken !== `Bearer ${ADMIN_TOKEN}`) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    next();
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

// API Endpoint: Protected view increment
app.post('/videos/:id/view', (req, res) => {
    const videoId = req.params.id;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!videos[videoId]) {
        videos[videoId] = { 
            views: 0, 
            uploadTime: new Date().toISOString() 
        };
    } else if (!videos[videoId].uploadTime) {
        videos[videoId].uploadTime = new Date().toISOString();
    }

    // Initialize IP tracking for this video
    if (!viewedIPs[videoId]) viewedIPs[videoId] = new Set();
    
    // Only increment if IP hasn't viewed before
    if (!viewedIPs[videoId].has(clientIP)) {
        videos[videoId].views++;
        viewedIPs[videoId].add(clientIP);
        fs.writeFileSync('viewedIPs.json', JSON.stringify(viewedIPs));
    }

    res.json({ 
        views: videos[videoId].views,
        alreadyViewed: viewedIPs[videoId].has(clientIP)
    });
});

// Admin Endpoint: Set upload time for a single video
app.post('/admin/videos/:id/set-upload-time', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    const { newTime } = req.body;
    const allowFutureDates = false; // Change to true if you want to allow future dates
    
    // Validate the timestamp format
    if (!newTime || isNaN(new Date(newTime).getTime())) {
        return res.status(400).json({ error: 'Invalid timestamp format. Use ISO format (e.g., "2023-10-01T12:00:00Z")' });
    }

    const newTimeDate = new Date(newTime);
    const now = new Date();
    
    if (!allowFutureDates && newTimeDate > now) {
        return res.status(400).json({ error: 'Upload time cannot be in the future' });
    }

    if (!videos[videoId]) {
        videos[videoId] = { views: 0 };
    }
    
    videos[videoId].uploadTime = newTime;
    res.json({ success: true, newUploadTime: newTime });
});

// Admin Endpoint: Bulk update upload times
app.post('/admin/videos/bulk-update-times', authenticateAdmin, (req, res) => {
    const updates = req.body.updates;
    const allowFutureDates = false;
    const now = new Date();
    
    if (!Array.isArray(updates)) {
        return res.status(400).json({ error: 'Expected array of updates' });
    }
    
    const results = [];
    
    updates.forEach(update => {
        if (!update.id || !update.newTime || isNaN(new Date(update.newTime).getTime())) {
            results.push({ id: update.id, status: 'invalid', error: 'Missing ID or invalid timestamp' });
            return;
        }
        
        if (!allowFutureDates && new Date(update.newTime) > now) {
            results.push({ id: update.id, status: 'rejected', error: 'Future dates not allowed' });
            return;
        }
        
        if (!videos[update.id]) {
            videos[update.id] = { views: 0 };
        }
        
        videos[update.id].uploadTime = update.newTime;
        results.push({ id: update.id, status: 'updated', newTime: update.newTime });
    });
    
    res.json({ success: true, results });
});

// Admin Endpoint: Get all videos
app.get('/admin/videos', authenticateAdmin, (req, res) => {
    res.json(videos);
});

// Admin Endpoint: Set view count for a video
app.post('/admin/videos/:id/set-views', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    const { views } = req.body;
    
    if (views === undefined || isNaN(parseInt(views))) {
        return res.status(400).json({ error: 'Invalid view count' });
    }
    
    if (!videos[videoId]) {
        videos[videoId] = { uploadTime: new Date().toISOString() };
    }
    
    videos[videoId].views = parseInt(views);
    res.json({ success: true, newViewCount: videos[videoId].views });
});

// Admin Endpoint: Delete a video
app.delete('/admin/videos/:id', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    if (!videos[videoId]) {
        return res.status(404).json({ error: 'Video not found' });
    }
    delete videos[videoId];
    res.json({ success: true, message: `Video ${videoId} deleted` });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin token: ${ADMIN_TOKEN}`);
});
