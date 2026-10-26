/**
 * thumbnail-preview.js
 *
 * Hover-preview slideshow for video thumbnails in the sidebar.
 *
 * Highlights:
 *   - Sprite base derived from MetadataCache → data-video-path → img src.
 *   - Every path segment normalised through one encoding pipeline, so
 *     "100%", "100%25", "100%%20" all become "100%25".
 *   - Sprite URL is built from the base as "/spriteimages/<base>.webp"
 *     (matching what video.html's player does) — we never trust the
 *     sprite reference inside the VTT, which is often badly encoded.
 *   - Overlay is positioned to match the thumbnail <img> exactly, not
 *     the container, and the sprite is COVER-scaled with the crop
 *     centred, so it always fills the thumbnail without bleeding into
 *     adjacent sprite cells.
 */
(function () {
    'use strict';

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

    // ------------------------------------------------------------------
    // Tunables
    // ------------------------------------------------------------------
    const FRAMES_TO_SHOW     = 10;
    const FRAME_CYCLE_MS     = 700;
    const SPRITE_CACHE_MAX   = 30;
    const VTT_CACHE_MAX      = 100;
    const RESOLVED_CACHE_MAX = 200;
    const DEBUG              = false;

    // Global enable/disable, controlled by the "Thumbnail hover previews"
    // toggle in Settings > Content (localStorage key 'thumbnailPreviews').
    // Defaults to enabled when the setting has never been saved.
    function isPreviewSettingEnabled() {
        try {
            const setting = JSON.parse(localStorage.getItem('thumbnailPreviews') || '{}');
            return setting.enabled === true;
        } catch (e) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Caches
    // ------------------------------------------------------------------
    const vttCache          = new Map();
    const spriteCache       = new Map();
    const resolvedBaseCache = new Map();
    const displayNameIndex  = new Map();
    let   displayNameIndexBuilt = false;

    function log(...args) { if (DEBUG) console.log('[thumb-preview]', ...args); }

    // ------------------------------------------------------------------
    // Basic helpers
    // ------------------------------------------------------------------

    function hashString(str) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function stripExtension(filename) {
        return filename.replace(/\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$/i, '');
    }

    function parseTimeCode(str) {
        const parts = String(str).trim().split(':');
        const s = parseFloat(parts[2] || 0) || 0;
        const m = parseInt(parts[1] || 0, 10) || 0;
        const h = parseInt(parts[0] || 0, 10) || 0;
        return h * 3600 + m * 60 + s;
    }

    function fmtTime(s) {
        s = Math.floor(s);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m + ':' + String(sec).padStart(2, '0');
    }

    // ------------------------------------------------------------------
    // Encoding
    // ------------------------------------------------------------------

    function safeDecodePercent(str) {
        return str.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
        );
    }

    function encodeSegment(seg) {
        return encodeURIComponent(safeDecodePercent(seg));
    }

    function encodePath(rawPath) {
        return rawPath
            .split('/')
            .filter(p => p.length > 0)
            .map(encodeSegment)
            .join('/');
    }

    // Repair mojibake: some upstream source (server JSON / directory
    // listing) reads UTF-8 filenames as Latin-1, turning "SCHÜLERN"
    // into "SCHÃLERN". Re-encoding the string as Latin-1 bytes and
    // decoding them as UTF-8 restores the original name. Returns the
    // repaired string, or null if the input is not mojibake / repair
    // is not possible.
    function repairMojibake(raw) {
        try {
            const fixed = decodeURIComponent(escape(raw));
            return fixed !== raw ? fixed : null;
        } catch (e) {
            return null;
        }
    }

    // Repair one fully percent-encoded path segment. The segment is
    // first decoded as UTF-8 (giving the mojibake chars, e.g.
    // "SCHÃLERN"), then the Latin-1/UTF-8 round-trip restores the
    // real name ("SCHÜLERN"). Returns the re-encoded repaired segment,
    // or null when the segment is not affected (or repair throws).
    function repairEncodedSegment(seg) {
        try {
            const moji = decodeURIComponent(seg);
            const fixed = repairMojibake(moji);
            return fixed !== null ? encodeURIComponent(fixed) : null;
        } catch (e) {
            return null;
        }
    }

    // For every candidate also produce a mojibake-repaired variant of
    // each encoded path segment. Unaffected segments stay untouched,
    // so this is a no-op for names without broken characters.
    function withMojibakeVariants(candidates) {
        const out = [];
        const seen = new Set();
        function push(base, source) {
            if (!base || seen.has(base)) return;
            seen.add(base);
            out.push({ base, source });
        }
        for (const c of candidates) {
            push(c.base, c.source);
            const repaired = c.base
                .split('/')
                .map(seg => repairEncodedSegment(seg) || seg)
                .join('/');
            if (repaired !== c.base) push(repaired, c.source + '-repaired');
        }
        return out;
    }

    // ------------------------------------------------------------------
    // MetadataCache display-name index
    // ------------------------------------------------------------------

    function buildDisplayNameIndex() {
        if (displayNameIndexBuilt) return;
        const mc = window.MetadataCache;
        if (!mc || !mc.raw || !mc.raw.videos) return;
        for (const [key, meta] of Object.entries(mc.raw.videos)) {
            if (meta && meta.displayName && !displayNameIndex.has(meta.displayName)) {
                displayNameIndex.set(meta.displayName, key);
            }
        }
        displayNameIndexBuilt = true;
        log('DisplayName index built:', displayNameIndex.size);
    }

    function findPathByDisplayName(displayName) {
        if (!displayName) return null;
        buildDisplayNameIndex();
        return displayNameIndex.get(displayName) || null;
    }

    // ------------------------------------------------------------------
    // Video key & candidates
    // ------------------------------------------------------------------

    function getVideoKey(container) {
        const suggestionEl = container.closest('[data-video-path]');
        if (suggestionEl && suggestionEl.dataset.videoPath) {
            return 'vp:' + suggestionEl.dataset.videoPath;
        }
        const img = container.querySelector('img');
        if (img) return 'img:' + (img.getAttribute('src') || '');
        return null;
    }

    function deriveSpriteBaseCandidates(container) {
        const candidates = [];
        const seen = new Set();
        function addCandidate(base, source) {
            if (!base || seen.has(base)) return;
            seen.add(base);
            candidates.push({ base, source });
        }

        const suggestionEl = container.closest('[data-video-path]');
        const titleEl = suggestionEl && suggestionEl.querySelector('.suggestion-title');
        const displayName = titleEl && titleEl.textContent.trim();
        if (displayName) {
            const rawPath = findPathByDisplayName(displayName);
            if (rawPath && rawPath.includes('/')) {
                addCandidate(encodePath(stripExtension(rawPath)), 'metadata-cache');
            }
        }

        if (suggestionEl && suggestionEl.dataset.videoPath) {
            const stripped = stripExtension(suggestionEl.dataset.videoPath);
            const parts = stripped.split('/').filter(p => p.length > 0);
            if (parts.length >= 2) {
                addCandidate(encodePath(stripped), 'data-video-path');
            }
        }

        // index.html cards: look up the real path via the card title in
        // MetadataCache (the img src may be a flat %2F-joined path, which
        // is tried separately below).
        if (!suggestionEl) {
            const cardEl = container.closest('.video-item');
            const cardTitle = cardEl && cardEl.querySelector('.video-title');
            const cardName = cardTitle && cardTitle.textContent.trim();
            if (cardName) {
                const rawPath = findPathByDisplayName(cardName);
                if (rawPath && rawPath.includes('/')) {
                    addCandidate(encodePath(stripExtension(rawPath)), 'metadata-cache-card');
                }
            }
        }

        const img = container.querySelector('img.video-thumbnail') || container.querySelector('img');
        if (img) {
            const trySrc = (src, label) => {
                if (!src) return;
                try { if (/^https?:\/\//i.test(src)) src = new URL(src).pathname; } catch (e) {}
                let rawPath = null;
                if (src.startsWith('/thumbnails-small/')) {
                    rawPath = src.substring('/thumbnails-small/'.length);
                } else if (src.startsWith('/thumbnails/')) {
                    rawPath = src.substring('/thumbnails/'.length);
                }
                if (!rawPath) return;
                rawPath = rawPath.replace(/\.(jpg|jpeg|png|webp)$/i, '');
                addCandidate(encodePath(rawPath), label);
            };
            trySrc(img.getAttribute('src'), 'img-attr');
            if (img.src && img.src !== img.getAttribute('src')) {
                trySrc(img.src, 'img-prop');
            }
        }

        return withMojibakeVariants(candidates);
    }

    // ------------------------------------------------------------------
    // VTT parser (crops only — ignores sprite filename inside VTT)
    // ------------------------------------------------------------------

    function parseVtt(text) {
        const entries = [];
        const lines = text.split(/\r?\n/);
        let start = null;
        let end = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.startsWith('WEBVTT')) continue;
            if (line.startsWith('NOTE')) continue;

            if (line.includes('-->')) {
                const parts = line.split('-->');
                start = parseTimeCode(parts[0]);
                end   = parseTimeCode(parts[1]);
                continue;
            }

            if (start !== null && end !== null) {
                let crop = null;
                const hashIdx = line.indexOf('#xywh=');
                if (hashIdx !== -1) {
                    const coords = line.substring(hashIdx + 6).split(',').map(Number);
                    if (coords.length === 4 && coords.every(n => !isNaN(n))) {
                        crop = { x: coords[0], y: coords[1], w: coords[2], h: coords[3] };
                    }
                }
                if (crop) entries.push({ start, end, crop });
                start = null;
                end = null;
            }
        }
        return entries;
    }

    // ------------------------------------------------------------------
    // VTT / sprite loading
    // ------------------------------------------------------------------

    async function getVttEntries(spriteBase, signal) {
        const cached = vttCache.get(spriteBase);
        if (cached) return cached;

        const url = '/spriteimages/' + spriteBase + '.vtt';
        log('Fetching VTT:', url);

        let res;
        try {
            res = await fetch(url, { signal });
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            log('VTT fetch error:', url, e);
            return null;
        }
        if (!res.ok) { log('VTT 404:', url, res.status); return null; }

        let text;
        try { text = await res.text(); }
        catch (e) { if (e.name === 'AbortError') throw e; return null; }
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const entries = parseVtt(text);
        if (entries.length === 0) { log('VTT had no crops:', url); return null; }

        if (vttCache.size >= VTT_CACHE_MAX) {
            vttCache.delete(vttCache.keys().next().value);
        }
        vttCache.set(spriteBase, entries);
        log('VTT OK:', url, '(' + entries.length + ' entries)');
        return entries;
    }

    async function getSpriteImage(spriteUrl, signal) {
        const cached = spriteCache.get(spriteUrl);
        if (cached) return cached;

        const promise = (async () => {
            log('Fetching sprite:', spriteUrl);
            const res = await fetch(spriteUrl, { signal });
            if (!res.ok) throw new Error('Sprite fetch failed: ' + res.status);

            const blob = await res.blob();
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Sprite decode failed'));
                img.src = objectUrl;
            });
            img._lytObjectUrl = objectUrl;
            return img;
        })();

        spriteCache.set(spriteUrl, promise);

        if (spriteCache.size > SPRITE_CACHE_MAX) {
            const oldestKey = spriteCache.keys().next().value;
            const oldestVal = spriteCache.get(oldestKey);
            spriteCache.delete(oldestKey);
            Promise.resolve(oldestVal)
                .then(img => { if (img && img._lytObjectUrl) URL.revokeObjectURL(img._lytObjectUrl); })
                .catch(() => {});
        }

        try { return await promise; }
        catch (e) { spriteCache.delete(spriteUrl); throw e; }
    }

    async function resolveSpriteBase(container, signal) {
        const videoKey = getVideoKey(container);

        if (videoKey) {
            const known = resolvedBaseCache.get(videoKey);
            if (known) {
                const entries = await getVttEntries(known, signal);
                if (entries) return { spriteBase: known, entries };
                resolvedBaseCache.delete(videoKey);
            }
        }

        const candidates = deriveSpriteBaseCandidates(container);
        log('Candidates for', videoKey, ':', candidates);

        for (const { base, source } of candidates) {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const entries = await getVttEntries(base, signal);
            if (entries) {
                if (videoKey) {
                    if (resolvedBaseCache.size >= RESOLVED_CACHE_MAX) {
                        resolvedBaseCache.delete(resolvedBaseCache.keys().next().value);
                    }
                    resolvedBaseCache.set(videoKey, base);
                }
                log('Resolved spriteBase via', source, ':', base);
                return { spriteBase: base, entries };
            }
        }

        log('All candidates failed for', videoKey);
        return null;
    }

    // ------------------------------------------------------------------
    // Frame selection
    // ------------------------------------------------------------------

    function pickSeededFrameIndices(seed, totalFrames, count) {
        const n = Math.min(count, totalFrames);
        const maxStart = totalFrames - n;
        const startIdx = maxStart > 0 ? (seed % (maxStart + 1)) : 0;
        const out = [];
        for (let i = 0; i < n; i++) out.push(startIdx + i);
        return out;
    }

    // ------------------------------------------------------------------
    // Overlay / label / .video-length
    // ------------------------------------------------------------------

    function ensureOverlay(container) {
        let ov = container.querySelector('.lyt-thumb-preview');
        if (ov) return ov;

        const cs = getComputedStyle(container);
        if (cs.position === 'static') container.style.position = 'relative';

        ov = document.createElement('div');
        ov.className = 'lyt-thumb-preview';
        Object.assign(ov.style, {
            position: 'absolute',
            top: '0', left: '0',
            width: '0', height: '0',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '0 0',
            backgroundPosition: '0 0',
            opacity: '0',
            transition: 'opacity 0.18s ease',
            pointerEvents: 'none',
            zIndex: '5',
            overflow: 'hidden'
        });
        container.appendChild(ov);
        return ov;
    }

    function ensureLabel(container) {
        let label = container.querySelector('.lyt-thumb-preview-time');
        if (label) return label;

        label = document.createElement('div');
        label.className = 'lyt-thumb-preview-time';
        Object.assign(label.style, {
            position: 'absolute',
            bottom: '2px', right: '2px',
            background: 'rgba(0,0,0,0.78)',
            color: '#fff',
            fontFamily: 'Roboto, Arial, sans-serif',
            fontSize: '11px',
            lineHeight: '1',
            padding: '2px 4px',
            borderRadius: '2px',
            zIndex: '6',
            pointerEvents: 'none',
            opacity: '0',
            transition: 'opacity 0.18s ease'
        });
        container.appendChild(label);
        return label;
    }

    // Hide/show the duration badge via a class + injected !important CSS.
    // Inline opacity was not reliable: other scripts / stylesheets could
    // override it, and display:none cannot be beaten by either.
    let badgeCssInjected = false;
    function injectBadgeCss() {
        if (badgeCssInjected) return;
        const style = document.createElement('style');
        style.textContent =
            '.lyt-preview-hovering .video-length { display: none !important; }';
        document.head.appendChild(style);
        badgeCssInjected = true;
    }

    function setVideoLengthVisible(container, visible) {
        if (visible) {
            container.classList.remove('lyt-preview-hovering');
            return;
        }
        const vl = container.querySelector('.video-length');
        if (!vl) return; // nothing to hide on this page
        injectBadgeCss();
        container.classList.add('lyt-preview-hovering');
    }

    // ------------------------------------------------------------------
    // Preview lifecycle
    // ------------------------------------------------------------------

    async function startPreview(container) {
        if (container._lytPreviewStarting || container._lytPreviewActive) return;
        container._lytPreviewStarting = true;

        const controller = new AbortController();
        container._lytPreviewController = controller;
        const signal = controller.signal;

        try {
            const resolved = await resolveSpriteBase(container, signal);
            if (!resolved) return;
            if (signal.aborted) return;

            // Build sprite URL from our verified base. We deliberately do NOT
            // use the sprite reference inside the VTT — that reference is
            // often badly encoded and new URL() does not re-encode bare '%'.
            const spriteUrl = '/spriteimages/' + resolved.spriteBase + '.webp';
            const spriteImg = await getSpriteImage(spriteUrl, signal);
            if (signal.aborted) return;

            await new Promise(r => requestAnimationFrame(r));
            if (signal.aborted) return;

            // ---- Measure the THUMBNAIL IMG, not the container ----
            const containerRect = container.getBoundingClientRect();
            const img = container.querySelector('img.video-thumbnail') || container.querySelector('img');
            const imgRect = img ? img.getBoundingClientRect() : containerRect;

            const useImg = imgRect.width > 0 && imgRect.height > 0;
            const targetRect = useImg ? imgRect : containerRect;

            const targetW = targetRect.width;
            const targetH = targetRect.height;
            if (!targetW || !targetH) return;

            const offsetLeft = targetRect.left - containerRect.left;
            const offsetTop  = targetRect.top  - containerRect.top;

            // ---- COVER scaling: crop fills the img, cropping if needed ----
            const firstCrop = resolved.entries[0].crop;
            const scale = Math.max(targetW / firstCrop.w, targetH / firstCrop.h);
            const bgW = spriteImg.naturalWidth  * scale;
            const bgH = spriteImg.naturalHeight * scale;

            const overlay = ensureOverlay(container);
            const label   = ensureLabel(container);

            // Position + size overlay to exactly cover the thumbnail image
            overlay.style.left   = offsetLeft + 'px';
            overlay.style.top    = offsetTop + 'px';
            overlay.style.width  = targetW + 'px';
            overlay.style.height = targetH + 'px';

            // Match the img's rounded corners
            if (useImg) {
                const imgCS = getComputedStyle(img);
                if (imgCS.borderRadius && imgCS.borderRadius !== '0px') {
                    overlay.style.borderRadius = imgCS.borderRadius;
                }
            }

            overlay.style.backgroundImage = 'url("' + spriteImg.src + '")';
            overlay.style.backgroundSize  = bgW + 'px ' + bgH + 'px';

            // Position the label near the img's bottom-right corner
            label.style.left   = 'auto';
            label.style.right  = (containerRect.width  - (offsetLeft + targetW) + 2) + 'px';
            label.style.bottom = (containerRect.height - (offsetTop  + targetH) + 2) + 'px';

            const seed         = hashString(resolved.spriteBase);
            const frameIndices = pickSeededFrameIndices(seed, resolved.entries.length, FRAMES_TO_SHOW);

            let currentStep = 0;
            function showStep(idx) {
                const entry = resolved.entries[frameIndices[idx]];
                if (!entry || !entry.crop) return;
                const c = entry.crop;

                // COVER: centre the crop inside the target box. When crop
                // aspect matches target aspect the offsets are 0, giving
                // a perfect fit. Otherwise the crop is centred and its
                // edges are clipped — no bleed into adjacent sprite cells.
                const cropScaledW = c.w * scale;
                const cropScaledH = c.h * scale;
                const cropOffsetX = (targetW - cropScaledW) / 2;
                const cropOffsetY = (targetH - cropScaledH) / 2;

                overlay.style.backgroundPosition =
                    (cropOffsetX - c.x * scale) + 'px ' +
                    (cropOffsetY - c.y * scale) + 'px';

                label.textContent = fmtTime(entry.start);
            }

            showStep(0);
            overlay.style.opacity = '1';
            label.style.opacity   = '1';
            setVideoLengthVisible(container, false);

            container._lytPreviewActive  = true;
            container._lytPreviewOverlay = overlay;
            container._lytPreviewLabel   = label;

            container._lytPreviewTimer = setInterval(() => {
                if (signal.aborted) { stopPreview(container); return; }
                currentStep = (currentStep + 1) % frameIndices.length;
                showStep(currentStep);
            }, FRAME_CYCLE_MS);

        } catch (e) {
            if (e.name !== 'AbortError') log('Preview error:', e);
        } finally {
            container._lytPreviewStarting = false;
            if (!container._lytPreviewActive) container._lytPreviewController = null;
        }
    }

    function stopPreview(container) {
        if (container._lytPreviewController) {
            try { container._lytPreviewController.abort(); } catch (e) {}
            container._lytPreviewController = null;
        }
        if (container._lytPreviewTimer) {
            clearInterval(container._lytPreviewTimer);
            container._lytPreviewTimer = null;
        }
        if (container._lytPreviewOverlay) container._lytPreviewOverlay.style.opacity = '0';
        if (container._lytPreviewLabel)   container._lytPreviewLabel.style.opacity   = '0';
        setVideoLengthVisible(container, true);
        container._lytPreviewActive   = false;
        container._lytPreviewStarting = false;
    }

    // ------------------------------------------------------------------
    // Attach
    // ------------------------------------------------------------------

    // A container is previewable when it belongs to a suggestion entry
    // ([data-video-path], sidebar) OR when it holds a video thumbnail
    // served from /thumbnails/ (e.g. cards rendered by index.html).
    function isPreviewable(container) {
        if (container.closest('[data-video-path]')) return true;
        const img = container.querySelector('img.video-thumbnail') || container.querySelector('img');
        if (!img) return false;
        const src = img.getAttribute('src') || '';
        return src.startsWith('/thumbnails/') || src.startsWith('/thumbnails-small/');
    }

    function attach(container) {
        if (container._lytPreviewBound) return;
        if (!isPreviewSettingEnabled()) return;
        if (!isPreviewable(container)) return;

        container._lytPreviewBound = true;
        container.addEventListener('mouseenter', () => {
            // Hide the duration badge right away (don't wait for the
            // sprite to finish loading) so it never overlaps the preview.
            setVideoLengthVisible(container, false);
            startPreview(container);
        });
        container.addEventListener('mouseleave', () => stopPreview(container));
    }

    function scanAndAttach() {
        if (!isPreviewSettingEnabled()) {
            document.querySelectorAll('.thumbnail-container').forEach(c => {
                if (c._lytPreviewBound) stopPreview(c);
            });
            return;
        }
        document.querySelectorAll('.thumbnail-container').forEach(attach);
    }

    let scanScheduled = false;
    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
            scanScheduled = false;
            scanAndAttach();
        });
    }

    // While hovering a thumbnail the duration badge is replaced by the
    // preview's frame-time label - but only when previews are enabled.
    function injectHoverHideCss() {
        if (!isPreviewSettingEnabled()) return;
        const style = document.createElement('style');
        style.textContent =
            '.thumbnail-container:hover .video-length { display: none !important; }';
        document.head.appendChild(style);
    }

    function init() {
        injectHoverHideCss();
        scanAndAttach();
        new MutationObserver(scheduleScan)
            .observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();