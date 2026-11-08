README:

admin_config.json looks like this by default:
{
  "uploadPolicy": "admin",
  "allowedUploaders": ["John Doe", "Jane Doe"],
  "adminUsers": ["YourUsername"],
  "reencodeOnUpload": {
    "enabled": true,
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
  }
}



- Set uploadPolicy to "none" if you want to hide the upload button everywhere

- Set uploadPolicy to "admin" if you only want admins to access the upload button

- Set uploadPolicy to "list" to specify a list of allowed users in "allowedUploaders" by their username from users.json:
  "allowedUploaders": ["Jane Doe", "John Doe", "Scam Saltman"],

- Specify admins in "adminUsers" to be affected by "uploadPolicy": "admin"

The other entries define reencoding settings, enable by setting "enabled": true,
Specify remaining settings as needed, keep in mind that some codec/container/audio combinations are NOT possible