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
const cliProgress = require('cli-progress');
const upload = multer({ dest: path.join(__dirname, 'temp-uploads') });

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

// Suppress harmless Windows EPERM session rename errors thrown by session-file-store
const originalConsoleError = console.error;
console.error = function(...args) {
    const message = args.join(' ');
    if (message.includes('EPERM') && message.includes('.session')) {
        return;
    }
    originalConsoleError.apply(console, args);
};

const tempUploadsDir = path.join(__dirname, 'temp-uploads');
if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// --- BRUTE-FORCE PROTECTION SYSTEM ---
const loginAttempts = new Map();
const loginAttemptsFile = path.join(__dirname, 'login_attempts.json');

function normalizeIp(ip) {
    if (ip && ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    return ip;
}

function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        return normalizeIp(ips[0]);
    }
    return normalizeIp(req.ip || req.connection.remoteAddress || req.socket.remoteAddress);
}

function loadLoginAttempts() {
    if (fs.existsSync(loginAttemptsFile)) {
        try {
            const data = fs.readFileSync(loginAttemptsFile, 'utf8');
            const attempts = JSON.parse(data);
            for (const [ip, attemptData] of Object.entries(attempts)) {
                loginAttempts.set(ip, attemptData);
            }
        } catch (err) {
            console.error('Error loading login attempts:', err);
        }
    }
}

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

function getBlockDuration(attempts) {
    if (attempts >= 20) return -1;
    if (attempts >= 15) return 30 * 60 * 1000;
    if (attempts >= 10) return 5 * 60 * 1000;
    if (attempts >= 5) return 2 * 60 * 1000;
    return 0;
}

function getLoginAttemptData(ip) {
    return loginAttempts.get(ip);
}

function isIpBlocked(ip) {
    const data = loginAttempts.get(ip);
    if (!data) return false;
    if (data.permanent) return true;
    if (data.blockedUntil) {
        if (Date.now() < data.blockedUntil) {
            return true;
        }
        data.blockedUntil = null;
    }
    return false;
}

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

function recordFailedAttempt(ip) {
    let data = loginAttempts.get(ip);
    if (!data) {
        data = { attempts: 0, lastAttemptTime: null, blockedUntil: null, permanent: false };
        loginAttempts.set(ip, data);
    }
    if (data.permanent) return;
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

function resetLoginAttempts(ip) {
    loginAttempts.delete(ip);
    saveLoginAttempts();
}

loadLoginAttempts();

const recommendationsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many recommendation requests, please try again later.'
});

app.get('/endscreen-recommendations', recommendationsLimiter, (req, res) => {
    const video = req.query.video || '';
    const limit = parseInt(req.query.limit) || 12;
    let videos = [...videoCache.values()].filter(v => v.path !== video);
    for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
    }
    res.json(getVideoDetails(videos.slice(0, limit)));
});

const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true, mode: 0o777 });
}

function stripExtension(filename) {
    return filename.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i, '');
}

// --- STATIC FILE MIDDLEWARE ---
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
app.use('/channeltags', express.static(path.join(__dirname, 'channeltags')));
app.use('/videostats', express.static(path.join(__dirname, 'videostats')));
app.use('/descriptions', express.static(path.join(__dirname, 'descriptions')));
app.use('/comments', express.static(path.join(__dirname, 'comments')));
app.use('/subtitles', express.static(path.join(__dirname, 'subtitles')));
app.use('/livechats', express.static(path.join(__dirname, 'livechats')));
app.use('/channelposts', express.static(path.join(__dirname, 'channelposts')));
app.use('/user-profiles', express.static(path.join(__dirname, 'user-profiles')));
app.use('/topic-images', express.static(path.join(__dirname, 'topic-images')));
app.use('/playlist-descriptions', express.static(path.join(__dirname, 'playlist-descriptions')));
app.use('/playlist-orders', express.static(path.join(__dirname, 'playlist-orders')));
app.use('/favicon.png', express.static(path.join(__dirname, 'favicon.png')));
app.use('/playlist_cache.json', express.static(path.join(__dirname, 'playlist_cache.json')));
app.use('/video_date_cache.json', express.static(path.join(__dirname, 'video_date_cache.json')));
app.use('/videoresolutions', express.static(path.join(__dirname, 'videoresolutions')));

// --- DISCORD EMBED ROUTE ---
app.get('/video.html', (req, res) => {
    const videoSrc = req.query.src;
    if (!videoSrc) {
        return res.sendFile(path.join(__dirname, 'public', 'video.html'));
    }
    let decodedSrc;
    try {
        decodedSrc = decodeURIComponent(videoSrc);
    } catch (e) {
        console.warn('[Encoding] Malformed URI in src, using raw:', videoSrc);
        decodedSrc = videoSrc;
    }
    const basePath = stripExtension(decodedSrc);
    const titlePath = path.join(__dirname, 'filenames', `${basePath}.txt`);
    let title = decodedSrc.split('/').pop();
    if (fs.existsSync(titlePath)) {
        try {
            title = fs.readFileSync(titlePath, 'utf8').trim();
        } catch (e) {
            console.error('Error reading title file for embed:', e);
        }
    }
    const pathParts = decodedSrc.split('/');
    const channel = pathParts[0];
    let thumbRelativePath = '';
    if (pathParts.length > 2) {
        const playlist = pathParts[1];
        const videoName = stripExtension(pathParts[pathParts.length - 1]);
        thumbRelativePath = `thumbnails/${encodeURIComponent(channel)}/${encodeURIComponent(playlist)}/${encodeURIComponent(videoName)}.jpg`;
    } else {
        const videoName = stripExtension(pathParts[pathParts.length - 1]);
        thumbRelativePath = `thumbnails/${encodeURIComponent(channel)}/${encodeURIComponent(videoName)}.jpg`;
    }
    const host = req.get('host');
    const videoUrl = `https://${host}/videos/${encodeURIComponent(decodedSrc)}`;
    const thumbUrl = `https://${host}/${thumbRelativePath}`;
    const pageUrl = `https://${host}/video.html?src=${encodeURIComponent(decodedSrc)}`;
    const htmlFilePath = path.join(__dirname, 'public', 'video.html');
    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
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
    if (req.query.t) redirectUrl += `&t=${encodeURIComponent(req.query.t)}`;
    if (req.query.pl) {
        const plCode = req.query.pl;
        const playlistName = shortCodeToPlaylistMap.get(plCode);
        if (playlistName) {
            redirectUrl += `&playlist=${encodeURIComponent(playlistName)}`;
        } else {
            redirectUrl += `&playlist=${encodeURIComponent(plCode)}`;
        }
    }
    res.redirect(redirectUrl);
});

// --- PLAYLIST SHORT LINK SYSTEM ---
let playlistShortMap = new Map();
let shortCodeToPlaylistMap = new Map();
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

// --- VIDEO TAGS API ---
app.get('/api/video-tags', (req, res) => {
    const video = req.query.video;
    if (!video) {
        return res.status(400).json({ error: 'Missing video parameter' });
    }

    let decodedVideo;
    try {
        decodedVideo = decodeURIComponent(video);
    } catch (e) {
        decodedVideo = video;
    }

    const cached = videoCache.get(decodedVideo);
    if (cached && cached.tags && cached.tags.length) {
        return res.json({ tags: cached.tags });
    }

    const basePath = decodedVideo.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i, '');
    const tagsFilePath = path.join(__dirname, 'videos', `${basePath}.txt`);
    if (fs.existsSync(tagsFilePath)) {
        try {
            const content = fs.readFileSync(tagsFilePath, 'utf8');
            const tags = content.split(',').map(t => t.trim()).filter(Boolean);
            return res.json({ tags });
        } catch (e) {
            return res.status(500).json({ error: 'Error reading tags file' });
        }
    }

    res.json({ tags: [] });
});

// --- DISCORD EMBED SUPPORT FOR CHANNEL PAGES ---
app.get('/channel.html', (req, res) => {
    const channel = req.query.channel;
    if (!channel) {
        return res.sendFile(path.join(__dirname, 'public', 'channel.html'));
    }

    let decodedChannel;
    try {
        decodedChannel = decodeURIComponent(channel);
    } catch (e) {
        decodedChannel = channel;
    }

    const baseChannel = decodedChannel.split('/')[0];

    const descPath = path.join(__dirname, 'channeldesc', `${baseChannel}.txt`);
    let description = 'LocalYT channel';
    if (fs.existsSync(descPath)) {
        try {
            const desc = fs.readFileSync(descPath, 'utf8').trim();
            if (desc) description = desc;
        } catch (e) { /* ignore */ }
    }

    const host = req.get('host');
    const pageUrl = `https://${host}/channel.html?channel=${encodeURIComponent(decodedChannel)}`;
    const picUrl = `https://${host}/channelpic/${encodeURIComponent(baseChannel)}.jpg`;

    const metaTags = `
        <meta property="og:title" content="${baseChannel}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content="${pageUrl}" />
        <meta property="og:image" content="${picUrl}" />
        <meta property="og:image:secure_url" content="${picUrl}" />
        <meta property="og:site_name" content="LocalYT" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="${baseChannel}" />
        <meta name="twitter:description" content="${description}" />
        <meta name="twitter:image" content="${picUrl}" />
    `;

    const htmlFilePath = path.join(__dirname, 'public', 'channel.html');
    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    htmlContent = htmlContent.replace('</head>', metaTags + '</head>');
    res.send(htmlContent);
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const folderVersionsPath = path.join(__dirname, 'folder_versions.json');
const notificationsFilePath = path.join(__dirname, 'notifications.json');

function ensurePreferencesFile() {
    if (!fs.existsSync(preferencesFilePath)) {
        fs.writeFileSync(preferencesFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        try { JSON.parse(data); } catch (err) { fs.writeFileSync(preferencesFilePath, JSON.stringify({})); }
    }
}

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

// --- USER TOPICS SYSTEM ---
const userTopicsFilePath = path.join(__dirname, 'userTopics.json');
const topicImagesDir = path.join(__dirname, 'topic-images');

if (!fs.existsSync(topicImagesDir)) {
    fs.mkdirSync(topicImagesDir, { recursive: true });
}

function ensureUserTopicsFile() {
    if (!fs.existsSync(userTopicsFilePath)) {
        fs.writeFileSync(userTopicsFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(userTopicsFilePath, 'utf8');
        try { JSON.parse(data); } catch (err) { fs.writeFileSync(userTopicsFilePath, JSON.stringify({})); }
    }
}
ensureUserTopicsFile();

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
                        const thumbPath = path.join(thumbnailsDir, `${basePath}.jpg`);
                        if (!fs.existsSync(thumbPath)) return;
                        const datePath = path.join(filedatesDir, `${basePath}.txt`);
                        let dateObj = new Date(0);
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
            } catch (err) {}
        }

        readDirRecursive(dir);

        if (earliestVideo) {
            cache[playlistKey] = encodeURI(earliestVideo);
        }
    }

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

    const videosDir = path.join(__dirname, 'videos');
    playlistsFound.forEach(playlistKey => {
        const playlistDir = path.join(videosDir, playlistKey);
        if (fs.existsSync(playlistDir)) {
            scanPlaylist(playlistKey, playlistDir);
        }
    });

    try {
        fs.writeFileSync(playlistCacheFilePath, JSON.stringify(cache, null, 2));
        playlistThumbnailCache = cache;
        console.log(`Built playlist thumbnail cache with ${Object.keys(cache).length} entries.`);
    } catch (err) {
        console.error('Error writing playlist cache:', err);
    }
}

// ======================================================================
// OPTIMIZED CACHING SYSTEM WITH INCREMENTAL SCAN
// ======================================================================

let videoCache = new Map();
let videoArray = [];
let recommendationIndex = {};

function loadFolderVersions() {
    if (fs.existsSync(folderVersionsPath)) {
        try {
            const data = fs.readFileSync(folderVersionsPath, 'utf8');
            return JSON.parse(data);
        } catch (e) { return {}; }
    }
    return {};
}

function saveFolderVersions(versions) {
    fs.writeFileSync(folderVersionsPath, JSON.stringify(versions, null, 2));
}

function getFolderVersion(folderPath) {
    try {
        const stats = fs.statSync(folderPath);
        let totalSize = 0;
        const walk = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const full = path.join(dir, file);
                const s = fs.statSync(full);
                if (s.isDirectory()) walk(full);
                else if (/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i.test(file)) {
                    totalSize += s.size;
                }
            }
        };
        walk(folderPath);
        return { mtime: stats.mtimeMs, size: totalSize };
    } catch (e) {
        return null;
    }
}

function hasFolderChanged(channel, currentVersion, oldVersions) {
    const oldVer = oldVersions[channel];
    if (!oldVer) return true;
    return oldVer.mtime !== currentVersion.mtime || oldVer.size !== currentVersion.size;
}

function loadExistingCache() {
    if (fs.existsSync(cacheFilePath)) {
        try {
            const data = fs.readFileSync(cacheFilePath, 'utf8');
            return JSON.parse(data);
        } catch (e) { return []; }
    }
    return [];
}

function generateNotifications(addedPaths) {
    if (!addedPaths || addedPaths.length === 0) {
        console.log('No new videos added since last scan.');
        return;
    }

    const channelCounts = {};
    addedPaths.forEach(p => {
        const channel = p.split('/')[0];
        if (!channelCounts[channel]) channelCounts[channel] = { videos: 0, audios: 0 };
        if (/\.(mp3|wav|flac|m4a|aac)$/i.test(p)) {
            channelCounts[channel].audios++;
        } else {
            channelCounts[channel].videos++;
        }
    });

    let notifications = [];
    if (fs.existsSync(notificationsFilePath)) {
        try {
            notifications = JSON.parse(fs.readFileSync(notificationsFilePath, 'utf8'));
        } catch (e) {}
    }

    const timestamp = new Date().toISOString();
    Object.keys(channelCounts).forEach(channel => {
        const counts = channelCounts[channel];
        let parts = [];
        if (counts.videos > 0) parts.push(`${counts.videos} new video file${counts.videos > 1 ? 's' : ''}`);
        if (counts.audios > 0) parts.push(`${counts.audios} new audio file${counts.audios > 1 ? 's' : ''}`);
        
        if (parts.length > 0) {
            notifications.unshift({
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                message: `${channel}: ${parts.join(' and ')} added.`,
                timestamp: timestamp
            });
        }
    });

    if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
    }

    fs.writeFileSync(notificationsFilePath, JSON.stringify(notifications, null, 2));
    console.log(`Generated notifications for ${addedPaths.length} new files.`);
}

function scanFolder(folderPath, baseDir) {
    const result = [];
    const walk = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const full = path.join(dir, file);
            if (!fs.existsSync(full)) continue;
            if (fs.statSync(full).isDirectory()) {
                walk(full);
            } else if (/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i.test(file)) {
                const relativePath = path.relative(baseDir, full).replace(/\\/g, '/');
                const basePath = relativePath.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/, '');
                
                let tags = [];
                const tagsPath = path.join(baseDir, `${basePath}.txt`);
                if (fs.existsSync(tagsPath)) {
                    try {
                        tags = fs.readFileSync(tagsPath, 'utf8').split(',').map(tag => tag.trim());
                    } catch (e) {}
                }

                let displayName = file.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/, '');
                const filenamePath = path.join(__dirname, 'filenames', `${basePath}.txt`);
                if (fs.existsSync(filenamePath)) {
                    try { displayName = fs.readFileSync(filenamePath, 'utf8'); } catch (e) {}
                }

                let fileDate = '';
                const fileDatePath = path.join(__dirname, 'filedates', `${basePath}.txt`);
                if (fs.existsSync(fileDatePath)) {
                    try { fileDate = fs.readFileSync(fileDatePath, 'utf8'); } catch (e) {}
                }

                result.push({
                    path: relativePath,
                    basePath: basePath,
                    tags: tags,
                    displayName: displayName,
                    fileDate: fileDate
                });
            }
        }
    };
    walk(folderPath);
    return result;
}

function incrementalScanAndCacheVideos() {
    console.log('Launching incremental scan...');
    const videosDir = path.join(__dirname, 'videos');
    
    const oldCache = loadExistingCache();
    const oldVersions = loadFolderVersions();
    const newVersions = {};
    const newCache = [];

    let channelDirs = [];
    try {
        channelDirs = fs.readdirSync(videosDir).filter(f => {
            const full = path.join(videosDir, f);
            return fs.statSync(full).isDirectory() && !f.startsWith('.');
        });
    } catch (err) {
        console.error('Error reading videos directory:', err);
        return;
    }

    const progressBar = new cliProgress.SingleBar({
        format: 'Progress [{bar}] {percentage}% | {value}/{total} channels',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        clearOnComplete: true
    });

    console.log(`${channelDirs.length} channel folders found.`);
    progressBar.start(channelDirs.length, 0);

    let changedChannels = 0;
    let unchangedChannels = 0;

    for (let i = 0; i < channelDirs.length; i++) {
        const channel = channelDirs[i];
        const channelPath = path.join(videosDir, channel);
        const version = getFolderVersion(channelPath);
        
        if (!version) {
            progressBar.update(i + 1);
            continue;
        }
        
        newVersions[channel] = version;
        const changed = hasFolderChanged(channel, version, oldVersions);

        if (changed) {
            changedChannels++;
            const channelCache = scanFolder(channelPath, videosDir);
            newCache.push(...channelCache);
        } else {
            unchangedChannels++;
            const oldChannelVideos = oldCache.filter(v => v.path.startsWith(channel + '/'));
            newCache.push(...oldChannelVideos);
        }

        progressBar.update(i + 1);
    }

    progressBar.stop();

    const existingChannels = new Set(channelDirs);
    const oldChannelKeys = Object.keys(oldVersions);
    for (const oldChannel of oldChannelKeys) {
        if (!existingChannels.has(oldChannel)) {
            console.log(`Channel "${oldChannel}" has been deleted.`);
            delete newVersions[oldChannel];
        }
    }

    try {
        if (oldCache.length > 0 && newCache.length > 0) {
            const oldPaths = new Set(oldCache.map(v => v.path));
            const addedPaths = newCache.filter(v => !oldPaths.has(v.path)).map(v => v.path);
            if (addedPaths.length > 0) {
                generateNotifications(addedPaths);
            }
        }

        fs.writeFileSync(cacheFilePath, JSON.stringify(newCache, null, 2));
        videoCache = new Map(newCache.map(v => [v.path, v]));
        videoArray = newCache;
        videoArray.sort((a, b) => a.path.localeCompare(b.path));
        
        console.log(`Cache updated: ${videoArray.length} videos (${changedChannels} changed, ${unchangedChannels} unchanged).`);
        
        saveFolderVersions(newVersions);
        buildRecommendationIndex();
    } catch (err) {
        console.error('Error while saving cache:', err);
    }
}

function fullScanAndCacheVideos() {
    console.log('\nInitiating full scan...');
    const videosDir = path.join(__dirname, 'videos');
    const tempCache = [];
    const newVersions = {};

    function readDir(dir) {
        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.startsWith('._')) return;
                const filePath = path.join(dir, file);
                try {
                    if (!fs.existsSync(filePath)) return;
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        readDir(filePath);
                    } else if (/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i.test(file)) {
                        const relativePath = path.relative(videosDir, filePath).replace(/\\/g, '/');
                        const basePath = relativePath.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/, '');
                        
                        let tags = [];
                        const tagsPath = path.join(videosDir, `${basePath}.txt`);
                        if (fs.existsSync(tagsPath)) {
                            try {
                                tags = fs.readFileSync(tagsPath, 'utf8').split(',').map(tag => tag.trim());
                            } catch (e) {}
                        }

                        let displayName = file.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/, '');
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

    console.log('Collecting all channels...');
    
    const allChannels = [];
    try {
        const items = fs.readdirSync(videosDir);
        for (const item of items) {
            const fullPath = path.join(videosDir, item);
            if (fs.statSync(fullPath).isDirectory() && !item.startsWith('.')) {
                allChannels.push(item);
            }
        }
    } catch (err) {
        console.error('Fehler beim Lesen des Videos-Verzeichnisses:', err);
    }

    const progressBar = new cliProgress.SingleBar({
        format: 'Fortschritt [{bar}] {percentage}% | {value}/{total} Kanäle',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        clearOnComplete: true
    });

    console.log(`${allChannels.length} Kanäle gefunden.`);
    progressBar.start(allChannels.length, 0);

    let processedChannels = 0;
    
    function scanChannel(channel) {
        const channelPath = path.join(videosDir, channel);
        const version = getFolderVersion(channelPath);
        if (version) {
            newVersions[channel] = version;
        }
        
        const walk = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (file.startsWith('._')) continue;
                const filePath = path.join(dir, file);
                try {
                    if (!fs.existsSync(filePath)) continue;
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        walk(filePath);
                    } else if (/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i.test(file)) {
                        const relativePath = path.relative(videosDir, filePath).replace(/\\/g, '/');
                        const basePath = relativePath.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/, '');
                        
                        let tags = [];
                        const tagsPath = path.join(videosDir, `${basePath}.txt`);
                        if (fs.existsSync(tagsPath)) {
                            try {
                                tags = fs.readFileSync(tagsPath, 'utf8').split(',').map(tag => tag.trim());
                            } catch (e) {}
                        }

                        let displayName = file.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/, '');
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
            }
        };
        
        walk(channelPath);
        processedChannels++;
        progressBar.update(processedChannels);
    }

    for (const channel of allChannels) {
        scanChannel(channel);
    }

    progressBar.stop();

    try {
        fs.writeFileSync(cacheFilePath, JSON.stringify(tempCache, null, 2));
        videoCache = new Map(tempCache.map(v => [v.path, v]));
        videoArray = tempCache;
        videoArray.sort((a, b) => a.path.localeCompare(b.path));
        console.log(`Full scan finished. ${videoArray.length} videos cached.`);
        
        saveFolderVersions(newVersions);
        buildRecommendationIndex();
    } catch (err) {
        console.error('Error writing cache file:', err);
    }
}

function initializeVideoCache() {
    console.log('Initializing video cache...');
    
    if (fs.existsSync(cacheFilePath)) {
        try {
            const stats = fs.statSync(cacheFilePath);
            if (stats.size > 0) {
                const data = fs.readFileSync(cacheFilePath, 'utf8');
                const videos = JSON.parse(data);
                videoCache = new Map(videos.map(v => [v.path, v]));
                videoArray = videos;
                console.log(`Cache loaded: ${videoCache.size} videos.`);
                
                incrementalScanAndCacheVideos();
                return;
            }
        } catch (err) {
            console.log('Cache corrupted or empty, re-running full scan...', err);
        }
    } else {
        console.log('video_cache.json not found, re-running full scan...');
    }
    
    fullScanAndCacheVideos();
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
    console.log(`Recommendation index loaded: ${Object.keys(index).length} tags/channels.`);
}

function initializeRecommendationIndex() {
    if (fs.existsSync(recommendationIndexPath)) {
        try {
            const data = fs.readFileSync(recommendationIndexPath, 'utf8');
            recommendationIndex = JSON.parse(data);
        } catch (err) {
            console.log('Recommendation index corrupted, re-running full scan...');
            buildRecommendationIndex();
        }
    } else {
        console.log('Recommendation index not found, re-running full scan...');
        buildRecommendationIndex();
    }
}

// --- LOAD CHANNEL HOME PREVIEW STATS ---
const channelHomePreviewDir = path.join(__dirname, 'channel-home-previews');
if (fs.existsSync(channelHomePreviewDir)) {
    try {
        const previewFiles = fs.readdirSync(channelHomePreviewDir).filter(f => f.endsWith('.json'));
        console.log(`Loaded ${previewFiles.length} Channel Home Previews.`);
    } catch (err) {
        console.error('Error reading channel home previews:', err);
    }
}
app.use('/channel-home-previews', express.static(channelHomePreviewDir));

// --- SHORT LINK SYSTEM ---
const shortLinksFilePath = path.join(__dirname, 'shortlinks.json');
let shortLinksMap = new Map();
let shortCodeToVideoMap = new Map();
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
    if (fs.existsSync(shortLinksFilePath)) {
        try {
            const data = fs.readFileSync(shortLinksFilePath, 'utf8');
            const links = JSON.parse(data);
            for (const [videoPath, code] of Object.entries(links)) {
                shortLinksMap.set(videoPath, code);
                shortCodeToVideoMap.set(code, videoPath);
            }
            console.log(`${shortLinksMap.size} Short Links loaded.`);
        } catch (err) {
            console.error('Error loading short links:', err);
            shortLinksMap.clear();
            shortCodeToVideoMap.clear();
        }
    } else {
        console.log('shortlinks.json not found, generating new file...');
    }

    let newCodesGenerated = 0;
    videoArray.forEach(video => {
        if (!shortLinksMap.has(video.path)) {
            const code = generateShortCode();
            shortLinksMap.set(video.path, code);
            shortCodeToVideoMap.set(code, video.path);
            newCodesGenerated++;
        }
    });

    if (newCodesGenerated > 0) {
        const obj = {};
        shortLinksMap.forEach((code, videoPath) => { obj[videoPath] = code; });
        fs.writeFileSync(shortLinksFilePath, JSON.stringify(obj, null, 2));
        console.log(`${newCodesGenerated} new Short Links generated. Total: ${shortLinksMap.size}`);
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
        console.log(`${metaFiles.length} Channel Home Meta cache files loaded.`);
    } catch (err) {
        console.error('Error reading channel home meta caches:', err);
    }
}
app.use('/channel-home-meta-cache', express.static(channelHomeMetaCacheDir));

// --- PLAYLIST SHORT LINK SYSTEM (INITIALIZATION) ---
function initializePlaylistShortLinks() {
    if (fs.existsSync(PLAYLIST_SHORT_FILE)) {
        try {
            const data = fs.readFileSync(PLAYLIST_SHORT_FILE, 'utf8');
            const links = JSON.parse(data);
            for (const [name, code] of Object.entries(links)) {
                playlistShortMap.set(name, code);
                shortCodeToPlaylistMap.set(code, name);
            }
            console.log(`${playlistShortMap.size} Playlist Short Links loaded.`);
            console.log(`${videoArray.length} media files loaded.`);
        } catch (err) {
            console.error('Error loading playlist links:', err);
        }
    }

    let newCodesGenerated = 0;
    const playlistsFound = new Set();

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
        console.log(`${newCodesGenerated} new Playlist Short Links generated. Total: ${playlistShortMap.size}`);
    }
}

initializePlaylistShortLinks();

// --- HELPER FUNCTIONS ---
function parseDurationToSecondsServer(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const trimmed = durationStr.trim();
    if (!trimmed) return 0;
    const parts = trimmed.split(':');
    if (parts.length === 3) {
        return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseInt(parts[2], 10) || 0);
    } else if (parts.length === 2) {
        return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    }
    return parseInt(parts[0], 10) || 0;
}

function parseEuropeanDateServer(dateString) {
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

function getVideoDurationSeconds(video) {
    const channel = video.path.split('/')[0];
    const videoBaseName = video.basePath.split('/').pop();
    let lengthPath = path.join(__dirname, 'videolengths', channel, `${videoBaseName}.txt`);
    if (!fs.existsSync(lengthPath)) {
        lengthPath = path.join(__dirname, 'videolengths', `${video.basePath}.txt`);
    }
    if (fs.existsSync(lengthPath)) {
        try {
            const lengthStr = fs.readFileSync(lengthPath, 'utf8').trim();
            return parseDurationToSecondsServer(lengthStr);
        } catch (e) { return 0; }
    }
    return 0;
}

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

// ======================================================================
// PREFERENCE SYSTEM CONSTANTS
// ======================================================================

const LOW_TAG_THRESHOLD = 0.05;
const IGNORED_TAGS = new Set(['uncategorized']);

const preferenceUpdateQueue = new Map();
let preferenceUpdateTimer = null;

// ======================================================================
// ROUTES
// ======================================================================

// --- SETTINGS ROUTES ---
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

app.post('/rename-account', (req, res) => {
    const { newUsername } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!newUsername) return res.status(400).send('New username is required');
    const usersFilePath = path.join(__dirname, 'users.json');
    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const usersData = JSON.parse(data);
        if (usersData[newUsername]) {
            return res.status(409).send('Username already exists');
        }
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
        usersData[newUsername] = usersData[currentUsername];
        delete usersData[currentUsername];
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send('Error renaming account');
    }
});

app.post('/reset-password', (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    const usersFilePath = path.join(__dirname, 'users.json');
    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const usersData = JSON.parse(data);
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
        if (!bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(403).send('Incorrect current password');
        }
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

app.post('/delete-account', (req, res) => {
    const { password } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!password) return res.status(400).send('Password is required');
    const usersFilePath = path.join(__dirname, 'users.json');
    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const usersData = JSON.parse(data);
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
        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(403).send('Incorrect password');
        }
        delete usersData[username];
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
        if (fs.existsSync(preferencesFilePath)) {
            const prefData = fs.readFileSync(preferencesFilePath, 'utf8');
            const allPrefs = JSON.parse(prefData);
            if (allPrefs[userId]) {
                delete allPrefs[userId];
                fs.writeFileSync(preferencesFilePath, JSON.stringify(allPrefs, null, 2));
            }
        }
        if (fs.existsSync(userSettingsFilePath)) {
            const settingsData = fs.readFileSync(userSettingsFilePath, 'utf8');
            const allSettings = JSON.parse(settingsData);
            if (allSettings[userId]) {
                delete allSettings[userId];
                fs.writeFileSync(userSettingsFilePath, JSON.stringify(allSettings, null, 2));
            }
        }
        const profilePicPath = path.join(userProfileDir, `${userId}.jpg`);
        if (fs.existsSync(profilePicPath)) {
            fs.unlinkSync(profilePicPath);
        }
        req.session.destroy(err => {
            if (err) return res.status(500).send('Error deleting session');
            res.sendStatus(200);
        });
    } catch (err) {
        res.status(500).send('Error deleting account');
    }
});

// --- PROFILE PICTURE ROUTES ---
const userProfileDir = path.join(__dirname, 'user-profiles');
if (!fs.existsSync(userProfileDir)) {
    fs.mkdirSync(userProfileDir, { recursive: true });
}

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

app.post('/user-profile-pic', upload.single('profilePic'), async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not logged in');
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }
    const uploadedFile = req.file;
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(uploadedFile.mimetype)) {
        fs.unlink(uploadedFile.path, () => {});
        return res.status(400).send('Only JPEG, PNG, and WebP images are allowed');
    }
    if (uploadedFile.size > 5 * 1024 * 1024) {
        fs.unlink(uploadedFile.path, () => {});
        return res.status(400).send('Image must be under 5MB');
    }
    const targetPath = path.join(userProfileDir, `${userId}.jpg`);
    const tempPath = uploadedFile.path;
    try {
        const { x, y, width, height } = req.body;
        let sharpInstance = sharp(tempPath);
        if (x && y && width && height) {
            const cropX = parseInt(x);
            const cropY = parseInt(y);
            const cropW = parseInt(width);
            const cropH = parseInt(height);
            if (cropW > 0 && cropH > 0) {
                sharpInstance = sharpInstance.extract({
                    left: cropX,
                    top: cropY,
                    width: cropW,
                    height: cropH
                });
            }
        }
        await sharpInstance.resize(500, 500).jpeg({ quality: 90 }).toFile(targetPath);
        fs.unlink(tempPath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });
        res.sendStatus(200);
    } catch (err) {
        console.error('Error processing image:', err);
        fs.unlink(tempPath, () => {});
        res.status(500).send('Error processing image');
    }
});

app.delete('/user-profile-pic', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not logged in');
    const profilePicPath = path.join(userProfileDir, `${userId}.jpg`);
    if (fs.existsSync(profilePicPath)) {
        fs.unlinkSync(profilePicPath);
    }
    res.sendStatus(200);
});

// --- USER TOPICS ROUTES ---
app.get('/user-topics', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    try {
        const data = fs.readFileSync(userTopicsFilePath, 'utf8');
        const allTopics = JSON.parse(data);
        res.json(allTopics[userId] || []);
    } catch (err) {
        res.status(500).send('Error reading topics');
    }
});

app.post('/user-topics', (req, res) => {
    const { topics } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!Array.isArray(topics)) return res.status(400).send('Invalid topics');
    if (topics.length > 4) return res.status(400).send('Maximum 4 topics allowed');
    try {
        const data = fs.readFileSync(userTopicsFilePath, 'utf8');
        const allTopics = JSON.parse(data);
        allTopics[userId] = topics;
        fs.writeFileSync(userTopicsFilePath, JSON.stringify(allTopics, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error('Error saving topics:', err);
        res.status(500).send('Error saving topics');
    }
});

app.post('/topic-profile-pic', upload.single('image'), async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!req.file) return res.status(400).send('No file uploaded');
    const { topicId, x, y, width, height } = req.body;
    if (!topicId) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).send('Topic ID required');
    }
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(req.file.mimetype)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).send('Only JPEG, PNG, and WebP images are allowed');
    }
    if (req.file.size > 5 * 1024 * 1024) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).send('Image must be under 5MB');
    }
    const targetPath = path.join(topicImagesDir, `${topicId}_pic.jpg`);
    try {
        let sharpInstance = sharp(req.file.path);
        if (x !== undefined && y !== undefined && width && height) {
            const cropW = parseInt(width);
            const cropH = parseInt(height);
            if (cropW > 0 && cropH > 0) {
                sharpInstance = sharpInstance.extract({
                    left: parseInt(x), top: parseInt(y),
                    width: cropW, height: cropH
                });
            }
        }
        await sharpInstance.resize(500, 500).jpeg({ quality: 90 }).toFile(targetPath);
        fs.unlink(req.file.path, () => {});
        res.json({ url: `/topic-images/${topicId}_pic.jpg?t=${Date.now()}` });
    } catch (err) {
        console.error('Error processing topic profile pic:', err);
        fs.unlink(req.file.path, () => {});
        res.status(500).send('Error processing image');
    }
});

app.post('/topic-banner', upload.single('image'), async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!req.file) return res.status(400).send('No file uploaded');
    const { topicId, x, y, width, height } = req.body;
    if (!topicId) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).send('Topic ID required');
    }
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(req.file.mimetype)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).send('Only JPEG, PNG, and WebP images are allowed');
    }
    if (req.file.size > 5 * 1024 * 1024) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).send('Image must be under 5MB');
    }
    const targetPath = path.join(topicImagesDir, `${topicId}_banner.jpg`);
    try {
        let sharpInstance = sharp(req.file.path);
        if (x !== undefined && y !== undefined && width && height) {
            const cropW = parseInt(width);
            const cropH = parseInt(height);
            if (cropW > 0 && cropH > 0) {
                sharpInstance = sharpInstance.extract({
                    left: parseInt(x), top: parseInt(y),
                    width: cropW, height: cropH
                });
            }
        }
        await sharpInstance.resize(2560, 424).jpeg({ quality: 90 }).toFile(targetPath);
        fs.unlink(req.file.path, () => {});
        res.json({ url: `/topic-images/${topicId}_banner.jpg?t=${Date.now()}` });
    } catch (err) {
        console.error('Error processing topic banner:', err);
        fs.unlink(req.file.path, () => {});
        res.status(500).send('Error processing image');
    }
});

app.delete('/topic-image', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    const { topicId, type } = req.body;
    if (!topicId || !type) return res.status(400).send('Missing parameters');
    const suffix = type === 'banner' ? '_banner.jpg' : '_pic.jpg';
    const imagePath = path.join(topicImagesDir, `${topicId}${suffix}`);
    if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
    }
    res.sendStatus(200);
});

app.get('/topic-videos/:topicId', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    const topicId = req.params.topicId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sort = req.query.sort || 'newest';
    let topicConfig = null;
    try {
        const data = fs.readFileSync(userTopicsFilePath, 'utf8');
        const allTopics = JSON.parse(data);
        const userTopics = allTopics[userId] || [];
        topicConfig = userTopics.find(t => t.id === topicId);
    } catch (err) {
        return res.status(500).send('Error reading topics');
    }
    if (!topicConfig) return res.status(404).send('Topic not found');
    const tags = topicConfig.tags || [];
    const titleWords = topicConfig.titleWords || [];
    const blacklistTags = (topicConfig.blacklistTags || []).map(t => t.toLowerCase().trim());
    const blacklistWords = (topicConfig.blacklistWords || []).map(w => w.toLowerCase().trim());
    const minDuration = topicConfig.minDurationSeconds || 0;
    let matchedVideos = videoArray.filter(video => {
        if (blacklistTags.length > 0 && video.tags && video.tags.length > 0) {
            const hasBlacklist = video.tags.some(tag =>
                blacklistTags.includes(tag.toLowerCase().trim())
            );
            if (hasBlacklist) return false;
        }
        if (blacklistWords.length > 0) {
            const nameLower = (video.displayName || '').toLowerCase();
            const hasBlacklistWord = blacklistWords.some(w => w.length > 2 && nameLower.includes(w));
            if (hasBlacklistWord) return false;
        }
        const tagSet = new Set(tags.map(t => t.toLowerCase().trim()));
        const hasPositiveTag = tags.length > 0 && video.tags && video.tags.some(tag =>
            tagSet.has(tag.toLowerCase().trim())
        );
        const hasTitleWord = titleWords.length > 0 && titleWords.some(w => {
            const nameLower = (video.displayName || '').toLowerCase();
            return w.length > 2 && nameLower.includes(w.toLowerCase());
        });
        return hasPositiveTag || hasTitleWord;
    });
    if (minDuration > 0) {
        matchedVideos = matchedVideos.filter(video => {
            return getVideoDurationSeconds(video) >= minDuration;
        });
    }
    matchedVideos.sort((a, b) => {
        const dateA = parseEuropeanDateServer(a.fileDate);
        const dateB = parseEuropeanDateServer(b.fileDate);
        return sort === 'newest' ? dateB - dateA : dateA - dateB;
    });
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pageVideos = matchedVideos.slice(startIndex, endIndex);
    const videosWithDetails = pageVideos.map(video => {
        const details = getVideoDetails([video])[0];
        const duration = getVideoDurationSeconds(video);
        let videoLength = '';
        if (duration > 0) {
            const h = Math.floor(duration / 3600);
            const m = Math.floor((duration % 3600) / 60);
            const s = duration % 60;
            if (h > 0) {
                videoLength = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            } else {
                videoLength = `${m}:${String(s).padStart(2, '0')}`;
            }
        }
        return { ...details, videoLength };
    });
    res.json({
        videos: videosWithDetails,
        page: page,
        limit: limit,
        total: matchedVideos.length,
        hasMore: endIndex < matchedVideos.length
    });
});

app.get('/get-all-tags', (req, res) => {
    res.json(Object.keys(recommendationIndex));
});

app.post('/save-preferences', (req, res) => {
    const { preferences } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    
    try {
        const filteredPreferences = {};
        for (const [tag, value] of Object.entries(preferences || {})) {
            const cleanTag = String(tag).trim();
            if (!cleanTag || cleanTag.toLowerCase() === 'uncategorized') continue;
            filteredPreferences[cleanTag] = value;
        }
        
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        const allPrefs = JSON.parse(data);
        allPrefs[userId] = filteredPreferences;
        fs.writeFileSync(preferencesFilePath, JSON.stringify(allPrefs, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error saving preferences');
    }
});

app.get('/api/top-tags', (req, res) => {
    const tagCounts = {};
    videoArray.forEach(video => {
        if (video.tags && video.tags.length > 0) {
            video.tags.forEach(tag => {
                const cleanTag = tag.trim();
                if (cleanTag && cleanTag.toLowerCase() !== 'uncategorized') {
                    tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
                }
            });
        }
    });
    const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([tag]) => tag);
    res.json(topTags);
});

app.post('/api/similar-tags', (req, res) => {
    const { selectedTags } = req.body;
    if (!selectedTags || !Array.isArray(selectedTags)) {
        return res.status(400).json({ error: 'Invalid tags' });
    }
    const tagCoOccurrence = {};
    const excludeTags = new Set(selectedTags.map(t => t.trim()));
    selectedTags.forEach(tag => {
        const cleanTag = tag.trim();
        const videoPaths = recommendationIndex[cleanTag] || [];
        videoPaths.forEach(vPath => {
            const video = videoCache.get(vPath);
            if (video && video.tags) {
                video.tags.forEach(vTag => {
                    const ct = vTag.trim();
                    if (ct && !excludeTags.has(ct) && ct.toLowerCase() !== 'uncategorized') {
                        tagCoOccurrence[ct] = (tagCoOccurrence[ct] || 0) + 1;
                    }
                });
            }
        });
    });
    const similarTags = Object.entries(tagCoOccurrence)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([tag]) => tag);
    res.json(similarTags);
});

app.post('/api/save-initial-preferences', (req, res) => {
    const { tags } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!tags || !Array.isArray(tags)) return res.status(400).send('Invalid tags');
    try {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        const allPrefs = JSON.parse(data);
        if (!allPrefs[userId]) allPrefs[userId] = {};
        tags.forEach(tag => {
            const cleanTag = String(tag).trim();
            if (!cleanTag || cleanTag.toLowerCase() === 'uncategorized') return;
            allPrefs[userId][cleanTag] = (allPrefs[userId][cleanTag] || 0) + 100;
        });
        if (preferenceUpdateQueue.has(userId)) {
            preferenceUpdateQueue.delete(userId);
        }
        fs.writeFileSync(preferencesFilePath, JSON.stringify(allPrefs, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error('Error saving initial preferences:', err);
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
    addedPaths.add(currentVideoPath);
    const finalRecommendations = [];
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
    shuffleArray(sameChannelVideos);
    const channelToAdd = sameChannelVideos.slice(0, channelQuota);
    channelToAdd.forEach(v => {
        finalRecommendations.push(v);
        addedPaths.add(v.path);
    });
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
    const prefTarget = limit - finalRecommendations.length;
    let preferencePool = [];
    if (userId && fs.existsSync(preferencesFilePath)) {
        try {
            const data = fs.readFileSync(preferencesFilePath, 'utf8');
            const prefData = JSON.parse(data);
            const userPrefs = prefData[userId] || {};
            const total = Object.values(userPrefs).reduce((s, v) => s + v, 0);
            const tagPercent = {};
            if (total > 0) {
                for (const tag in userPrefs) {
                    if (userPrefs[tag] / total >= LOW_TAG_THRESHOLD) {
                        tagPercent[tag] = userPrefs[tag] / total;
                    }
                }
            }
            const scoredVideos = videoArray.map(video => {
                let score = 0;
                if (video.tags) {
                    for (const tag of video.tags) {
                        score += tagPercent[tag] || 0;
                    }
                }
                return { video, score };
            });
            scoredVideos.sort((a, b) => b.score - a.score);
            preferencePool = scoredVideos.map(item => item.video).filter(v => !addedPaths.has(v.path));
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
        const isCurrentlyLiked = likesData[userId][commentId] === true;
        likesData[userId][commentId] = !isCurrentlyLiked;
        fs.writeFile(commentLikesFilePath, JSON.stringify(likesData, null, 2), err => {
            if (err) return res.status(500).send('Error saving comment like');
            res.json({ isLiked: !isCurrentlyLiked });
        });
    });
});

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

app.get('/user-playlist-videos', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const playlistName = req.query.name;
    if (!playlistName) return res.status(400).send('Playlist name is required');
    const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
    fs.readFile(playlistsFilePath, 'utf8', (err, data) => {
        let allPlaylists = {};
        if (!err) {
            try { allPlaylists = JSON.parse(data); } catch (e) {}
        }
        const userPlaylists = allPlaylists[userId] || {};
        const videos = userPlaylists[playlistName];
        if (!videos) return res.status(404).send('Playlist not found');
        const result = videos.map(vPath => {
            const video = videoCache.get(vPath);
            if (!video) return null;
            let viewCount = '0';
            const viewCountPath = path.join(__dirname, 'viewcounts', `${video.basePath}.txt`);
            try { if (fs.existsSync(viewCountPath)) viewCount = fs.readFileSync(viewCountPath, 'utf8'); } catch (e) {}
            return {
                path: video.path,
                viewCount: viewCount,
                fileDate: video.fileDate || '',
                displayName: video.displayName || video.path,
                tags: video.tags || []
            };
        }).filter(Boolean);
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
const REGISTER_COOLDOWN_MS = 10 * 60 * 1000;

app.get('/register-status', (req, res) => {
    const clientIp = getClientIp(req);
    const cooldownEnd = registrationCooldowns.get(clientIp);
    if (cooldownEnd && Date.now() < cooldownEnd) {
        return res.json({ 
            blocked: true, 
            remainingTime: cooldownEnd - Date.now() 
        });
    }
    if (cooldownEnd) registrationCooldowns.delete(clientIp);
    res.json({ blocked: false });
});

app.post('/register', (req, res) => {
    const clientIp = getClientIp(req);
    const cooldownEnd = registrationCooldowns.get(clientIp);

    // Check cooldown
    if (cooldownEnd && Date.now() < cooldownEnd) {
        const remainingTime = cooldownEnd - Date.now();
        const remainingMinutes = Math.ceil(remainingTime / 60000);
        const remainingSeconds = Math.ceil((remainingTime % 60000) / 1000);
        let timeString = '';
        if (remainingMinutes > 0) {
            timeString = remainingMinutes + ' minute' + (remainingMinutes > 1 ? 's' : '');
        } else {
            timeString = remainingSeconds + ' second' + (remainingSeconds > 1 ? 's' : '');
        }
        return res.status(429).json({
            blocked: true,
            remainingTime: remainingTime,
            error: 'Please wait ' + timeString + ' before creating another account.'
        });
    }

    const { username, password } = req.body;

    // Validate input
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'Username is required.' });
    }
    if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Password is required.' });
    }
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }
    if (trimmedUsername.length > 30) {
        return res.status(400).json({ error: 'Username must be at most 30 characters long.' });
    }
    // Optional: disallow special characters
    if (!/^[a-zA-Z0-9_\-. ]+$/.test(trimmedUsername)) {
        return res.status(400).json({ error: 'Username contains invalid characters. Use letters, numbers, spaces, underscores, hyphens, or dots.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const usersFilePath = path.join(__dirname, 'users.json');

    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        let usersData = {};
        if (!err) {
            try {
                usersData = JSON.parse(data);
            } catch (e) {
                return res.status(500).json({ error: 'Error reading user database.' });
            }
        }

        // Check for existing user (case-insensitive)
        const existing = Object.keys(usersData).find(
            key => key.toLowerCase() === trimmedUsername.toLowerCase()
        );
        if (existing) {
            return res.status(409).json({ error: 'Username already exists. Please choose a different username.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        usersData[trimmedUsername] = {
            id: uuidv4(),
            password: hashedPassword
        };

        fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2), err => {
            if (err) {
                console.error('Error saving user:', err);
                return res.status(500).json({ error: 'Error saving user. Please try again.' });
            }

            // Set cooldown for this IP (10 minutes)
            registrationCooldowns.set(clientIp, Date.now() + REGISTER_COOLDOWN_MS);

            // Return success
            res.status(200).json({ success: true });
        });
    });
});

app.post('/login', (req, res) => {
    const clientIp = getClientIp(req);
    const attemptData = getLoginAttemptData(clientIp);
    if (attemptData && attemptData.permanent) {
        return res.status(403).json({ 
            error: 'You have been permanently blocked for trying to log in too many times. Contact your LocalYT owner for support.',
            permanent: true 
        });
    }
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
            recordFailedAttempt(clientIp);
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
        resetLoginAttempts(clientIp);
        req.session.userId = user.id;
        let hasPreferences = false;
        try {
            const prefData = JSON.parse(fs.readFileSync(preferencesFilePath, 'utf8'));
            hasPreferences = Object.keys(prefData[user.id] || {}).length > 0;
        } catch (e) {}
        res.json({ success: true, hasPreferences });
    });
});

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

// ======================================================================
// PREFERENCE UPDATE SYSTEM (with decay and low-tag removal)
// ======================================================================

function batchUpdatePreferences() {
    if (preferenceUpdateQueue.size === 0) return;

    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        let preferencesData = {};
        if (!err) preferencesData = JSON.parse(data);

        preferenceUpdateQueue.forEach((videoTagsArray, userId) => {
            let userPrefs = preferencesData[userId] || {};
            
            // If no preferences yet, start with empty object
            if (!userPrefs || Object.keys(userPrefs).length === 0) {
                userPrefs = {};
            }

            for (const videoTags of videoTagsArray) {
                // Calculate total percentage to add
                // Each tag in the video gets equal share
                const totalNewPercentage = 10; // 10% total for a newly-watched video
                const perTagPercentage = totalNewPercentage / videoTags.length;
                
                // Get current total (should be 100%, but handle edge cases)
                const currentTotal = Object.values(userPrefs).reduce((sum, v) => sum + v, 0);
                
                if (currentTotal === 0) {
                    // First video ever - distribute evenly
                    for (const tag of videoTags) {
                        const cleanTag = tag.trim();
                        if (cleanTag && !IGNORED_TAGS.has(cleanTag.toLowerCase())) {
                            userPrefs[cleanTag] = (userPrefs[cleanTag] || 0) + perTagPercentage;
                        }
                    }
                    continue;
                }
                
                // Calculate reduction factor for existing tags
                // We need to reduce existing tags to make room for new ones
                const totalReduction = totalNewPercentage;
                const reductionFactor = totalReduction / currentTotal;
                
                // Apply reduction to all existing tags
                for (let tag in userPrefs) {
                    userPrefs[tag] *= (1 - reductionFactor);
                }
                
                // Add new tags
                for (const tag of videoTags) {
                    const cleanTag = tag.trim();
                    if (cleanTag && !IGNORED_TAGS.has(cleanTag.toLowerCase())) {
                        userPrefs[cleanTag] = (userPrefs[cleanTag] || 0) + perTagPercentage;
                    }
                }
            }
            
            // Clean up: remove tags below threshold
            const total = Object.values(userPrefs).reduce((sum, v) => sum + v, 0);
            if (total > 0) {
                const cleanedPrefs = {};
                for (let tag in userPrefs) {
                    const pct = (userPrefs[tag] / total) * 100;
                    if (pct >= (LOW_TAG_THRESHOLD * 100)) {
                        // Store as percentage (0-100)
                        cleanedPrefs[tag] = Math.round(pct * 100) / 100;
                    }
                }
                userPrefs = cleanedPrefs;
            }

            preferencesData[userId] = userPrefs;
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

    const videoTags = videoData.tags.filter(t => !IGNORED_TAGS.has(t.toLowerCase()));

    if (!preferenceUpdateQueue.has(userId)) {
        preferenceUpdateQueue.set(userId, []);
    }
    preferenceUpdateQueue.get(userId).push(videoTags);

    if (preferenceUpdateTimer) clearTimeout(preferenceUpdateTimer);
    preferenceUpdateTimer = setTimeout(batchUpdatePreferences, 5000);
    res.json({ queued: true });
});

// ======================================================================
// RECOMMENDATIONS (percentage-based)
// ======================================================================

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
            const userPrefs = preferencesData[userId] || {};
            const total = Object.values(userPrefs).reduce((sum, v) => sum + v, 0);

            // Compute tag percentages
            const tagPercent = {};
            if (total > 0) {
                for (const tag in userPrefs) {
                    const pct = userPrefs[tag] / total;
                    if (pct >= LOW_TAG_THRESHOLD) {
                        tagPercent[tag] = pct;
                    }
                }
            }

            // If no meaningful tags → fallback to random
            if (Object.keys(tagPercent).length === 0) {
                const allVideos = [...videoCache.values()];
                shuffleArray(allVideos);
                const paginated = allVideos.slice(startIndex, endIndex);
                return res.json({
                    videos: getVideoDetails(paginated),
                    page, limit,
                    total: videoArray.length,
                    hasMore: endIndex < videoArray.length
                });
            }

            // Score each video by summing the percentages of its tags
            const scoredVideos = videoArray.map(video => {
                let score = 0;
                if (video.tags) {
                    for (const tag of video.tags) {
                        score += tagPercent[tag] || 0;
                    }
                }
                // Add small random factor (±10%) to introduce variety
                const randomFactor = 0.9 + (Math.random() * 0.2); // 0.9 to 1.1
                score = score * randomFactor;
                return { video, score };
            });
            
            // Sort by score descending
            scoredVideos.sort((a, b) => b.score - a.score);
            
            // Take top 100 candidates (to have enough for randomness)
            const topCandidates = scoredVideos.slice(0, 100);
            
            // Shuffle the top candidates to get different order each time
            shuffleArray(topCandidates);
            
            // Paginate from the shuffled list
            const paginated = topCandidates.slice(startIndex, endIndex).map(item => item.video);
            
            // If we don't have enough videos, fill with random ones
            if (paginated.length < limit) {
                const remaining = limit - paginated.length;
                const allVideos = videoArray.filter(v => !paginated.includes(v));
                shuffleArray(allVideos);
                const fill = allVideos.slice(0, remaining);
                paginated.push(...fill);
            }

            res.json({
                videos: getVideoDetails(paginated),
                page, limit,
                total: videoArray.length,
                hasMore: endIndex < videoArray.length
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
            const userPrefs = preferencesData[userId] || {};
            const total = Object.values(userPrefs).reduce((sum, v) => sum + v, 0);

            if (total === 0) return res.json([]);

            const sorted = Object.entries(userPrefs)
                .map(([tag, weight]) => ({ tag, pct: weight / total }))
                .filter(item => item.pct >= LOW_TAG_THRESHOLD)
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 5)
                .map(item => item.tag);

            res.json(sorted);
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
            return res.send('');
        }
        res.send(data);
    });
});

// ======================================================================
// USER SEARCH HISTORY SYSTEM
// ======================================================================
const userSearchHistoryFilePath = path.join(__dirname, 'userSearchHistory.json');

function ensureUserSearchHistoryFile() {
    if (!fs.existsSync(userSearchHistoryFilePath)) {
        fs.writeFileSync(userSearchHistoryFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(userSearchHistoryFilePath, 'utf8');
        try { JSON.parse(data); } catch (err) { fs.writeFileSync(userSearchHistoryFilePath, JSON.stringify({})); }
    }
}
ensureUserSearchHistoryFile();

app.get('/user-search-history', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    try {
        const data = fs.readFileSync(userSearchHistoryFilePath, 'utf8');
        const allHistory = JSON.parse(data);
        res.json(allHistory[userId] || []);
    } catch (err) {
        console.error('Error reading search history:', err);
        res.status(500).send('Error reading history');
    }
});

app.post('/user-search-history', (req, res) => {
    const { query } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    if (!query || typeof query !== 'string') return res.status(400).send('Invalid query');
    try {
        const data = fs.readFileSync(userSearchHistoryFilePath, 'utf8');
        const allHistory = JSON.parse(data);
        if (!allHistory[userId]) allHistory[userId] = [];
        let userList = allHistory[userId];
        userList = userList.filter(item => item !== query);
        userList.unshift(query);
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

app.get('/api/shortlink', (req, res) => {
    const video = req.query.video;
    const playlist = req.query.playlist;
    if (!video) return res.status(400).json({ error: 'Missing video parameter' });
    const videoCode = shortLinksMap.get(video);
    if (!videoCode) return res.status(404).json({ error: 'Video short link not found' });
    let shortPath = `/v/${videoCode}`;
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

app.post('/remove-from-history', (req, res) => {
    const { video } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    if (!video) return res.status(400).send('Video path is required');
    fs.readFile(watchHistoryFilePath, 'utf8', (err, data) => {
        let watchHistoryData = {};
        if (!err) {
            try {
                watchHistoryData = JSON.parse(data);
            } catch (e) {
                watchHistoryData = {};
            }
        }
        if (watchHistoryData[userId]) {
            watchHistoryData[userId] = watchHistoryData[userId].filter(item => {
                const itemPath = typeof item === 'object' ? item.video : item;
                return itemPath !== video;
            });
            fs.writeFile(watchHistoryFilePath, JSON.stringify(watchHistoryData, null, 2), err => {
                if (err) return res.status(500).send('Error removing from watch history');
                res.sendStatus(200);
            });
        } else {
            res.status(404).send('User history not found');
        }
    });
});

app.use((err, req, res, next) => {
    if (err.code === 'EPERM' && err.path && err.path.includes('.session')) {
        if (res.headersSent) return;
        return res.status(503).send('Server busy. Please try again.');
    }
    console.error('Server error:', err.message || err);
    if (res.headersSent) {
        return;
    }
    if (err instanceof SyntaxError && err.message.includes('JSON')) {
        return res.status(500).send('Session data corrupted. Please refresh.');
    }
    if (err.code === 'EPERM') {
        return res.status(503).send('Server busy. Please try again.');
    }
    res.status(500).send('Internal server error');
});

app.get('/shared-playlist', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('Missing playlist ID');
    try {
        const decoded = Buffer.from(id, 'base64').toString('utf8');
        const [userId, playlistName] = decoded.split(':');
        if (!userId || !playlistName) return res.status(400).send('Invalid playlist ID');
        const playlistsFilePath = path.join(__dirname, 'user-playlists.json');
        if (!fs.existsSync(playlistsFilePath)) return res.status(404).send('Playlist not found');
        const data = fs.readFileSync(playlistsFilePath, 'utf8');
        const allPlaylists = JSON.parse(data);
        const userPlaylists = allPlaylists[userId];
        if (!userPlaylists || !userPlaylists[playlistName]) {
            return res.status(404).send('Playlist not found');
        }
        const videoPaths = userPlaylists[playlistName];
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

// --- NOTIFICATIONS API ---
const notificationReadStateFilePath = path.join(__dirname, 'notification_read_state.json');

app.get('/api/notifications', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    try {
        const notifs = fs.existsSync(notificationsFilePath) ? JSON.parse(fs.readFileSync(notificationsFilePath, 'utf8')) : [];
        const readState = fs.existsSync(notificationReadStateFilePath) ? JSON.parse(fs.readFileSync(notificationReadStateFilePath, 'utf8')) : {};
        const userReadIds = readState[userId] || [];
        
        const unreadCount = notifs.filter(n => !userReadIds.includes(n.id)).length;
        res.json({ notifications: notifs, unreadCount });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load notifications' });
    }
});

app.post('/api/notifications/read', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('Not authenticated');
    try {
        const notifs = fs.existsSync(notificationsFilePath) ? JSON.parse(fs.readFileSync(notificationsFilePath, 'utf8')) : [];
        const readState = fs.existsSync(notificationReadStateFilePath) ? JSON.parse(fs.readFileSync(notificationReadStateFilePath, 'utf8')) : {};
        if (!readState[userId]) readState[userId] = [];
        
        notifs.forEach(n => {
            if (!readState[userId].includes(n.id)) {
                readState[userId].push(n.id);
            }
        });
        fs.writeFileSync(notificationReadStateFilePath, JSON.stringify(readState, null, 2));
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

app.listen(PORT, () => {
    console.log(`\nServer is running on http://localhost:${PORT}`);
});