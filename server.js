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
        'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10kb' }));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later'
});

// Database setup
const DATA_FILE = path.join(__dirname, 'data.json');
let videos = {};
let viewedIPs = {};

// Improved data loading with defaults
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            videos = data.videos || {};
            viewedIPs = data.viewedIPs || {};
            
            // Initialize default videos if they don't exist
            if (!videos[1]) {
                videos[1] = { 
                    views: 0, 
                    uploadTime: new Date().toISOString(),
                    title: "Blanx an E-commerce Website",
                    loading: false
                };
            }
            if (!videos[2]) {
                videos[2] = { 
                    views: 0, 
                    uploadTime: new Date().toISOString(),
                    title: "WatchNest a Movie Website",
                    loading: false
                };
            }
        } else {
            // Initialize with default data
            videos = {
                1: { 
                    views: 0, 
                    uploadTime: new Date().toISOString(),
                    title: "Blanx an E-commerce Website",
                    loading: false
                },
                2: { 
                    views: 0, 
                    uploadTime: new Date().toISOString(),
                    title: "WatchNest a Movie Website",
                    loading: false
                }
            };
            viewedIPs = {};
            saveData();
        }
    } catch (err) {
        console.error('Error loading data:', err);
        videos = {
            1: { views: 0, uploadTime: new Date().toISOString(), loading: false },
            2: { views: 0, uploadTime: new Date().toISOString(), loading: false }
        };
        viewedIPs = {};
    }
}

// Enhanced save function with error handling
function saveData() {
    try {
        const data = { videos, viewedIPs };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving data:', err);
    }
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

// ================= API ENDPOINTS ================= //

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        videoCount: Object.keys(videos).length 
    });
});

// Get all videos
app.get('/videos', (req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.json(videos);
});

// Get single video with loading state
app.get('/videos/:id', apiLimiter, (req, res) => {
    const videoId = req.params.id;
    res.set('Cache-Control', 'no-store, max-age=0');
    
    if (!videos[videoId]) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    // Return video data with loading state
    res.json({
        ...videos[videoId],
        loading: videos[videoId].loading || false
    });
});

// Increment views with loading state
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

    if (!viewedIPs[videoId]) {
        viewedIPs[videoId] = new Set();
    }
    
    // Set loading state
    videos[videoId].loading = true;
    saveData();
    
    // Simulate processing delay (remove in production)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
        if (!viewedIPs[videoId].has(clientIP)) {
            videos[videoId].views++;
            viewedIPs[videoId].add(clientIP);
        }
        
        res.json({ 
            views: videos[videoId].views,
            loading: false,
            alreadyViewed: viewedIPs[videoId].has(clientIP)
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to increment views',
            loading: false
        });
    } finally {
        videos[videoId].loading = false;
        saveData();
    }
});

// ================= ADMIN ENDPOINTS ================= //

// Get all videos (admin)
app.get('/admin/videos', authenticateAdmin, (req, res) => {
    res.json(videos);
});

// Set upload time
app.post('/admin/videos/:id/set-upload-time', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    const { newTime } = req.body;
    
    if (!newTime || isNaN(new Date(newTime).getTime())) {
        return res.status(400).json({ error: 'Invalid timestamp format' });
    }

    const newTimeDate = new Date(newTime);
    const now = new Date();
    
    if (newTimeDate > now) {
        return res.status(400).json({ error: 'Upload time cannot be in the future' });
    }

    if (!videos[videoId]) {
        videos[videoId] = { views: 0, title: `Video ${videoId}`, loading: false };
    }
    
    videos[videoId].uploadTime = newTime;
    saveData();
    
    res.json({ success: true, video: videos[videoId] });
});

// Bulk update
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
            videos[update.id] = { views: 0, title: `Video ${update.id}`, loading: false };
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

// Set views
app.post('/admin/videos/:id/set-views', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    const { views } = req.body;
    
    if (views === undefined || isNaN(parseInt(views))) {
        return res.status(400).json({ error: 'Invalid view count' });
    }
    
    if (!videos[videoId]) {
        videos[videoId] = { 
            uploadTime: new Date().toISOString(),
            title: `Video ${videoId}`,
            loading: false
        };
    }
    
    videos[videoId].views = parseInt(views);
    saveData();
    
    res.json({ success: true, video: videos[videoId] });
});

// Delete video
app.delete('/admin/videos/:id', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    
    if (!videos[videoId]) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    delete videos[videoId];
    delete viewedIPs[videoId];
    saveData();
    
    res.json({ success: true, message: `Video ${videoId} deleted` });
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize and start server
loadData();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`Admin token: ${ADMIN_TOKEN}`);
    }
});

// Graceful shutdown
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
