const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, 'video_date_cache.json');
const lastStatePath = path.join(__dirname, 'last_video_state.json');
const notifPath = path.join(__dirname, 'notifications.json');

console.log("--- Starting Notification Generation ---");

let currentCache = {};
try {
    if (fs.existsSync(cachePath)) {
        currentCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        console.log(`Successfully read ${cachePath}`);
    } else {
        console.error(`Error: ${cachePath} does not exist!`);
    }
} catch(e) { 
    console.error("Error reading/parsing video_date_cache.json", e); 
}

// Extract paths from current cache
let currentPaths = new Set();
if (Array.isArray(currentCache)) {
    console.log("Cache is an Array.");
    currentCache.forEach(v => {
        if (v && v.path) currentPaths.add(v.path);
    });
} else if (typeof currentCache === 'object' && currentCache !== null) {
    console.log("Cache is an Object.");
    Object.keys(currentCache).forEach(p => currentPaths.add(p));
} else {
    console.log("Cache format is unknown or empty.");
}

console.log(`Found ${currentPaths.size} paths in the current cache.`);

// Check if this is the very first run
const isFirstRun = !fs.existsSync(lastStatePath);

if (isFirstRun) {
    fs.writeFileSync(lastStatePath, JSON.stringify([...currentPaths], null, 2));
    console.log("First run detected. Baseline state saved to last_video_state.json. No notifications generated.");
    process.exit(0);
}

// Normal run: load last state
let lastState = [];
try {
    lastState = JSON.parse(fs.readFileSync(lastStatePath, 'utf8'));
} catch(e) {
    console.error("Error reading last_video_state.json", e);
}

let lastPaths = new Set(lastState);
console.log(`Found ${lastPaths.size} paths in the last state.`);

const newPaths = [...currentPaths].filter(p => !lastPaths.has(p));
console.log(`Found ${newPaths.length} new paths.`);

if (newPaths.length > 0) {
    const channelCounts = {};
    newPaths.forEach(p => {
        const channel = p.split('/')[0];
        if (!channelCounts[channel]) channelCounts[channel] = { videos: 0, audios: 0 };
        if (/\.(mp3|wav|flac|m4a|aac)$/i.test(p)) {
            channelCounts[channel].audios++;
        } else {
            channelCounts[channel].videos++;
        }
    });

    let notifications = [];
    try {
        if (fs.existsSync(notifPath)) {
            notifications = JSON.parse(fs.readFileSync(notifPath, 'utf8'));
        }
    } catch(e) {}

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

    fs.writeFileSync(notifPath, JSON.stringify(notifications, null, 2));
    console.log(`Generated notifications. Saved to ${notifPath}`);
    
    // Print the new paths for debugging
    console.log("New paths detected:");
    newPaths.forEach(p => console.log(`  - ${p}`));
} else {
    console.log("No new files found for notifications.");
}

// Save current paths as the last state for the next run
fs.writeFileSync(lastStatePath, JSON.stringify([...currentPaths], null, 2));
console.log("--- Finished ---");