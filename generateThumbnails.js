const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const videosDir = path.join(__dirname, 'videos');
const thumbnailsDir = path.join(__dirname, 'thumbnails');

// Create thumbnails directory if it doesn't exist
if (!fsSync.existsSync(thumbnailsDir)) {
    fsSync.mkdirSync(thumbnailsDir, { recursive: true });
}

async function getVideoDuration(videoPath) {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
        );
        const duration = parseFloat(stdout);
        return duration && duration > 1 ? duration : 10; // Default to 10s if invalid
    } catch (error) {
        console.warn(`Could not get duration for ${path.basename(videoPath)}, using default.`);
        return 10;
    }
}

async function generateThumbnailForVideo(videoPath, thumbnailPath) {
    try {
        const duration = await getVideoDuration(videoPath);
        const maxTime = Math.min(duration * 0.9, duration - 1);
        const randomTime = Math.floor(Math.random() * (maxTime - 1)) + 1;
        
        await execAsync(
            `ffmpeg -ss ${randomTime} -i "${videoPath}" -vframes 1 -q:v 2 -y "${thumbnailPath}"`
        );
        
        console.log(`Thumbnail generated for ${path.basename(videoPath)} at ${randomTime}s.`);
        return true;
    } catch (error) {
        console.error(`Error generating thumbnail for ${path.basename(videoPath)}:`, error.message);
        return false;
    }
}

async function extractCoverFromMP3(mp3Path, thumbnailPath) {
    try {
        await execAsync(
            `ffmpeg -i "${mp3Path}" -an -vcodec copy -y "${thumbnailPath}"`
        );
        console.log(`Cover image extracted for ${path.basename(mp3Path)}`);
        return true;
    } catch (error) {
        console.error(`Error extracting cover for ${path.basename(mp3Path)}:`, error.message);
        return false;
    }
}

async function processFile(filePath, relativePath, thumbnailsBaseDir) {
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
        await processDirectory(filePath, path.join(thumbnailsBaseDir, path.basename(filePath)));
        return;
    }

    const fileName = path.basename(filePath);
    const baseName = path.parse(fileName).name;
    
    // Skip if not a supported media file
    if (!fileName.match(/\.(mp4|mkv|mp3)$/i)) return;
    
    const thumbnailFilename = `${baseName}.jpg`;
    const thumbnailDir = path.join(thumbnailsBaseDir, relativePath);
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
    
    // Ensure thumbnail directory exists
    await fs.mkdir(thumbnailDir, { recursive: true });
    
    // Check if thumbnail already exists
    try {
        await fs.access(thumbnailPath);
        console.log(`Thumbnail for ${fileName} already exists.`);
        return;
    } catch (error) {
        // File doesn't exist, proceed to create it
    }
    
    if (fileName.endsWith('.mp3')) {
        await extractCoverFromMP3(filePath, thumbnailPath);
    } else {
        await generateThumbnailForVideo(filePath, thumbnailPath);
    }
}

async function processDirectory(directoryPath, thumbnailsBaseDir) {
    try {
        const files = await fs.readdir(directoryPath);
        
        // Process files in parallel with a concurrency limit
        const concurrencyLimit = 4; // Adjust based on your CPU cores
        const batches = [];
        
        for (let i = 0; i < files.length; i += concurrencyLimit) {
            const batch = files.slice(i, i + concurrencyLimit).map(async (file) => {
                const filePath = path.join(directoryPath, file);
                const relativePath = path.relative(directoryPath, path.dirname(filePath));
                await processFile(filePath, relativePath, thumbnailsBaseDir);
            });
            
            batches.push(Promise.allSettled(batch));
        }
        
        await Promise.all(batches);
        
    } catch (error) {
        console.error('Error processing directory:', directoryPath, error);
    }
}

async function createThumbnails() {
    console.time('Thumbnail generation completed in');
    await processDirectory(videosDir, thumbnailsDir);
    console.timeEnd('Thumbnail generation completed in');
}

createThumbnails().catch(console.error);