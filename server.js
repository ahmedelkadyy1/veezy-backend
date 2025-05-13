require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Enhanced security middleware
app.use(helmet());
app.use(cors({
    origin: [
        'https://veezy-frontend.vercel.app',
        'http://localhost:3000' // For local testing
    ],
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10kb' }));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
});

// Database setup with persistence
const DATA_FILE = path.join(__dirname, 'data.json');
let videos = {};
let viewedIPs = {};

// Load initial data
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            videos = data.videos || {};
            viewedIPs = data.viewedIPs || {};
        } else {
            // Initialize with sample data if no file exists
            videos = {
                1: { views: 142, uploadTime: '2023-05-15T10:00:00Z' },
                2: { views: 87, uploadTime: '2023-06-20T14:30:00Z' }
            };
            saveData();
        }
    } catch (err) {
        console.error('Error loading data:', err);
        // Fallback to empty data if loading fails
        videos = {};
        viewedIPs = {};
    }
}

// Save data to file
function saveData() {
    const data = { videos, viewedIPs };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
}

// Authentication
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '227001';

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header missing or invalid' });
    }
    
    const token = authHeader.split(' ')[1];
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Invalid admin token' });
    }
    
    next();
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        videoCount: Object.keys(videos).length
    });
});

// API Endpoint: Get video data
app.get('/videos/:id', apiLimiter, (req, res) => {
    const videoId = req.params.id;
    
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
    }
    
    const videoData = videos[videoId] || { 
        views: 0, 
        uploadTime: new Date().toISOString() 
    };
    
    res.json(videoData);
});

// API Endpoint: Protected view increment
app.post('/videos/:id/view', apiLimiter, (req, res) => {
    const videoId = req.params.id;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
    }

    // Initialize video if doesn't exist
    if (!videos[videoId]) {
        videos[videoId] = { 
            views: 0, 
            uploadTime: new Date().toISOString() 
        };
    }

    // Initialize IP tracking for this video
    if (!viewedIPs[videoId]) {
        viewedIPs[videoId] = new Set();
    }
    
    // Only increment if IP hasn't viewed before
    if (!viewedIPs[videoId].has(clientIP)) {
        videos[videoId].views++;
        viewedIPs[videoId].add(clientIP);
        saveData();
    }

    res.json({ 
        views: videos[videoId].views,
        alreadyViewed: viewedIPs[videoId].has(clientIP)
    });
});

// ================= ADMIN ENDPOINTS ================= //

// Admin Endpoint: Set upload time for a single video
app.post('/admin/videos/:id/set-upload-time', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    const { newTime } = req.body;
    
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
    }
    
    if (!newTime || isNaN(new Date(newTime).getTime())) {
        return res.status(400).json({ error: 'Invalid timestamp format. Use ISO format (e.g., "2023-10-01T12:00:00Z")' });
    }

    const newTimeDate = new Date(newTime);
    const now = new Date();
    
    if (newTimeDate > now) {
        return res.status(400).json({ error: 'Upload time cannot be in the future' });
    }

    if (!videos[videoId]) {
        videos[videoId] = { views: 0 };
    }
    
    videos[videoId].uploadTime = newTime;
    saveData();
    
    res.json({ success: true, newUploadTime: newTime });
});

// Admin Endpoint: Bulk update upload times
app.post('/admin/videos/bulk-update-times', authenticateAdmin, (req, res) => {
    const updates = req.body.updates;
    const now = new Date();
    
    if (!Array.isArray(updates)) {
        return res.status(400).json({ error: 'Expected array of updates' });
    }
    
    const results = [];
    const errors = [];
    
    updates.forEach(update => {
        if (!update.id || !update.newTime || isNaN(new Date(update.newTime).getTime())) {
            errors.push(`Invalid update for ID: ${update.id}`);
            return;
        }
        
        if (new Date(update.newTime) > now) {
            errors.push(`Future date not allowed for ID: ${update.id}`);
            return;
        }
        
        if (!videos[update.id]) {
            videos[update.id] = { views: 0 };
        }
        
        videos[update.id].uploadTime = update.newTime;
        results.push({ id: update.id, status: 'updated', newTime: update.newTime });
    });
    
    saveData();
    
    res.json({ 
        success: errors.length === 0,
        updatedCount: results.length,
        errorCount: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
    });
});

// Admin Endpoint: Get all videos
app.get('/admin/videos', authenticateAdmin, (req, res) => {
    res.json(videos);
});

// Admin Endpoint: Set view count for a video
app.post('/admin/videos/:id/set-views', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    const { views } = req.body;
    
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
    }
    
    if (views === undefined || isNaN(parseInt(views)) || parseInt(views) < 0) {
        return res.status(400).json({ error: 'Invalid view count' });
    }
    
    if (!videos[videoId]) {
        videos[videoId] = { uploadTime: new Date().toISOString() };
    }
    
    videos[videoId].views = parseInt(views);
    saveData();
    
    res.json({ success: true, newViewCount: videos[videoId].views });
});

// Admin Endpoint: Delete a video
app.delete('/admin/videos/:id', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
    }
    
    if (!videos[videoId]) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    delete videos[videoId];
    
    if (viewedIPs[videoId]) {
        delete viewedIPs[videoId];
    }
    
    saveData();
    
    res.json({ success: true, message: `Video ${videoId} deleted` });
});

// Serve admin panel (optional)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize data and start server
loadData();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`Admin token: ${ADMIN_TOKEN}`);
    }
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.log('Saving data before shutdown...');
    saveData();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Saving data before shutdown...');
    saveData();
    process.exit(0);
});
