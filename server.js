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

// Load initial data
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            videos = data.videos || {};
            viewedIPs = data.viewedIPs || {};
        } else {
            videos = {
                1: { views: 142, uploadTime: '2023-05-15T10:00:00Z', title: "Blanx an E-commerce Website" },
                2: { views: 87, uploadTime: '2023-06-20T14:30:00Z', title: "WatchNest a Movie Website" }
            };
            saveData();
        }
    } catch (err) {
        console.error('Error loading data:', err);
        videos = {};
        viewedIPs = {};
    }
}

function saveData() {
    const data = { videos, viewedIPs };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
}

// Authentication
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '227001';

const authenticateAdmin = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Invalid admin token' });
    next();
};

// Public Endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', videoCount: Object.keys(videos).length });
});

app.get('/videos', apiLimiter, (req, res) => {
    res.json(videos);
});

app.get('/videos/:id', apiLimiter, (req, res) => {
    const videoId = req.params.id;
    res.json(videos[videoId] || { views: 0, uploadTime: new Date().toISOString() });
});

app.post('/videos/:id/view', apiLimiter, (req, res) => {
    const videoId = req.params.id;
    const clientIP = req.ip;

    if (!videos[videoId]) {
        videos[videoId] = { views: 0, uploadTime: new Date().toISOString() };
    }

    if (!viewedIPs[videoId]?.has(clientIP)) {
        videos[videoId].views++;
        viewedIPs[videoId] = viewedIPs[videoId] || new Set();
        viewedIPs[videoId].add(clientIP);
        saveData();
    }

    res.json({ views: videos[videoId].views });
});

// Admin Endpoints
app.get('/admin/videos', authenticateAdmin, (req, res) => {
    res.json(videos);
});

app.post('/admin/videos/:id/set-views', authenticateAdmin, (req, res) => {
    const videoId = req.params.id;
    videos[videoId] = videos[videoId] || { uploadTime: new Date().toISOString() };
    videos[videoId].views = parseInt(req.body.views);
    saveData();
    res.json({ success: true });
});

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize
loadData();
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
