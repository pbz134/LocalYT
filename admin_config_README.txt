README:

admin_config.json looks like this by default (see below for an explanation):
{
  "uploadPolicy": "admin",
  "allowedUploaders": [],
  "adminUsers": [],
  "reencodeOnUpload": {
    "enabled": true,
    "concurrency": 1,
    "targetWidth": 1920,
    "targetHeight": 1080,
    "crf": 28,
    "preset": 6,
    "fpsCap": 60,
    "videoCodec": "av1",
    "audioCodec": "aac",
    "audioBitrate": "128k",
    "container": "mp4",
    "keepOriginalIfSmaller": true
  },
  "transcoding": {
    "enabled": true,
    "engine": "qsv",
    "resolutions": { "480": true, "360": true, "240": true, "144": true },
    "maxConcurrent": 1,
    "cacheMaxAgeDays": 60,
    "cacheCleanupIntervalHours": 6,
    "qsvQuality": 26,
    "qsvPreset": "veryfast",
    "x264Crf": 26,
    "x264Preset": "veryfast",
    "audioBitrate": "96k"
  }
}


Upload Policy:
- Set uploadPolicy to "none" if you want to hide the upload button everywhere
- Set uploadPolicy to "admin" if you only want admins to access the upload button
- Set uploadPolicy to "list" to specify a list of allowed users in "allowedUploaders" by their username from users.json:
  "allowedUploaders": ["Jane Doe", "John Doe", "Scam Saltman"],

- Specify admins in "adminUsers" to be affected by "uploadPolicy": "admin"

Transcoding:
Transcoding allows users to stream videos in lower resolutions without having to store them on the server
However, this is a tradeoff between CPU consumption and storage consumption
- Set "enabled" to "false" to globally disable transcoding
- Change "qsvQuality" and "qsvPreset" for better quality (but more CPU-heavy) transcoding

Specify remaining settings as needed, keep in mind that some codec/container/audio combinations are NOT possible

