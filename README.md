<p align="center">
  <a href="#readme">
    <img src="https://github.com/pbz134/LocalYT/blob/main/.github/Logo_Original.png" alt="LocalYT" />
  </a>
</p>

**LocalYT** is a feature-rich local video library that allows you to watch videos with seamless metadata integration and a powerful tag-based algorithm in a familiar UI.


## Inspiration

I started building an archive of YouTube videos around 2019 to preserve all the various videos I liked, even when they got deleted from their original source. Years later, I had amassed a huge collection of almost 100,000 videos, and watching them through a standard video player like VLC would be too boring. So I came up with an idea to create my very own video library and enjoy the videos even more that way.

Back in 2024 when I was experimenting with AI-assisted coding, I made the very first version of **LocalYT**, basically a prototype, with a simple video grid as the landing page and a separate video player page. It wasn't much, but it was a start.
From then on, I regularly worked on the program to further improve it, and 15 months later, I think that **LocalYT** has evolved into the perfect video UI for me.

---

## Features

- **Fully self-hosted**
  - LocalYT runs completely offline, independent of any APIs or online services
- **Immersive video watching experience**
  - A minimalistic but stylish UI makes your videos feel more engaging
- **Easy metadata integration**
  - Add thumbnails, descriptions, like/dislike values and more to your videos
- **Multi-page system**
  - LocalYT comes with a landing page, video player page, channel pages and many more
- **Video playlists**
  - Keep your channels more organized by creating playlists with subfolders
  - Video queues next to the player allow you to watch a full playlist at once (see Video Page screenshot below)
- **Algorithm**
  - Use the power of a Large Language Model (LLM) to tag videos accurately
  - LocalYT analyzes your behavior and shows you more of the videos you like
  - Configure your algorithm behavior however you like by modifying it on the Settings page
- **Account system**
  - Create a local account to track your watch history, liked videos and subscribed channels
  - Add videos to your own custom playlists
  - Resume your session on a different computer

---

## Prerequisites
- [Node.js](https://nodejs.org/en)
- [FFmpeg](https://www.ffmpeg.org/download.html) (must be added to PATH!)
- A few, or a lot of videos :)

---

## Setup

1. Download LocalYT-vXX.7z from the Releases tab and extract it (avoid special characters in the path to reduce the chance of errors)
2. Copy any .mp4, .mkv or .mp3 files into subfolders of `/videos` (each subfolder represents a channel)
3. Optionally, copy respective thumbnails, descriptions or other metadata into subfolders of their respective metadata folders
4. Run `#Setup-or-Update.bat` and wait for the automatic setup to complete
5. Launch the server with `#Launch-Server.bat`

---

## Example Setups
**Landing Page**
[![Landing Page](https://github.com/pbz134/LocalYT/blob/main/.github/index_example.PNG)](#readme)

**Video Page**
[![Video Page](https://github.com/pbz134/LocalYT/blob/main/.github/video_example.PNG)](#readme)

**Channel Page**
[![Channel Page](https://github.com/pbz134/LocalYT/blob/main/.github/channel_example.PNG)](#readme)

Channel used:
https://www.youtube.com/@TWD98

---

## FAQ
How does the algorithm actually work?
- The algorithm works by first creating a file list of all videos and saving them to a .txt file. KoboldCpp is then being used to launch a local LLM on your computer which analyzes the titles and guesses the most accurate tags from a large available tag pool. Once every video has been tagged and you are logged in to an account on the video page, you can start watching videos which makes the respective tags for that video increase in your account. The higher the value of a certain tag is, the more likely it is for LocalYT to recommend you similar videos!

What if I only have the video files and no metadata?
- No metadata is no problem! All missing data, such as thumbnails, view counts, various stats and even channels' profile pictures are simply being generated.
- You can also use the built-in metadata fetcher at /LocalYT-Debug to get the necessary metadata for your videos
- Note that you need to have video links ready which you can get with `download-channel-or-playlist.bat`

---

## TO DO
- Work on the documentation in the user modal
- Make hamburger menu available on all related .html pages
- Finish implementing Light Mode
- Use Logo.svg with external rendered version number instead of PNG
