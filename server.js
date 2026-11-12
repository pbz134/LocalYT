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
const { spawn } = require('child_process');
const compression = require('compression');

// ---- VIDEO UPLOAD MULTER INSTANCE ----
// Separate from `upload` (used for profile pics / topic images) because we
// need multiple named fields and a bigger file-size limit.
const videoUpload = multer({
    dest: path.join(__dirname, 'temp-uploads'),
    limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50 GB
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'video') {
            if (/\.(mp4|mkv|mp3|avi|mov|wmv|flv|webm)$/i.test(file.originalname)) return cb(null, true);
            return cb(new Error('Invalid video file type'));
        }
        if (file.fieldname === 'thumbnail') {
            if (/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.originalname)) return cb(null, true);
            return cb(new Error('Invalid thumbnail file type'));
        }
        if (file.fieldname === 'commentsJson' || file.fieldname === 'livechatJson') {
            if (file.originalname.toLowerCase().endsWith('.json')) return cb(null, true);
            return cb(new Error('JSON file required'));
        }
        cb(null, false);
    }
});

// ======================================================================
// ADMIN / PERMISSION CONFIG
// ======================================================================

const adminConfigPath = path.join(__dirname, 'admin_config.json');

const DEFAULT_ADMIN_CONFIG = {
    uploadPolicy: 'admin',       // "none" | "admin" | "list" | "all"
    allowedUploaders: [],        // usernames
    adminUsers: []               // usernames
};

let adminConfigCache = null;

function loadAdminConfig() {
    if (adminConfigCache) return adminConfigCache;
    try {
        if (fs.existsSync(adminConfigPath)) {
            const parsed = JSON.parse(fs.readFileSync(adminConfigPath, 'utf8'));
            adminConfigCache = { ...DEFAULT_ADMIN_CONFIG, ...parsed };
            // Sanitize
            if (!Array.isArray(adminConfigCache.allowedUploaders)) adminConfigCache.allowedUploaders = [];
            if (!Array.isArray(adminConfigCache.adminUsers)) adminConfigCache.adminUsers = [];
            if (!['none','admin','list','all'].includes(adminConfigCache.uploadPolicy)) {
                adminConfigCache.uploadPolicy = 'admin';
            }
        } else {
            adminConfigCache = { ...DEFAULT_ADMIN_CONFIG };
            fs.writeFileSync(adminConfigPath, JSON.stringify(adminConfigCache, null, 2));
            console.log('[Admin] Created default admin_config.json');
        }
    } catch (err) {
        console.error('[Admin] Failed to read admin_config.json, using defaults:', err.message);
        adminConfigCache = { ...DEFAULT_ADMIN_CONFIG };
    }
    return adminConfigCache;
}

function saveAdminConfig(config) {
    const existing = adminConfigCache || {};
    adminConfigCache = {
        ...existing,                       // preserve transcoding, reencodeOnUpload, anything else
        uploadPolicy: config.uploadPolicy,
        allowedUploaders: config.allowedUploaders,
        adminUsers: config.adminUsers
    };
    try {
        fs.writeFileSync(adminConfigPath, JSON.stringify(adminConfigCache, null, 2));
        return true;
    } catch (err) {
        console.error('[Admin] Failed to save admin_config.json:', err.message);
        return false;
    }
}

function getUsernameById(userId) {
    if (!userId) return null;
    try {
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
        for (const [name, u] of Object.entries(users)) {
            if (u.id === userId) return name;
        }
    } catch {}
    return null;
}

function isUserAdmin(userId) {
    if (!userId) return false;
    const config = loadAdminConfig();
    const username = getUsernameById(userId);
    if (!username) return false;
    // Bootstrap mode: no admins configured → every logged-in user is admin
    if (config.adminUsers.length === 0) return true;
    return config.adminUsers.some(u => u.toLowerCase() === username.toLowerCase());
}

function canUserUpload(userId) {
    if (!userId) return false;
    const config = loadAdminConfig();
    switch (config.uploadPolicy) {
        case 'none':  return false;
        case 'all':   return true;
        case 'admin': return isUserAdmin(userId);
        case 'list': {
            if (isUserAdmin(userId)) return true;
            const username = getUsernameById(userId);
            if (!username) return false;
            return config.allowedUploaders.some(u => u.toLowerCase() === username.toLowerCase());
        }
        default: return false;
    }
}

// Load once at startup so the file is created before the first request
loadAdminConfig();

// ======================================================================
// UPLOAD JOB TRACKING + QUEUE
// ======================================================================
const uploadJobs = new Map();
const UPLOAD_JOB_TTL_MS = 60 * 60 * 1000;   // 1 hour after completion

function createUploadJob() {
    const jobId = uuidv4();
    const job = {
        id: jobId,
        status: 'queued',           // 'queued' | 'processing' | 'done' | 'error'
        phase: 'queued',            // 'queued' | 'starting' | 'reencoding' | 'finalizing' | 'complete' | 'error'
        progress: 0,                // 0-100
        message: 'Waiting in queue...',
        queuePosition: 0,           // 1-based while queued, 0 while running or done
        createdAt: Date.now(),
        completedAt: null,
        result: null,
        error: null
    };
    uploadJobs.set(jobId, job);
    return job;
}

// Garbage-collect FINISHED jobs only — never delete a queued/processing job.
setInterval(() => {
    const cutoff = Date.now() - UPLOAD_JOB_TTL_MS;
    let removed = 0;
    for (const [id, job] of uploadJobs) {
        if ((job.status === 'done' || job.status === 'error') &&
            (job.completedAt || job.createdAt) < cutoff) {
            uploadJobs.delete(id);
            removed++;
        }
    }
    if (removed > 0) console.log(`[Upload] Cleaned up ${removed} stale job(s)`);
}, 15 * 60 * 1000);

// ======================================================================
// UPLOAD QUEUE
// ======================================================================
// Serializes processUploadAsync so only one upload is being reencoded /
// finalized at a time. Uploads themselves are still received in parallel
// by multer; only the CPU-heavy post-processing step is queued.

class UploadQueue {
    constructor(concurrency = 1, maxDepth = 20) {
        this.concurrency = concurrency;   // 1 = strict FIFO
        this.maxDepth = maxDepth;         // reject if this many are waiting
        this.running = 0;
        this.queue = [];                  // [{ job, files, body, resolve, reject }, ...]
    }

    isFull() {
        return this.queue.length >= this.maxDepth;
    }

    enqueue(job, files, body) {
        if (this.isFull()) {
            return Promise.reject(new Error('Upload queue is full. Please try again later.'));
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ job, files, body, resolve, reject });
            this._updateQueuePositions();
            this._tick();
        });
    }

    _updateQueuePositions() {
        this.queue.forEach((entry, idx) => {
            entry.job.queuePosition = idx + 1;
            entry.job.message = `Waiting in queue (position ${idx + 1})...`;
        });
    }

    _tick() {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const entry = this.queue.shift();
            this._updateQueuePositions();
            this.running++;

            // Promote job to 'processing'
            entry.job.status = 'processing';
            entry.job.phase = 'starting';
            entry.job.queuePosition = 0;
            entry.job.message = 'Processing upload...';

            console.log(`[Upload] Starting job ${entry.job.id} (${this.running} running, ${this.queue.length} queued)`);

            processUploadAsync(entry.job, entry.files, entry.body)
                .then(() => {
                    entry.job.completedAt = Date.now();
                    entry.resolve();
                })
                .catch(err => {
                    entry.job.completedAt = Date.now();
                    entry.reject(err);
                })
                .finally(() => {
                    this.running--;
                    this._tick();
                });
        }
    }

    getStatus() {
        return {
            running: this.running,
            queued: this.queue.length,
            concurrency: this.concurrency,
            maxDepth: this.maxDepth
        };
    }
}

// Read concurrency from admin_config so a beefy machine can run 2x.
// Default 1 = recommended for AV1.
const _adminCfg = loadAdminConfig();
const _reencodeConcurrency = Math.max(1, parseInt(_adminCfg?.reencodeOnUpload?.concurrency, 10) || 1);
const _uploadQueueDepth = Math.max(1, parseInt(_adminCfg?.reencodeOnUpload?.maxQueueDepth, 10) || 20);

const uploadQueue = new UploadQueue(_reencodeConcurrency, _uploadQueueDepth);
console.log(`[Upload] Queue initialized: concurrency=${_reencodeConcurrency}, maxDepth=${_uploadQueueDepth}`);

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

// Suppress harmless Windows EPERM session rename errors thrown by session-file-store
/*
const originalConsoleError = console.error;
console.error = function(...args) {
    const message = args.join(' ');
    if (message.includes('EPERM') && message.includes('.session')) {
        return;
    }
    originalConsoleError.apply(console, args);
};
*/

// Prevent Node 24 server crash on unhandled rejection
process.on('unhandledRejection', (err) => {
    if (err && err.cancelled) return;
    console.error('[Fatal] Unhandled rejection:', err);
});

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

function promptSkipScan(timeoutMs = 5000) {
    return new Promise((resolve) => {
        if (!process.stdin.isTTY) {
            resolve(false);
            return;
        }
        console.log(`\nPress 's' within ${timeoutMs / 1000} seconds to skip the incremental scan...`);
        let resolved = false;
        const onKeyPress = (chunk) => {
            const key = chunk.toString().toLowerCase();
            if (key === 's') {
                resolved = true;
                cleanup();
                resolve(true);
            }
        };
        const cleanup = () => {
            process.stdin.removeListener('data', onKeyPress);
            process.stdin.setRawMode(false);
            process.stdin.pause();
        };
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', onKeyPress);
        const timer = setTimeout(() => {
            if (!resolved) {
                cleanup();
                resolve(false);
            }
        }, timeoutMs);
    });
}

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
app.use('/spriteimages', express.static(path.join(__dirname, 'spriteimages')));
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
    // User playlists aren't global, so we pass the name through as-is.
    if (req.query.upl) {
        redirectUrl += `&userplaylist=${encodeURIComponent(req.query.upl)}`;
    }
    res.redirect(redirectUrl);
});

// --- PLAYLIST SHORT LINK SYSTEM ---
let playlistShortMap = new Map();
let shortCodeToPlaylistMap = new Map();
const PLAYLIST_SHORT_FILE = path.join(__dirname, 'playlist_shortlinks.json');

let playlistCodeToChannelMap = new Map();

function registerPlaylistChannel(code, channel) {
    if (code && channel && !playlistCodeToChannelMap.has(code)) {
        playlistCodeToChannelMap.set(code, channel);
    }
}

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

// --- CHANNEL SHORT LINK SYSTEM ---
let channelShortMap = new Map();
let shortCodeToChannelMap = new Map();
const CHANNEL_SHORT_FILE = path.join(__dirname, 'channel_shortlinks.json');

function generateChannelShortCode() {
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
    } while (
        shortCodeToChannelMap.has(code) ||
        shortCodeToVideoMap.has(code) ||
        shortCodeToPlaylistMap.has(code)
    );
    return code;
}

function getOrCreateChannelShortCode(channelName) {
    if (!channelName || typeof channelName !== 'string') return null;
    if (channelShortMap.has(channelName)) return channelShortMap.get(channelName);
    const code = generateChannelShortCode();
    if (!code) return null;
    channelShortMap.set(channelName, code);
    shortCodeToChannelMap.set(code, channelName);
    saveChannelLinksToFile();
    return code;
}

function saveChannelLinksToFile() {
    const obj = {};
    channelShortMap.forEach((val, key) => { obj[key] = val; });
    try {
        fs.writeFileSync(CHANNEL_SHORT_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error('Error saving channel links:', err);
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

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    store: new FileStore({
        path: sessionsDir,
        ttl: 86400,
        retries: 5,
        reapInterval: 3600,
        fileExtension: '.session',
        reapAsync: true,
        reapSyncFallback: false,
        logFn: function() {},
        encoding: 'utf8',
        encrypt: false
    }),
    secret: process.env.SESSION_SECRET || 'local-dev-only-fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: 'auto',
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
const metadataCachePath = path.join(__dirname, 'metadata_cache.json');
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

function getPlaylistThumbnailFromOrder(channel, playlistPath) {
    try {
        const orderFilePath = path.join(__dirname, 'playlist-orders', channel, `${playlistPath}.jsonl`);
        if (!fs.existsSync(orderFilePath)) return null;
        const data = fs.readFileSync(orderFilePath, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return null;
        const firstEntry = JSON.parse(lines[0]);
        if (!firstEntry.path) return null;
        const videoPathWithoutExt = firstEntry.path.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i, '');
        const fullThumbPath = path.join(__dirname, 'thumbnails', `${videoPathWithoutExt}.jpg`);
        if (fs.existsSync(fullThumbPath)) {
            const parts = videoPathWithoutExt.split('/');
            const encodedParts = parts.map(part => encodeURIComponent(part));
            const encodedPath = encodedParts.join('/');
            return `/thumbnails/${encodedPath}.jpg`;
        } else {
            console.log(`Thumbnail not found on disk: ${fullThumbPath}`);
            return null;
        }
    } catch (err) {
        console.error(`Error reading order file for ${channel}/${playlistPath}:`, err.message);
        return null;
    }
}

app.get('/playlist-order-thumbnail/:channel/:playlist*', (req, res) => {
    const channel = req.params.channel;
    const playlistPath = req.params[0] ? `${req.params.playlist}/${req.params[0]}` : req.params.playlist;
    const thumbnail = getPlaylistThumbnailFromOrder(channel, playlistPath);
    if (thumbnail) {
        res.send(thumbnail);
    } else {
        res.status(404).send('Thumbnail not found');
    }
});

function loadPlaylistThumbnailCache() {
    if (fs.existsSync(playlistCacheFilePath)) {
        try {
            const data = fs.readFileSync(playlistCacheFilePath, 'utf8');
            playlistThumbnailCache = JSON.parse(data);
            console.log(`Loaded playlist thumbnail cache (${Object.keys(playlistThumbnailCache).length} entries).`);
        } catch (err) {
            console.log('Failed to read playlist cache, using on-demand generation.');
            playlistThumbnailCache = {};
        }
    } else {
        console.log('playlist_cache.json not found, using on-demand generation.');
        playlistThumbnailCache = {};
    }
}

function buildPlaylistThumbnailCache() {
    console.log('Playlist thumbnail cache is now generated on-demand from JSONL order files.');
    try {
        if (!fs.existsSync(playlistCacheFilePath)) {
            fs.writeFileSync(playlistCacheFilePath, JSON.stringify({}, null, 2));
        }
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

function refreshSingleChannelCache(channelName) {
    const videosDir = path.join(__dirname, 'videos');
    const channelPath = path.join(videosDir, channelName);

    if (!fs.existsSync(channelPath) || !fs.statSync(channelPath).isDirectory()) {
        console.warn(`[Upload] refreshSingleChannelCache: channel folder not found: ${channelPath}`);
        return { added: 0, removed: 0 };
    }

    // Load the current cache and version state
    const oldCache = loadExistingCache();
    const oldVersions = loadFolderVersions();

    // Compute the new version fingerprint for just this channel
    const newVersion = getFolderVersion(channelPath);
    if (!newVersion) {
        console.warn(`[Upload] refreshSingleChannelCache: could not stat ${channelPath}`);
        return { added: 0, removed: 0 };
    }

    // Re-scan only this channel's files
    const channelVideos = scanFolder(channelPath, videosDir);

    // Build a lookup set of the newly scanned paths for diffing
    const newPaths = new Set(channelVideos.map(v => v.path));

    // Old videos for this channel that no longer exist on disk
    const oldPaths = new Set(
        oldCache.filter(v => v.path.startsWith(channelName + '/')).map(v => v.path)
    );

    const addedPaths = channelVideos.filter(v => !oldPaths.has(v.path)).map(v => v.path);
    const removedPaths = [...oldPaths].filter(p => !newPaths.has(p));

    // Replace this channel's entries in the persisted cache
    const otherChannelVideos = oldCache.filter(v => !v.path.startsWith(channelName + '/'));
    const mergedCache = otherChannelVideos.concat(channelVideos);
    mergedCache.sort((a, b) => a.path.localeCompare(b.path));

    // Write to disk (atomic-ish via writeFileSync of the whole file)
    try {
        fs.writeFileSync(cacheFilePath, JSON.stringify(mergedCache, null, 2));
    } catch (err) {
        console.error('[Upload] refreshSingleChannelCache: failed to write video_cache.json:', err);
        return { added: 0, removed: 0 };
    }

    // Refresh in-memory state
    videoCache = new Map(mergedCache.map(v => [v.path, v]));
    videoArray = mergedCache;

    // Update folder_versions.json so a later boot scan won't re-scan this channel
    oldVersions[channelName] = newVersion;
    try {
        saveFolderVersions(oldVersions);
    } catch (err) {
        console.error('[Upload] refreshSingleChannelCache: failed to save folder_versions.json:', err);
    }

    // Rebuild the recommendation index (fast: iterates in-memory videoArray)
    try {
        buildRecommendationIndex();
    } catch (err) {
        console.error('[Upload] refreshSingleChannelCache: failed to rebuild recommendation index:', err);
    }

    // Fire notifications for newly added files (uses the same helper as the full scan)
    if (addedPaths.length > 0) {
        try {
            generateNotifications(addedPaths);
        } catch (err) {
            console.error('[Upload] refreshSingleChannelCache: failed to generate notifications:', err);
        }
    }

    // Short-link generation for the new files (they'll be missing from shortlinks.json)
    if (addedPaths.length > 0) {
        let newCodesGenerated = 0;
        addedPaths.forEach(videoPath => {
            if (!shortLinksMap.has(videoPath)) {
                const code = generateShortCode();
                shortLinksMap.set(videoPath, code);
                shortCodeToVideoMap.set(code, videoPath);
                newCodesGenerated++;
            }
        });
        if (newCodesGenerated > 0) {
            const obj = {};
            shortLinksMap.forEach((code, videoPath) => { obj[videoPath] = code; });
            try {
                fs.writeFileSync(shortLinksFilePath, JSON.stringify(obj, null, 2));
            } catch (err) {
                console.error('[Upload] refreshSingleChannelCache: failed to save shortlinks.json:', err);
            }
        }
    }

    return { added: addedPaths.length, removed: removedPaths.length };
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
        console.error('Error reading videos directory:', err);
    }
    const progressBar = new cliProgress.SingleBar({
        format: 'Progress [{bar}] {percentage}% | {value}/{total} channels',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        clearOnComplete: true
    });
    console.log(`${allChannels.length} channels found.`);
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

async function initializeVideoCache() {
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
                const skip = await promptSkipScan();
                if (skip) {
                    console.log('Skipping incremental scan.');
                    buildRecommendationIndex();
                    return;
                }
                incrementalScanAndCacheVideos();
                return;
            }
        } catch (err) {
            console.log('Cache corrupted or empty, re-running full scan...', err);
        }
    } else {
        console.log('video_cache.json not found, running full scan...');
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
app.get('/metadata_cache.json', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'metadata_cache.json'), err => {
        if (err) next();
    });
});

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

    videoArray.forEach(video => {
        const parts = video.path.split('/');
        if (parts.length > 2) {
            const channel = parts[0];
            const playlistName = parts.slice(1, -1).join('/');
            const code = playlistShortMap.get(playlistName);
            if (code) registerPlaylistChannel(code, channel);
        }
    });
}

function initializeChannelShortLinks() {
    if (fs.existsSync(CHANNEL_SHORT_FILE)) {
        try {
            const data = fs.readFileSync(CHANNEL_SHORT_FILE, 'utf8');
            const links = JSON.parse(data);
            for (const [name, code] of Object.entries(links)) {
                channelShortMap.set(name, code);
                shortCodeToChannelMap.set(code, name);
            }
            console.log(`${channelShortMap.size} Channel Short Links loaded.`);
        } catch (err) {
            console.error('Error loading channel links:', err);
        }
    }
    let newCodesGenerated = 0;
    const channelsFound = new Set();
    videoArray.forEach(video => {
        const parts = video.path.split('/');
        if (parts.length > 0 && parts[0]) channelsFound.add(parts[0]);
    });
    channelsFound.forEach(channelName => {
        if (!channelShortMap.has(channelName)) {
            const code = generateChannelShortCode();
            if (code) {
                channelShortMap.set(channelName, code);
                shortCodeToChannelMap.set(code, channelName);
                newCodesGenerated++;
            }
        }
    });
    if (newCodesGenerated > 0) {
        saveChannelLinksToFile();
        console.log(`${newCodesGenerated} new Channel Short Links generated. Total: ${channelShortMap.size}`);
    }
}

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

// --- LOAD METADATA CACHE ---
let metadataCache = { videos: {}, channels: {}, playlists: {} };
try {
    if (fs.existsSync(metadataCachePath)) {
        metadataCache = JSON.parse(fs.readFileSync(metadataCachePath, 'utf8'));
        console.log(`Metadata cache loaded: ${Object.keys(metadataCache.videos || {}).length} videos, ` +
                    `${Object.keys(metadataCache.channels || {}).length} channels, ` +
                    `${Object.keys(metadataCache.playlists || {}).length} playlists.`);
    } else {
        console.log('metadata_cache.json not found — run LocalYT-Rev-Files/generate_metadata_cache.py to enable it.');
    }
} catch (err) {
    console.error('Failed to load metadata_cache.json:', err.message);
}

function getVideoDurationSeconds(video) {
    const cached = metadataCache.videos && metadataCache.videos[video.path];
    if (cached && cached.videoLength) {
        return parseDurationToSecondsServer(cached.videoLength);
    }
    const channel = video.path.split('/')[0];
    const videoBaseName = video.basePath.split('/').pop();
    let lengthPath = path.join(__dirname, 'videolengths', channel, `${videoBaseName}.txt`);
    if (!fs.existsSync(lengthPath)) {
        lengthPath = path.join(__dirname, 'videolengths', `${video.basePath}.txt`);
    }
    if (fs.existsSync(lengthPath)) {
        try {
            return parseDurationToSecondsServer(fs.readFileSync(lengthPath, 'utf8').trim());
        } catch (e) { return 0; }
    }
    return 0;
}

function getVideoDetails(videoSlice) {
    return videoSlice.map(video => {
        const cached = metadataCache.videos && metadataCache.videos[video.path];
        let viewCount = '0';
        if (cached && cached.viewCount !== undefined) {
            viewCount = cached.viewCount;
        } else {
            const viewCountPath = path.join(__dirname, 'viewcounts', `${video.basePath}.txt`);
            try { if (fs.existsSync(viewCountPath)) viewCount = fs.readFileSync(viewCountPath, 'utf8'); } catch (e) {}
        }
        return {
            path: video.path,
            viewCount: viewCount,
            fileDate: video.fileDate || (cached && cached.fileDate) || '',
            displayName: video.displayName || (cached && cached.displayName) || video.path,
            tags: video.tags || [],
            videoLength: (cached && cached.videoLength) || '',
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
const MAX_TAG_PCT = 0.30;
const MINORITY_TAG_FLOOR = 3;

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
                const tagNames = Object.keys(userPrefs).filter(
                    t => userPrefs[t] / total >= LOW_TAG_THRESHOLD
                );
                const uniform = tagNames.length ? 1 / tagNames.length : 0;
                for (const tag of tagNames) {
                    const pct = userPrefs[tag] / total;
                    const blended = pct * 0.7 + uniform * 0.3;
                    tagPercent[tag] = Math.min(Math.sqrt(blended), MAX_TAG_PCT);
                }
            }
            const scoredVideos = videoArray.map(video => {
                let score = 0;
                const channel = video.path.split('/')[0];
                if (video.tags) {
                    for (const tag of video.tags) {
                        let weight = tagPercent[tag] || 0;
                        if (tag.toLowerCase() === channel.toLowerCase()) {
                            weight *= (1/3);
                        }
                        score += weight;
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

app.get('/tag-videos', (req, res) => {
    const tag = req.query.tag;
    const limit = parseInt(req.query.limit) || 20;
    if (!tag) return res.status(400).json({ error: 'Missing tag parameter' });
    const videoPaths = recommendationIndex[tag] || [];
    const uniquePaths = [...new Set(videoPaths)];
    shuffleArray(uniquePaths);
    const selected = uniquePaths.slice(0, limit);
    const videos = selected.map(vPath => {
        const video = videoCache.get(vPath);
        if (!video) return null;
        return getVideoDetails([video])[0];
    }).filter(Boolean);
    res.json(videos);
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
            registrationCooldowns.set(clientIp, Date.now() + REGISTER_COOLDOWN_MS);
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
        
        // Force the session to save to the file system before responding
        req.session.save((err) => {
            if (err) {
                console.error("CRITICAL SESSION SAVE ERROR:", err);
                return res.status(500).json({ error: 'Failed to save session. Check server console.' });
            }
            res.json({ success: true, hasPreferences });
        });
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
// PREFERENCE UPDATE SYSTEM
// ======================================================================

function batchUpdatePreferences() {
    if (preferenceUpdateQueue.size === 0) return;
    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        let preferencesData = {};
        if (!err) preferencesData = JSON.parse(data);
        preferenceUpdateQueue.forEach((videoTagsArray, userId) => {
            let userPrefs = preferencesData[userId] || {};
            if (!userPrefs || Object.keys(userPrefs).length === 0) {
                userPrefs = {};
            }
            for (const videoTags of videoTagsArray) {
                const totalNewPercentage = 10;
                const perTagPercentage = totalNewPercentage / videoTags.length;
                const currentTotal = Object.values(userPrefs).reduce((sum, v) => sum + v, 0);
                if (currentTotal === 0) {
                    for (const tag of videoTags) {
                        const cleanTag = tag.trim();
                        if (cleanTag && !IGNORED_TAGS.has(cleanTag.toLowerCase())) {
                            userPrefs[cleanTag] = (userPrefs[cleanTag] || 0) + perTagPercentage;
                        }
                    }
                    continue;
                }
                const totalReduction = totalNewPercentage;
                const reductionFactor = totalReduction / currentTotal;
                for (let tag in userPrefs) {
                    userPrefs[tag] *= (1 - reductionFactor);
                }
                for (const tag of videoTags) {
                    const cleanTag = tag.trim();
                    if (cleanTag && !IGNORED_TAGS.has(cleanTag.toLowerCase())) {
                        userPrefs[cleanTag] = (userPrefs[cleanTag] || 0) + perTagPercentage;
                    }
                }
            }
            const total = Object.values(userPrefs).reduce((sum, v) => sum + v, 0);
            if (total > 0) {
                const cleanedPrefs = {};
                for (let tag in userPrefs) {
                    const pct = (userPrefs[tag] / total) * 100;
                    if (pct >= (LOW_TAG_THRESHOLD * 100)) {
                        cleanedPrefs[tag] = Math.round(pct * 100) / 100;
                    } else if (userPrefs[tag] > 0) {
                        cleanedPrefs[tag] = MINORITY_TAG_FLOOR;
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

app.get('/recommendations', recommendationsLimiter, (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const tagFilter = req.query.tag;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    let filteredVideoArray = videoArray;
    if (tagFilter) {
        const lowerTag = tagFilter.toLowerCase();
        filteredVideoArray = videoArray.filter(v =>
            v.tags && v.tags.some(t => t.toLowerCase() === lowerTag)
        );
    }
    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading preferences');
        try {
            const preferencesData = JSON.parse(data);
            const userPrefs = preferencesData[userId] || {};
            const total = Object.values(userPrefs).reduce((sum, v) => sum + v, 0);
            const tagPercent = {};
            if (total > 0) {
                const tagNames = Object.keys(userPrefs).filter(
                    t => userPrefs[t] / total >= LOW_TAG_THRESHOLD
                );
                const uniform = tagNames.length ? 1 / tagNames.length : 0;
                for (const tag of tagNames) {
                    const pct = userPrefs[tag] / total;
                    const blended = pct * 0.7 + uniform * 0.3;
                    tagPercent[tag] = Math.min(Math.sqrt(blended), MAX_TAG_PCT);
                }
            }
            if (Object.keys(tagPercent).length === 0) {
                const allVideos = [...filteredVideoArray];
                shuffleArray(allVideos);
                const paginated = allVideos.slice(startIndex, endIndex);
                return res.json({
                    videos: getVideoDetails(paginated),
                    page, limit,
                    total: filteredVideoArray.length,
                    hasMore: endIndex < filteredVideoArray.length
                });
            }
            const scoredVideos = filteredVideoArray.map(video => {
                let score = 0;
                const channel = video.path.split('/')[0];
                if (video.tags) {
                    for (const tag of video.tags) {
                        let weight = tagPercent[tag] || 0;
                        if (tag.toLowerCase() === channel.toLowerCase()) {
                            weight *= (1/3);
                        }
                        score += weight;
                    }
                }
                const randomFactor = 0.9 + (Math.random() * 0.2);
                score = score * randomFactor;
                return { video, score };
            });
            scoredVideos.sort((a, b) => b.score - a.score);
            const perChannelCap = Math.max(2, Math.ceil(limit * 0.4));
            const cappedTarget = Math.max(100, endIndex + limit);
            const channelCaps = {};
            const capped = [];
            for (const item of scoredVideos) {
                const ch = item.video.path.split('/')[0];
                if ((channelCaps[ch] || 0) >= perChannelCap) continue;
                channelCaps[ch] = (channelCaps[ch] || 0) + 1;
                capped.push(item);
                if (capped.length >= cappedTarget) break;
            }
            shuffleArray(capped);
            const paginated = capped.slice(startIndex, endIndex).map(item => item.video);
            if (paginated.length < limit) {
                const remaining = limit - paginated.length;
                const allVideos = filteredVideoArray.filter(v => !paginated.includes(v));
                shuffleArray(allVideos);
                const fill = allVideos.slice(0, remaining);
                paginated.push(...fill);
            }
            res.json({
                videos: getVideoDetails(paginated),
                page, limit,
                total: filteredVideoArray.length,
                hasMore: endIndex < filteredVideoArray.length
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
                    let thumbnail = getPlaylistThumbnailFromOrder(channel, relativePath);
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
    const orderFilePath = path.join(__dirname, 'playlist-orders', channel, `${playlistPath}.jsonl`);
    let customOrder = [];
    if (fs.existsSync(orderFilePath)) {
        try {
            const data = fs.readFileSync(orderFilePath, 'utf8');
            const lines = data.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                const entry = JSON.parse(line);
                if (entry.path) customOrder.push(entry.path);
            }
        } catch (err) {
            console.error(`Error reading order file: ${err.message}`);
        }
    }
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
                let orderIndex = -1;
                if (customOrder.length > 0) {
                    orderIndex = customOrder.indexOf(relativePath);
                }
                videoFiles.push({
                    path: relativePath,
                    viewCount: viewCount,
                    fileDate: cached.fileDate || '',
                    displayName: cached.displayName || file,
                    orderIndex: orderIndex
                });
            }
        });
    }
    readPlaylistDir(playlistDir);
    if (customOrder.length > 0) {
        videoFiles.sort((a, b) => {
            if (a.orderIndex === -1 && b.orderIndex === -1) return 0;
            if (a.orderIndex === -1) return 1;
            if (b.orderIndex === -1) return -1;
            return a.orderIndex - b.orderIndex;
        });
    }
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

// ======================================================================
// SERVER-SIDE SEARCH
// ======================================================================

function parseSearchQueryServer(rawQuery) {
    const operators = {
        before: null, after: null, channel: null,
        length: null, views: null, tag: null
    };
    if (!rawQuery) return { operators, freeText: '' };

    let remaining = rawQuery;

    // Numeric operators: length:, views:  (supports >=, <=, >, <, =)
    const numRegex = /\b(length|views):\s*(?:"([^"]*)"|((?:>=|<=|>|<|=)\s*-?\d+(?:\.\d+)?)|(\S+))/gi;
    remaining = remaining.replace(numRegex, (fullMatch, opName, quoted, cmpExpr, unquoted) => {
        const op = opName.toLowerCase();
        const tryParse = (str) => {
            const m = String(str).match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
            return m ? { op: m[1] || '=', value: parseFloat(m[2]) } : null;
        };
        if (quoted !== undefined) { const p = tryParse(quoted); if (p) { operators[op] = p; return ' '; } return fullMatch; }
        if (cmpExpr !== undefined) { const p = tryParse(cmpExpr); if (p) { operators[op] = p; return ' '; } return fullMatch; }
        if (unquoted !== undefined) { const p = tryParse(unquoted); if (p) { operators[op] = p; return ' '; } }
        return fullMatch;
    });

    // String operators: before:, after:, channel:, tag:
    const strRegex = /\b(before|after|channel|tag):\s*(?:"([^"]*)"|(\S+))/gi;
    remaining = remaining.replace(strRegex, (fullMatch, opName, quoted, unquoted) => {
        operators[opName.toLowerCase()] = quoted !== undefined ? quoted : unquoted;
        return ' ';
    });

    return { operators, freeText: remaining.replace(/\s+/g, ' ').trim() };
}

function hasAnyOperatorServer(operators) {
    if (!operators) return false;
    return Object.values(operators).some(v => v !== null && v !== undefined && v !== '');
}

function compareValueServer(actual, op, expected) {
    switch (op) {
        case '>':  return actual > expected;
        case '>=': return actual >= expected;
        case '<':  return actual < expected;
        case '<=': return actual <= expected;
        case '=':  return actual === expected;
        default:   return true;
    }
}

function parseFileDateServer(dateStr) {
    if (!dateStr) return null;
    const parts = String(dateStr).trim().split('.');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month, day);
}

function parseOperatorDateServer(dateStr) {
    if (!dateStr) return null;
    const m = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function videoMatchesOperators(video, operators) {
    if (!video || !operators) return true;
    const cached = (metadataCache.videos && metadataCache.videos[video.path]) || {};

    if (operators.channel) {
        const channel = (video.path || '').split('/')[0];
        if (channel.toLowerCase() !== operators.channel.toLowerCase()) return false;
    }

    if (operators.before || operators.after) {
        const fileDate = parseFileDateServer(cached.fileDate || video.fileDate);
        if (!fileDate) return false;
        if (operators.before) {
            const b = parseOperatorDateServer(operators.before);
            if (b && fileDate >= b) return false;
        }
        if (operators.after) {
            const a = parseOperatorDateServer(operators.after);
            if (a && fileDate <= a) return false;
        }
    }

    if (operators.length) {
        const lengthStr = cached.videoLength || '';
        if (!lengthStr) return false;
        const seconds = parseDurationToSecondsServer(lengthStr);
        if (!compareValueServer(seconds, operators.length.op, operators.length.value)) return false;
    }

    if (operators.views) {
        const views = parseInt(String(cached.viewCount || '').replace(/,/g, ''), 10);
        if (isNaN(views)) return false;
        if (!compareValueServer(views, operators.views.op, operators.views.value)) return false;
    }

    if (operators.tag) {
        const tags = video.tags || (cached && cached.tags) || [];
        if (!Array.isArray(tags) || tags.length === 0) return false;
        const q = String(operators.tag).toLowerCase();
        if (!tags.some(t => String(t).toLowerCase() === q)) return false;
    }

    return true;
}

/**
 * Score a pool of videos by free text. Returns ALL scored matches, sorted.
 * Caller slices to maxResults — this lets us report an accurate `total`.
 */
function scoreVideosServer(pool, freeText) {
    if (!freeText) return pool.map(v => ({ video: v, score: 0, isPriority: false }));

    const queryLower = freeText.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const termRegexes = queryTerms.map(term => new RegExp(`\\b(${term})\\b`, 'i'));

    // Build channel set + priority channels once per request
    const channelSet = new Set();
    for (const v of pool) channelSet.add((v.path.split('/')[0] || '').toLowerCase());
    const potentialChannels = new Set();
    for (const re of termRegexes) {
        channelSet.forEach(ch => { if (re.test(ch)) potentialChannels.add(ch); });
    }

    const scored = [];
    for (const video of pool) {
        const lowerTitle = (video.displayName || '').toLowerCase();
        const lowerChannel = (video.path.split('/')[0] || '').toLowerCase();

        let titleMatchCount = 0, channelMatchCount = 0, baseScore = 0;

        if (lowerTitle === queryLower) baseScore += 100;
        if (lowerChannel === queryLower) baseScore += 80;

        for (const re of termRegexes) {
            if (re.test(lowerTitle))   { titleMatchCount++;   baseScore += 10; }
            if (re.test(lowerChannel)) { channelMatchCount++; baseScore += 5;  }
        }

        if (titleMatchCount >= 4)      baseScore *= 15;
        else if (titleMatchCount === 3) baseScore *= 8;
        else if (titleMatchCount === 2) baseScore *= 3;
        if (channelMatchCount >= 2)     baseScore *= 2;

        const isPriority = potentialChannels.has(lowerChannel);
        if (isPriority && titleMatchCount > 0) baseScore += 15;

        if (baseScore > 0) scored.push({ video, score: baseScore, isPriority });
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.isPriority !== b.isPriority) return a.isPriority ? 1 : -1;
        return 0;
    });
    return scored;
}

/**
 * Enrich a list of videoArray entries with the fields the client needs
 * to render a search result — including resolution + subtitles so the
 * client doesn't need metadata_cache.json at all.
 */
function enrichForSearch(videos) {
    return videos.map(video => {
        const base = getVideoDetails([video])[0];
        const cached = (metadataCache.videos && metadataCache.videos[video.path]) || {};
        if (cached.resolution) base.resolution = cached.resolution;
        if (Array.isArray(cached.subtitles)) base.subtitles = cached.subtitles;
        return base;
    });
}

app.get('/search', (req, res) => {
    const rawQuery = (req.query.q || '').trim();
    const maxResults = Math.min(500, Math.max(1, parseInt(req.query.maxResults, 10) || 100));

    if (!rawQuery) {
        return res.json({
            videos: [], query: '', freeText: '', operators: {},
            total: 0, hasMore: false, channelCounts: {}
        });
    }

    const { operators, freeText } = parseSearchQueryServer(rawQuery);
    const hasOperators = hasAnyOperatorServer(operators);

    // 1. Operator filter first — this both improves correctness and
    //    reduces the pool the scorer has to touch.
    let pool = videoArray;
    if (hasOperators) {
        pool = pool.filter(v => videoMatchesOperators(v, operators));
    }

    // 2. Free-text scoring (or plain slice if operator-only)
    const scored = freeText ? scoreVideosServer(pool, freeText) : null;

    if (!freeText && !hasOperators) {
        return res.json({
            videos: [], query: rawQuery, freeText, operators,
            total: 0, hasMore: false, channelCounts: {}
        });
    }

    const matchedVideos = freeText ? scored.map(s => s.video) : pool;
    const total = matchedVideos.length;
    const page = matchedVideos.slice(0, maxResults);

    // 3. Channel counts for the "channel card" header
    const channelCounts = {};
    for (const v of page) {
        const ch = v.path.split('/')[0];
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    }

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
        videos: enrichForSearch(page),
        query: rawQuery,
        freeText,
        operators,
        total,
        hasMore: total > maxResults,
        channelCounts
    });
});

app.get('/api/playlist-shortlink', (req, res) => {
    const playlist = req.query.playlist;
    const channel = req.query.channel;
    if (!playlist) return res.status(400).json({ error: 'Missing playlist' });

    let code = playlistShortMap.get(playlist);
    if (!code) {
        code = getOrCreatePlaylistShortCode(playlist);
    }
    if (!code) return res.status(404).json({ error: 'Could not create short link' });

    // Register the channel so /p/:code can resolve it later,
    // even if this playlist wasn't in videoArray at startup.
    if (channel) registerPlaylistChannel(code, channel);

    res.json({ shortPath: `/p/${code}` });
});

// Standalone playlist short link redirect
app.get('/p/:code', (req, res) => {
    const code = req.params.code;
    const playlistName = shortCodeToPlaylistMap.get(code);
    if (!playlistName) {
        return res.status(404).send('Playlist short link not found');
    }

    let channel = playlistCodeToChannelMap.get(code);
    // Fallback: scan videoArray if the map is stale (e.g. playlist was uploaded
    // after startup but never triggered /api/playlist-shortlink yet).
    if (!channel) {
        for (const video of videoArray) {
            const parts = video.path.split('/');
            if (parts.length > 2) {
                const pl = parts.slice(1, -1).join('/');
                if (pl === playlistName) {
                    channel = parts[0];
                    registerPlaylistChannel(code, channel);
                    break;
                }
            }
        }
    }
    if (!channel) {
        return res.status(404).send('Could not resolve channel for playlist');
    }

    res.redirect(
        `/playlist.html?channel=${encodeURIComponent(channel)}` +
        `&playlist=${encodeURIComponent(playlistName)}`
    );
});

// Returns { shortPath: "/c/CODE" } for a given channel
app.get('/api/channel-shortlink', (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ error: 'Missing channel' });
    const code = getOrCreateChannelShortCode(channel);
    if (!code) return res.status(404).json({ error: 'Could not create short link' });
    res.json({ shortPath: `/c/${code}` });
});

// Standalone channel short link redirect (supports /c/CODE and /c/CODE/<tab>)
app.get('/c/:code/:tab?', (req, res) => {
    const code = req.params.code;
    const tab = req.params.tab;
    const channelName = shortCodeToChannelMap.get(code);
    if (!channelName) return res.status(404).send('Channel short link not found');

    let redirectUrl = `/channel.html?channel=${encodeURIComponent(channelName)}`;
    const validTabs = ['videos', 'playlists', 'about', 'posts', 'search', 'streams', 'related'];
    if (tab && validTabs.includes(tab)) {
        redirectUrl += `/${tab}`;
    }
    // Preserve ?q=… on search URLs
    if (req.query.q) {
        redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(req.query.q);
    }
    res.redirect(redirectUrl);
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
            const channel = video.split('/')[0];
            if (channel) registerPlaylistChannel(plCode, channel);
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

// ======================================================================
// VIDEO UPLOAD HELPERS
// (Everything below this line runs AFTER app.use(session(...)),
//  so req.session is guaranteed to be populated in the two routes that
//  follow.)
// ======================================================================

function findBinary(name) {
    const bundled = path.join(__dirname, 'LocalYT-Rev-Files', 'FFmpeg', `${name}.exe`);
    if (fs.existsSync(bundled)) return bundled;
    return name;
}

function runProcess(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { windowsHide: true });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => stdout += d.toString());
        child.stderr.on('data', d => stderr += d.toString());
        child.on('close', code => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`${cmd} exited with ${code}: ${stderr}`));
        });
        child.on('error', reject);
    });
}

function runPythonScript(scriptName, args = []) {
    return new Promise((resolve, reject) => {
        const candidates = [
            path.join(__dirname, 'venv', 'python.exe'),
            path.join(__dirname, 'venv', 'Scripts', 'python.exe'),
        ];
        let pythonExe = 'python';
        for (const c of candidates) {
            if (fs.existsSync(c)) { pythonExe = c; break; }
        }
        const scriptPath = path.join(__dirname, 'LocalYT-Rev-Files', scriptName);
        if (!fs.existsSync(scriptPath)) {
            return reject(new Error(`Python script not found: ${scriptPath}`));
        }
        const child = spawn(pythonExe, [scriptPath, ...args], {
            cwd: __dirname,
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => stdout += d.toString());
        child.stderr.on('data', d => stderr += d.toString());
        child.on('close', code => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`${scriptName} exited with ${code}: ${stderr}`));
        });
        child.on('error', reject);
    });
}

// Serialize Python scripts by name so two invocations of the same script
// (e.g. from two queued uploads) don't race on the files they touch.
const pythonScriptLocks = new Map();

async function runPythonScriptSerialized(scriptName, args = []) {
    const prev = pythonScriptLocks.get(scriptName);
    if (prev) {
        try { await prev; } catch { /* first run's failure doesn't block next */ }
    }
    const promise = runPythonScript(scriptName, args);
    pythonScriptLocks.set(scriptName, promise);
    promise.finally(() => {
        if (pythonScriptLocks.get(scriptName) === promise) {
            pythonScriptLocks.delete(scriptName);
        }
    }).catch(() => {});
    return promise;
}

async function probeVideoInfo(filePath) {
    try {
        const { stdout } = await runProcess(findBinary('ffprobe'), [
            '-v', 'error',
            '-show_entries',
            'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate:format=duration',
            '-of', 'json',
            filePath
        ]);
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const videoStream = streams.find(s => s.codec_type === 'video') || {};
        const audioStream = streams.find(s => s.codec_type === 'audio') || {};
        const duration = parseFloat((data.format && data.format.duration) || '0');

        let fps = 0;
        const fpsStr = videoStream.avg_frame_rate || videoStream.r_frame_rate || '0/0';
        const [fpsNum, fpsDen] = String(fpsStr).split('/').map(Number);
        if (fpsDen && fpsNum && isFinite(fpsNum / fpsDen)) fps = fpsNum / fpsDen;

        return {
            durationSec: isFinite(duration) && duration > 0 ? duration : 0,
            width: parseInt(videoStream.width, 10) || 0,
            height: parseInt(videoStream.height, 10) || 0,
            codec: (videoStream.codec_name || 'Unknown').toUpperCase(),
            audioCodec: (audioStream.codec_name || '').toLowerCase(),
            fps: fps
        };
    } catch {
        return { durationSec: 0, width: 0, height: 0, codec: 'Unknown', audioCodec: '', fps: 0 };
    }
}

// Friendly codec aliases → ffmpeg encoder names
const VIDEO_CODEC_ALIASES = {
    'av1': 'libsvtav1',
    'h264': 'libx264',
    'h265': 'libx265',
    'hevc': 'libx265',
    'vp9': 'libvpx-vp9'
};
const AUDIO_CODEC_ALIASES = {
    'opus': 'libopus',
    'aac': 'aac',
    'mp3': 'libmp3lame'
};

function resolveCodec(alias, aliases) {
    if (!alias) return null;
    const lower = String(alias).toLowerCase();
    return aliases[lower] || alias; // pass-through if it's already a raw encoder name
}

// Encode settings that don't apply to every codec — silently dropped if N/A.
function buildCodecArgs(videoEncoder, crf, preset) {
    const args = ['-c:v', videoEncoder];
    // CRF flag name varies by encoder
    if (videoEncoder === 'libsvtav1' || videoEncoder === 'libaom-av1' || videoEncoder === 'librav1e') {
        args.push('-crf', String(crf));
        if (videoEncoder === 'libsvtav1') {
            // Preset scale differs (0-13 for SVT, 0-8 for aom/rav1e)
            args.push('-preset', String(preset));
            // tune=0 = PSNR (default), tune=1 = VQ (psychovisual). PSNR is safer.
            args.push('-svtav1-params', 'tune=0');
        } else if (videoEncoder === 'libaom-av1' || videoEncoder === 'librav1e') {
            args.push('-cpu-used', String(Math.min(8, Math.max(0, preset))));
        }
    } else if (videoEncoder === 'libx264' || videoEncoder === 'libx265') {
        args.push('-crf', String(crf));
        args.push('-preset', ['ultrafast','superfast','veryfast','faster','fast','medium','slow','slower','veryslow'][Math.min(8, preset)] || 'medium');
    } else if (videoEncoder === 'libvpx-vp9') {
        args.push('-crf', String(crf));
        args.push('-b:v', '0'); // required for VP9 CRF mode
        args.push('-row-mt', '1');
    }
    return args;
}

/**
 * Reencode a video to the target spec.
 * Writes to `targetPath`; caller is responsible for moving/deleting it.
 * Throws on ffmpeg failure (caller should catch and fall back to original).
 */
async function reencodeVideo(sourcePath, targetPath, config, onProgress = () => {}) {
    const ffmpeg = findBinary('ffmpeg');
    const info = await probeVideoInfo(sourcePath);

    const targetW = parseInt(config.targetWidth, 10) || 1920;
    const targetH = parseInt(config.targetHeight, 10) || 1080;
    const crf = parseInt(config.crf, 10) || 28;
    const preset = parseInt(config.preset, 10) || 6;
    const fpsCap = parseInt(config.fpsCap, 10) || 60;
    const videoEncoder = resolveCodec(config.videoCodec || 'av1', VIDEO_CODEC_ALIASES);
    const audioEncoder = resolveCodec(config.audioCodec || 'opus', AUDIO_CODEC_ALIASES);
    const audioBitrate = config.audioBitrate || '128k';

    if (!videoEncoder) throw new Error('No video codec configured');
    if (!audioEncoder) throw new Error('No audio codec configured');

    const filters = [
        `scale='min(${targetW},iw)':'min(${targetH},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`
    ];
    if (info.fps && info.fps > fpsCap) {
        filters.push(`fps=${fpsCap}`);
    }

    const args = [
        '-i', sourcePath,
        ...buildCodecArgs(videoEncoder, crf, preset),
        '-vf', filters.join(','),
        '-c:a', audioEncoder,
        '-b:a', audioBitrate,
        '-progress', 'pipe:1',
        '-nostats',
        '-y',
        targetPath
    ];

    const durationSec = info.durationSec;
    console.log(`[Reencode] ${path.basename(sourcePath)} → ${videoEncoder} crf=${crf} preset=${preset} ${targetW}x${targetH} (source: ${info.width}x${info.height} @ ${info.fps.toFixed(2)}fps, ${durationSec.toFixed(1)}s)`);

    const started = Date.now();

    await new Promise((resolve, reject) => {
        const child = spawn(ffmpeg, args, { windowsHide: true });
        let stdoutBuf = '';
        let stderrTail = '';

        child.stdout.on('data', (chunk) => {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split('\n');
            stdoutBuf = lines.pop();   // keep partial last line for next chunk

            for (const line of lines) {
                const eq = line.indexOf('=');
                if (eq === -1) continue;
                const key = line.slice(0, eq).trim();
                const value = line.slice(eq + 1).trim();

                // out_time_us and out_time_ms are both microseconds (ffmpeg quirk)
                if (key === 'out_time_us' || key === 'out_time_ms') {
                    const us = parseInt(value, 10);
                    if (!isNaN(us) && durationSec > 0) {
                        const pct = Math.min(99, (us / 1e6 / durationSec) * 100);
                        onProgress(pct);
                    }
                } else if (key === 'progress' && value === 'end') {
                    onProgress(100);
                }
            }
        });

        child.stderr.on('data', (d) => {
            stderrTail += d.toString();
            if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-2000);
        });

        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with ${code}: ${stderrTail.slice(-500)}`));
        });
        child.on('error', reject);
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[Reencode] Finished in ${elapsed}s → ${path.basename(targetPath)}`);
}

function classifyResolution(width, height) {
    const maxDim = Math.max(width, height);
    if (maxDim >= 2160) return '4K';
    if (maxDim >= 1440) return '2K';
    if (maxDim >= 1280) return 'HD';
    if (maxDim > 0) return 'SD';
    return '';
}

async function processUploadAsync(job, files, body) {
    const videoFile    = files?.video?.[0];
    const thumbnailFile = files?.thumbnail?.[0];
    const commentsFile = files?.commentsJson?.[0];
    const livechatFile = files?.livechatJson?.[0];

    // Everything the closure needs, extracted from `req`
    const channel  = sanitizeComponent(body.channel || '');
    const playlist = sanitizeComponent(body.playlist || '');

    const originalExt  = path.extname(videoFile.originalname).toLowerCase();
    const originalBase = path.basename(videoFile.originalname, originalExt);
    const baseName     = sanitizeComponent(originalBase) || 'video';

    const warnings = [];

    try {
        // ---------- Reencode (optional) ----------
        const reencodeConfig = (loadAdminConfig().reencodeOnUpload) || {};
        let finalExt = originalExt;
        let sourceForMove = videoFile.path;

        if (reencodeConfig.enabled && originalExt !== '.mp3') {
            const reencodedTemp = `${videoFile.path}-reencoded.${reencodeConfig.container || 'mkv'}`;
            job.phase = 'reencoding';
            job.progress = 5;
            job.message = 'Reencoding video...';

            try {
                await reencodeVideo(videoFile.path, reencodedTemp, reencodeConfig, (pct) => {
                    job.progress = 5 + (pct * 0.75);        // map to 5% .. 80%
                    job.message = `Reencoding video... ${Math.round(pct)}%`;
                });

                const originalSize  = fs.statSync(videoFile.path).size;
                const reencodedSize = fs.statSync(reencodedTemp).size;

                if (reencodeConfig.keepOriginalIfSmaller !== false && reencodedSize >= originalSize) {
                    console.log(`[Upload] Reencode grew file (${originalSize} → ${reencodedSize}), keeping original`);
                    fs.unlinkSync(reencodedTemp);
                } else {
                    const ratio = (reencodedSize / originalSize * 100).toFixed(1);
                    console.log(`[Upload] Reencode: ${(originalSize / 1048576).toFixed(1)}MB → ${(reencodedSize / 1048576).toFixed(1)}MB (${ratio}%)`);
                    fs.unlinkSync(videoFile.path);
                    sourceForMove = reencodedTemp;
                    finalExt = `.${reencodeConfig.container || 'mkv'}`;
                }
            } catch (e) {
                console.error('[Upload] Reencode failed, using original:', e.message);
                warnings.push('Reencoding failed, stored original: ' + e.message);
                try { if (fs.existsSync(reencodedTemp)) fs.unlinkSync(reencodedTemp); } catch {}
            }
        }

        job.progress = 80;
        job.phase = 'finalizing';
        job.message = 'Writing metadata files...';

        // ---------- Everything below is your existing step 1b onward ----------
        // (final path computation, move, probe, all metadata writes,
        //  targeted cache refresh, direct cache patches, background Python)
        //
        // Copy from the previous answer's handler body starting at:
        //     const finalFilename = `${baseName}${finalExt}`;
        // through the end of the try-block, EXCEPT:
        //   - do not use `req.*` — use the local `files`, `body`, and the
        //     extracted `thumbnailFile`, `commentsFile`, `livechatFile`
        //   - do not `res.json(...)` — instead set `job.result = {...}`
        //     and leave the return value for the caller
        //   - add periodic `job.progress = N; job.message = '...'` updates
        //     so the client sees movement during the metadata phase

        const finalFilename = `${baseName}${finalExt}`;
        const channelRelativeDir = playlist ? `${channel}/${playlist}` : channel;
        const videoRelativePath  = `${channelRelativeDir}/${finalFilename}`;
        const videoFullPath      = path.join(__dirname, 'videos', videoRelativePath);

        if (fs.existsSync(videoFullPath)) {
            throw new Error(`File already exists: ${finalFilename}`);
        }

        fs.mkdirSync(path.dirname(videoFullPath), { recursive: true });
        fs.renameSync(sourceForMove, videoFullPath);

        const actualChannel = resolveActualChannelName(channel);

        if (!fs.existsSync(path.join(__dirname, 'channelpic', `${actualChannel}.jpg`))) {
            try { await generateChannelPicInline(actualChannel); }
            catch { warnings.push('Could not generate channel picture.'); }
        }
        const subcountPath = path.join(__dirname, 'subcount', `${actualChannel}.txt`);
        if (!fs.existsSync(subcountPath)) {
            fs.mkdirSync(path.dirname(subcountPath), { recursive: true });
            fs.writeFileSync(subcountPath, '10,000');
        }

        const info = await probeVideoInfo(videoFullPath);
        const durationSec = info.durationSec;
        const resolutionClass = classifyResolution(info.width, info.height);

        // Display name
        const displayName = (body.displayName || '').trim() || baseName;
        const filenameTxtPath = path.join(__dirname, 'filenames', channelRelativeDir, `${baseName}.txt`);
        fs.mkdirSync(path.dirname(filenameTxtPath), { recursive: true });
        fs.writeFileSync(filenameTxtPath, displayName);

        // Upload date
        let uploadDate = (body.uploadDate || '').trim();
        if (uploadDate && /^\d{4}-\d{2}-\d{2}$/.test(uploadDate)) {
            const [y, m, d] = uploadDate.split('-');
            uploadDate = `${d}.${m}.${y}`;
        } else if (!uploadDate) {
            uploadDate = formatDateDDMMYYYY(new Date());
        }
        const filedateTxtPath = path.join(__dirname, 'filedates', channelRelativeDir, `${baseName}.txt`);
        fs.mkdirSync(path.dirname(filedateTxtPath), { recursive: true });
        fs.writeFileSync(filedateTxtPath, uploadDate);

        // Length
        if (durationSec > 0) {
            const lengthTxtPath = path.join(__dirname, 'videolengths', actualChannel, `${baseName}.txt`);
            fs.mkdirSync(path.dirname(lengthTxtPath), { recursive: true });
            fs.writeFileSync(lengthTxtPath, formatDurationHM(durationSec));
        }

        // View count
        let viewCountRaw = (body.viewCount || '').trim();
        let viewCountNum;
        if (viewCountRaw) {
            viewCountNum = parseInt(viewCountRaw.replace(/,/g, ''), 10);
            if (isNaN(viewCountNum) || viewCountNum < 0) viewCountNum = 0;
        } else {
            let subcount = 10000;
            if (fs.existsSync(subcountPath)) {
                const raw = fs.readFileSync(subcountPath, 'utf8').trim().replace(/,/g, '');
                const parsed = parseInt(raw, 10);
                if (!isNaN(parsed) && parsed > 0) subcount = parsed;
            }
            const factor = 0.10 + Math.random() * 0.68;
            const jitter = (Math.random() - 0.5) * subcount * 0.06;
            viewCountNum = Math.max(0, Math.round(subcount * factor + jitter));
        }
        const viewcountTxtPath = path.join(__dirname, 'viewcounts', channelRelativeDir, `${baseName}.txt`);
        fs.mkdirSync(path.dirname(viewcountTxtPath), { recursive: true });
        fs.writeFileSync(viewcountTxtPath, viewCountNum.toLocaleString('en-US'));

        // Likes/dislikes
        let likes = parseInt(body.likes || '', 10);
        let dislikes = parseInt(body.dislikes || '', 10);
        const likesProvided = !isNaN(likes) && likes >= 0;
        const dislikesProvided = !isNaN(dislikes) && dislikes >= 0;
        if (likesProvided && dislikesProvided) {
            // as-is
        } else if (likesProvided) {
            dislikes = Math.max(0, Math.round(likes * (0.008 + Math.random() * 0.02)));
        } else if (dislikesProvided) {
            const ratio = 0.008 + Math.random() * 0.02;
            likes = dislikes > 0 ? Math.round(dislikes / ratio) : 0;
        } else {
            const likeRate = getRealisticLikeRate(viewCountNum);
            likes = Math.max(1, Math.round(viewCountNum * likeRate));
            dislikes = Math.max(0, Math.round(likes * (0.008 + Math.random() * 0.02)));
        }
        const videostatsPath = path.join(__dirname, 'videostats', channelRelativeDir, `${baseName}.txt`);
        fs.mkdirSync(path.dirname(videostatsPath), { recursive: true });
        fs.writeFileSync(videostatsPath, `${likes},${dislikes}`);

        // Resolution + codec
        if (resolutionClass) {
            const resPath = path.join(__dirname, 'videoresolutions', channelRelativeDir, `${baseName}.txt`);
            fs.mkdirSync(path.dirname(resPath), { recursive: true });
            fs.writeFileSync(resPath, `${resolutionClass}\n${info.codec}`);
        }

        // Description
        const description = (body.description || '').trim();
        if (description) {
            const descPath = path.join(__dirname, 'descriptions', actualChannel, `${baseName}.txt`);
            fs.mkdirSync(path.dirname(descPath), { recursive: true });
            fs.writeFileSync(descPath, description);
        }

        // Thumbnail
        const thumbPath = path.join(__dirname, 'thumbnails', channelRelativeDir, `${baseName}.jpg`);
        fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
        if (thumbnailFile) {
            try {
                await sharp(thumbnailFile.path)
                    .resize(1280, 720, { fit: 'cover', position: 'centre' })
                    .jpeg({ quality: 90 })
                    .toFile(thumbPath);
                fs.unlink(thumbnailFile.path, () => {});
            } catch (e) {
                warnings.push('Could not process provided thumbnail: ' + e.message);
                fs.unlink(thumbnailFile.path, () => {});
            }
        }
        if (!fs.existsSync(thumbPath)) {
            await generateThumbnailForUpload(videoFullPath, thumbPath, durationSec, originalExt === '.mp3');
            if (!fs.existsSync(thumbPath)) {
                const placeholder = path.join(__dirname, 'LocalYT-Rev-Files', 'thumbnail-placeholder.jpg');
                if (fs.existsSync(placeholder)) fs.copyFileSync(placeholder, thumbPath);
            }
        }

        // Small thumbnail
        const smallThumbPath = path.join(__dirname, 'thumbnails-small', channelRelativeDir, `${baseName}.jpg`);
        if (fs.existsSync(thumbPath) && !fs.existsSync(smallThumbPath)) {
            try {
                fs.mkdirSync(path.dirname(smallThumbPath), { recursive: true });
                await sharp(thumbPath).resize({ width: 300 }).jpeg({ quality: 85 }).toFile(smallThumbPath);
            } catch { warnings.push('Could not generate small thumbnail.'); }
        }

        // Comments JSON
        let commentsWritten = false;
        if (commentsFile) {
            try {
                const raw = fs.readFileSync(commentsFile.path, 'utf8');
                JSON.parse(raw);
                const commentsPath = path.join(__dirname, 'comments', channelRelativeDir, `${baseName}.json`);
                fs.mkdirSync(path.dirname(commentsPath), { recursive: true });
                fs.writeFileSync(commentsPath, raw);
                fs.unlink(commentsFile.path, () => {});
                commentsWritten = true;
            } catch (e) {
                warnings.push('Invalid comments JSON: ' + e.message);
                fs.unlink(commentsFile.path, () => {});
            }
        }

        // Livechat JSON
        let livechatWritten = false;
        if (livechatFile) {
            try {
                const raw = fs.readFileSync(livechatFile.path, 'utf8');
                const formatted = formatLivechatIfNeeded(JSON.parse(raw));
                const livechatPath = path.join(__dirname, 'livechats', actualChannel, `${baseName}.json`);
                fs.mkdirSync(path.dirname(livechatPath), { recursive: true });
                fs.writeFileSync(livechatPath, JSON.stringify(formatted, null, 4));
                fs.unlink(livechatFile.path, () => {});
                livechatWritten = true;
            } catch (e) {
                warnings.push('Invalid livechat JSON: ' + e.message);
                fs.unlink(livechatFile.path, () => {});
            }
        }

        job.progress = 92;
        job.message = 'Refreshing library cache...';

        // Targeted cache refresh (your existing function)
        try {
            const r = refreshSingleChannelCache(actualChannel);
            console.log(`[Upload] Cache refreshed for "${actualChannel}" (added: ${r.added}, removed: ${r.removed})`);
        } catch (e) {
            console.error('[Upload] Targeted cache refresh failed:', e);
            warnings.push('Video cache not refreshed — run #Setup-or-Update.bat later.');
        }

        job.progress = 95;
        job.message = 'Updating metadata cache...';

        const cacheMeta = {
            displayName,
            fileDate: uploadDate,
            viewCount: viewCountNum.toLocaleString('en-US'),
            videoLength: durationSec > 0 ? formatDurationHM(durationSec) : '',
            likes,
            dislikes,
            resolution: resolutionClass || undefined,
            codec: info.codec || undefined,
            hasThumbnail: fs.existsSync(thumbPath),
            hasThumbnailSmall: fs.existsSync(smallThumbPath),
            hasComments: commentsWritten,
            hasLiveChat: livechatWritten,
            subtitles: collectSubtitlesForVideo(actualChannel, baseName) || undefined
        };
        const cacheOk = patchMetadataCacheForUpload(actualChannel, videoRelativePath, cacheMeta);
        if (!cacheOk) warnings.push('Metadata cache could not be updated.');

        patchHomePreviewForUpload(actualChannel, videoRelativePath, displayName, uploadDate);
        patchHomeMetaCacheForUpload(actualChannel, videoRelativePath, {
            ...cacheMeta,
            descriptionHtml: description ? description.slice(0, 500) : null
        });

        // Fire-and-forget Python regeneration
        runPythonScriptSerialized('generate_home_previews.py', ['-c', actualChannel])
            .catch(e => console.error('[Upload/home-previews] failed:', e.message));
        runPythonScriptSerialized('generate_metadata_cache.py', ['-c', actualChannel])
            .catch(e => console.error('[Upload/metadata-cache] failed:', e.message));

        // Success
        job.status = 'done';
        job.phase = 'complete';
        job.progress = 100;
        job.message = 'Upload complete';
        job.result = {
            success: true,
            channel: actualChannel,
            playlist: playlist || null,
            path: videoRelativePath,
            videoUrl: `/video.html?src=${encodeURIComponent(videoRelativePath)}`,
            warnings: warnings.length ? warnings : undefined
        };
    } catch (err) {
        cleanupTempFiles(files);
        throw err;
    }
}

async function generateThumbnailForUpload(videoPath, thumbPath, durationSec, isAudio) {
    const ffmpeg = findBinary('ffmpeg');
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    if (isAudio) {
        try {
            await runProcess(ffmpeg, ['-i', videoPath, '-an', '-vcodec', 'copy', '-y', thumbPath]);
            if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) return;
        } catch {}
    }
    const seekTime = durationSec > 2 ? Math.min(durationSec * 0.3, durationSec - 1) : 0;
    try {
        await runProcess(ffmpeg, [
            '-ss', String(seekTime), '-i', videoPath,
            '-vframes', '1', '-q:v', '2', '-y', thumbPath
        ]);
    } catch {}
}

function formatDurationHM(totalSeconds) {
    totalSeconds = Math.floor(totalSeconds);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDateDDMMYYYY(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
}

function sanitizeComponent(name) {
    if (!name) return '';
    let clean = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    clean = clean.replace(/^[.\s]+|[.\s]+$/g, '');
    if (clean === '.' || clean === '..' || clean === '') return '';
    return clean;
}

function resolveActualChannelName(channelName) {
    const videosDir = path.join(__dirname, 'videos');
    try {
        const items = fs.readdirSync(videosDir);
        const lower = channelName.toLowerCase();
        for (const item of items) {
            if (item.toLowerCase() === lower) {
                try {
                    if (fs.statSync(path.join(videosDir, item)).isDirectory()) return item;
                } catch {}
            }
        }
    } catch {}
    return channelName;
}

async function generateChannelPicInline(channelName) {
    const targetPath = path.join(__dirname, 'channelpic', `${channelName}.jpg`);
    if (fs.existsSync(targetPath)) return;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const initial = (channelName.charAt(0) || '?').toUpperCase();
    let hash = 0;
    for (let i = 0; i < channelName.length; i++) {
        hash = channelName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    const svg = `<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg">
        <rect width="160" height="160" fill="hsl(${hue}, 60%, 45%)"/>
        <text x="80" y="118" font-family="Arial, sans-serif" font-size="110" fill="white" text-anchor="middle" font-weight="bold">${initial}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(targetPath);
}

function getRealisticLikeRate(viewCount) {
    const tiers = [
        [10000,       0.024, 0.042],
        [100000,      0.019, 0.033],
        [1000000,     0.014, 0.026],
        [5000000,     0.009, 0.019],
        [20000000,    0.006, 0.013],
        [Infinity,    0.004, 0.010],
    ];
    for (const [upper, lo, hi] of tiers) {
        if (viewCount < upper) {
            const mode = (lo + hi) / 2;
            const u = Math.random();
            const c = (mode - lo) / (hi - lo);
            if (u < c) return lo + Math.sqrt(u * (hi - lo) * (mode - lo));
            return hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
        }
    }
    return 0.005;
}

function parseOffsetToMs(val) {
    if (!val) return null;
    if (typeof val === 'number') return val;
    if (/^\d+$/.test(String(val))) return parseInt(val, 10);
    const s = String(val).replace('-', '').trim();
    const parts = s.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    return null;
}

function formatLivechatIfNeeded(parsed) {
    if (Array.isArray(parsed)) {
        const already = parsed.length > 0 && parsed.every(item =>
            item && typeof item === 'object' &&
            'offsetMs' in item && 'author' in item && 'message' in item
        );
        if (already) return parsed;
    }
    let items = [];
    if (Array.isArray(parsed)) items = parsed;
    else if (typeof parsed === 'object' && parsed !== null) items = [parsed];
    const messages = [];
    let lastTs = 0, lastOffsetMs = -1;
    for (const item of items) {
        try {
            const actions = item?.replayChatItemAction?.actions;
            if (!actions || !actions.length) continue;
            const action = actions[0];
            let offsetMs = parseOffsetToMs(item?.replayChatItemAction?.videoOffsetTimeMsec);
            const renderer = action?.addChatItemAction?.item?.liveChatTextMessageRenderer;
            if (!renderer) continue;
            const currentTs = parseInt(renderer.timestampUsec, 10) || 0;
            if (offsetMs === null || offsetMs === 0) {
                offsetMs = lastTs > 0 ? lastOffsetMs + Math.round((currentTs - lastTs) / 1000) : 0;
            }
            lastTs = currentTs;
            lastOffsetMs = offsetMs;
            const author = renderer?.authorName?.simpleText || 'Unknown Author';
            const message = (renderer?.message?.runs || []).map(r => r.text || '').join('');
            messages.push({ offsetMs, author, message });
        } catch {}
    }
    return messages;
}

function cleanupTempFiles(files) {
    if (!files) return;
    const all = Array.isArray(files) ? files : Object.values(files).flat();
    for (const f of all) {
        try { if (f && f.path) fs.unlinkSync(f.path); } catch {}
    }
}

function readTxtIfExists(p) {
    try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null; } catch { return null; }
}

function collectSubtitlesForVideo(channel, basename) {
    const subsDir = path.join(__dirname, 'subtitles', channel);
    if (!fs.existsSync(subsDir)) return null;
    try {
        const files = fs.readdirSync(subsDir);
        const langs = [];
        for (const f of files) {
            if (f.startsWith('._') || !f.endsWith('.vtt')) continue;
            const stem = f.substring(0, f.length - 4);
            if (stem === basename) langs.push('');
            else if (stem.startsWith(basename + '.')) langs.push(stem.substring(basename.length + 1));
        }
        return langs.length > 0 ? langs : null;
    } catch { return null; }
}

function buildChannelMetaForCache(channel) {
    const chMeta = {};
    chMeta.hasPic = fs.existsSync(path.join(__dirname, 'channelpic', `${channel}.jpg`));
    chMeta.hasBanner = fs.existsSync(path.join(__dirname, 'channelbanner', `${channel}.jpg`));
    const d = readTxtIfExists(path.join(__dirname, 'channeldesc', `${channel}.txt`));
    if (d !== null) chMeta.description = d;
    const s = readTxtIfExists(path.join(__dirname, 'subcount', `${channel}.txt`));
    if (s !== null) chMeta.subCount = s;
    const fs2 = readTxtIfExists(path.join(__dirname, 'subcount', 'fuzzy', `${channel}.txt`));
    if (fs2 !== null) chMeta.fuzzySubCount = fs2;
    const statsPath = path.join(__dirname, 'channelstats', `${channel}.json`);
    if (fs.existsSync(statsPath)) {
        try { chMeta.stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')); } catch {}
    }
    const t = readTxtIfExists(path.join(__dirname, 'channeltags', `${channel}.txt`));
    if (t !== null) chMeta.tags = t.split(',').map(x => x.trim()).filter(Boolean);
    return chMeta;
}

function patchMetadataCacheForUpload(channel, videoRelPath, meta) {
    const cachePath = path.join(__dirname, 'metadata_cache.json');
    const relPath = videoRelPath.replace(/\\/g, '/');
    const tmpPath = cachePath + '.upload-tmp';
    try {
        let cache;
        if (fs.existsSync(cachePath)) {
            cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        } else {
            cache = { generated_at: new Date().toISOString(), videos: {}, channels: {}, playlists: {} };
        }
        if (!cache.videos) cache.videos = {};
        if (!cache.channels) cache.channels = {};
        if (!cache.playlists) cache.playlists = {};
        const videoEntry = {};
        if (meta.displayName !== undefined) videoEntry.displayName = meta.displayName;
        if (meta.fileDate !== undefined) videoEntry.fileDate = meta.fileDate;
        if (meta.viewCount !== undefined) videoEntry.viewCount = meta.viewCount;
        if (meta.videoLength !== undefined) videoEntry.videoLength = meta.videoLength;
        if (meta.likes !== undefined) videoEntry.likes = meta.likes;
        if (meta.dislikes !== undefined) videoEntry.dislikes = meta.dislikes;
        if (meta.resolution) videoEntry.resolution = meta.resolution;
        if (meta.codec) videoEntry.codec = meta.codec;
        videoEntry.hasThumbnail = !!meta.hasThumbnail;
        videoEntry.hasThumbnailSmall = !!meta.hasThumbnailSmall;
        videoEntry.hasComments = !!meta.hasComments;
        videoEntry.hasLiveChat = !!meta.hasLiveChat;
        if (meta.subtitles) videoEntry.subtitles = meta.subtitles;
        cache.videos[relPath] = videoEntry;
        if (!cache.channels[channel]) {
            cache.channels[channel] = buildChannelMetaForCache(channel);
        }
        cache.generated_at = new Date().toISOString();
        fs.writeFileSync(tmpPath, JSON.stringify(cache));
        fs.renameSync(tmpPath, cachePath);
        return true;
    } catch (e) {
        console.error('[Upload] Failed to patch metadata_cache.json:', e.message);
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
        return false;
    }
}

function patchHomePreviewForUpload(channel, videoRelPath, displayName, fileDate) {
    const previewPath = path.join(__dirname, 'channel-home-previews', `${channel}.json`);
    if (!fs.existsSync(previewPath)) return;
    try {
        const previews = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
        if (!Array.isArray(previews)) return;
        const filtered = previews.filter(p => p && p.path !== videoRelPath);
        filtered.unshift({ type: 'video', path: videoRelPath, displayName, fileDate });
        const capped = filtered.slice(0, 60);
        const tmp = previewPath + '.upload-tmp';
        fs.writeFileSync(tmp, JSON.stringify(capped, null, 2));
        fs.renameSync(tmp, previewPath);
    } catch (e) {
        console.error('[Upload] Failed to patch home preview:', e.message);
    }
}

function patchHomeMetaCacheForUpload(channel, videoRelPath, meta) {
    const metaPath = path.join(__dirname, 'channel-home-meta-cache', `${channel}.json`);
    if (!fs.existsSync(metaPath)) return;
    try {
        const cache = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        cache[videoRelPath] = {
            type: 'video',
            displayName: meta.displayName,
            fileDate: meta.fileDate,
            viewCount: meta.viewCount,
            videoLength: meta.videoLength,
            descriptionHtml: meta.descriptionHtml || null
        };
        const tmp = metaPath + '.upload-tmp';
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
        fs.renameSync(tmp, metaPath);
    } catch (e) {
        console.error('[Upload] Failed to patch home meta cache:', e.message);
    }
}

// ======================================================================
// UPLOAD ENDPOINTS
// ======================================================================

app.get('/api/channels', (req, res) => {
    if (!canUserUpload(req.session.userId)) {
        return res.status(403).json({ error: 'Upload access required' });
    }
    const videosDir = path.join(__dirname, 'videos');
    try {
        const channels = fs.readdirSync(videosDir)
            .filter(f => {
                try {
                    const full = path.join(videosDir, f);
                    return fs.statSync(full).isDirectory() && !f.startsWith('.');
                } catch { return false; }
            })
            .sort();
        res.json(channels);
    } catch {
        res.json([]);
    }
});

// --- PERMISSIONS (client needs this to show/hide the upload button) ---
app.get('/api/permissions', (req, res) => {
    const userId = req.session.userId;
    res.json({
        authenticated: !!userId,
        canUpload: canUserUpload(userId),
        isAdmin: isUserAdmin(userId)
    });
});

// --- ADMIN CONFIG ---
app.get('/api/admin/config', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!isUserAdmin(userId)) return res.status(403).json({ error: 'Admin access required' });
    res.json(loadAdminConfig());
});

app.post('/api/admin/config', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!isUserAdmin(userId)) return res.status(403).json({ error: 'Admin access required' });

    const current = loadAdminConfig();
    const body = req.body || {};
    const currentUsername = getUsernameById(userId);

    const updated = {
        uploadPolicy: ['none','admin','list','all'].includes(body.uploadPolicy)
            ? body.uploadPolicy : current.uploadPolicy,
        allowedUploaders: Array.isArray(body.allowedUploaders)
            ? body.allowedUploaders.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim())
            : current.allowedUploaders,
        adminUsers: Array.isArray(body.adminUsers)
            ? body.adminUsers.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim())
            : current.adminUsers
    };

    // Safety: cannot remove the last remaining admin while bootstrap-mode has been exited
    if (current.adminUsers.length > 0) {
        if (updated.adminUsers.length === 0) {
            return res.status(400).json({ error: 'At least one admin must remain. Add another admin first.' });
        }
        if (currentUsername &&
            !updated.adminUsers.some(u => u.toLowerCase() === currentUsername.toLowerCase())) {
            return res.status(400).json({
                error: 'You cannot remove yourself as admin while other admins exist. Remove another admin first, or promote someone else then remove yourself.'
            });
        }
    }

    if (saveAdminConfig(updated)) {
        console.log(`[Admin] Config updated by ${currentUsername || userId}: policy=${updated.uploadPolicy}, ${updated.adminUsers.length} admin(s), ${updated.allowedUploaders.length} allowed uploader(s)`);
        res.json({ success: true, config: updated });
    } else {
        res.status(500).json({ error: 'Failed to save admin_config.json' });
    }
});

// --- USER LIST (for the admin tab's datalists) ---
app.get('/api/admin/users', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!isUserAdmin(userId)) return res.status(403).json({ error: 'Admin access required' });
    try {
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
        res.json(Object.keys(users).sort());
    } catch {
        res.json([]);
    }
});

app.post('/upload-video',
    videoUpload.fields([
        { name: 'video', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
        { name: 'commentsJson', maxCount: 1 },
        { name: 'livechatJson', maxCount: 1 }
    ]),
    async (req, res) => {
        if (!req.session) {
            console.error('[Upload] CRITICAL: req.session is undefined.');
            console.error('[Upload] The /upload-video route is registered BEFORE app.use(session(...)).');
            cleanupTempFiles(req.files);
            return res.status(500).json({ error: 'Server misconfiguration: session middleware not loaded for /upload-video.' });
        }

        const userId = req.session.userId;
        if (!userId) {
            cleanupTempFiles(req.files);
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!canUserUpload(userId)) {
            cleanupTempFiles(req.files);
            return res.status(403).json({ error: 'You do not have permission to upload videos.' });
        }

        const videoFile = req.files?.video?.[0];
        if (!videoFile) {
            cleanupTempFiles(req.files);
            return res.status(400).json({ error: 'No video file provided' });
        }

        const channel = sanitizeComponent(req.body.channel || '');
        if (!channel) {
            cleanupTempFiles(req.files);
            return res.status(400).json({ error: 'Channel name is required' });
        }

        // Reject early if the queue is already full — before we hand off
        // and before we waste any more work on this upload.
        if (uploadQueue.isFull()) {
            cleanupTempFiles(req.files);
            return res.status(429).json({
                error: 'Upload queue is full. Please try again later.'
            });
        }

        // Snapshot the fields the async worker needs, then hand off.
        const job = createUploadJob();
        const files = req.files;
        const body  = { ...req.body };

        // Respond immediately so Cloudflare's 100s timeout never applies
        res.json({ success: true, jobId: job.id });

        uploadQueue.enqueue(job, files, body).catch(err => {
            console.error(`[Upload] Job ${job.id} failed:`, err);
            job.status = 'error';
            job.phase = 'error';
            job.error = err.message || 'Upload failed';
            job.completedAt = Date.now();
            cleanupTempFiles(files);
        });
    }
);

app.get('/upload-status/:jobId', (req, res) => {
    const job = uploadJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found or expired' });
    res.json({
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: Math.round(job.progress),
        message: job.message,
        queuePosition: job.queuePosition || 0,
        queueStatus: uploadQueue.getStatus(),
        result: job.result,
        error: job.error
    });
});

// ======================================================================
// LIVE TRANSCODING SYSTEM
// ======================================================================
// Streams lower resolutions on-demand via ffmpeg, caching the results so
// subsequent viewers get instant Range-supported playback.
//
// Cache retention (all configurable in admin_config.json under "transcoding"):
//   cacheMaxAgeDays            - delete cache file if untouched this many days
//                                (0 = disable cleanup entirely)
//   cacheCleanupIntervalHours  - how often to sweep (1h tick, honours this value)
//
// A cache file's mtime is refreshed every time it is served, so
// "cacheMaxAgeDays: 60" means "evict after 60 days of no watches" - not
// "evict 60 days after it was created".

const TRANSCODE_CACHE_DIR = path.join(__dirname, 'transcode-cache');
if (!fs.existsSync(TRANSCODE_CACHE_DIR)) {
    fs.mkdirSync(TRANSCODE_CACHE_DIR, { recursive: true });
}
app.use('/transcode-cache', express.static(TRANSCODE_CACHE_DIR));

const _transcodeProbeCache = new Map();
const _transcodeJobs = new Map();

// Kill a transcode if every viewer has left and nobody reconnects within this window.
// Long enough to survive a page reload; short enough to free the queue slot fast.
const TRANSCODE_CLIENT_GRACE_MS = 10000;

class TranscodeCancelledError extends Error {
    constructor(msg) {
        super(msg || 'Transcode cancelled');
        this.cancelled = true;
    }
}

class TranscodeQueue {
    constructor(concurrency) {
        this.concurrency = Math.max(1, concurrency);
        this.running = 0;
        this.queue = [];
    }
    isFull() { return this.queue.length >= 20; }
    enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this._tick();
        });
    }
    _tick() {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const { fn, resolve, reject } = this.queue.shift();
            this.running++;
            Promise.resolve()
                .then(fn)
                .then(resolve, reject)
                .finally(() => {
                    this.running--;
                    this._tick();
                });
        }
    }
    getStatus() { return { running: this.running, queued: this.queue.length }; }
}

let _transcodeQueueInstance = null;
function getTranscodeQueue() {
    if (!_transcodeQueueInstance) {
        _transcodeQueueInstance = new TranscodeQueue(getTranscodeConfig().maxConcurrent);
    }
    return _transcodeQueueInstance;
}

function getTranscodeConfig() {
    const cfg = loadAdminConfig();
    const tc = cfg.transcoding || {};

    const parsedAge = parseInt(tc.cacheMaxAgeDays, 10);
    const parsedInterval = parseInt(tc.cacheCleanupIntervalHours, 10);

    return {
        enabled: !!tc.enabled,
        engine: tc.engine || 'qsv',
        resolutions: tc.resolutions || { '480': true, '360': true, '240': true, '144': true },
        maxConcurrent: Math.max(1, parseInt(tc.maxConcurrent, 10) || 1),
        cacheMaxAgeDays: Number.isFinite(parsedAge) ? parsedAge : 60,
        cacheCleanupIntervalHours: Math.max(1, Number.isFinite(parsedInterval) ? parsedInterval : 6),
        qsvQuality: parseInt(tc.qsvQuality, 10) || 26,
        qsvPreset: tc.qsvPreset || 'veryfast',
        x264Crf: parseInt(tc.x264Crf, 10) || 26,
        x264Preset: tc.x264Preset || 'veryfast',
        audioBitrate: tc.audioBitrate || '96k',
        // 'auto'   -> copy AAC/MP3, re-encode everything else (recommended)
        // 'copy'   -> always copy (may fail for Opus/Vorbis/etc. in MP4)
        // 'encode' -> always re-encode to AAC (old behaviour)
        audioMode: ['auto', 'copy', 'encode'].includes(tc.audioMode) ? tc.audioMode : 'auto'
    };
}

function getEnabledTranscodeHeights() {
    const cfg = getTranscodeConfig();
    if (!cfg.enabled) return [];
    return Object.entries(cfg.resolutions)
        .filter(([, on]) => on === true)
        .map(([h]) => parseInt(h, 10))
        .filter(h => h > 0)
        .sort((a, b) => b - a);
}

function getTranscodeCachePath(videoRelPath, targetHeight) {
    const baseName = videoRelPath.replace(/\.[^.]+$/, '');
    const safe = baseName.replace(/[<>:"|?*\x00-\x1f]/g, '_');
    return path.join(TRANSCODE_CACHE_DIR, `${targetHeight}p`, `${safe}.mp4`);
}

function _touchCacheFile(filePath) {
    try { const n = new Date(); fs.utimesSync(filePath, n, n); } catch {}
}

async function getCachedSourceProbe(videoRelPath) {
    if (_transcodeProbeCache.has(videoRelPath)) return _transcodeProbeCache.get(videoRelPath);
    const full = path.join(__dirname, 'videos', videoRelPath);
    if (!fs.existsSync(full)) return null;
    const info = await probeVideoInfo(full);
    _transcodeProbeCache.set(videoRelPath, info);
    return info;
}

function buildTranscodeArgs(sourcePath, targetHeight, cfg, sourceAudioCodec) {
    const targetWidth = Math.floor(targetHeight * 16 / 9 / 2) * 2;
    const useQsv = (cfg.engine === 'qsv' || cfg.engine === 'auto');

    const args = ['-hide_banner', '-loglevel', 'error'];

    if (useQsv) {
        args.push('-hwaccel', 'qsv');
        args.push('-hwaccel_output_format', 'qsv');
    }

    args.push('-i', sourcePath);

    if (useQsv) {
        args.push(
            '-c:v', 'h264_qsv',
            '-global_quality', String(cfg.qsvQuality),
            '-preset', cfg.qsvPreset,
            '-async_depth', '4',
            '-bf', '0',
            '-look_ahead', '0',
            '-vf', `scale=${targetWidth}:${targetHeight}:flags=bilinear`
        );
    } else {
        args.push(
            '-c:v', 'libx264',
            '-crf', String(cfg.x264Crf),
            '-preset', cfg.x264Preset,
            '-vf', `scale=${targetWidth}:${targetHeight}:flags=bilinear`
        );
    }

    // Audio: copy when it's MP4/fMP4-compatible, otherwise re-encode to AAC.
    // Copying avoids the second-generation AAC artifacts (clicks / pops)
    // that show up even at "the same bitrate".
    const audioMode = cfg.audioMode || 'auto';
    const copyableAudioCodecs = new Set(['aac', 'mp3']);
    const canCopy = sourceAudioCodec && copyableAudioCodecs.has(String(sourceAudioCodec).toLowerCase());

    if (audioMode === 'copy' || (audioMode === 'auto' && canCopy)) {
        args.push('-c:a', 'copy');
    } else {
        args.push('-c:a', 'aac', '-b:a', cfg.audioBitrate);
    }

    args.push(
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4'
    );
    return args;
}

/**
 * Start (or attach to) a transcode. First caller gets a live fMP4 stream.
 * The output is written to a .tmp file that becomes the cache on success.
 */
function _attachClientToJob(job, res) {
    job.clients.add(res);
    if (job.killTimer) {
        clearTimeout(job.killTimer);
        job.killTimer = null;
    }
    res.on('close', () => {
        job.clients.delete(res);
        if (job.clients.size === 0 && !job.killed && !job.completed) {
            job.killTimer = setTimeout(() => {
                if (job.clients.size === 0 && !job.killed && !job.completed) {
                    job.killed = true;
                    console.log(`[Transcode] Killing abandoned transcode (no viewers for ${TRANSCODE_CLIENT_GRACE_MS / 1000}s)`);
                    try { job.proc.kill(); } catch {}
                }
            }, TRANSCODE_CLIENT_GRACE_MS);
        }
    });
}

function startOrAttachTranscode(videoRelPath, targetHeight, res, options = {}) {
    const startOffset = Math.max(0, Math.floor(options.startOffset || 0));
    const cacheable = options.cache !== false && startOffset === 0;
    const key = `${videoRelPath}|${targetHeight}|${startOffset}`;

    if (res.destroyed) {
        return Promise.reject(new TranscodeCancelledError('Client disconnected before start'));
    }

    // If the caller is asking for a different offset for the SAME (video, quality),
    // the client has seeked. Kill any in-flight job for that pair immediately,
    // otherwise it burns CPU for up to 10s (grace period) before the queue frees up.
    if (startOffset > 0) {
        for (const [k, j] of _transcodeJobs) {
            if (k !== key && k.startsWith(`${videoRelPath}|${targetHeight}|`) && !j.completed && !j.killed) {
                console.log(`[Transcode] Killing prior offset job for seek priority: ${k}`);
                j.killed = true;
                try { j.proc.kill(); } catch {}
            }
        }
    }

    // ---------- Attach to an in-flight transcode ----------
    if (_transcodeJobs.has(key)) {
        const job = _transcodeJobs.get(key);
        _attachClientToJob(job, res);
        return job.promise
            .then(() => {
                if (res.destroyed) return;
                if (job.killed) throw new TranscodeCancelledError();
                const cachePath = getTranscodeCachePath(videoRelPath, targetHeight);
                if (fs.existsSync(cachePath)) {
                    _touchCacheFile(cachePath);
                    res.sendFile(cachePath);
                } else {
                    throw new Error('Transcode produced no output');
                }
            })
            .catch(err => {
                if (!res.destroyed && !res.headersSent) {
                    res.status(err.cancelled ? 503 : 500)
                       .send(err.cancelled ? 'Transcode cancelled' : 'Transcode failed');
                }
                throw err;
            });
    }

    // ---------- Start a new transcode ----------
    const cfg = getTranscodeConfig();
    const sourcePath = path.join(__dirname, 'videos', videoRelPath);
    const cachePath = getTranscodeCachePath(videoRelPath, targetHeight);
    const tmpPath = cachePath + '.tmp';
    if (cacheable) fs.mkdirSync(path.dirname(cachePath), { recursive: true });

    // The caller already probed the source (getCachedSourceProbe). Fall back to
    // the in-memory probe cache if it wasn't passed in. This lets
    // buildTranscodeArgs decide whether to copy or re-encode the audio track.
    const sourceInfo = options.sourceInfo || _transcodeProbeCache.get(videoRelPath) || null;
    const sourceAudioCodec = sourceInfo ? sourceInfo.audioCodec : '';

    // buildTranscodeArgs already returns:
    //   ['-hide_banner','-loglevel','error','-i',src,'-c:v',...,'-f','mp4']
    // We rebuild it here so we can insert -ss BEFORE -i (input seek).
    const base = buildTranscodeArgs(sourcePath, targetHeight, cfg, sourceAudioCodec);
    const iIdx = base.indexOf('-i');
    const args = ['-hide_banner', '-loglevel', 'error'];
    if (startOffset > 0) args.push('-ss', String(startOffset));
    args.push(...base.slice(iIdx));   // "-i <src>" onward, including "-f mp4"
    args.push('pipe:1');

    console.log(`[Transcode] Start ${videoRelPath} → ${targetHeight}p (${cfg.engine})`);
    const startedAt = Date.now();
    const proc = spawn(findBinary('ffmpeg'), args, { windowsHide: true });
    const writeStream = cacheable ? fs.createWriteStream(tmpPath) : null;

    const job = {
        promise: null,
        clients: new Set(),
        killTimer: null,
        killed: false,
        completed: false,
        proc,
        writeStream,
        tmpPath,
        cachePath,
        startedAt
    };
    _transcodeJobs.set(key, job);
    _attachClientToJob(job, res);

    // The FIRST client streams the live output; late-attaching clients wait
    // for the promise and receive the cached file at the end.
    if (!res.headersSent) {
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-cache',
            'Accept-Ranges': 'none'
        });
    }

    proc.stdout.on('data', chunk => {
        if (writeStream) writeStream.write(chunk);
        if (!job.killed && !res.destroyed && !res.writableEnded) {
            try { res.write(chunk); } catch {}
        }
    });

    let stderrBuf = '';
    proc.stderr.on('data', d => {
        stderrBuf += d.toString();
        if (stderrBuf.length > 3000) stderrBuf = stderrBuf.slice(-1500);
    });

    job.promise = new Promise((resolve, reject) => {
        const finalize = (code) => {
            job.completed = true;

            if (job.killed) {
                if (writeStream) try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
                const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
                console.log(`[Transcode] Cancelled ${videoRelPath} → ${targetHeight}p${startOffset > 0 ? `@${startOffset}s` : ''} after ${secs}s`);
                if (!res.destroyed && !res.writableEnded) { try { res.end(); } catch {} }
                reject(new TranscodeCancelledError());
                return;
            }

            if (code === 0) {
                if (cacheable) {
                    try { fs.renameSync(tmpPath, cachePath); }
                    catch (e) { console.error('[Transcode] Rename failed:', e.message); }
                }
                const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
                const sizeMB = cacheable && fs.existsSync(cachePath)
                    ? (fs.statSync(cachePath).size / 1048576).toFixed(1) : 'stream';
                console.log(`[Transcode] Done ${videoRelPath} → ${targetHeight}p${startOffset > 0 ? `@${startOffset}s` : ''} (${secs}s, ${sizeMB})`);
                if (!res.destroyed && !res.writableEnded) { try { res.end(); } catch {} }
                resolve();
            } else {
                if (writeStream) try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
                console.error(`[Transcode] FAILED (${code}): ${stderrBuf.slice(-500)}`);
                if (!res.destroyed && !res.writableEnded) { try { res.end(); } catch {} }
                reject(new Error(`ffmpeg exited ${code}`));
            }
        };

        proc.on('close', code => {
            if (job.killTimer) { clearTimeout(job.killTimer); job.killTimer = null; }
            if (writeStream) writeStream.end(() => finalize(code));
            else finalize(code);
        });
        proc.on('error', err => {
            writeStream.destroy();
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
            job.completed = true;
            if (!res.destroyed && !res.writableEnded) { try { res.end(); } catch {} }
            reject(err);
        });
    });

    // Clean up the job registry 30s after completion OR failure.
    // Using .then(cleanup, cleanup) instead of .finally() avoids creating
    // a second rejected promise that nobody handles (which crashes Node 24).
    const cleanup = () => setTimeout(() => {
        if (_transcodeJobs.get(key) === job) _transcodeJobs.delete(key);
    }, 30000);
    job.promise.then(cleanup, cleanup);
    return job.promise;
}

// --- Global list of enabled transcode qualities (for the settings page) ---
app.get('/api/transcode/available-qualities', (req, res) => {
    const cfg = getTranscodeConfig();
    if (!cfg.enabled) return res.json({ enabled: false, qualities: [] });
    const heights = getEnabledTranscodeHeights();
    res.json({
        enabled: true,
        qualities: heights.map(h => ({ height: h, label: `${h}p` }))
    });
});

// --- Available qualities endpoint ---
app.get('/api/transcode/qualities', async (req, res) => {
    const videoRelPath = req.query.video;
    if (!videoRelPath || typeof videoRelPath !== 'string') {
        return res.status(400).json({ error: 'Missing video parameter' });
    }
    const cfg = getTranscodeConfig();
    if (!cfg.enabled) return res.json({ enabled: false, qualities: [] });

    const info = await getCachedSourceProbe(videoRelPath);
    if (!info) return res.status(404).json({ error: 'Video not found' });

    const sourceHeight = info.height || 0;
    const qualities = getEnabledTranscodeHeights()
        .filter(h => h < sourceHeight)
        .map(h => ({
            height: h,
            label: `${h}p`,
            cached: fs.existsSync(getTranscodeCachePath(videoRelPath, h))
        }));

    res.json({
        enabled: true,
        sourceHeight,
        durationSec: info.durationSec || 0,   // used by client to fix "Infinity" on fMP4 streams
        qualities
    });
});

// --- Transcode stream endpoint ---
app.get('/transcode/:quality/*', async (req, res) => {
    const quality = parseInt(req.params.quality, 10);
    const videoRelPath = decodeURIComponent(req.params[0] || '');
    const startOffset = Math.max(0, parseInt(req.query.start, 10) || 0);
    if (!videoRelPath || !quality) return res.status(400).send('Bad request');
    if (videoRelPath.includes('..') || videoRelPath.includes('\0')) {
        return res.status(400).send('Invalid path');
    }

    const cfg = getTranscodeConfig();
    if (!cfg.enabled) return res.status(403).send('Transcoding disabled');
    if (!getEnabledTranscodeHeights().includes(quality)) return res.status(400).send('Quality not enabled');

    const videosDir = path.join(__dirname, 'videos');
    const sourcePath = path.resolve(videosDir, videoRelPath);
    if (!sourcePath.startsWith(videosDir + path.sep)) return res.status(400).send('Invalid path');
    if (!fs.existsSync(sourcePath)) return res.status(404).send('Video not found');

    const info = await getCachedSourceProbe(videoRelPath);
    if (info && info.height && info.height <= quality) {
        return res.status(400).send('Source is already this resolution or lower');
    }

    // Cache hit — always serve from cache (ignores ?start, Range works natively).
    const cachePath = getTranscodeCachePath(videoRelPath, quality);
    if (fs.existsSync(cachePath)) {
        _touchCacheFile(cachePath);
        return res.sendFile(cachePath);
    }

    const key = `${videoRelPath}|${quality}|${startOffset}`;
    const queue = getTranscodeQueue();
    if (queue.isFull() && !_transcodeJobs.has(key)) {
        return res.status(503).send('Transcode queue is full. Try again later.');
    }

    try {
        await queue.enqueue(() =>
            startOrAttachTranscode(videoRelPath, quality, res, {
                startOffset,
                sourceInfo: info
            })
        );
    } catch (err) {
        if (res.destroyed || res.headersSent) return;
        if (err.cancelled) res.status(503).send('Transcode cancelled');
        else res.status(500).send('Transcode failed');
    }
});

// --- Cache retention sweep (tick hourly; honours cacheCleanupIntervalHours) ---
let _lastTranscodeCleanup = 0;
setInterval(() => {
    const cfg = getTranscodeConfig();
    if (!cfg.cacheMaxAgeDays) return;   // 0 or negative → cleanup disabled

    const intervalMs = cfg.cacheCleanupIntervalHours * 3600000;
    if (Date.now() - _lastTranscodeCleanup < intervalMs) return;
    _lastTranscodeCleanup = Date.now();

    const cutoff = Date.now() - cfg.cacheMaxAgeDays * 86400000;
    let removed = 0, bytes = 0;
    try {
        for (const q of fs.readdirSync(TRANSCODE_CACHE_DIR)) {
            const qDir = path.join(TRANSCODE_CACHE_DIR, q);
            try { if (!fs.statSync(qDir).isDirectory()) continue; } catch { continue; }
            const walk = (dir) => {
                for (const f of fs.readdirSync(dir)) {
                    const fp = path.join(dir, f);
                    try {
                        const st = fs.statSync(fp);
                        if (st.isDirectory()) walk(fp);
                        else if (fp.endsWith('.mp4') && st.mtimeMs < cutoff) {
                            bytes += st.size;
                            fs.unlinkSync(fp);
                            removed++;
                        }
                    } catch {}
                }
            };
            walk(qDir);
        }
        if (removed > 0) {
            console.log(`[Transcode] Cache cleanup: ${removed} file(s), ` +
                `${(bytes / 1073741824).toFixed(2)} GB freed ` +
                `(older than ${cfg.cacheMaxAgeDays}d)`);
        }
    } catch (err) {
        console.error('[Transcode] Cleanup error:', err.message);
    }
}, 60 * 60 * 1000);

// --- Clean up orphaned .tmp files left by a crashed server ---
(function cleanupOrphanedTmp() {
    try {
        const walk = (dir) => {
            for (const f of fs.readdirSync(dir)) {
                const fp = path.join(dir, f);
                if (fs.statSync(fp).isDirectory()) walk(fp);
                else if (f.endsWith('.tmp')) { try { fs.unlinkSync(fp); } catch {} }
            }
        };
        walk(TRANSCODE_CACHE_DIR);
    } catch {}
})();

console.log(`[Transcode] Initialized. Engine: ${getTranscodeConfig().engine}, ` +
    `heights: ${getEnabledTranscodeHeights().join(', ') || 'none'}, ` +
    `cache retention: ${getTranscodeConfig().cacheMaxAgeDays || 'disabled'}d ` +
    `(sweep every ${getTranscodeConfig().cacheCleanupIntervalHours}h)`);

// ===== STARTUP =====
(async () => {
    await initializeVideoCache();
    initializeShortLinks();
    initializeRecommendationIndex();
    loadPlaylistThumbnailCache();
    initializePlaylistShortLinks();
    initializeChannelShortLinks();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\nServer is running on http://localhost:${PORT}`);
    });
})();