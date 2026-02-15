const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = 3000;

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
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Serve the favicon from the root directory
app.use('/favicon.png', express.static(path.join(__dirname, 'favicon.png')));

const preferencesFilePath = path.join(__dirname, 'userPreferences.json');
const watchHistoryFilePath = path.join(__dirname, 'watchHistory.json');

// Ensure the preferences file exists and is valid JSON
function ensurePreferencesFile() {
    if (!fs.existsSync(preferencesFilePath)) {
        fs.writeFileSync(preferencesFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(preferencesFilePath, 'utf8');
        try {
            JSON.parse(data);
        } catch (err) {
            fs.writeFileSync(preferencesFilePath, JSON.stringify({}));
        }
    }
}

// Ensure the watch history file exists and is valid JSON
function ensureWatchHistoryFile() {
    if (!fs.existsSync(watchHistoryFilePath)) {
        fs.writeFileSync(watchHistoryFilePath, JSON.stringify({}));
    } else {
        const data = fs.readFileSync(watchHistoryFilePath, 'utf8');
        try {
            JSON.parse(data);
        } catch (err) {
            fs.writeFileSync(watchHistoryFilePath, JSON.stringify({}));
        }
    }
}

ensurePreferencesFile();
ensureWatchHistoryFile();

app.get('/videos', (req, res) => {
    const videosDir = path.join(__dirname, 'videos');
    const videoFiles = [];

    function readDir(dir) {
        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                try {
                    // Crucial Fix: Check if file exists before stating it
                    // This fixes the "ENOENT" crash when files are deleted/moved during scan
                    if (!fs.existsSync(filePath)) {
                        return;
                    }

                    const stats = fs.statSync(filePath);
                    
                    if (stats.isDirectory()) {
                        readDir(filePath);
                    } else if (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv')) {
                        const relativePath = path.relative(videosDir, filePath).replace(/\\/g, '/');
                        const basePath = relativePath.replace(/\.(mp4|mp3|mkv)$/, '');
                        
                        // Use the base path for metadata files
                        const viewCountPath = path.join(__dirname, 'viewcounts', `${basePath}.txt`);
                        const fileDatePath = path.join(__dirname, 'filedates', `${basePath}.txt`);
                        const filenamePath = path.join(__dirname, 'filenames', `${basePath}.txt`);

                        let viewCount = '0';
                        let fileDate = '';
                        let displayName = file.replace(/\.(mp4|mp3|mkv)$/, '');

                        // Safely read metadata files
                        try {
                            if (fs.existsSync(viewCountPath)) {
                                viewCount = fs.readFileSync(viewCountPath, 'utf8');
                            }
                        } catch (e) {
                            console.log(`View count not found for: ${relativePath}`);
                        }

                        try {
                            if (fs.existsSync(fileDatePath)) {
                                fileDate = fs.readFileSync(fileDatePath, 'utf8');
                            }
                        } catch (e) {
                            console.log(`File date not found for: ${relativePath}`);
                        }

                        try {
                            if (fs.existsSync(filenamePath)) {
                                displayName = fs.readFileSync(filenamePath, 'utf8');
                            }
                        } catch (e) {
                            console.log(`Display name not found for: ${relativePath}`);
                        }

                        videoFiles.push({
                            path: relativePath,
                            viewCount: viewCount,
                            fileDate: fileDate,
                            displayName: displayName
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
    const shuffledVideos = videoFiles.sort(() => 0.5 - Math.random());
    res.json(shuffledVideos);
});

app.get('/videostats/:video', (req, res) => {
    const video = req.params.video.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '');
    const filePath = path.join(__dirname, 'videostats', `${video}.txt`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(404).send('File not found');
        }
        res.send(data);
    });
});

app.post('/like', (req, res) => {
    const { video, isLiked } = req.body;
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }
    const likesFilePath = path.join(__dirname, 'likes.json');

    fs.readFile(likesFilePath, 'utf8', (err, data) => {
        let likesData = {};
        if (!err) {
            likesData = JSON.parse(data);
        }
        if (!likesData[userId]) {
            likesData[userId] = {};
        }
        likesData[userId][video] = isLiked;

        fs.writeFile(likesFilePath, JSON.stringify(likesData, null, 2), err => {
            if (err) {
                return res.status(500).send('Error saving likes');
            }
            res.sendStatus(200);
        });
    });
});

app.post('/dislike', (req, res) => {
    const { video, isDisliked } = req.body;
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }
    const dislikesFilePath = path.join(__dirname, 'dislikes.json');

    fs.readFile(dislikesFilePath, 'utf8', (err, data) => {
        let dislikesData = {};
        if (!err) {
            dislikesData = JSON.parse(data);
        }
        if (!dislikesData[userId]) {
            dislikesData[userId] = {};
        }
        dislikesData[userId][video] = isDisliked;

        fs.writeFile(dislikesFilePath, JSON.stringify(dislikesData, null, 2), err => {
            if (err) {
                return res.status(500).send('Error saving dislikes');
            }
            res.sendStatus(200);
        });
    });
});

app.get('/user-likes', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }
    const likesFilePath = path.join(__dirname, 'likes.json');

    fs.readFile(likesFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading likes');
        }
        const likesData = JSON.parse(data);
        res.json(likesData[userId] || {});
    });
});

app.get('/user-dislikes', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }
    const dislikesFilePath = path.join(__dirname, 'dislikes.json');

    fs.readFile(dislikesFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading dislikes');
        }
        const dislikesData = JSON.parse(data);
        res.json(dislikesData[userId] || {});
    });
});

app.get('/subcount/:channel', (req, res) => {
    const channel = req.params.channel;
    const filePath = path.join(__dirname, 'subcount', `${channel}.txt`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(404).send('File not found');
        }
        res.send(data);
    });
});

app.get('/user-subscriptions/:channel', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }
    const channel = req.params.channel;
    const subscriptionsFilePath = path.join(__dirname, 'subscriptions.json');

    fs.readFile(subscriptionsFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading subscriptions');
        }
        const subscriptionsData = JSON.parse(data);
        res.json(subscriptionsData[userId] || {});
    });
});

app.post('/subscribe', (req, res) => {
    const { channel, isSubscribed } = req.body;
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }
    const subscriptionsFilePath = path.join(__dirname, 'subscriptions.json');

    fs.readFile(subscriptionsFilePath, 'utf8', (err, data) => {
        let subscriptionsData = {};
        if (!err) {
            subscriptionsData = JSON.parse(data);
        }
        if (!subscriptionsData[userId]) {
            subscriptionsData[userId] = {};
        }
        subscriptionsData[userId][channel] = isSubscribed;

        fs.writeFile(subscriptionsFilePath, JSON.stringify(subscriptionsData, null, 2), err => {
            if (err) {
                return res.status(500).send('Error saving subscriptions');
            }
            res.sendStatus(200);
        });
    });
});

app.get('/viewcounts/:video', (req, res) => {
    const video = req.params.video.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '');
    const filePath = path.join(__dirname, 'viewcounts', `${video}.txt`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(404).send('File not found');
        }
        res.send(data);
    });
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const usersFilePath = path.join(__dirname, 'users.json');

    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        let usersData = {};
        if (!err) {
            usersData = JSON.parse(data);
        }
        if (usersData[username]) {
            return res.status(400).send('Username already exists');
        }
        const hashedPassword = bcrypt.hashSync(password, 10);
        usersData[username] = {
            id: uuidv4(),
            password: hashedPassword
        };

        fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2), err => {
            if (err) {
                return res.status(500).send('Error saving user');
            }
            res.sendStatus(200);
        });
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const usersFilePath = path.join(__dirname, 'users.json');

    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading users');
        }
        const usersData = JSON.parse(data);
        const user = usersData[username];
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).send('Invalid username or password');
        }
        req.session.userId = user.id;
        res.sendStatus(200);
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Error logging out');
        }
        res.redirect('/login.html');
    });
});

// New endpoint to get the current logged-in user's username
app.get('/session-user', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const usersFilePath = path.join(__dirname, 'users.json');
    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Error reading users' });
        }
        const usersData = JSON.parse(data);
        // Find the username associated with the userId
        const username = Object.keys(usersData).find(key => usersData[key].id === userId);
        
        if (username) {
            res.json({ username: username });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    });
});

app.post('/updatePreferences', (req, res) => {
    const { video } = req.body;
    const userId = req.session.userId;
    if (!userId) {
        console.log('User not authenticated');
        return res.status(401).send('User not authenticated');
    }

    const videoTagsPath = path.join(__dirname, 'videos', `${video.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '')}.txt`);
    if (!fs.existsSync(videoTagsPath)) {
        console.log('Video tags not found');
        return res.status(404).send('Video tags not found');
    }

    const videoTags = fs.readFileSync(videoTagsPath, 'utf8').split(',').map(tag => tag.trim());
    console.log('Video Tags:', videoTags);

    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        let preferencesData = {};
        if (!err) {
            preferencesData = JSON.parse(data);
        }
        if (!preferencesData[userId]) {
            preferencesData[userId] = {};
        }
        videoTags.forEach(tag => {
            if (preferencesData[userId][tag]) {
                preferencesData[userId][tag] += 1;
            } else {
                preferencesData[userId][tag] = 1;
            }
        });
        console.log('Updated Preferences:', preferencesData[userId]);

        fs.writeFile(preferencesFilePath, JSON.stringify(preferencesData, null, 2), err => {
            if (err) {
                console.log('Error saving preferences');
                return res.status(500).send('Error saving preferences');
            }
            res.sendStatus(200);
        });
    });
});

app.get('/recommendations', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading preferences');
        }
        try {
            const preferencesData = JSON.parse(data);
            const userPreferences = preferencesData[userId] || {};

            const videosDir = path.join(__dirname, 'videos');
            const videoFiles = [];

            function readDir(dir) {
                try {
                    const files = fs.readdirSync(dir);
                    files.forEach(file => {
                        const filePath = path.join(dir, file);
                        try {
                            // Crucial Fix: Check existence to prevent crash
                            if (!fs.existsSync(filePath)) {
                                return;
                            }

                            if (fs.statSync(filePath).isDirectory()) {
                                readDir(filePath);
                            } else if (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv')) {
                                const relativePath = path.relative(videosDir, filePath).replace(/\\/g, '/');
                                
                                // Safely build paths
                                const viewCountPath = path.join(__dirname, 'viewcounts', `${relativePath.replace(/\.(mp4|mp3|mkv)$/, '')}.txt`);
                                const fileDatePath = path.join(__dirname, 'filedates', `${relativePath.replace(/\.(mp4|mp3|mkv)$/, '')}.txt`);
                                const tagsPath = path.join(__dirname, 'videos', `${relativePath.replace(/\.(mp4|mp3|mkv)$/, '')}.txt`);
                                const filenamePath = path.join(__dirname, 'filenames', relativePath.replace(/\.(mp4|mp3|mkv)$/, '') + '.txt');

                                let viewCount = '0';
                                let fileDate = '';
                                let tags = [];
                                let displayName = file.replace(/\.(mp4|mp3|mkv)$/, '');

                                if (fs.existsSync(viewCountPath)) {
                                    viewCount = fs.readFileSync(viewCountPath, 'utf8');
                                }

                                if (fs.existsSync(fileDatePath)) {
                                    fileDate = fs.readFileSync(fileDatePath, 'utf8');
                                }

                                if (fs.existsSync(tagsPath)) {
                                    tags = fs.readFileSync(tagsPath, 'utf8').split(',').map(tag => tag.trim());
                                }

                                if (fs.existsSync(filenamePath)) {
                                    displayName = fs.readFileSync(filenamePath, 'utf8');
                                }

                                videoFiles.push({
                                    path: relativePath,
                                    viewCount: viewCount,
                                    fileDate: fileDate,
                                    tags: tags,
                                    displayName: displayName
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

            const recommendedVideos = videoFiles.filter(video => {
                return video.tags.some(tag => userPreferences[tag]);
            }).sort(() => 0.5 - Math.random()).slice(0, 20);

            res.json(recommendedVideos);
        } catch (err) {
            console.error('Error parsing preferences data:', err);
            return res.status(500).send('Error parsing preferences data');
        }
    });
});

app.get('/top-categories', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    fs.readFile(preferencesFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading preferences');
        }
        try {
            const preferencesData = JSON.parse(data);
            const userPreferences = preferencesData[userId] || {};

            const sortedPreferences = Object.entries(userPreferences).sort((a, b) => b[1] - a[1]);
            const topCategories = sortedPreferences.slice(0, 5).map(entry => entry[0]);

            res.json(topCategories);
        } catch (err) {
            console.error('Error parsing preferences data:', err);
            return res.status(500).send('Error parsing preferences data');
        }
    });
});

// Get all playlists for a channel
app.get('/channel-playlists/:channel', (req, res) => {
    const channel = req.params.channel;
    const videosDir = path.join(__dirname, 'videos', channel);
    
    if (!fs.existsSync(videosDir)) {
        return res.json([]);
    }

    const playlists = [];
    
    function scanForPlaylists(dir, basePath = '') {
        const items = fs.readdirSync(dir);
        
        items.forEach(item => {
            const itemPath = path.join(dir, item);
            const relativePath = basePath ? `${basePath}/${item}` : item;
            
            if (fs.statSync(itemPath).isDirectory()) {
                // This is a playlist (subdirectory)
                const playlistVideos = [];
                
                // Count videos in this playlist
                function countVideosInPlaylist(playlistDir) {
                    const files = fs.readdirSync(playlistDir);
                    files.forEach(file => {
                        const filePath = path.join(playlistDir, file);
                        if (fs.statSync(filePath).isFile() && 
                            (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv'))) {
                            playlistVideos.push(file);
                        } else if (fs.statSync(filePath).isDirectory()) {
                            countVideosInPlaylist(filePath); // Recursive for nested folders
                        }
                    });
                }
                
                countVideosInPlaylist(itemPath);
                
                if (playlistVideos.length > 0) {
                    playlists.push({
                        name: item,
                        path: relativePath,
                        videoCount: playlistVideos.length,
                        fullPath: itemPath
                    });
                }
                
                // Check for nested playlists
                scanForPlaylists(itemPath, relativePath);
            }
        });
    }
    
    scanForPlaylists(videosDir);
    res.json(playlists);
});

// Get videos in a specific playlist
app.get('/playlist-videos/:channel/:playlist*', (req, res) => {
    const channel = req.params.channel;
    const playlistPath = req.params[0] ? 
        `${req.params.playlist}/${req.params[0]}` : 
        req.params.playlist;
    
    const playlistDir = path.join(__dirname, 'videos', channel, playlistPath);
    
    if (!fs.existsSync(playlistDir)) {
        return res.status(404).send('Playlist not found');
    }

    const videoFiles = [];

    function readPlaylistDir(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                readPlaylistDir(filePath); // Handle nested folders
            } else if (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv')) {
                const relativePath = path.relative(path.join(__dirname, 'videos'), filePath).replace(/\\/g, '/');
                const viewCountPath = path.join(__dirname, 'viewcounts', `${relativePath.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '')}.txt`);
                const fileDatePath = path.join(__dirname, 'filedates', `${relativePath.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '')}.txt`);
                const filenamePath = path.join(__dirname, 'filenames', relativePath.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '') + '.txt');

                let viewCount = '0';
                let fileDate = '';
                let displayName = file.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '');

                if (fs.existsSync(viewCountPath)) {
                    viewCount = fs.readFileSync(viewCountPath, 'utf8');
                }

                if (fs.existsSync(fileDatePath)) {
                    fileDate = fs.readFileSync(fileDatePath, 'utf8');
                }

                if (fs.existsSync(filenamePath)) {
                    displayName = fs.readFileSync(filenamePath, 'utf8');
                }

                videoFiles.push({
                    path: relativePath,
                    viewCount: viewCount,
                    fileDate: fileDate,
                    displayName: displayName
                });
            }
        });
    }

    readPlaylistDir(playlistDir);
    res.json(videoFiles);
});

app.get('/user-history', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    fs.readFile(watchHistoryFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading watch history');
        }
        const watchHistoryData = JSON.parse(data);
        const userHistory = watchHistoryData[userId] || [];

        const videosDir = path.join(__dirname, 'videos');
        const videoFiles = [];

        function readDir(dir) {
            try {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const filePath = path.join(dir, file);
                    try {
                        // --- CRUCIAL FIX: Check if file exists before stating it ---
                        if (!fs.existsSync(filePath)) {
                            return;
                        }

                        if (fs.statSync(filePath).isDirectory()) {
                            readDir(filePath);
                        } else if (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv')) {
                            const relativePath = path.relative(videosDir, filePath).replace(/\\/g, '/');
                            const viewCountPath = path.join(__dirname, 'viewcounts', `${relativePath.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '')}.txt`);
                            const fileDatePath = path.join(__dirname, 'filedates', `${relativePath.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '')}.txt`);
                            const filenamePath = path.join(__dirname, 'filenames', relativePath.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '') + '.txt');

                            let viewCount = '0';
                            let fileDate = '';
                            let displayName = file.replace(/\.mp4$/, '').replace(/\.mp3$/, '').replace(/\.mkv$/, '');

                            if (fs.existsSync(viewCountPath)) {
                                viewCount = fs.readFileSync(viewCountPath, 'utf8');
                            }

                            if (fs.existsSync(fileDatePath)) {
                                fileDate = fs.readFileSync(fileDatePath, 'utf8');
                            }

                            if (fs.existsSync(filenamePath)) {
                                displayName = fs.readFileSync(filenamePath, 'utf8');
                            }

                            videoFiles.push({
                                path: relativePath,
                                viewCount: viewCount,
                                fileDate: fileDate,
                                displayName: displayName
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

        // Create a map for quick video lookup
        const videoMap = {};
        videoFiles.forEach(video => {
            videoMap[video.path] = video;
        });

        // Filter and sort by history timestamp (newest first)
        const watchedVideos = userHistory
            .filter(item => {
                const videoPath = typeof item === 'object' ? item.video : item;
                return videoMap[videoPath];
            })
            .map(item => {
                const videoPath = typeof item === 'object' ? item.video : item;
                const video = videoMap[videoPath];
                const timestamp = typeof item === 'object' ? item.timestamp : null;
                return {
                    ...video,
                    timestamp: timestamp // Include the timestamp
                };
            })
            .sort((a, b) => {
                // Sort by timestamp (newest first)
                if (!a.timestamp && !b.timestamp) return 0;
                if (!a.timestamp) return 1;
                if (!b.timestamp) return -1;
                return new Date(b.timestamp) - new Date(a.timestamp);
            });

        res.json(watchedVideos);
    });
});

app.get('/search-index', (req, res) => {
    const videosDir = path.join(__dirname, 'videos');
    const videoFiles = [];

    function readDir(dir) {
        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                try {
                    // Crucial Fix: Check existence to prevent crash on corrupted/ghost files
                    if (!fs.existsSync(filePath)) {
                        return;
                    }

                    if (fs.statSync(filePath).isDirectory()) {
                        readDir(filePath);
                    } else if (file.endsWith('.mp4') || file.endsWith('.mp3') || file.endsWith('.mkv')) {
                        const relativePath = path.relative(videosDir, filePath).replace(/\\/g, '/');
                        
                        // Safely build paths
                        const viewCountPath = path.join(__dirname, 'viewcounts', `${relativePath.replace(/\.(mp4|mp3|mkv)$/, '')}.txt`);
                        const fileDatePath = path.join(__dirname, 'filedates', `${relativePath.replace(/\.(mp4|mp3|mkv)$/, '')}.txt`);
                        const filenamePath = path.join(__dirname, 'filenames', relativePath.replace(/\.(mp4|mp3|mkv)$/, '') + '.txt');
                        const descriptionPath = path.join(__dirname, 'descriptions', relativePath.replace(/\.(mp4|mp3|mkv)$/, '') + '.txt');

                        let viewCount = '0';
                        let fileDate = '';
                        let displayName = file.replace(/\.(mp4|mp3|mkv)$/, '');
                        let description = '';

                        if (fs.existsSync(viewCountPath)) {
                            viewCount = fs.readFileSync(viewCountPath, 'utf8');
                        }

                        if (fs.existsSync(fileDatePath)) {
                            fileDate = fs.readFileSync(fileDatePath, 'utf8');
                        }

                        if (fs.existsSync(filenamePath)) {
                            displayName = fs.readFileSync(filenamePath, 'utf8');
                        }

                        if (fs.existsSync(descriptionPath)) {
                            description = fs.readFileSync(descriptionPath, 'utf8');
                        }

                        videoFiles.push({
                            path: relativePath,
                            viewCount: viewCount,
                            fileDate: fileDate,
                            displayName: displayName,
                            description: description
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
    res.json({ videos: videoFiles });
});

app.post('/add-to-history', (req, res) => {
    const { video } = req.body;
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    fs.readFile(watchHistoryFilePath, 'utf8', (err, data) => {
        let watchHistoryData = {};
        if (!err) {
            watchHistoryData = JSON.parse(data);
        }
        if (!watchHistoryData[userId]) {
            watchHistoryData[userId] = [];
        }
        
        // Remove the video if it already exists (to update its position)
        watchHistoryData[userId] = watchHistoryData[userId].filter(item => 
            typeof item === 'object' ? item.video !== video : item !== video
        );
        
        // Add the video with timestamp (newest first)
        watchHistoryData[userId].unshift({
            video: video,
            timestamp: new Date().toISOString() // Add timestamp
        });
        
        // Keep only the last 100 videos to prevent the array from growing too large
        if (watchHistoryData[userId].length > 100) {
            watchHistoryData[userId] = watchHistoryData[userId].slice(0, 100);
        }

        fs.writeFile(watchHistoryFilePath, JSON.stringify(watchHistoryData, null, 2), err => {
            if (err) {
                return res.status(500).send('Error saving watch history');
            }
            res.sendStatus(200);
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});