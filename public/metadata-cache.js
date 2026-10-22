/**
 * metadata-cache.js
 * Loads /metadata_cache.json once and exposes synchronous accessors
 * with graceful fallback to individual fetches for missing data.
 */
(function () {
    'use strict';

    let cache = null;
    let loadPromise = null;

    function load() {
        if (loadPromise) return loadPromise;
        loadPromise = fetch('/metadata_cache.json', { cache: 'no-cache' })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => {
                cache = data;
                if (!cache.videos) cache.videos = {};
                if (!cache.channels) cache.channels = {};
                if (!cache.playlists) cache.playlists = {};
                return cache;
            })
            .catch(err => {
                console.warn('[MetadataCache] Falling back to individual fetches:', err.message);
                cache = { videos: {}, channels: {}, playlists: {} };
                return cache;
            });
        return loadPromise;
    }

    function ready() { return cache ? Promise.resolve(cache) : load(); }

    // --- SYNC ACCESSORS ---
    function getVideo(videoPath) {
        if (!cache || !videoPath) return null;
        return cache.videos[videoPath] || null;
    }
    function getChannel(channelName) {
        if (!cache || !channelName) return null;
        return cache.channels[channelName] || null;
    }
    function getPlaylist(channelName, playlistPath) {
        if (!cache) return null;
        return cache.playlists[`${channelName}/${playlistPath}`] || null;
    }

    // --- ASYNC FALLBACK FETCHERS ---
    function stripExtension(p) {
        return p.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i, '');
    }
    async function fetchText(url) {
        try {
            const r = await fetch(url);
            return r.ok ? await r.text() : null;
        } catch (e) { return null; }
    }

    // --- CONVENIENCE ASYNC GETTERS (use sync cache, fallback to fetch) ---
    async function getViewCount(videoPath) {
        await ready();
        const v = getVideo(videoPath);
        if (v && v.viewCount !== undefined) return v.viewCount;
        const t = await fetchText(`/viewcounts/${encodeURIComponent(stripExtension(videoPath))}`);
        return t || '0';
    }
    async function getFileDate(videoPath) {
        await ready();
        const v = getVideo(videoPath);
        if (v && v.fileDate !== undefined) return v.fileDate;
        const t = await fetchText(`/filedates/${encodeURIComponent(stripExtension(videoPath))}.txt`);
        return t || 'Unknown date';
    }
    async function getDisplayName(videoPath) {
        await ready();
        const v = getVideo(videoPath);
        if (v && v.displayName !== undefined) return v.displayName;
        const t = await fetchText(`/filenames/${encodeURIComponent(stripExtension(videoPath))}.txt`);
        return t || stripExtension(videoPath.split('/').pop());
    }
    async function getVideoLength(videoPath) {
        await ready();
        const v = getVideo(videoPath);
        if (v && v.videoLength !== undefined) return v.videoLength;
        const parts = videoPath.split('/');
        const channel = parts[0];
        const name = stripExtension(parts[parts.length - 1]);
        const t = await fetchText(`/videolengths/${encodeURIComponent(channel)}/${encodeURIComponent(name)}.txt`);
        return t || '';
    }
    async function getSubtitles(videoPath) {
        await ready();
        const v = getVideo(videoPath);
        return v && v.subtitles ? v.subtitles : null;
    }

    window.MetadataCache = {
        ready,
        isLoaded: () => !!cache,
        getVideo,
        getChannel,
        getPlaylist,
        getViewCount,
        getFileDate,
        getDisplayName,
        getVideoLength,
        getSubtitles,
        // Expose raw cache for advanced use (e.g. iterating all videos)
        get raw() { return cache; }
    };

    // Eagerly start loading — deduped via loadPromise
    ready();
})();