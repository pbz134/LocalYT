const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;

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

// Static file middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use('/LocalYT-Rev-Files', express.static(path.join(__dirname, 'LocalYT-Rev-Files')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));
app.use('/filedates', express.static(path.join(__dirname, 'filedates')));
app.use('/filenames', express.static(path.join(__dirname, 'filenames')));
app.use('/videolengths', express.static(path.join(__dirname, 'videolengths')));
app.use('/channelpic', express.static(path.join(__dirname, 'channelpic')));
app.use('/channelbanner', express.static(path.join(__dirname, 'channelbanner')));
app.use('/videostats', express.static(path.join(__dirname, 'videostats')));
app.use('/descriptions', express.static(path.join(__dirname, 'descriptions')));
app.use('/favicon.png', express.static(path.join(__dirname, 'favicon.png')));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    store: new FileStore({
        path: sessionsDir,
        ttl: 86400,
        retries: 0,
        reapInterval: 3600,
        fileExtension: '.session',
        reapAsync: true,
        reapSyncFallback: false,
        logFn: function(message) { console.log('FileStore:', message); },
        encoding: 'utf8',
        encrypt: false
    }),
    secret: 'your_secret_key',
    resave: true,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    },
    name: 'localyt.sid',
    rolling: true
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

// --- OPTIMIZED VIDEO CACHING SYSTEM ---
let videoCache = new Map(); // Map for O(1) lookups
let videoArray = []; // Array for pagination
let recommendationIndex = {};

function initializeVideoCache() {
    console.log('Checking for video cache...');
    
    // MODIFIED: Only scan if the file does not exist
    if (fs.existsSync(cacheFilePath)) {
        try {
            const stats = fs.statSync(cacheFilePath);
            if (stats.size > 0) {
                const data = fs.readFileSync(cacheFilePath, 'utf8');
                const videos = JSON.parse(data);
                
                // Store in Map for fast lookups
                videoCache = new Map(videos.map(v => [v.path, v]));
                videoArray = videos; // Keep array for pagination
                
                console.log(`Loaded ${videoCache.size} videos from cache.`);
                // Keep cache sorted for stability
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
                        
                        // Read Tags
                        let tags = [];
                        const tagsPath = path.join(videosDir, `${basePath}.txt`);
                        if (fs.existsSync(tagsPath)) {
                            try {
                                tags = fs.readFileSync(tagsPath, 'utf8').split(',').map(tag => tag.trim());
                            } catch (e) {}
                        }

                        // Read Display Name
                        let displayName = file.replace(/\.(mp4|mp3|mkv)$/, '');
                        const filenamePath = path.join(__dirname, 'filenames', `${basePath}.txt`);
                        if (fs.existsSync(filenamePath)) {
                            try { displayName = fs.readFileSync(filenamePath, 'utf8'); } catch (e) {}
                        }

                        // Read File Date
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
        // Sort alphabetically
        videoArray.sort((a, b) => a.path.localeCompare(b.path));
        console.log(`Scan complete. Cached ${videoArray.length} videos.`);
        
        // Build recommendation index after cache is updated
        buildRecommendationIndex();
    } catch (err) {
        console.error('Error writing cache file:', err);
    }
}

// Build recommendation index from video cache
function buildRecommendationIndex() {
    console.log('Building recommendation index...');
    const index = {};
    
    videoArray.forEach(video => {
        // Extract channel name from path
        const channel = video.path.split('/')[0];
        
        // Add channel name as a tag
        if (channel) {
            if (!index[channel]) {
                index[channel] = [];
            }
            index[channel].push(video.path);
        }
        
        // Add existing tags
        if (video.tags && video.tags.length > 0) {
            video.tags.forEach(tag => {
                // Clean up the tag
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
    
    // Write to file for persistence
    fs.writeFileSync(recommendationIndexPath, JSON.stringify(index, null, 2));
    recommendationIndex = index;
    console.log('Recommendation index built successfully with ' + Object.keys(index).length + ' tags');
    console.log('Sample tags:', Object.keys(index).slice(0, 10));
}

// Load or build recommendation index
function initializeRecommendationIndex() {
    // MODIFIED: Only build if the file does not exist
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

// Initialize both caches
initializeVideoCache();
initializeRecommendationIndex();

// Helper to get details
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

// Helper to shuffle array (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

app.get('/videos', (req, res) => {
    // Shuffle the cache copy for this request
    const shuffled = [...videoArray]; // Create copy
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

app.get('/rescan', (req, res) => {
    scanAndCacheVideos();
    buildRecommendationIndex(); // Rebuild index after scan
    res.send('Rescan complete');
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

app.get('/subcount/:channel', (req, res) => {
    const channel = req.params.channel;
    const filePath = path.join(__dirname, 'subcount', `${channel}.txt`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(404).send('File not found');
        res.send(data);
    });
});

app.get('/user-subscriptions/:channel', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send('User not authenticated');
    const channel = req.params.channel;
    const subscriptionsFilePath = path.join(__dirname, 'subscriptions.json');
    fs.readFile(subscriptionsFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading subscriptions');
        const subscriptionsData = JSON.parse(data);
        res.json(subscriptionsData[userId] || {});
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

app.get('/viewcounts/:video', (req, res) => {
    const video = req.params.video.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '');
    const filePath = path.join(__dirname, 'viewcounts', `${video}.txt`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(404).send('File not found');
        res.send(data);
    });
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const usersFilePath = path.join(__dirname, 'users.json');
    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        let usersData = {};
        if (!err) usersData = JSON.parse(data);
        if (usersData[username]) return res.status(400).send('Username already exists');
        const hashedPassword = bcrypt.hashSync(password, 10);
        usersData[username] = { id: uuidv4(), password: hashedPassword };
        fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2), err => {
            if (err) return res.status(500).send('Error saving user');
            res.sendStatus(200);
        });
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const usersFilePath = path.join(__dirname, 'users.json');
    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading users');
        const usersData = JSON.parse(data);
        const user = usersData[username];
        if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).send('Invalid username or password');
        req.session.userId = user.id;
        res.sendStatus(200);
    });
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
        const usersData = JSON.parse(data);
        const username = Object.keys(usersData).find(key => usersData[key].id === userId);
        if (username) res.json({ username: username });
        else res.status(404).json({ error: 'User not found' });
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
        
        // Apply all queued updates
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

    // Queue the update
    if (!preferenceUpdateQueue.has(userId)) {
        preferenceUpdateQueue.set(userId, new Set());
    }
    
    videoTags.forEach(tag => {
        preferenceUpdateQueue.get(userId).add(tag);
    });
    
    // Clear existing timer and set new one
    if (preferenceUpdateTimer) clearTimeout(preferenceUpdateTimer);
    preferenceUpdateTimer = setTimeout(batchUpdatePreferences, 5000); // Batch every 5 seconds
    
    res.json({ queued: true, message: 'Preference update queued' });
});

// --- OPTIMIZED RECOMMENDATIONS (Using Index) ---
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
            
            console.log('User preferences tags:', Object.keys(userPreferences).length);
            
            // Sort tags by weight (higher numbers first)
            const sortedTags = Object.entries(userPreferences)
                .map(([tag, weight]) => ({ tag, weight }))
                .sort((a, b) => b.weight - a.weight);
            
            console.log('Top 20 tags by weight:', sortedTags.slice(0, 20));
            
            // Create a Map to store videos with their source tag
            const videoMap = new Map(); // path -> { video, sourceTag }
            
            // First, identify high-priority tags (your most important content)
            // These are tags with weight >= 100 that you want to see prominently
            const highPriorityTags = sortedTags.filter(t => t.weight >= 100);
            
            // Also identify medium-priority tags
            const mediumPriorityTags = sortedTags.filter(t => t.weight >= 50 && t.weight < 100);
            
            console.log(`High priority tags (${highPriorityTags.length}):`, highPriorityTags.map(t => `${t.tag}(${t.weight})`));
            
            // For each high-priority tag, collect ALL their videos
            highPriorityTags.forEach(({ tag }) => {
                const tagVideos = recommendationIndex[tag] || [];
                console.log(`Tag "${tag}": ${tagVideos.length} videos available`);
                
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
            
            // Group videos by their source tag
            const videosByTag = new Map(); // tag -> array of videos
            videoMap.forEach((value, path) => {
                if (!videosByTag.has(value.sourceTag)) {
                    videosByTag.set(value.sourceTag, []);
                }
                videosByTag.get(value.sourceTag).push(value.video);
            });
            
            console.log('Video counts by source tag:');
            videosByTag.forEach((videos, tag) => {
                console.log(`  ${tag}: ${videos.length} videos`);
            });
            
            // Calculate how many videos to take from each tag for this page
            const resultVideos = [];
            const tags = Array.from(videosByTag.keys());
            
            if (page === 1) {
                // For page 1, create a balanced mix:
                // - 40% from top priority tags (ensuring Modern Vintage Gamer appears)
                // - 30% from other high priority tags
                // - 30% from medium priority tags
                
                const topPriorityTag = "Modern Vintage Gamer";
                const otherHighPriorityTags = highPriorityTags
                    .map(t => t.tag)
                    .filter(tag => tag !== topPriorityTag);
                
                // Take 4 videos from Modern Vintage Gamer (20% of 20)
                const mvgVideos = videosByTag.get(topPriorityTag) || [];
                shuffleArray(mvgVideos);
                resultVideos.push(...mvgVideos.slice(0, 4));
                
                // Take 4 more videos from other high priority tags (20%)
                const otherHighVideos = [];
                otherHighPriorityTags.forEach(tag => {
                    const tagVideos = videosByTag.get(tag) || [];
                    shuffleArray(tagVideos);
                    if (tagVideos.length > 0) {
                        // Take 1-2 videos from each tag
                        const takeCount = Math.min(2, Math.ceil(tagVideos.length / 100));
                        otherHighVideos.push(...tagVideos.slice(0, takeCount));
                    }
                });
                shuffleArray(otherHighVideos);
                resultVideos.push(...otherHighVideos.slice(0, 4));
                
                // Take 4 videos from medium priority tags (20%)
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
                
                // Fill the remaining 8 slots with a weighted random selection from all videos
                const allVideos = Array.from(videoMap.values()).map(v => v.video);
                shuffleArray(allVideos);
                
                // But prioritize videos from high-weight tags
                const weightedRemaining = [];
                allVideos.forEach(video => {
                    // Check which tag this video comes from
                    let videoWeight = 0;
                    for (const tag of highPriorityTags) {
                        if (video.tags && video.tags.includes(tag.tag)) {
                            videoWeight = tag.weight;
                            break;
                        }
                    }
                    weightedRemaining.push({ video, weight: videoWeight });
                });
                
                // Sort by weight (higher first) then shuffle slightly
                weightedRemaining.sort((a, b) => b.weight - a.weight);
                
                // Take the next 8 videos, but with some randomness
                const candidates = weightedRemaining.slice(0, 50); // Take top 50 by weight
                shuffleArray(candidates);
                resultVideos.push(...candidates.slice(0, 8).map(c => c.video));
                
            } else {
                // For subsequent pages, just use weighted random selection
                const allVideos = Array.from(videoMap.values()).map(v => v.video);
                
                // Weight videos based on their source tag's weight
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
                
                // Weighted shuffle (higher weight = higher chance of appearing early)
                for (let i = weightedVideos.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [weightedVideos[i], weightedVideos[j]] = [weightedVideos[j], weightedVideos[i]];
                }
                
                // Sort by weight (higher weights float to top)
                weightedVideos.sort((a, b) => b.weight - a.weight);
                
                const paginatedVideos = weightedVideos
                    .slice(startIndex, endIndex)
                    .map(item => item.video);
                
                resultVideos.push(...paginatedVideos);
            }
            
            // Remove duplicates just in case
            const uniqueVideos = [];
            const seen = new Set();
            resultVideos.forEach(video => {
                if (!seen.has(video.path)) {
                    seen.add(video.path);
                    uniqueVideos.push(video);
                }
            });
            
            console.log(`Returning ${uniqueVideos.length} unique videos for page ${page}`);
            
            // Get video details
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
            
            // Sort and return top 5 categories
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
                if (playlistVideos.length > 0) playlists.push({ name: item, path: relativePath, videoCount: playlistVideos.length, fullPath: itemPath });
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
        if (watchHistoryData[userId].length > 100) watchHistoryData[userId] = watchHistoryData[userId].slice(0, 100);
        fs.writeFile(watchHistoryFilePath, JSON.stringify(watchHistoryData, null, 2), err => {
            if (err) return res.status(500).send('Error saving watch history');
            res.sendStatus(200);
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});