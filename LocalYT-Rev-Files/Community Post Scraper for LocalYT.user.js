// ==UserScript==
// @name        Community Post Scraper for LocalYT
// @namespace    http://tampermonkey.net/
// @version      13.1
// @description  Uses multiple strategies to find images including direct DOM access. Filters images < 100x100 px.
// @author       You
// @match        https://www.youtube.com/*/posts
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const IMAGE_FOLDER_PATH = "./";
    const SCROLL_PAUSE = 3000;
    const SCROLL_STEP = 2000;
    const MAX_RETRIES = 10;
    const MIN_IMAGE_SIZE = 100; // Minimum width/height in pixels

    // --- STATE ---
    let isRunning = false;
    let scrapedIds = new Set();
    let masterPostList = [];
    let detectedChannelName = "YouTube_Channel";

    // --- UTILITIES ---

    function log(msg) {
        console.log(`[YT Scraper] ${msg}`);
        updateStatus(msg);
    }

    function parseDate(str) {
        if (!str) return new Date().getTime();
        const now = new Date();
        const s = str.toLowerCase().trim();
        let ms = 0;

        const m = s.match(/vor\s(\d+)\s(\w+)/);
        if (m) {
            const val = parseInt(m[1]);
            const unit = m[2];
            if (unit.includes('sek')) ms = val * 1000;
            else if (unit.includes('min')) ms = val * 60000;
            else if (unit.includes('stund')) ms = val * 3600000;
            else if (unit.includes('tag') || unit === 'gestern') {
                ms = (val || 1) * 86400000;
            }
            else if (unit.includes('woche')) ms = val * 604800000;
            else if (unit.includes('monat')) ms = val * 2592000000;
        } else if (s.includes('gerade eben')) ms = 0;

        return now.getTime() - ms;
    }

    async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    /**
     * Checks image dimensions safely.
     * Returns true if VALID (large enough).
     * Returns true if ERROR (fails safe: saves image rather than losing data).
     * Returns false only if explicitly too small.
     */
    async function checkImageDimensions(url) {
        return new Promise((resolve) => {
            const img = new Image();

            // CRITICAL FIX: Prevent Referrer/Security issues blocking the load
            img.referrerPolicy = "no-referrer";
            img.crossOrigin = "anonymous"; // Attempt CORS, but handle failure below

            img.onload = () => {
                if (img.width >= MIN_IMAGE_SIZE && img.height >= MIN_IMAGE_SIZE) {
                    resolve(true); // Valid size
                } else {
                    console.warn(`[Filter] Skipping small image: ${img.width}x${img.height}`);
                    resolve(false); // Too small
                }
            };

            img.onerror = () => {
                // FIX: If we can't check it (error), assume it's good so we don't lose data.
                console.warn(`[Filter] Could not verify size (Error/CORS), defaulting to SAVE: ${url.substring(0, 50)}...`);
                resolve(true);
            };

            img.src = url;
        });
    }

    function generateIndexedFileName(author, postId, index, rawUrl) {
        let ext = 'webp';
        if (rawUrl.includes('.jpg') || rawUrl.includes('.jpeg')) ext = 'jpg';
        else if (rawUrl.includes('.png')) ext = 'png';

        const safeAuthor = author.replace(/[^a-zA-Z0-9]/g, '_');
        const safeId = postId.split('/').pop();

        return `${safeAuthor}_${safeId}_img${index + 1}.${ext}`;
    }

    /**
     * MULTI-STRATEGY IMAGE EXTRACTOR
     */
    function extractImageUrls(postElement) {
        const urls = [];
        const seenUrls = new Set();

        // STRATEGY 1: Direct querySelector
        const directImages = postElement.querySelectorAll('img[width="638"]');
        directImages.forEach(img => {
            const src = img.src || img.getAttribute('src') || '';
            if (src && !seenUrls.has(src) && src.startsWith('http')) {
                seenUrls.add(src);
                urls.push(src);
            }
        });

        // STRATEGY 2: Regex search
        if (urls.length === 0) {
            const htmlContent = postElement.innerHTML;
            const regex = /(?:https?:)?\/\/(yt3\.ggpht|lh3\.googleusercontent)\.com\/[^\s"'\]>]{50,}/g;
            let match;
            while ((match = regex.exec(htmlContent)) !== null) {
                let url = match[0].trim().replace(/["'\]>]+$/, '');
                if (url.startsWith('//')) url = 'https:' + url;
                if (url && !seenUrls.has(url) && url.length > 80) {
                    seenUrls.add(url);
                    urls.push(url);
                }
            }
        }

        // STRATEGY 3: Recursive walk
        if (urls.length === 0) {
            const allElements = postElement.querySelectorAll('*');
            allElements.forEach(el => {
                const bgImage = window.getComputedStyle(el).backgroundImage;
                if (bgImage && bgImage !== 'none' && bgImage.includes('ggpht')) {
                    const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/);
                    if (urlMatch && !seenUrls.has(urlMatch[1])) {
                        seenUrls.add(urlMatch[1]);
                        urls.push(urlMatch[1]);
                    }
                }
                ['data-src', 'data-url', 'src', 'href'].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val && (val.includes('ggpht') || val.includes('googleusercontent')) && !seenUrls.has(val)) {
                        let url = val;
                        if (url.startsWith('//')) url = 'https:' + url;
                        seenUrls.add(url);
                        urls.push(url);
                    }
                });
            });
        }

        return urls;
    }


    // --- DOWNLOAD LOGIC ---

    function directDownload(url, filename) {
        return new Promise((resolve) => {
            GM_download({
                url: url,
                name: filename,
                saveAs: false,
                onload: function() { resolve(true); },
                onerror: function(error) {
                    console.error("Download failed:", error);
                    fallbackBlobDownload(url, filename).then(resolve);
                }
            });
        });
    }

    async function fallbackBlobDownload(url, filename) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(blobUrl);
            return true;
        } catch(e) {
            return false;
        }
    }

    function saveFinalJSON() {
        if (masterPostList.length === 0) {
            alert("No posts were scraped!");
            return;
        }

        const jsonStr = JSON.stringify(masterPostList, null, 2);
        const blob = new Blob([jsonStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);

        const finalFileName = `${detectedChannelName}_Community_Posts.json`;

        log(`Saving Final JSON: ${finalFileName}`);

        GM_download({
            url: url,
            name: finalFileName,
            saveAs: true,
            onload: function() { URL.revokeObjectURL(url); },
            onerror: function(err) { console.error("Final Save Error", err); }
        });
    }


    // --- CORE SCRAPER ---

    async function scrapeCurrentView() {
        const posts = document.querySelectorAll('ytd-backstage-post-renderer');
        let newCount = 0;

        for (let post of posts) {
            try {
                const idLink = post.querySelector('#published-time-text a');
                if (!idLink) continue;

                const postId = idLink.getAttribute('href');
                if (!postId || scrapedIds.has(postId)) continue;

                // Detect Channel Name
                if (detectedChannelName === "YouTube_Channel") {
                    const authEl = post.querySelector('#author-text span');
                    if (authEl) {
                        detectedChannelName = authEl.textContent.trim().replace(/[^a-zA-Z0-9]/g, '_');
                        updateStatus(`Scraping: ${detectedChannelName}...`);
                    }
                }

                // Extract Metadata
                const authorEl = post.querySelector('#author-text span');
                const author = authorEl ? authorEl.textContent.trim() : "Unknown";

                const dateStr = idLink.textContent.trim();
                const unixTime = parseDate(dateStr);

                const textEl = post.querySelector('#content-text');
                const text = textEl ? textEl.innerText.trim() : "";

                const likeEl = post.querySelector('#vote-count-middle');
                const likes = likeEl ? parseInt(likeEl.textContent.replace(/\D/g, ''), 10) : 0;

                // --- EXTRACTION WITH MULTIPLE ATTEMPTS ---
                let foundUrls = extractImageUrls(post);

                if (foundUrls.length === 0) {
                    await sleep(3000);
                    foundUrls = extractImageUrls(post);
                    if (foundUrls.length === 0) {
                        await sleep(2000);
                        foundUrls = extractImageUrls(post);
                    }
                }

                // Process Found URLs with Size Filtering
                let images = [];

                if (foundUrls.length > 0) {
                    for (let i = 0; i < foundUrls.length; i++) {
                        const src = foundUrls[i];

                        // Check dimensions
                        const isValidSize = await checkImageDimensions(src);

                        // If check returns false, it means it was successfully loaded but was TOO SMALL
                        if (!isValidSize) {
                            continue;
                        }

                        // If we are here, image is either Valid Size OR Check failed (so we keep it as fallback)
                        const cleanName = generateIndexedFileName(author, postId, i, src);
                        const localPath = `${IMAGE_FOLDER_PATH}${cleanName}`;

                        images.push({
                            original_url: src,
                            file_name: cleanName,
                            local_path: localPath,
                            image_index: images.length + 1
                        });

                        await directDownload(src, cleanName);
                    }
                }

                // Add to Master List
                const postData = {
                    id: postId,
                    author: author,
                    content: text,
                    likes: likes,
                    unix_timestamp: unixTime,
                    raw_date: dateStr,
                    total_images: images.length,
                    images: images
                };

                masterPostList.push(postData);
                scrapedIds.add(postId);
                newCount++;

                post.style.border = "2px solid #4caf50";

            } catch (e) {
                console.error("Error parsing single post", e);
            }
        }

        return newCount;
    }

    // --- MAIN LOOP ---

    async function startLoop() {
        if (isRunning) return alert("Already running!");

        isRunning = true;
        masterPostList = [];
        scrapedIds.clear();
        detectedChannelName = "YouTube_Channel";

        let noNewDataCounter = 0;

        btnStart.disabled = true;
        btnStop.disabled = false;
        statusText.innerText = "Status: Starting...";

        while (isRunning && noNewDataCounter < MAX_RETRIES) {

            const count = await scrapeCurrentView();

            if (count === 0) {
                noNewDataCounter++;
                log(`No new posts (${noNewDataCounter}/${MAX_RETRIES})`);
            } else {
                noNewDataCounter = 0;
                log(`Collected ${masterPostList.length} posts...`);
            }

            window.scrollBy(0, SCROLL_STEP);
            await sleep(SCROLL_PAUSE);
        }

        finishScraping();
    }

    function stopScraping() {
        isRunning = false;
        finishScraping();
    }

    function finishScraping() {
        isRunning = false;
        btnStart.disabled = false;
        btnStop.disabled = true;

        updateStatus(`Finished. Saving JSON...`);
        saveFinalJSON();

        alert(`Done! Scraped ${masterPostList.length} total posts.\nSaving as: ${detectedChannelName}_Community_Posts.json`);
    }

    // --- GUI CREATION ---

    const gui = document.createElement('div');
    gui.id = 'yt-scraper-gui';
    Object.assign(gui.style, {
        position: 'fixed', bottom: '20px', right: '20px', width: '340px',
        background: '#fff', border: '1px solid #ccc', borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: '999999',
        fontFamily: 'Arial, sans-serif', fontSize: '14px', padding: '15px'
    });

    const header = document.createElement('div');
    header.style.fontWeight = 'bold'; header.style.marginBottom = '10px';
    header.style.fontSize = '16px'; header.innerText = 'Community Post Scraper for LocalYT';

    const statusText = document.createElement('div');
    statusText.style.marginBottom = '10px'; statusText.style.color = '#555';
    statusText.style.fontSize = '12px'; statusText.innerText = 'Status: Idle';

    const infoText = document.createElement('div');
    infoText.style.marginBottom = '15px'; infoText.style.fontSize = '11px';
    infoText.style.color = '#777';
    infoText.innerHTML = `Method: <b>Multi-Strategy</b><br>
    Filter: Min 100x100 px<br>
    (Safe mode: Saves on error)<br>
    1. Direct query<br>
    2. Regex search<br>
    3. Attribute scan<br>
    4. Background-image check`;

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex'; btnContainer.style.gap = '10px';

    const btnStart = document.createElement('button');
    btnStart.innerText = '▶ Start';
    Object.assign(btnStart.style, {
        flex: 1, padding: '10px', background: '#1976D2', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
    });
    btnStart.onclick = startLoop;

    const btnStop = document.createElement('button');
    btnStop.innerText = '⏹ Stop & Save';
    btnStop.disabled = true;
    Object.assign(btnStop.style, {
        flex: 1, padding: '10px', background: '#D32F2F', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
    });
    btnStop.onclick = stopScraping;

    btnContainer.appendChild(btnStart);
    btnContainer.appendChild(btnStop);
    gui.appendChild(header);
    gui.appendChild(infoText);
    gui.appendChild(statusText);
    gui.appendChild(btnContainer);

    document.body.appendChild(gui);

    function updateStatus(txt) {
        if(statusText) statusText.innerText = `Status: ${txt}`;
    }

})();