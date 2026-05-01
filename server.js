const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const upload = multer({ dest: path.join(__dirname, 'temp-uploads') });

const app = express();
const PORT = 3000;

const tempUploadsDir = path.join(__dirname, 'temp-uploads');
if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// --- BRUTE-FORCE PROTECTION SYSTEM ---
const loginAttempts = new Map();
const loginAttemptsFile = path.join(__dirname, 'login_attempts.json');

// Normalize IP address (remove IPv6 prefix for IPv4 addresses)
function normalizeIp(ip) {
    if (ip && ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    return ip;
}

// Get client IP from request
function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        return normalizeIp(ips[0]);
    }
    return normalizeIp(req.ip || req.connection.remoteAddress || req.socket.remoteAddress);
}

// Load login attempts from file on startup
function loadLoginAttempts() {
    if (fs.existsSync(loginAttemptsFile)) {
        try {
            const data = fs.readFileSync(loginAttemptsFile, 'utf8');
            const attempts = JSON.parse(data);
            for (const [ip, attemptData] of Object.entries(attempts)) {
                loginAttempts.set(ip, attemptData);
            }
            console.log(`Loaded login attempt data for ${loginAttempts.size} IPs.`);
        } catch (err) {
            console.error('Error loading login attempts:', err);
        }
    }
}

// Save login attempts to file
function saveLoginAttempts() {
    try {
        const obj = {};
        loginAttempts.forEach((data, ip) => {
            obj[ip] = data;
        });
        fs.writeFileSync(loginAttemptsFile, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error('Error saving login attempts:', err);
    }
}

// Get block duration based on attempt count
function getBlockDuration(attempts) {
    if (attempts >= 20) return -1; // Permanent
    if (attempts >= 15) return 30 * 60 * 1000; // 30 minutes
    if (attempts >= 10) return 5 * 60 * 1000; // 5 minutes
    if (attempts >= 5) return 2 * 60 * 1000; // 2 minutes
    return 0; // No block
}

// Get login attempt data for an IP
function getLoginAttemptData(ip) {
    return loginAttempts.get(ip);
}

// Check if IP is currently blocked
function isIpBlocked(ip) {
    const data = loginAttempts.get(ip);
    if (!data) return false;
    
    if (data.permanent) return true;
    
    if (data.blockedUntil) {
        if (Date.now() < data.blockedUntil) {
            return true;
        }
        // Block expired - clear blockedUntil but keep attempt count
        data.blockedUntil = null;
    }
    
    return false;
}

// Get remaining block time in milliseconds (-1 for permanent)
function getRemainingBlockTime(ip) {
    const data = loginAttempts.get(ip);
    if (!data) return 0;
    
    if (data.permanent) return -1;
    
    if (data.blockedUntil) {
        const remaining = data.blockedUntil - Date.now();
        if (remaining > 0) return remaining;
    }
    
    return 0;
}

// Record failed login attempt
function recordFailedAttempt(ip) {
    let data = loginAttempts.get(ip);
    
    if (!data) {
        data = { attempts: 0, lastAttemptTime: null, blockedUntil: null, permanent: false };
        loginAttempts.set(ip, data);
    }
    
    // Don't increment if already permanently blocked
    if (data.permanent) return;
    
    // Don't increment if currently in a temporary block
    if (data.blockedUntil && Date.now() < data.blockedUntil) return;
    
    data.attempts += 1;
    data.lastAttemptTime = Date.now();
    
    const blockDuration = getBlockDuration(data.attempts);
    
    if (blockDuration === -1) {
        data.permanent = true;
        data.blockedUntil = null;
    } else if (blockDuration > 0) {
        data.blockedUntil = Date.now() + blockDuration;
    }
    
    saveLoginAttempts();
}

// Reset login attempts on successful login
function resetLoginAttempts(ip) {
    loginAttempts.delete(ip);
    saveLoginAttempts();
}

// Load existing login attempts on startup
loadLoginAttempts();

// Create limiter for recommendation endpoints
const recommendationsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // limit each IP to 30 requests per windowMs
    message: 'Too many recommendation requests, please try again later.'
});

// Create sessions directory
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true, mode: 0o777 });
}

// Helper function to strip file extension (used for Discord Embeds and general metadata)
function stripExtension(filename) {
    return filename.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i, '');
}

// --- STATIC FILE MIDDLEWARE ---
// Specific static folders (loaded before generic public)
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use('/LocalYT-Rev-Files', express.static(path.join(__dirname, 'LocalYT-Rev-Files')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));
app.use('/thumbnails-small', express.static(path.join(__dirname, 'thumbnails-small')));
app.use('/filedates', express.static(path.join(__dirname, 'filedates')));
app.use('/filenames', express.static(path.join(__dirname, 'filenames')));
app.use('/videolengths', express.static(path.join(__dirname, 'videolengths')));
app.use('/channelpic', express.static(path.join(__dirname, 'channelpic')));
app.use('/channelbanner', express.static(path.join(__dirname, 'channelbanner')));
app.use('/channeldesc', express.static(path.join(__dirname, 'channeldesc')));
app.use('/channelstats', express.static(path.join(__dirname, 'channelstats')));
app.use('/videostats', express.static(path.join(__dirname, 'videostats')));
app.use('/descriptions', express.static(path.join(__dirname, 'descriptions')));
app.use('/comments', express.static(path.join(__dirname, 'comments')));
app.use('/subtitles', express.static(path.join(__dirname, 'subtitles')));
app.use('/livechats', express.static(path.join(__dirname, 'livechats')));
app.use('/channelposts', express.static(path.join(__dirname, 'channelposts')));
app.use('/user-profiles', express.static(path.join(__dirname, 'user-profiles')));
app.use('/favicon.png', express.static(path.join(__dirname, 'favicon.png')));
app.use('/playlist_cache.json', express.static(path.join(__dirname, 'playlist_cache.json')));
app.use('/video_date_cache.json', express.static(path.join(__dirname, 'video_date_cache.json')));

// --- DISCORD EMBED ROUTE ---
app.get('/video.html', (req, res) => {
    const videoSrc = req.query.src;

    // If no video source is provided, serve the default HTML file
    if (!videoSrc) {
        return res.sendFile(path.join(__dirname, 'public', 'video.html'));
    }

    // SAFE DECODE: Handle malformed URI sequences (e.g., "100%" in filenames)
    let decodedSrc;
    try {
        decodedSrc = decodeURIComponent(videoSrc);
    } catch (e) {
        console.warn('[Discord Embed] Malformed URI in src, using raw:', videoSrc);
        decodedSrc = videoSrc;
    }
    
    // --- Get Title ---
    // Try to read the custom filename, fallback to the actual filename
    const basePath = stripExtension(decodedSrc);
    const titlePath = path.join(__dirname, 'filenames', `${basePath}.txt`);
    let title = decodedSrc.split('/').pop(); // Default title
    
    if (fs.existsSync(titlePath)) {
        try {
            title = fs.readFileSync(titlePath, 'utf8').trim();
        } catch (e) {
            console.error('Error reading title file for embed:', e);
        }
    }

    // --- Get Thumbnail Path ---
    const pathParts = decodedSrc.split('/');
    const channel = pathParts[0];
    let thumbRelativePath = '';

    if (pathParts.length > 2) {
        // Channel/Playlist/Video structure
        const playlist = pathParts[1];
        const videoName = stripExtension(pathParts[pathParts.length - 1]);
        thumbRelativePath = `thumbnails/${encodeURIComponent(channel)}/${encodeURIComponent(playlist)}/${encodeURIComponent(videoName)}.jpg`;
    } else {
        // Channel/Video structure
        const videoName = stripExtension(pathParts[pathParts.length - 1]);
        thumbRelativePath = `thumbnails/${encodeURIComponent(channel)}/${encodeURIComponent(videoName)}.jpg`;
    }

    // --- Construct URLs ---
    const host = req.get('host');
    const videoUrl = `https://${host}/videos/${encodeURIComponent(decodedSrc)}`;
    const thumbUrl = `https://${host}/${thumbRelativePath}`;
    const pageUrl = `https://${host}/video.html?src=${encodeURIComponent(decodedSrc)}`;

    // --- Inject Meta Tags ---
    const htmlFilePath = path.join(__dirname, 'public', 'video.html');
    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

    // Only embed video player for MP4 files
    const isMp4 = decodedSrc.toLowerCase().endsWith('.mp4');

    const metaTags = `
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="LocalYT" />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content="${pageUrl}" />
        <meta property="og:image" content="${thumbUrl}" />
        <meta property="og:image:secure_url" content="${thumbUrl}" />
        <meta property="og:site_name" content="LocalYT" />
        ${isMp4 ? `
        <meta property="og:video" content="${videoUrl}" />
        <meta property="og:video:secure_url" content="${videoUrl}" />
        <meta property="og:video:type" content="video/mp4" />
        <meta property="og:video:width" content="1280" />
        <meta property="og:video:height" content="720" />
        ` : ''}
        <meta name="twitter:card" content="player" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:image" content="${thumbUrl}" />
        ${isMp4 ? `
        <meta name="twitter:player:stream" content="${videoUrl}" />
        <meta name="twitter:player:stream:content_type" content="video/mp4"/>
        ` : ''}
    `;

    // Inject into <head>
    htmlContent = htmlContent.replace('</head>', metaTags + '</head>');

    res.send(htmlContent);
});

// --- SHORT LINK REDIRECT ---
app.get('/v/:code', (req, res) => {
    const code = req.params.code;
    const videoPath = shortCodeToVideoMap.get(code);
    
    if (!videoPath) {
        return res.status(404).send('Short link not found');
    }

    let redirectUrl = `/video.html?src=${encodeURIComponent(videoPath)}`;
    
    // Preserve timestamp
    if (req.query.t) redirectUrl += `&t=${encodeURIComponent(req.query.t)}`;

    // Handle Playlist Short Code (?pl=...)
    if (req.query.pl) {
        const plCode = req.query.pl;
        const playlistName = shortCodeToPlaylistMap.get(plCode);
        
        if (playlistName) {
            // Found the real name, append it
            redirectUrl += `&playlist=${encodeURIComponent(playlistName)}`;
        } else {
            // Fallback: If code not found, pass raw value (in case it's a manual test)
            redirectUrl += `&playlist=${encodeURIComponent(plCode)}`;
        }
    }
    
    res.redirect(redirectUrl);
});

// --- PLAYLIST SHORT LINK SYSTEM (DEFINITIONS) ---
let playlistShortMap = new Map();       // playlist name -> short code
let shortCodeToPlaylistMap = new Map(); // short code -> playlist name
const PLAYLIST_SHORT_FILE = path.join(__dirname, 'playlist_shortlinks.json');

function generatePlaylistShortCode() {
    if (!SHORT_CODE_CHARS) return null; 
    let code;
    let attempts = 0;
    do {
        code = '';
        for (let i = 0; i < 7; i++) {
            code += SHORT_CODE_CHARS.charAt(Math.floor(Math.random() * SHORT_CODE_CHARS.length));
        }
        attempts++;
        if (attempts > 100) break; 
    } while (shortCodeToPlaylistMap.has(code) || shortCodeToVideoMap.has(code)); 
    return code;
}

function getOrCreatePlaylistShortCode(playlistName) {
    if (!playlistName || typeof playlistName !== 'string') return null;
    
    if (playlistShortMap.has(playlistName)) {
        return playlistShortMap.get(playlistName);
    }

    const code = generatePlaylistShortCode();
    if (!code) return null;

    playlistShortMap.set(playlistName, code);
    shortCodeToPlaylistMap.set(code, playlistName);
    
    // Auto-save when new ones are created
    savePlaylistLinksToFile();
    
    return code;
}

function savePlaylistLinksToFile() {
    const obj = {};
    playlistShortMap.forEach((val, key) => { obj[key] = val; });
    try {
        fs.writeFileSync(PLAYLIST_SHORT_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error('Error saving playlist links:', err);
    }
}

// NOTE: The initialization function is called at the bottom of the file 
// to ensure videoArray is loaded first.

// Generic public static middleware (loaded after specific routes)
app.use(express.static(path.join(__dirname, 'public')));

// Generic public static middleware (loaded after specific routes)
app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    store: new FileStore({
        path: sessionsDir,
        ttl: 86400,
        retries: 3,
        reapInterval: -1, 
        fileExtension: '.session',
        reapAsync: false,
        reapSyncFallback: false, 
        logFn: function() {},  
        encoding: 'utf8',
        encrypt: false
    }),
    secret: 'secret',
    resave: true,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, 
        httpOnly: true,
        sameSite: 'lax'
    },
    name: 'localyt.sid',
    rolling: false
}));

const preferencesFilePath = path.join(__dirname, 'userPreferences.json');
const watchHistoryFilePath = path.join(__dirname, 'watchHistory.json');
const cacheFilePath = path.join(__dirname, 'video_cache.json');
const recommendationIndexPath = path.join(__dirname, 'recommendation_index.json');

// Ensure the preferences file exists and is valid JSON
function ensurePreferencesFile() {
    if (!fs.existsSync(preferencesFilePath)) {
        fs.writeFileSync(preferencesFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        try { JSON.parse(data); } catch (err) { fs.writeFileSync(preferencesFilePath, JSON.stringify({})); }
    }
}

// Ensure the watch history file exists and is valid JSON
function ensureWatchHistoryFile() {
    if (!fs.existsSync(watchHistoryFilePath)) {
        fs.writeFileSync(watchHistoryFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(watchHistoryFilePath, 'utf8');
        try { JSON.parse(data); } catch (err) { fs.writeFileSync(watchHistoryFilePath, JSON.stringify({})); }
    }
}

ensurePreferencesFile();
ensureWatchHistoryFile();

// --- PLAYLIST THUMBNAIL CACHE SYSTEM ---
const playlistCacheFilePath = path.join(__dirname, 'playlist_cache.json');
let playlistThumbnailCache = {};

function loadPlaylistThumbnailCache() {
    if (fs.existsSync(playlistCacheFilePath)) {
        try {
            const data = fs.readFileSync(playlistCacheFilePath, 'utf8');
            playlistThumbnailCache = JSON.parse(data);
            console.log(`Loaded playlist thumbnail cache (${Object.keys(playlistThumbnailCache).length} entries).`);
        } catch (err) {
            console.log('Failed to read playlist cache, regenerating...', err);
            buildPlaylistThumbnailCache();
        }
    } else {
        console.log('playlist_cache.json not found, generating...');
        buildPlaylistThumbnailCache();
    }
}

function buildPlaylistThumbnailCache() {
    console.log('Building playlist thumbnail cache (this may take a moment)...');
    const cache = {};
    const thumbnailsDir = path.join(__dirname, 'thumbnails');
    const filedatesDir = path.join(__dirname, 'filedates');

    function parseEuropeanDate(dateString) {
        if (!dateString || dateString === 'Unknown date') return new Date(0);
        const parts = String(dateString).trim().split('.');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
        return new Date(dateString);
    }

    function scanPlaylist(playlistKey, dir) {
        let earliestVideo = null;
        let earliestDate = null;

        function readDirRecursive(d) {
            try {
                const files = fs.readdirSync(d);
                files.forEach(file => {
                    const filePath = path.join(d, file);
                    if (!fs.existsSync(filePath)) return;
                    
                    if (fs.statSync(filePath).isDirectory()) {
                        readDirRecursive(filePath);
                    } else if (file.match(/\.(mp4|mp3|mkv)$/i)) {
                        const basePath = path.relative(path.join(__dirname, 'videos'), filePath).replace(/\\/g, '/').replace(/\.(mp4|mp3|mkv)$/i, '');
                        
                        // Check if thumbnail exists
                        const thumbPath = path.join(thumbnailsDir, `${basePath}.jpg`);
                        if (!fs.existsSync(thumbPath)) return;

                        // Get upload date
                        const datePath = path.join(filedatesDir, `${basePath}.txt`);
                        let dateObj = new Date(0); // Default to epoch if no date
                        
                        if (fs.existsSync(datePath)) {
                            try {
                                const dateStr = fs.readFileSync(datePath, 'utf8').trim();
                                dateObj = parseEuropeanDate(dateStr);
                            } catch (e) {}
                        }

                        if (!earliestDate || dateObj < earliestDate) {
                            earliestDate = dateObj;
                            earliestVideo = `/thumbnails/${basePath}.jpg`;
                        }
                    }
                });
            } catch (err) {
                // Silently skip inaccessible directories
            }
        }

        readDirRecursive(dir);

        if (earliestVideo) {
            cache[playlistKey] = encodeURI(earliestVideo);
        }
    }

    // Find all playlists from video cache (paths with more than 1 segment)
    const playlistsFound = new Set();
    videoArray.forEach(video => {
        const parts = video.path.split('/');
        if (parts.length > 2) {
            const playlistName = parts.slice(1, -1).join('/');
            if (playlistName) {
                playlistsFound.add(`${parts[0]}/${playlistName}`);
            }
        }
    });

    // Scan each playlist for its earliest thumbnail
    const videosDir = path.join(__dirname, 'videos');
    playlistsFound.forEach(playlistKey => {
        const playlistDir = path.join(videosDir, playlistKey);
        if (fs.existsSync(playlistDir)) {
            scanPlaylist(playlistKey, playlistDir);
        }
    });

    // Save cache to disk
    try {
        fs.writeFileSync(playlistCacheFilePath, JSON.stringify(cache, null, 2));
        playlistThumbnailCache = cache;
        console.log(`Built playlist thumbnail cache with ${Object.keys(cache).length} entries.`);
    } catch (err) {
        console.error('Error writing playlist cache:', err);
    }
}

// --- OPTIMIZED VIDEO CACHING SYSTEM ---
let videoCache = new Map(); // Map for O(1) lookups
let videoArray = []; // Array for pagination
let recommendationIndex = {};

function initializeVideoCache() {
    console.log('Checking for video cache...');
    
    if (fs.existsSync(cacheFilePath)) {
        try {
            const stats = fs.statSync(cacheFilePath);
            if (stats.size > 0) {
                const data = fs.readFileSync(cacheFilePath, 'utf8');
                const videos = JSON.parse(data);
                
                videoCache = new Map(videos.map(v => [v.path, v]));
                videoArray = videos;
                
                console.log(`Loaded ${videoCache.size} videos from cache.`);
                videoArray.sort((a, b) => a.path.localeCompare(b.path));
                return;
            }
        } catch (err) {
            console.log('Failed to read cache, rescanning...', err);
        }
    } else {
        console.log('video_cache.json not found, initiating scan...');
    }
    
    scanAndCacheVideos();
}

function scanAndCacheVideos() {
    console.log('Scanning videos directory (reading tags may take a few minutes)...');
    const videosDir = path.join(__dirname, 'videos');
    const tempCache = [];

    function readDir(dir) {
        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                try {
                    if (!fs.existsSync(filePath)) return;

                    const stats = fs.statSync(filePath);
                    
                    if (stats.isDirectory()) {
                        readDir(filePath);
                    } else if (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv')) {
                        const relativePath = path.relative(videosDir, filePath).replace(/\\/g, '/');
                        const basePath = relativePath.replace(/\.(mp4|mp3|mkv)$/, '');
                        
                        let tags = [];
                        const tagsPath = path.join(videosDir, `${basePath}.txt`);
                        if (fs.existsSync(tagsPath)) {
                            try {
                                tags = fs.readFileSync(tagsPath, 'utf8').split(',').map(tag => tag.trim());
                            } catch (e) {}
                        }

                        let displayName = file.replace(/\.(mp4|mp3|mkv)$/, '');
                        const filenamePath = path.join(__dirname, 'filenames', `${basePath}.txt`);
                        if (fs.existsSync(filenamePath)) {
                            try { displayName = fs.readFileSync(filenamePath, 'utf8'); } catch (e) {}
                        }

                        let fileDate = '';
                        const fileDatePath = path.join(__dirname, 'filedates', `${basePath}.txt`);
                        if (fs.existsSync(fileDatePath)) {
                            try { fileDate = fs.readFileSync(fileDatePath, 'utf8'); } catch (e) {}
                        }

                        tempCache.push({
                            path: relativePath,
                            basePath: basePath,
                            tags: tags,
                            displayName: displayName,
                            fileDate: fileDate
                        });
                    }
                } catch (err) {
                    console.error(`Error processing file ${file}:`, err.message);
                }
            });
        } catch (err) {
            console.error(`Error reading directory ${dir}:`, err.message);
        }
    }

    readDir(videosDir);
    
    try {
        fs.writeFileSync(cacheFilePath, JSON.stringify(tempCache, null, 2));
        videoCache = new Map(tempCache.map(v => [v.path, v]));
        videoArray = tempCache;
        videoArray.sort((a, b) => a.path.localeCompare(b.path));
        console.log(`Scan complete. Cached ${videoArray.length} videos.`);
        
        buildRecommendationIndex();
    } catch (err) {
        console.error('Error writing cache file:', err);
    }
}

function buildRecommendationIndex() {
    console.log('Building recommendation index...');
    const index = {};
    
    videoArray.forEach(video => {
        const channel = video.path.split('/')[0];
        
        if (channel) {
            if (!index[channel]) {
                index[channel] = [];
            }
            index[channel].push(video.path);
        }
        
        if (video.tags && video.tags.length > 0) {
            video.tags.forEach(tag => {
                const cleanTag = tag.trim();
                if (cleanTag) {
                    if (!index[cleanTag]) {
                        index[cleanTag] = [];
                    }
                    index[cleanTag].push(video.path);
                }
            });
        }
    });
    
    fs.writeFileSync(recommendationIndexPath, JSON.stringify(index, null, 2));
    recommendationIndex = index;
    console.log('Recommendation index built successfully with ' + Object.keys(index).length + ' tags');
}

function initializeRecommendationIndex() {
    if (fs.existsSync(recommendationIndexPath)) {
        try {
            const data = fs.readFileSync(recommendationIndexPath, 'utf8');
            recommendationIndex = JSON.parse(data);
            console.log('Loaded recommendation index with ' + Object.keys(recommendationIndex).length + ' tags');
        } catch (err) {
            console.log('Failed to load recommendation index, rebuilding...');
            buildRecommendationIndex();
        }
    } else {
        console.log('recommendation_index.json not found, building...');
        buildRecommendationIndex();
    }
}

// --- LOAD CHANNEL HOME PREVIEW STATS ---
const channelHomePreviewDir = path.join(__dirname, 'channel-home-previews');
if (fs.existsSync(channelHomePreviewDir)) {
    try {
        const previewFiles = fs.readdirSync(channelHomePreviewDir).filter(f => f.endsWith('.json'));
        console.log(`Loaded ${previewFiles.length} channel home previews.`);
    } catch (err) {
        console.error('Error reading channel home previews:', err);
    }
} else {
    console.log('No channel home previews found. Run the Python generator script.');
}
app.use('/channel-home-previews', express.static(channelHomePreviewDir));

// --- SHORT LINK SYSTEM ---
const shortLinksFilePath = path.join(__dirname, 'shortlinks.json');
let shortLinksMap = new Map();       // video path -> short code
let shortCodeToVideoMap = new Map(); // short code -> video path
const SHORT_CODE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateShortCode() {
    let code;
    do {
        code = '';
        for (let i = 0; i < 7; i++) {
            code += SHORT_CODE_CHARS.charAt(Math.floor(Math.random() * SHORT_CODE_CHARS.length));
        }
    } while (shortCodeToVideoMap.has(code));
    return code;
}

function initializeShortLinks() {
    // Load existing short links from file
    if (fs.existsSync(shortLinksFilePath)) {
        try {
            const data = fs.readFileSync(shortLinksFilePath, 'utf8');
            const links = JSON.parse(data);
            for (const [videoPath, code] of Object.entries(links)) {
                shortLinksMap.set(videoPath, code);
                shortCodeToVideoMap.set(code, videoPath);
            }
            console.log(`Loaded ${shortLinksMap.size} short links.`);
        } catch (err) {
            console.error('Error loading short links:', err);
            shortLinksMap.clear();
            shortCodeToVideoMap.clear();
        }
    } else {
        console.log('shortlinks.json not found, will generate new links.');
    }

    // Generate short codes for any videos that don't have one yet
    let newCodesGenerated = 0;
    videoArray.forEach(video => {
        if (!shortLinksMap.has(video.path)) {
            const code = generateShortCode();
            shortLinksMap.set(video.path, code);
            shortCodeToVideoMap.set(code, video.path);
            newCodesGenerated++;
        }
    });

    // Save to disk if any new codes were generated
    if (newCodesGenerated > 0) {
        const obj = {};
        shortLinksMap.forEach((code, videoPath) => { obj[videoPath] = code; });
        fs.writeFileSync(shortLinksFilePath, JSON.stringify(obj, null, 2));
        console.log(`Generated ${newCodesGenerated} new short links. Total: ${shortLinksMap.size}`);
    }
}

initializeVideoCache();
initializeShortLinks();
initializeRecommendationIndex();
loadPlaylistThumbnailCache();

// --- LOAD CHANNEL HOME META CACHE ---
const channelHomeMetaCacheDir = path.join(__dirname, 'channel-home-meta-cache');
if (fs.existsSync(channelHomeMetaCacheDir)) {
    try {
        const metaFiles = fs.readdirSync(channelHomeMetaCacheDir).filter(f => f.endsWith('.json'));
        console.log(`Loaded ${metaFiles.length} channel home meta caches.`);
    } catch (err) {
        console.error('Error reading channel home meta caches:', err);
    }
}
app.use('/channel-home-meta-cache', express.static(channelHomeMetaCacheDir));

// --- PLAYLIST SHORT LINK SYSTEM (INITIALIZATION) ---
function initializePlaylistShortLinks() {
    // 1. Load existing links from file
    if (fs.existsSync(PLAYLIST_SHORT_FILE)) {
        try {
            const data = fs.readFileSync(PLAYLIST_SHORT_FILE, 'utf8');
            const links = JSON.parse(data);
            for (const [name, code] of Object.entries(links)) {
                playlistShortMap.set(name, code);
                shortCodeToPlaylistMap.set(code, name);
            }
            console.log(`Loaded ${playlistShortMap.size} playlist short links from file.`);
        } catch (err) {
            console.error('Error loading playlist links:', err);
        }
    }

    // 2. Scan Video Cache and Generate Missing Links
    let newCodesGenerated = 0;
    const playlistsFound = new Set();

    // videoArray is now defined because this runs after initializeVideoCache()
    videoArray.forEach(video => {
        const parts = video.path.split('/');
        if (parts.length > 2) {
            const playlistName = parts.slice(1, -1).join('/'); 
            if (playlistName) {
                playlistsFound.add(playlistName);
            }
        }
    });

    playlistsFound.forEach(playlistName => {
        if (!playlistShortMap.has(playlistName)) {
            const code = generatePlaylistShortCode();
            if (code) {
                playlistShortMap.set(playlistName, code);
                shortCodeToPlaylistMap.set(code, playlistName);
                newCodesGenerated++;
            }
        }
    });

    if (newCodesGenerated > 0) {
        savePlaylistLinksToFile();
        console.log(`Generated ${newCodesGenerated} new playlist short links. Total: ${playlistShortMap.size}`);
    } else {
        console.log(`Playlist short link index up to date. Total: ${playlistShortMap.size}`);
    }
}

// Run playlist shortlink initialization
initializePlaylistShortLinks();

function getVideoDetails(videoSlice) {
    return videoSlice.map(video => {
        const viewCountPath = path.join(__dirname, 'viewcounts', `${video.basePath}.txt`);
        
        let viewCount = '0';
        try { if (fs.existsSync(viewCountPath)) viewCount = fs.readFileSync(viewCountPath, 'utf8'); } catch (e) {}

        return {
            path: video.path,
            viewCount: viewCount,
            fileDate: video.fileDate || '',
            displayName: video.displayName || video.path,
            tags: video.tags || []
        };
    });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- HELPER FOR USER MANAGEMENT ---
function findUserByUsername(username) {
    const usersFilePath = path.join(__dirname, 'users.json');
    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const usersData = JSON.parse(data);
        return usersData[username];
    } catch (e) {
        return null;
    }
}

// --- SETTINGS ROUTES ---

// Get User Preferences for Editing
app.get('/get-preferences', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    try {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        const allPrefs = JSON.parse(data);
        const userPrefs = allPrefs[userId] || {};
        res.json(userPrefs);
    } catch (err) {
        res.status(500).send('Error reading preferences');
    }
});

// Reset Preferences
app.post('/reset-preferences', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    try {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        const allPrefs = JSON.parse(data);
        delete allPrefs[userId];
        fs.writeFileSync(preferencesFilePath, JSON.stringify(allPrefs, null, 2));
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send('Error resetting preferences');
    }
});

// Update Single Preference Tag
app.post('/update-preference-tag', (req, res) => {
    const { tag, value } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    if (!tag) return res.status(400).send('Tag is required');

    try {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        const allPrefs = JSON.parse(data);
        if (!allPrefs[userId]) allPrefs[userId] = {};
        
        allPrefs[userId][tag] = parseInt(value) || 0;
        fs.writeFileSync(preferencesFilePath, JSON.stringify(allPrefs, null, 2));
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send('Error updating preference');
    }
});

// Rename Account
app.post('/rename-account', (req, res) => {
    const { newUsername } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!newUsername) return res.status(400).send('New username is required');

    const usersFilePath = path.join(__dirname, 'users.json');

    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const usersData = JSON.parse(data);

        // Check if new username exists
        if (usersData[newUsername]) {
            return res.status(409).send('Username already exists');
        }

        // Find current user
        let currentUsername = null;
        for (const [name, user] of Object.entries(usersData)) {
            if (user.id === userId) {
                currentUsername = name;
                break;
            }
        }

        if (!currentUsername) {
            return res.status(404).send('User not found');
        }

        // Rename
        usersData[newUsername] = usersData[currentUsername];
        delete usersData[currentUsername];

        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send('Error renaming account');
    }
});

// Reset Password
app.post('/reset-password', (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    const usersFilePath = path.join(__dirname, 'users.json');

    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const usersData = JSON.parse(data);

        // Find user
        let username = null;
        let user = null;
        for (const [name, u] of Object.entries(usersData)) {
            if (u.id === userId) {
                username = name;
                user = u;
                break;
            }
        }

        if (!user) return res.status(404).send('User not found');

        // Verify current password
        if (!bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(403).send('Incorrect current password');
        }

        // Update password
        user.password = bcrypt.hashSync(newPassword, 10);
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send('Error resetting password');
    }
});

// --- USER SETTINGS SYSTEM ---
const userSettingsFilePath = path.join(__dirname, 'userSettings.json');

function ensureUserSettingsFile() {
    if (!fs.existsSync(userSettingsFilePath)) {
        fs.writeFileSync(userSettingsFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(userSettingsFilePath, 'utf8');
        try { JSON.parse(data); } catch (err) { fs.writeFileSync(userSettingsFilePath, JSON.stringify({})); }
    }
}

ensureUserSettingsFile();

// Get user settings (language, appearance, etc.)
app.get('/user-settings', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    try {
        const data = fs.readFileSync(userSettingsFilePath, 'utf8');
        const allSettings = JSON.parse(data);
        res.json(allSettings[userId] || {});
    } catch (err) {
        res.status(500).send('Error reading settings');
    }
});

// Save user settings
app.post('/user-settings', (req, res) => {
    const { settings } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    if (!settings || typeof settings !== 'object') {
        return res.status(400).send('Invalid settings object');
    }

    try {
        const data = fs.readFileSync(userSettingsFilePath, 'utf8');
        const allSettings = JSON.parse(data);
        allSettings[userId] = settings;
        fs.writeFileSync(userSettingsFilePath, JSON.stringify(allSettings, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error('Error saving user settings:', err);
        res.status(500).send('Error saving settings');
    }
});

// Get Autoplay Settings
app.get('/autoplay-settings', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    try {
        const data = fs.readFileSync(userSettingsFilePath, 'utf8');
        const allSettings = JSON.parse(data);
        const userSettings = allSettings[userId] || {};
        res.json(userSettings.autoplay || {});
    } catch (err) {
        res.status(500).send('Error reading autoplay settings');
    }
});

// Save Autoplay Settings
app.post('/autoplay-settings', (req, res) => {
    const { autoplay } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    if (!autoplay || typeof autoplay !== 'object') {
        return res.status(400).send('Invalid autoplay settings object');
    }

    try {
        const data = fs.readFileSync(userSettingsFilePath, 'utf8');
        const allSettings = JSON.parse(data);
        if (!allSettings[userId]) allSettings[userId] = {};
        allSettings[userId].autoplay = autoplay;
        fs.writeFileSync(userSettingsFilePath, JSON.stringify(allSettings, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error('Error saving autoplay settings:', err);
        res.status(500).send('Error saving autoplay settings');
    }
});

// Also clean up user settings when deleting account
app.post('/delete-account', (req, res) => {
    const { password } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    if (!password) return res.status(400).send('Password is required');

    const usersFilePath = path.join(__dirname, 'users.json');

    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const usersData = JSON.parse(data);

        // Find user and verify password
        let username = null;
        let user = null;
        for (const [name, u] of Object.entries(usersData)) {
            if (u.id === userId) {
                username = name;
                user = u;
                break;
            }
        }

        if (!user) return res.status(404).send('User not found');

        // Verify password before deletion
        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(403).send('Incorrect password');
        }

        // Remove from users.json
        delete usersData[username];
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

        // Remove preferences
        if (fs.existsSync(preferencesFilePath)) {
            const prefData = fs.readFileSync(preferencesFilePath, 'utf8');
            const allPrefs = JSON.parse(prefData);
            if (allPrefs[userId]) {
                delete allPrefs[userId];
                fs.writeFileSync(preferencesFilePath, JSON.stringify(allPrefs, null, 2));
            }
        }

        // Remove user settings (language, appearance)
        if (fs.existsSync(userSettingsFilePath)) {
            const settingsData = fs.readFileSync(userSettingsFilePath, 'utf8');
            const allSettings = JSON.parse(settingsData);
            if (allSettings[userId]) {
                delete allSettings[userId];
                fs.writeFileSync(userSettingsFilePath, JSON.stringify(allSettings, null, 2));
            }
        }

        // Remove profile picture
        const profilePicPath = path.join(userProfileDir, `${userId}.jpg`);
        if (fs.existsSync(profilePicPath)) {
            fs.unlinkSync(profilePicPath);
        }

        // Destroy session
        req.session.destroy(err => {
            if (err) return res.status(500).send('Error deleting session');
            res.sendStatus(200);
        });

    } catch (err) {
        res.status(500).send('Error deleting account');
    }
});

// --- PROFILE PICTURE ROUTES ---

// Ensure user-profiles directory exists
const userProfileDir = path.join(__dirname, 'user-profiles');
if (!fs.existsSync(userProfileDir)) {
    fs.mkdirSync(userProfileDir, { recursive: true });
}

// Get current user's profile picture URL
app.get('/user-profile-pic', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.json({ hasCustomPic: false, picUrl: null });
    }

    const profilePicPath = path.join(userProfileDir, `${userId}.jpg`);
    if (fs.existsSync(profilePicPath)) {
        res.json({ hasCustomPic: true, picUrl: `/user-profiles/${userId}.jpg` });
    } else {
        res.json({ hasCustomPic: false, picUrl: null });
    }
});

// Upload profile picture (with cropping and resizing)
app.post('/user-profile-pic', upload.single('profilePic'), async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not logged in');

    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const uploadedFile = req.file;
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedMimes.includes(uploadedFile.mimetype)) {
        // Clean up temp file
        fs.unlink(uploadedFile.path, () => {});
        return res.status(400).send('Only JPEG, PNG, and WebP images are allowed');
    }

    // Limit to 5MB
    if (uploadedFile.size > 5 * 1024 * 1024) {
        fs.unlink(uploadedFile.path, () => {});
        return res.status(400).send('Image must be under 5MB');
    }

    const targetPath = path.join(userProfileDir, `${userId}.jpg`);
    const tempPath = uploadedFile.path;

    try {
        // Extract crop data from body
        const { x, y, width, height } = req.body;
        
        let sharpInstance = sharp(tempPath);

        // If cropping data is provided, extract that region
        if (x && y && width && height) {
            const cropX = parseInt(x);
            const cropY = parseInt(y);
            const cropW = parseInt(width);
            const cropH = parseInt(height);

            // Ensure valid dimensions
            if (cropW > 0 && cropH > 0) {
                sharpInstance = sharpInstance.extract({
                    left: cropX,
                    top: cropY,
                    width: cropW,
                    height: cropH
                });
            }
        }

        // Resize to 500x500 and convert to JPEG
        await sharpInstance
            .resize(500, 500)
            .jpeg({ quality: 90 })
            .toFile(targetPath);

        // Clean up the temp file
        fs.unlink(tempPath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });

        res.sendStatus(200);

    } catch (err) {
        console.error('Error processing image:', err);
        // Clean up temp file on error
        fs.unlink(tempPath, () => {});
        res.status(500).send('Error processing image');
    }
});

// Delete profile picture (revert to placeholder)
app.delete('/user-profile-pic', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not logged in');

    const profilePicPath = path.join(userProfileDir, `${userId}.jpg`);
    if (fs.existsSync(profilePicPath)) {
        fs.unlinkSync(profilePicPath);
    }
    res.sendStatus(200);
});

// GET ALL TAGS (For settings suggestion list)
app.get('/get-all-tags', (req, res) => {
    // Returns keys from the recommendation index (channels + tags)
    res.json(Object.keys(recommendationIndex));
});

// SAVE PREFERENCES (Bulk Overwrite)
app.post('/save-preferences', (req, res) => {
    const { preferences } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    try {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        const allPrefs = JSON.parse(data);
        
        // Overwrite user preferences
        allPrefs[userId] = preferences;
        
        // Clear the memory queue for this user to prevent old queued updates 
        // from overwriting this manual save
        if (preferenceUpdateQueue.has(userId)) {
            preferenceUpdateQueue.delete(userId);
        }

        fs.writeFileSync(preferencesFilePath, JSON.stringify(allPrefs, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error saving preferences');
    }
});

app.get('/videos', (req, res) => {
    const shuffled = [...videoArray];
    shuffleArray(shuffled);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const pageVideos = shuffled.slice(startIndex, endIndex);
    const videosWithDetails = getVideoDetails(pageVideos);

    res.json({
        videos: videosWithDetails,
        page: page,
        limit: limit,
        total: videoArray.length,
        hasMore: endIndex < videoArray.length
    });
});

// --- SIDEBAR RECOMMENDATIONS (AGGRESSIVE CHANNEL PRIORITY) ---
app.get('/sidebar-recommendations', recommendationsLimiter, (req, res) => {
    const currentVideoPath = req.query.video;
    const userId = req.session.userId;

    if (!currentVideoPath) {
        return res.status(400).send('Missing video parameter');
    }

    const currentVideo = videoCache.get(currentVideoPath);
    if (!currentVideo) {
        return res.status(404).send('Current video not found');
    }

    const limit = parseInt(req.query.limit) || 20;
    const currentChannel = currentVideoPath.split('/')[0];
    
    const addedPaths = new Set();
    addedPaths.add(currentVideoPath); // Prevent watching the exact same video

    const finalRecommendations = [];

    // Helper to add unique videos
    const addVideos = (videos, count, forceShuffle = true) => {
        let pool = videos.filter(v => !addedPaths.has(v.path));
        if (forceShuffle) shuffleArray(pool);
        
        const taken = [];
        for (const v of pool) {
            if (taken.length >= count) break;
            addedPaths.add(v.path);
            taken.push(v);
        }
        return taken;
    };

    // --- 1. CURRENT CHANNEL VIDEOS (TOP PRIORITY) ---
    // Allocate 50% of the sidebar strictly to the current channel
    const channelQuota = Math.floor(limit * 0.1); 
    
    let sameChannelVideos = [];
    if (recommendationIndex[currentChannel]) {
        recommendationIndex[currentChannel].forEach(vPath => {
            if (!addedPaths.has(vPath)) {
                const vData = videoCache.get(vPath);
                if (vData) sameChannelVideos.push(vData);
            }
        });
    }
    
    // Shuffle channel videos so it's not always the same ones, but add them FIRST
    shuffleArray(sameChannelVideos);
    const channelToAdd = sameChannelVideos.slice(0, channelQuota);
    
    channelToAdd.forEach(v => {
        finalRecommendations.push(v);
        addedPaths.add(v.path);
    });

    // --- 2. SIMILAR POOL (TAGS) ---
    const remainingSlots = limit - finalRecommendations.length;
    const similarTarget = Math.floor(remainingSlots * 0.7);

    let similarPool = [];
    const currentTags = currentVideo.tags || [];

    currentTags.forEach(tag => {
        const cleanTag = tag.trim();
        if (recommendationIndex[cleanTag]) {
            recommendationIndex[cleanTag].forEach(vPath => {
                if (!addedPaths.has(vPath)) {
                    const vData = videoCache.get(vPath);
                    if (vData) similarPool.push(vData);
                }
            });
        }
    });

    // Deduplicate similar pool
    const uniqueSimilarPool = [];
    const seenSim = new Set();
    similarPool.forEach(v => {
        if (!seenSim.has(v.path)) {
            seenSim.add(v.path);
            uniqueSimilarPool.push(v);
        }
    });

    shuffleArray(uniqueSimilarPool);
    const similarToAdd = uniqueSimilarPool.slice(0, similarTarget);
    
    similarToAdd.forEach(v => {
        finalRecommendations.push(v);
        addedPaths.add(v.path);
    });

    // --- 3. PREFERENCE POOL ---
    const prefTarget = limit - finalRecommendations.length;
    
    let preferencePool = [];
    
    if (userId && fs.existsSync(preferencesFilePath)) {
        try {
            const data = fs.readFileSync(preferencesFilePath, 'utf8');
            const prefData = JSON.parse(data);
            const userPrefs = prefData[userId] || {};

            const sortedTags = Object.entries(userPrefs)
                .sort((a, b) => b[1] - a[1])
                .map(t => t[0]);

            for (const tag of sortedTags) {
                if (recommendationIndex[tag]) {
                    recommendationIndex[tag].forEach(vPath => {
                        if (!addedPaths.has(vPath)) {
                            const vData = videoCache.get(vPath);
                            if (vData) preferencePool.push(vData);
                        }
                    });
                }
            }
            
            const seenPref = new Set();
            const uniquePrefPool = [];
            preferencePool.forEach(v => {
                if (!seenPref.has(v.path)) {
                    seenPref.add(v.path);
                    uniquePrefPool.push(v);
                }
            });
            preferencePool = uniquePrefPool;

        } catch (e) {
            console.error("Error reading preferences for sidebar", e);
        }
    }

    shuffleArray(preferencePool);
    const prefToAdd = preferencePool.slice(0, prefTarget);

    prefToAdd.forEach(v => {
        finalRecommendations.push(v);
        addedPaths.add(v.path);
    });

    // --- 4. BACKFILL ---
    if (finalRecommendations.length < limit) {
        const allVideos = [...videoCache.values()];
        const backfill = addVideos(allVideos, limit - finalRecommendations.length);
        finalRecommendations.push(...backfill);
    }

    res.json(getVideoDetails(finalRecommendations));
});

app.get('/videostats/:video', (req, res) => {
    const video = req.params.video.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '');
    const filePath = path.join(__dirname, 'videostats', `${video}.txt`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(404).send('File not found');
        res.send(data);
    });
});

app.post('/like', (req, res) => {
    const { video, isLiked } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const likesFilePath = path.join(__dirname, 'likes.json');
    fs.readFile(likesFilePath, 'utf8', (err, data) => {
        let likesData = {};
        if (!err) likesData = JSON.parse(data);
        if (!likesData[userId]) likesData[userId] = {};
        likesData[userId][video] = isLiked;
        fs.writeFile(likesFilePath, JSON.stringify(likesData, null, 2), err => {
            if (err) return res.status(500).send('Error saving likes');
            res.sendStatus(200);
        });
    });
});

app.post('/dislike', (req, res) => {
    const { video, isDisliked } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const dislikesFilePath = path.join(__dirname, 'dislikes.json');
    fs.readFile(dislikesFilePath, 'utf8', (err, data) => {
        let dislikesData = {};
        if (!err) dislikesData = JSON.parse(data);
        if (!dislikesData[userId]) dislikesData[userId] = {};
        dislikesData[userId][video] = isDisliked;
        fs.writeFile(dislikesFilePath, JSON.stringify(dislikesData, null, 2), err => {
            if (err) return res.status(500).send('Error saving dislikes');
            res.sendStatus(200);
        });
    });
});

app.get('/user-likes', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const likesFilePath = path.join(__dirname, 'likes.json');
    fs.readFile(likesFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading likes');
        const likesData = JSON.parse(data);
        res.json(likesData[userId] || {});
    });
});

app.get('/user-dislikes', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const dislikesFilePath = path.join(__dirname, 'dislikes.json');
    fs.readFile(dislikesFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading dislikes');
        const dislikesData = JSON.parse(data);
        res.json(dislikesData[userId] || {});
    });
});

app.get('/api/comments', (req, res) => {
    const videoPath = req.query.video;
    if (!videoPath) return res.json([]);

    const basePath = decodeURIComponent(videoPath).replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i, '');
    const filePath = path.join(__dirname, 'comments', basePath + '.json');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try {
            const comments = JSON.parse(data);
            res.json(comments);
        } catch (e) {
            res.json([]);
        }
    });
});

// --- COMMENT LIKES SYSTEM ---

// Like a comment
app.post('/like-comment', (req, res) => {
    const { commentId } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    if (!commentId) return res.status(400).send('Comment ID is required');

    const commentLikesFilePath = path.join(__dirname, 'userCommentLikes.json');
    
    fs.readFile(commentLikesFilePath, 'utf8', (err, data) => {
        let likesData = {};
        if (!err && data) {
            try {
                likesData = JSON.parse(data);
            } catch (e) {
                likesData = {};
            }
        }
        
        if (!likesData[userId]) likesData[userId] = {};
        
        // Toggle: if already liked, unlike; otherwise like
        const isCurrentlyLiked = likesData[userId][commentId] === true;
        likesData[userId][commentId] = !isCurrentlyLiked;
        
        fs.writeFile(commentLikesFilePath, JSON.stringify(likesData, null, 2), err => {
            if (err) return res.status(500).send('Error saving comment like');
            res.json({ isLiked: !isCurrentlyLiked });
        });
    });
});

// Get current user's comment likes
app.get('/user-comment-likes', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    
    const commentLikesFilePath = path.join(__dirname, 'userCommentLikes.json');
    fs.readFile(commentLikesFilePath, 'utf8', (err, data) => {
        if (err) return res.json({});
        try {
            const likesData = JSON.parse(data);
            res.json(likesData[userId] || {});
        } catch (e) {
            res.json({});
        }
    });
});

// ========== PLAYLIST ROUTES ==========

app.get('/user-playlists', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
    fs.readFile(playlistsFilePath, 'utf8', (err, data) => {
        if (err) return res.json({});
        try {
            const allPlaylists = JSON.parse(data);
            res.json(allPlaylists[userId] || {});
        } catch (e) {
            res.json({});
        }
    });
});

app.get('/user-playlist-details', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
    fs.readFile(playlistsFilePath, 'utf8', (err, data) => {
        let allPlaylists = {};
        if (!err) {
            try { allPlaylists = JSON.parse(data); } catch (e) {}
        }
        const userPlaylists = allPlaylists[userId] || {};
        const result = {};
        for (const [name, videos] of Object.entries(userPlaylists)) {
            const validVideos = videos.filter(vPath => videoCache.has(vPath));
            result[name] = validVideos.map(vPath => {
                const video = videoCache.get(vPath);
                return getVideoDetails([video])[0];
            });
        }
        res.json(result);
    });
});

app.post('/create-playlist', (req, res) => {
    const { name } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    if (!name || !name.trim()) return res.status(400).send('Playlist name is required');
    const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
    fs.readFile(playlistsFilePath, 'utf8', (err, data) => {
        let allPlaylists = {};
        if (!err) {
            try { allPlaylists = JSON.parse(data); } catch (e) {}
        }
        if (!allPlaylists[userId]) allPlaylists[userId] = {};
        if (allPlaylists[userId][name.trim()]) {
            return res.status(409).send('Playlist already exists');
        }
        allPlaylists[userId][name.trim()] = [];
        fs.writeFile(playlistsFilePath, JSON.stringify(allPlaylists, null, 2), err => {
            if (err) return res.status(500).send('Error saving playlist');
            res.sendStatus(200);
        });
    });
});

app.post('/save-to-playlist', (req, res) => {
    const { playlist, video } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    if (!playlist || !video) return res.status(400).send('Playlist and video are required');
    const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
    fs.readFile(playlistsFilePath, 'utf8', (err, data) => {
        let allPlaylists = {};
        if (!err) {
            try { allPlaylists = JSON.parse(data); } catch (e) {}
        }
        if (!allPlaylists[userId]) allPlaylists[userId] = {};
        if (!allPlaylists[userId][playlist]) allPlaylists[userId][playlist] = [];
        if (allPlaylists[userId][playlist].includes(video)) {
            return res.status(409).send('Video already in playlist');
        }
        allPlaylists[userId][playlist].push(video);
        fs.writeFile(playlistsFilePath, JSON.stringify(allPlaylists, null, 2), err => {
            if (err) return res.status(500).send('Error saving to playlist');
            res.sendStatus(200);
        });
    });
});

app.post('/delete-playlist', (req, res) => {
    const { name } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
    fs.readFile(playlistsFilePath, 'utf8', (err, data) => {
        let allPlaylists = {};
        if (!err) {
            try { allPlaylists = JSON.parse(data); } catch (e) {}
        }
        if (allPlaylists[userId] && allPlaylists[userId][name]) {
            delete allPlaylists[userId][name];
            fs.writeFile(playlistsFilePath, JSON.stringify(allPlaylists, null, 2), err => {
                if (err) return res.status(500).send('Error deleting playlist');
                res.sendStatus(200);
            });
        } else {
            res.status(404).send('Playlist not found');
        }
    });
});

app.post('/remove-from-playlist', (req, res) => {
    const { playlist, video } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
    fs.readFile(playlistsFilePath, 'utf8', (err, data) => {
        let allPlaylists = {};
        if (!err) {
            try { allPlaylists = JSON.parse(data); } catch (e) {}
        }
        if (allPlaylists[userId] && allPlaylists[userId][playlist]) {
            allPlaylists[userId][playlist] = allPlaylists[userId][playlist].filter(v => v !== video);
            fs.writeFile(playlistsFilePath, JSON.stringify(allPlaylists, null, 2), err => {
                if (err) return res.status(500).send('Error removing from playlist');
                res.sendStatus(200);
            });
        } else {
            res.status(404).send('Playlist not found');
        }
    });
});

app.get('/subcount/:channel', (req, res) => {
    const channel = req.params.channel;
    const filePath = path.join(__dirname, 'subcount', `${channel}.txt`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(404).send('File not found');
        res.send(data);
    });
});

app.get('/subcount/fuzzy/:channel', (req, res) => {
    const channel = req.params.channel;
    const filePath = path.join(__dirname, 'subcount', 'fuzzy', `${channel}.txt`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(404).send('File not found');
        res.send(data);
    });
});

// Get all subscribed channels for the current user
app.get('/user-subscriptions', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const subscriptionsFilePath = path.join(__dirname, 'subscriptions.json');
    fs.readFile(subscriptionsFilePath, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try {
            const subscriptionsData = JSON.parse(data);
            const userSubs = subscriptionsData[userId] || {};
            const subscribedChannels = Object.entries(userSubs)
                .filter(([channel, isSub]) => isSub)
                .map(([channel]) => channel);
            res.json(subscribedChannels);
        } catch (e) {
            res.json([]);
        }
    });
});

app.post('/subscribe', (req, res) => {
    const { channel, isSubscribed } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const subscriptionsFilePath = path.join(__dirname, 'subscriptions.json');
    fs.readFile(subscriptionsFilePath, 'utf8', (err, data) => {
        let subscriptionsData = {};
        if (!err) subscriptionsData = JSON.parse(data);
        if (!subscriptionsData[userId]) subscriptionsData[userId] = {};
        subscriptionsData[userId][channel] = isSubscribed;
        fs.writeFile(subscriptionsFilePath, JSON.stringify(subscriptionsData, null, 2), err => {
            if (err) return res.status(500).send('Error saving subscriptions');
            res.sendStatus(200);
        });
    });
});

// Get random videos from a specific channel
app.get('/channel-random-videos/:channel', (req, res) => {
    const channel = decodeURIComponent(req.params.channel);
    const limit = parseInt(req.query.limit) || 20;

    const channelVideos = recommendationIndex[channel];
    if (!channelVideos) return res.json([]);

    const uniquePaths = [...new Set(channelVideos)];
    const shuffled = [...uniquePaths];
    shuffleArray(shuffled);
    const selected = shuffled.slice(0, limit);

    const videosWithDetails = selected.map(vPath => {
        const video = videoCache.get(vPath);
        if (!video) return null;
        return getVideoDetails([video])[0];
    }).filter(Boolean);

    res.json(videosWithDetails);
});

app.get('/viewcounts/:video', (req, res) => {
    const video = req.params.video.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '');
    const filePath = path.join(__dirname, 'viewcounts', `${video}.txt`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(404).send('File not found');
        res.send(data);
    });
});

// --- REGISTRATION COOLDOWN SYSTEM ---
const registrationCooldowns = new Map();
const REGISTER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// Check registration cooldown status (for page load)
app.get('/register-status', (req, res) => {
    const clientIp = getClientIp(req);
    const cooldownEnd = registrationCooldowns.get(clientIp);
    
    if (cooldownEnd && Date.now() < cooldownEnd) {
        return res.json({ 
            blocked: true, 
            remainingTime: cooldownEnd - Date.now() 
        });
    }
    
    // Clean up expired cooldown
    if (cooldownEnd) registrationCooldowns.delete(clientIp);
    
    res.json({ blocked: false });
});

// Update the existing /register route to include the cooldown check
app.post('/register', (req, res) => {
    const clientIp = getClientIp(req);
    const cooldownEnd = registrationCooldowns.get(clientIp);
    
    // Check if IP is currently on cooldown
    if (cooldownEnd && Date.now() < cooldownEnd) {
        return res.status(429).json({ 
            blocked: true, 
            remainingTime: cooldownEnd - Date.now(),
            error: 'Please wait before creating another account.' 
        });
    }
    
    const { username, password } = req.body;
    const usersFilePath = path.join(__dirname, 'users.json');
    
    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        let usersData = {};
        if (!err) usersData = JSON.parse(data);
        
        if (usersData[username]) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = bcrypt.hashSync(password, 10);
        usersData[username] = { id: uuidv4(), password: hashedPassword };
        
        fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2), err => {
            if (err) return res.status(500).json({ error: 'Error saving user' });
            
            // Set cooldown for this IP on successful registration
            registrationCooldowns.set(clientIp, Date.now() + REGISTER_COOLDOWN_MS);
            
            res.sendStatus(200);
        });
    });
});

// --- LOGIN WITH BRUTE-FORCE PROTECTION ---
app.post('/login', (req, res) => {
    const clientIp = getClientIp(req);
    
    // Check if permanently blocked FIRST
    const attemptData = getLoginAttemptData(clientIp);
    if (attemptData && attemptData.permanent) {
        return res.status(403).json({ 
            error: 'You have been permanently blocked for trying to log in too many times. Contact your LocalYT owner for support.',
            permanent: true 
        });
    }
    
    // Check if temporarily blocked
    if (isIpBlocked(clientIp)) {
        const remainingTime = getRemainingBlockTime(clientIp);
        const minutes = Math.ceil(remainingTime / 60000);
        const seconds = Math.ceil((remainingTime % 60000) / 1000);
        let timeString = minutes > 0 ? `${minutes} minute(s)` : `${seconds} second(s)`;
        return res.status(429).json({ 
            error: `Too many failed login attempts. Please try again in ${timeString}.`,
            blocked: true,
            remainingTime: remainingTime
        });
    }
    
    const { username, password } = req.body;
    const usersFilePath = path.join(__dirname, 'users.json');
    
    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Error reading users' });
        
        const usersData = JSON.parse(data);
        const user = usersData[username];
        
        if (!user || !bcrypt.compareSync(password, user.password)) {
            // Record failed attempt
            recordFailedAttempt(clientIp);
            
            // Check if this attempt triggered a block
            const updatedData = getLoginAttemptData(clientIp);
            
            if (updatedData && updatedData.permanent) {
                return res.status(403).json({ 
                    error: 'You have been permanently blocked for trying to log in too many times. Contact your LocalYT owner for support.',
                    permanent: true 
                });
            }
            
            if (updatedData && updatedData.blockedUntil && Date.now() < updatedData.blockedUntil) {
                const remainingTime = updatedData.blockedUntil - Date.now();
                const minutes = Math.ceil(remainingTime / 60000);
                const seconds = Math.ceil((remainingTime % 60000) / 1000);
                let timeString = minutes > 0 ? `${minutes} minute(s)` : `${seconds} second(s)`;
                return res.status(429).json({ 
                    error: `Too many failed login attempts. Please try again in ${timeString}.`,
                    blocked: true,
                    remainingTime: remainingTime
                });
            }
            
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        // Successful login - reset attempts for this IP
        resetLoginAttempts(clientIp);
        req.session.userId = user.id;
        res.sendStatus(200);
    });
});

// --- CHECK LOGIN BLOCK STATUS (for page load) ---
app.get('/login-status', (req, res) => {
    const clientIp = getClientIp(req);
    const attemptData = getLoginAttemptData(clientIp);
    
    if (!attemptData) {
        return res.json({ blocked: false });
    }
    
    if (attemptData.permanent) {
        return res.json({ 
            blocked: true, 
            permanent: true,
            error: 'You have been permanently blocked for trying to log in too many times. Contact your LocalYT owner for support.'
        });
    }
    
    if (isIpBlocked(clientIp)) {
        const remainingTime = getRemainingBlockTime(clientIp);
        const minutes = Math.ceil(remainingTime / 60000);
        const seconds = Math.ceil((remainingTime % 60000) / 1000);
        let timeString = minutes > 0 ? `${minutes} minute(s)` : `${seconds} second(s)`;
        return res.json({ 
            blocked: true, 
            permanent: false,
            error: `Too many failed login attempts. Please try again in ${timeString}.`,
            remainingTime: remainingTime,
            attempts: attemptData.attempts
        });
    }
    
    res.json({ blocked: false, attempts: attemptData.attempts || 0 });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Error logging out');
        res.redirect('/login.html');
    });
});

app.get('/session-user', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const usersFilePath = path.join(__dirname, 'users.json');
    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Error reading users' });
        
        try {
            const usersData = JSON.parse(data);
            const username = Object.keys(usersData).find(key => usersData[key].id === userId);
            
            if (username) {
                res.json({ 
                    username: username, 
                    id: userId 
                });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        } catch (e) {
             res.status(500).json({ error: 'Server error' });
        }
    });
});

// Batch preference update system
const preferenceUpdateQueue = new Map();
let preferenceUpdateTimer = null;

function batchUpdatePreferences() {
    if (preferenceUpdateQueue.size === 0) return;
    
    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        let preferencesData = {};
        if (!err) preferencesData = JSON.parse(data);
        
        preferenceUpdateQueue.forEach((tags, userId) => {
            if (!preferencesData[userId]) preferencesData[userId] = {};
            tags.forEach(tag => {
                preferencesData[userId][tag] = (preferencesData[userId][tag] || 0) + 1;
            });
        });
        
        fs.writeFile(preferencesFilePath, JSON.stringify(preferencesData, null, 2), (err) => {
            if (err) console.error('Error saving preferences:', err);
            preferenceUpdateQueue.clear();
        });
    });
}

app.post('/updatePreferences', (req, res) => {
    const { video } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    
    const videoData = videoCache.get(video);
    if (!videoData || !videoData.tags) return res.status(404).send('Video tags not found');

    const videoTags = videoData.tags;

    if (!preferenceUpdateQueue.has(userId)) {
        preferenceUpdateQueue.set(userId, new Set());
    }
    
    videoTags.forEach(tag => {
        preferenceUpdateQueue.get(userId).add(tag);
    });
    
    if (preferenceUpdateTimer) clearTimeout(preferenceUpdateTimer);
    preferenceUpdateTimer = setTimeout(batchUpdatePreferences, 5000);
    
    res.json({ queued: true, message: 'Preference update queued' });
});


app.get('/recommendations', recommendationsLimiter, (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading preferences');
        
        try {
            const preferencesData = JSON.parse(data);
            const userPreferences = preferencesData[userId] || {};

            // --- FALLBACK LOGIC: Check if user has preferences ---
            const hasPreferences = Object.keys(userPreferences).length > 0;

            // If user has NO preferences, return random videos (like guest mode but authenticated)
            if (!hasPreferences) {
                console.log(`User ${userId} has no preferences, returning random videos.`);
                
                // Create a shuffled copy of all videos
                const allVideos = [...videoCache.values()];
                shuffleArray(allVideos);

                // Paginate the shuffled results
                const paginatedVideos = allVideos.slice(startIndex, endIndex);
                const result = getVideoDetails(paginatedVideos);

                return res.json({
                    videos: result,
                    page: page,
                    limit: limit,
                    total: videoArray.length,
                    hasMore: endIndex < videoArray.length
                });
            }

            // --- NORMAL LOGIC: User has preferences ---
            const sortedTags = Object.entries(userPreferences)
                .map(([tag, weight]) => ({ tag, weight }))
                .sort((a, b) => b.weight - a.weight);
            
            const videoMap = new Map();
            
            const highPriorityTags = sortedTags.filter(t => t.weight >= 100);
            const mediumPriorityTags = sortedTags.filter(t => t.weight >= 50 && t.weight < 100);
            
            highPriorityTags.forEach(({ tag }) => {
                const tagVideos = recommendationIndex[tag] || [];
                tagVideos.forEach(videoPath => {
                    if (!videoMap.has(videoPath)) {
                        const video = videoCache.get(videoPath);
                        if (video) {
                            videoMap.set(videoPath, {
                                video,
                                sourceTag: tag
                            });
                        }
                    }
                });
            });
            
            const videosByTag = new Map();
            videoMap.forEach((value, p) => {
                if (!videosByTag.has(value.sourceTag)) {
                    videosByTag.set(value.sourceTag, []);
                }
                videosByTag.get(value.sourceTag).push(value.video);
            });
            
            const resultVideos = [];
            
            if (page === 1) {
                const topPriorityTag = "Modern Vintage Gamer"; // Example priority tag
                const otherHighPriorityTags = highPriorityTags
                    .map(t => t.tag)
                    .filter(tag => tag !== topPriorityTag);
                
                const mvgVideos = videosByTag.get(topPriorityTag) || [];
                shuffleArray(mvgVideos);
                resultVideos.push(...mvgVideos.slice(0, 4));
                
                const otherHighVideos = [];
                otherHighPriorityTags.forEach(tag => {
                    const tagVideos = videosByTag.get(tag) || [];
                    shuffleArray(tagVideos);
                    if (tagVideos.length > 0) {
                        const takeCount = Math.min(2, Math.ceil(tagVideos.length / 100));
                        otherHighVideos.push(...tagVideos.slice(0, takeCount));
                    }
                });
                shuffleArray(otherHighVideos);
                resultVideos.push(...otherHighVideos.slice(0, 4));
                
                const mediumVideos = [];
                mediumPriorityTags.forEach(tag => {
                    const tagVideos = videosByTag.get(tag.tag) || [];
                    shuffleArray(tagVideos);
                    if (tagVideos.length > 0) {
                        mediumVideos.push(...tagVideos.slice(0, 1));
                    }
                });
                shuffleArray(mediumVideos);
                resultVideos.push(...mediumVideos.slice(0, 4));
                
                const allVideos = Array.from(videoMap.values()).map(v => v.video);
                shuffleArray(allVideos);
                
                const weightedRemaining = [];
                allVideos.forEach(video => {
                    let videoWeight = 0;
                    for (const tag of highPriorityTags) {
                        if (video.tags && video.tags.includes(tag.tag)) {
                            videoWeight = tag.weight;
                            break;
                        }
                    }
                    weightedRemaining.push({ video, weight: videoWeight });
                });
                
                weightedRemaining.sort((a, b) => b.weight - a.weight);
                
                const candidates = weightedRemaining.slice(0, 50);
                shuffleArray(candidates);
                resultVideos.push(...candidates.slice(0, 8).map(c => c.video));
                
            } else {
                const allVideos = Array.from(videoMap.values()).map(v => v.video);
                
                const weightedVideos = allVideos.map(video => {
                    let weight = 1;
                    for (const tag of highPriorityTags) {
                        if (video.tags && video.tags.includes(tag.tag)) {
                            weight = tag.weight;
                            break;
                        }
                    }
                    return { video, weight };
                });
                
                for (let i = weightedVideos.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [weightedVideos[i], weightedVideos[j]] = [weightedVideos[j], weightedVideos[i]];
                }
                
                weightedVideos.sort((a, b) => b.weight - a.weight);
                
                const paginatedVideos = weightedVideos
                    .slice(startIndex, endIndex)
                    .map(item => item.video);
                
                resultVideos.push(...paginatedVideos);
            }
            
            const uniqueVideos = [];
            const seen = new Set();
            resultVideos.forEach(video => {
                if (!seen.has(video.path)) {
                    seen.add(video.path);
                    uniqueVideos.push(video);
                }
            });

            // --- BACKFILL / EMPTY CHECK ---
            if (uniqueVideos.length === 0) {
                const allVideos = [...videoCache.values()];
                shuffleArray(allVideos);
                const paginatedVideos = allVideos.slice(startIndex, endIndex);
                const result = getVideoDetails(paginatedVideos);
                return res.json({
                    videos: result,
                    page: page,
                    limit: limit,
                    total: videoArray.length,
                    hasMore: endIndex < videoArray.length
                });
            }

            const result = getVideoDetails(uniqueVideos);
            
            res.json({
                videos: result,
                page: page,
                limit: limit,
                total: videoMap.size,
                hasMore: endIndex < videoMap.size
            });
            
        } catch (err) {
            console.error('Error generating recommendations:', err);
            return res.status(500).send('Error generating recommendations');
        }
    });
});

app.get('/top-categories', recommendationsLimiter, (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    
    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading preferences');
        
        try {
            const preferencesData = JSON.parse(data);
            const userPreferences = preferencesData[userId] || {};
            
            const sortedPreferences = Object.entries(userPreferences)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(entry => entry[0]);
            
            res.json(sortedPreferences);
        } catch (err) {
            return res.status(500).send('Error parsing preferences data');
        }
    });
});

app.get('/channel-playlists/:channel', (req, res) => {
    const channel = req.params.channel;
    const videosDir = path.join(__dirname, 'videos', channel);
    if (!fs.existsSync(videosDir)) return res.json([]);
    
    const playlists = [];
    
    function scanForPlaylists(dir, basePath = '') {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const itemPath = path.join(dir, item);
            const relativePath = basePath ? `${basePath}/${item}` : item;
            if (fs.statSync(itemPath).isDirectory()) {
                const playlistVideos = [];
                function countVideosInPlaylist(playlistDir) {
                    const files = fs.readdirSync(playlistDir);
                    files.forEach(file => {
                        const filePath = path.join(playlistDir, file);
                        if (fs.statSync(filePath).isFile() && (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv'))) {
                            playlistVideos.push(file);
                        } else if (fs.statSync(filePath).isDirectory()) {
                            countVideosInPlaylist(filePath);
                        }
                    });
                }
                countVideosInPlaylist(itemPath);
                if (playlistVideos.length > 0) {
                    // Look up thumbnail from cache instead of doing it on the frontend
                    let thumbnail = null;
                    const cacheKey = `${channel}/${relativePath}`;
                    if (playlistThumbnailCache[cacheKey]) {
                        thumbnail = playlistThumbnailCache[cacheKey];
                    }
                    
                    playlists.push({ 
                        name: item, 
                        path: relativePath, 
                        videoCount: playlistVideos.length, 
                        fullPath: itemPath,
                        thumbnail: thumbnail
                    });
                }
                scanForPlaylists(itemPath, relativePath);
            }
        });
    }
    scanForPlaylists(videosDir);
    res.json(playlists);
});

app.get('/playlist-videos/:channel/:playlist*', (req, res) => {
    const channel = req.params.channel;
    const playlistPath = req.params[0] ? `${req.params.playlist}/${req.params[0]}` : req.params.playlist;
    const playlistDir = path.join(__dirname, 'videos', channel, playlistPath);
    if (!fs.existsSync(playlistDir)) return res.status(404).send('Playlist not found');
    const videoFiles = [];
    function readPlaylistDir(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) readPlaylistDir(filePath);
            else if (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv')) {
                const relativePath = path.relative(path.join(__dirname, 'videos'), filePath).replace(/\\/g, '/');
                const basePath = relativePath.replace(/\.(mp4|mp3|mkv)$/, '');
                const cached = videoCache.get(relativePath) || {};
                let viewCount = '0';
                const viewCountPath = path.join(__dirname, 'viewcounts', `${basePath}.txt`);
                if (fs.existsSync(viewCountPath)) viewCount = fs.readFileSync(viewCountPath, 'utf8');
                videoFiles.push({
                    path: relativePath,
                    viewCount: viewCount,
                    fileDate: cached.fileDate || '',
                    displayName: cached.displayName || file
                });
            }
        });
    }
    readPlaylistDir(playlistDir);
    res.json(videoFiles);
});

app.get('/channel-description/:channel', (req, res) => {
    const channel = req.params.channel;
    const filePath = path.join(__dirname, 'channeldesc', `${channel}.txt`);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.send(''); // Return empty string if no description exists
        }
        res.send(data);
    });
});

// ======================================================================
// USER SEARCH HISTORY SYSTEM (NEW)
// ======================================================================
const userSearchHistoryFilePath = path.join(__dirname, 'userSearchHistory.json');

// Ensure file exists
function ensureUserSearchHistoryFile() {
    if (!fs.existsSync(userSearchHistoryFilePath)) {
        fs.writeFileSync(userSearchHistoryFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(userSearchHistoryFilePath, 'utf8');
        try { JSON.parse(data); } catch (err) { fs.writeFileSync(userSearchHistoryFilePath, JSON.stringify({})); }
    }
}
ensureUserSearchHistoryFile();

// GET recent search history for logged-in user
app.get('/user-search-history', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');

    try {
        const data = fs.readFileSync(userSearchHistoryFilePath, 'utf8');
        const allHistory = JSON.parse(data);
        
        // Return the list, defaulting to empty array if none exists
        res.json(allHistory[userId] || []);
    } catch (err) {
        console.error('Error reading search history:', err);
        res.status(500).send('Error reading history');
    }
});

// POST (Save/Update) a new search query
app.post('/user-search-history', (req, res) => {
    const { query } = req.body;
    const userId = req.session.userId;
    
    if (!userId) return res.status(401).send('Not authenticated');
    if (!query || typeof query !== 'string') return res.status(400).send('Invalid query');

    try {
        const data = fs.readFileSync(userSearchHistoryFilePath, 'utf8');
        const allHistory = JSON.parse(data);

        // Initialize user array if missing
        if (!allHistory[userId]) allHistory[userId] = [];

        let userList = allHistory[userId];

        // Remove query if it already exists (to move it to top)
        userList = userList.filter(item => item !== query);
        
        // Add new query to the beginning
        userList.unshift(query);
        
        // Keep only the latest 5
        if (userList.length > 5) {
            userList = userList.slice(0, 5);
        }

        allHistory[userId] = userList;

        fs.writeFileSync(userSearchHistoryFilePath, JSON.stringify(allHistory, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error('Error saving search history:', err);
        res.status(500).send('Error saving history');
    }
});


app.get('/user-history', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    fs.readFile(watchHistoryFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading watch history');
        const watchHistoryData = JSON.parse(data);
        const userHistory = watchHistoryData[userId] || [];
        const watchedVideos = userHistory
            .filter(item => videoCache.has(typeof item === 'object' ? item.video : item))
            .map(item => {
                const videoPath = typeof item === 'object' ? item.video : item;
                const video = videoCache.get(videoPath);
                const timestamp = typeof item === 'object' ? item.timestamp : null;
                const details = getVideoDetails([video])[0];
                return { ...details, timestamp: timestamp };
            })
            .sort((a, b) => {
                if (!a.timestamp && !b.timestamp) return 0;
                if (!a.timestamp) return 1;
                if (!b.timestamp) return -1;
                return new Date(b.timestamp) - new Date(a.timestamp);
            });
        res.json(watchedVideos);
    });
});

app.get('/search-index', (req, res) => {
    const minimalData = videoArray.map(v => ({
        path: v.path,
        displayName: v.displayName || path.basename(v.path)
    }));
    res.json({ videos: minimalData });
});

// --- SHORT LINK API ---
app.get('/api/shortlink', (req, res) => {
    const video = req.query.video;
    const playlist = req.query.playlist; // Capture explicitly

    if (!video) return res.status(400).json({ error: 'Missing video parameter' });

    // 1. Get Video Short Code
    const videoCode = shortLinksMap.get(video);
    if (!videoCode) return res.status(404).json({ error: 'Video short link not found' });

    let shortPath = `/v/${videoCode}`;

    // 2. Get Playlist Short Code (if provided and valid)
    if (playlist && playlist.trim() !== '') {
        const plCode = getOrCreatePlaylistShortCode(playlist);
        if (plCode) {
            shortPath += `?pl=${plCode}`;
        }
    }

    res.json({ shortPath: shortPath });
});

app.post('/add-to-history', (req, res) => {
    const { video } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    fs.readFile(watchHistoryFilePath, 'utf8', (err, data) => {
        let watchHistoryData = {};
        if (!err) watchHistoryData = JSON.parse(data);
        if (!watchHistoryData[userId]) watchHistoryData[userId] = [];
        watchHistoryData[userId] = watchHistoryData[userId].filter(item => (typeof item === 'object' ? item.video : item) !== video);
        watchHistoryData[userId].unshift({ video: video, timestamp: new Date().toISOString() });
        if (watchHistoryData[userId].length > 10000) watchHistoryData[userId] = watchHistoryData[userId].slice(0, 10000);
        fs.writeFile(watchHistoryFilePath, JSON.stringify(watchHistoryData, null, 2), err => {
            if (err) return res.status(500).send('Error saving watch history');
            res.sendStatus(200);
        });
    });
});

// --- ERROR HANDLING MIDDLEWARE ---
app.use((err, req, res, next) => {
    // Log the error for debugging
    console.error('Server error:', err.message || err);
    
    // Don't try to send a response if headers were already sent
    if (res.headersSent) {
        return;
    }
    
    // If it's a JSON parse error (corrupted session file)
    if (err instanceof SyntaxError && err.message.includes('JSON')) {
        return res.status(500).send('Session data corrupted. Please refresh.');
    }
    
    // If it's an EPERM error (file lock conflict from concurrent tabs)
    if (err.code === 'EPERM') {
        return res.status(503).send('Server busy. Please try again.');
    }
    
    // Default error
    res.status(500).send('Internal server error');
});

// --- SHARED PLAYLIST ROUTE ---
app.get('/shared-playlist', (req, res) => {
    const { id } = req.query; // id = base64 encoded "userId:playlistName"

    if (!id) return res.status(400).send('Missing playlist ID');

    try {
        const decoded = Buffer.from(id, 'base64').toString('utf8');
        const [userId, playlistName] = decoded.split(':');

        if (!userId || !playlistName) return res.status(400).send('Invalid playlist ID');

        // Read playlists file
        const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
        if (!fs.existsSync(playlistsFilePath)) return res.status(404).send('Playlist not found');

        const data = fs.readFileSync(playlistsFilePath, 'utf8');
        const allPlaylists = JSON.parse(data);
        
        // Access specific user's playlist
        const userPlaylists = allPlaylists[userId];
        if (!userPlaylists || !userPlaylists[playlistName]) {
            return res.status(404).send('Playlist not found');
        }

        const videoPaths = userPlaylists[playlistName];

        // Enrich with video details (similar to /user-playlist-details)
        const validVideos = videoPaths.filter(vPath => videoCache.has(vPath));
        const result = validVideos.map(vPath => {
            const video = videoCache.get(vPath);
            return getVideoDetails([video])[0];
        });

        res.json({
            name: playlistName,
            videos: result
        });

    } catch (err) {
        console.error('Error loading shared playlist:', err);
        res.status(500).send('Error loading playlist');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});