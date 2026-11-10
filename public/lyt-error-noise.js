(function () {
    'use strict';

    // ---------------------------------------------------------------
    // Config
    // ---------------------------------------------------------------
    const NOISE_FPS = 24;             // higher = finer shimmer, like film grain
    const NOISE_PIXEL_SIZE = 1;       // 1 = finest static (single-pixel grain)
    const SCANLINE_OPACITY = 0.58;    // very subtle CRT scanline overlay
    const ROLL_BAR_CHANCE = 0.01;    // very rare rolling grey bar
    const CHROMA_SHIFT = 0;           // 0 = no RGB split (keeps it monochrome)
    
    // Noise Tuning
    const MAX_BRIGHTNESS = 30;       // hard cap (0..255) — mid-grey, strictly no white
    const NOISE_GAMMA = 1.4;          // lower = brighter/denser, higher = darker/sparser

    // ---------------------------------------------------------------
    // i18n — matches the pattern used elsewhere in video.html
    // ---------------------------------------------------------------
    function getLang(en, de) {
        return localStorage.getItem('language') === 'de' ? de : en;
    }

    const MESSAGES = {
        title: {
            en: 'An error occurred.',
            de: 'Es ist ein Fehler aufgetreten.'
        },
        subtitle: {
            en: 'Please try again later.',
            de: 'Bitte versuche es später erneut.'
        },
        playbackId: {
            en: 'Playback ID',
            de: 'Wiedergabe-ID'
        }
    };

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let overlayEl = null;       // root .lyt_error_overlay
    let canvasEl = null;        // noise canvas
    let ctx = null;
    let cardEl = null;          // error message card
    let noiseTimer = null;
    let installed = false;
    let rollBarY = -1;          // -1 = no active roll bar
    let rollBarHeight = 0;

    // ---------------------------------------------------------------
    // Build DOM
    // ---------------------------------------------------------------
    function buildOverlay() {
        overlayEl = document.createElement('div');
        overlayEl.className = 'lyt_error_overlay';
        overlayEl.setAttribute('aria-hidden', 'true');
        overlayEl.style.cssText = [
            'position:absolute',
            'top:0',
            'left:0',
            'right:0',
            'bottom:0',
            'background:#000',
            'z-index:50',                 // above controls (10) and end screens (15)
            'display:none',
            'pointer-events:auto',
            'overflow:hidden'
        ].join(';');

        // --- noise canvas ---
        canvasEl = document.createElement('canvas');
        canvasEl.className = 'lyt_error_noise';
        canvasEl.style.cssText = [
            'position:absolute',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'display:block',
            'image-rendering:pixelated',
            'image-rendering:crisp-edges'
        ].join(';');
        overlayEl.appendChild(canvasEl);

        ctx = canvasEl.getContext('2d');

        // --- CRT scanline overlay ---
        const scan = document.createElement('div');
        scan.className = 'lyt_error_scanlines';
        scan.style.cssText = [
            'position:absolute',
            'inset:0',
            'pointer-events:none',
            'background:repeating-linear-gradient(',
            '  to bottom,',
            '  rgba(0,0,0,0) 0px,',
            '  rgba(0,0,0,0) 2px,',
            '  rgba(0,0,0,' + SCANLINE_OPACITY + ') 3px,',
            '  rgba(0,0,0,' + SCANLINE_OPACITY + ') 4px',
            ')',
            'mix-blend-mode:multiply'
        ].join('');
        overlayEl.appendChild(scan);

        // --- vignette ---
        const vignette = document.createElement('div');
        vignette.className = 'lyt_error_vignette';
        vignette.style.cssText = [
            'position:absolute',
            'inset:0',
            'pointer-events:none',
            'background:radial-gradient(ellipse at center,',
            '  rgba(0,0,0,0) 40%,',
            '  rgba(0,0,0,0.55) 100%)'
        ].join('');
        overlayEl.appendChild(vignette);

        // --- error card (classic TV error style) ---
        cardEl = document.createElement('div');
        cardEl.className = 'lyt_error_card';
        cardEl.style.cssText = [
            'position:absolute',
            'top:50%',
            'left:50%',
            'transform:translate(-50%,-50%)',
            'text-align:center',
            'color:#e0e0e0',
            'font-family:"Roboto", "Arial", sans-serif',
            'max-width:80%',
            'z-index:2',
            'user-select:text'
        ].join(';');

        cardEl.innerHTML = `
            <div class="lyt_error_title" style="
                font-size:24px;
                font-weight:500;
                margin-bottom:8px;
                color:#e0e0e0;
                text-shadow:0 1px 4px rgba(0,0,0,0.9);
                letter-spacing:0.3px;
            "></div>
            <div class="lyt_error_subtitle" style="
                font-size:14px;
                color:#9a9a9a;
                margin-bottom:18px;
                text-shadow:0 1px 3px rgba(0,0,0,0.9);
            "></div>
            <div class="lyt_error_details" style="
                font-size:11px;
                color:#6a6a6a;
                font-family:"Courier New",monospace;
                word-break:break-all;
                line-height:1.5;
            "></div>
        `;

        overlayEl.appendChild(cardEl);

        applyLanguage();
    }

    function applyLanguage() {
        if (!cardEl) return;
        cardEl.querySelector('.lyt_error_title').textContent = MESSAGES.title[localStorage.getItem('language') === 'de' ? 'de' : 'en'];
        cardEl.querySelector('.lyt_error_subtitle').textContent = MESSAGES.subtitle[localStorage.getItem('language') === 'de' ? 'de' : 'en'];
    }

    // ---------------------------------------------------------------
    // Noise renderer
    // ---------------------------------------------------------------
    function sizeCanvas() {
        if (!canvasEl || !overlayEl) return;
        const rect = overlayEl.getBoundingClientRect();
        const scale = NOISE_PIXEL_SIZE;
        const w = Math.max(1, Math.floor(rect.width / scale));
        const h = Math.max(1, Math.floor(rect.height / scale));
        if (canvasEl.width !== w || canvasEl.height !== h) {
            canvasEl.width = w;
            canvasEl.height = h;
        }
    }

    function renderNoiseFrame() {
        if (!ctx) {
            if (canvasEl) ctx = canvasEl.getContext('2d');
            if (!ctx) return;
        }
        const w = canvasEl.width;
        const h = canvasEl.height;
        if (w === 0 || h === 0) {
            sizeCanvas();
            return;
        }

        const img = ctx.createImageData(w, h);
        const data = img.data;

        // Dense, classic static. 
        // By using a moderate gamma curve (1.8) and no artificial black pixels,
        // we get a beautiful, organic mix of pure black, dark grey, and mid-grey.
        // The hard cap at 155 ensures we NEVER hit white (255) or even light grey.
        const maxV = MAX_BRIGHTNESS;
        const gamma = NOISE_GAMMA;

        for (let i = 0; i < data.length; i += 4) {
            const r = Math.random();
            const v = Math.pow(r, gamma) * maxV;

            // Pure monochrome
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }

        ctx.putImageData(img, 0, 0);

        if (CHROMA_SHIFT > 0) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.25;
            ctx.drawImage(canvasEl, -CHROMA_SHIFT, 0);
            ctx.drawImage(canvasEl, CHROMA_SHIFT, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }

        // Rare faint horizontal interference line
        if (Math.random() < 0.05) {
            const yLine = (Math.random() * h) | 0;
            ctx.fillStyle = 'rgba(90,90,90,0.12)';
            ctx.fillRect(0, yLine, w, 1);
        }

        // Rolling bar (very rare, dim grey)
        if (rollBarY < 0 && Math.random() < ROLL_BAR_CHANCE) {
            rollBarY = 0;
            rollBarHeight = 50 + ((Math.random() * 150) | 0);
        }
        if (rollBarY >= 0) {
            const grad = ctx.createLinearGradient(0, rollBarY, 0, rollBarY + rollBarHeight);
            // Change the 0.15 values here to make the moving bar brighter/darker:
            grad.addColorStop(0, 'rgba(90,90,90,0)');
            grad.addColorStop(0.1, 'rgba(90,90,90,0.08)');
            grad.addColorStop(0.9, 'rgba(90,90,90,0.08)');
            grad.addColorStop(1, 'rgba(90,90,90,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, rollBarY, w, rollBarHeight);
            rollBarY += 4;
            if (rollBarY > h) rollBarY = -1;
        }
    }

    function startNoiseLoop() {
        if (noiseTimer) return;
        sizeCanvas();
        const intervalMs = 1000 / NOISE_FPS;
        noiseTimer = setInterval(() => {
            renderNoiseFrame();
        }, intervalMs);
        renderNoiseFrame();
    }

    function stopNoiseLoop() {
        if (noiseTimer) {
            clearInterval(noiseTimer);
            noiseTimer = null;
        }
    }

    // ---------------------------------------------------------------
    // Show / hide
    // ---------------------------------------------------------------
    function showOverlay(errorDetail) {
        if (!overlayEl) buildOverlay();

        let host = document.querySelector('.video-stage');
        if (!host) host = document.querySelector('.video-wrapper');
        if (!host) host = document.getElementById('videoPlayer')?.parentElement;
        if (!host) {
            console.warn('[lyt-error-noise] No host element found for overlay');
            return;
        }

        if (overlayEl.parentElement !== host) {
            host.appendChild(overlayEl);
        }

        applyLanguage();

        const detailsEl = cardEl.querySelector('.lyt_error_details');
        const lines = [];

        if (errorDetail) {
            if (errorDetail.message) lines.push(errorDetail.message);
            if (errorDetail.code !== undefined) {
                lines.push('MediaError code: ' + errorDetail.code +
                    (errorDetail.name ? ' (' + errorDetail.name + ')' : ''));
            }
            if (errorDetail.playbackId) {
                lines.push(MESSAGES.playbackId[localStorage.getItem('language') === 'de' ? 'de' : 'en'] +
                    ': ' + errorDetail.playbackId);
            }
            if (errorDetail.url) {
                lines.push('URL: ' + errorDetail.url);
            }
        }

        detailsEl.textContent = lines.join('\n');
        detailsEl.style.whiteSpace = 'pre-line';

        overlayEl.style.display = 'block';
        overlayEl.setAttribute('aria-hidden', 'false');

        const poster = document.querySelector('.lyt_poster_overlay');
        if (poster) poster.style.opacity = '0';
        const centerPlay = document.querySelector('.lyt_center_play_btn');
        if (centerPlay) centerPlay.style.display = 'none';

        const v = document.getElementById('videoPlayer');
        if (v) {
            try { v.pause(); } catch (e) {}
        }

        startNoiseLoop();

        requestAnimationFrame(() => {
            sizeCanvas();
            renderNoiseFrame();
        });
    }

    function hideOverlay() {
        if (!overlayEl) return;
        overlayEl.style.display = 'none';
        overlayEl.setAttribute('aria-hidden', 'true');
        stopNoiseLoop();
    }

    // ---------------------------------------------------------------
    // Error decoding
    // ---------------------------------------------------------------
    function decodeVideoError(videoEl) {
        const detail = {
            message: null,
            code: null,
            name: null,
            playbackId: null,
            url: null
        };

        const src = videoEl.currentSrc || videoEl.src || '';
        if (src) {
            detail.url = src;
            let h = 0;
            for (let i = 0; i < src.length; i++) {
                h = ((h << 5) - h + src.charCodeAt(i)) | 0;
            }
            detail.playbackId = (h >>> 0).toString(16).padStart(8, '0').slice(0, 8);
        }

        const err = videoEl.error;
        if (err) {
            detail.code = err.code;
            const codeNames = {
                1: 'MEDIA_ERR_ABORTED',
                2: 'MEDIA_ERR_NETWORK',
                3: 'MEDIA_ERR_DECODE',
                4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
            };
            detail.name = codeNames[err.code] || 'UNKNOWN';

            const isDe = localStorage.getItem('language') === 'de';
            const msgs = {
                1: isDe ? 'Wiedergabe abgebrochen.' : 'Playback aborted.',
                2: isDe ? 'Netzwerkfehler beim Laden des Videos.' : 'A network error caused the video download to fail.',
                3: isDe ? 'Die Medien-Ressource konnte nicht dekodiert werden.' : 'The media resource could not be decoded.',
                4: isDe ? 'Die Medien-Ressource konnte nicht geladen werden. Format wird möglicherweise nicht unterstützt.' :
                         'The media resource could not be loaded. Format may not be supported.'
            };
            detail.message = msgs[err.code] || (isDe ? 'Unbekannter Wiedergabefehler.' : 'Unknown playback error.');
        } else {
            const isDe = localStorage.getItem('language') === 'de';
            detail.message = isDe ?
                'Medien-Laden pausiert. Die Ressource konnte nicht geladen werden.' :
                'Media loading paused. The resource could not be loaded.';
        }

        return detail;
    }

    // ---------------------------------------------------------------
    // Installation
    // ---------------------------------------------------------------
    function install() {
        if (installed) return;
        installed = true;

        const video = document.getElementById('videoPlayer');
        if (!video) {
            console.warn('[lyt-error-noise] #videoPlayer not found yet, retrying on DOMContentLoaded…');
            document.addEventListener('DOMContentLoaded', install, { once: true });
            installed = false;
            return;
        }

        video.addEventListener('error', () => {
            const detail = decodeVideoError(video);
            console.error('[lyt-error-noise] Video error:', detail);
            showOverlay(detail);
        }, true);

        let loadedSomething = false;
        video.addEventListener('loadedmetadata', () => { loadedSomething = true; });
        video.addEventListener('loadeddata', () => { loadedSomething = true; });
        video.addEventListener('canplay', () => { loadedSomething = true; });

        setTimeout(() => {
            if (!loadedSomething && video.readyState === 0 &&
                video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
                const detail = decodeVideoError(video);
                detail.message = (localStorage.getItem('language') === 'de' ?
                    'Medien-Ressource konnte nicht dekodiert werden. Metadaten konnten nicht gelesen werden.' :
                    'Media resource could not be decoded. Metadata could not be parsed.');
                detail.name = 'NS_ERROR_DOM_MEDIA_METADATA_ERR';
                console.error('[lyt-error-noise] Stalled load detected, showing noise overlay:', detail);
                showOverlay(detail);
            }
        }, 6000);

        window.lytShowError = function (message, extra) {
            const detail = decodeVideoError(video);
            if (message) detail.message = message;
            if (extra) Object.assign(detail, extra);
            showOverlay(detail);
        };

        window.lytHideError = hideOverlay;

        const resizeObserver = new ResizeObserver(() => {
            if (overlayEl && overlayEl.style.display !== 'none') {
                sizeCanvas();
            }
        });
        const host = document.querySelector('.video-stage') || video.parentElement;
        if (host) resizeObserver.observe(host);

        document.addEventListener('fullscreenchange', () => {
            if (overlayEl && overlayEl.style.display !== 'none') {
                setTimeout(() => {
                    sizeCanvas();
                    renderNoiseFrame();
                }, 50);
            }
        });

        window.addEventListener('storage', (e) => {
            if (e.key === 'language' && overlayEl && overlayEl.style.display !== 'none') {
                applyLanguage();
            }
        });

        console.log('[lyt-error-noise] Installed on #videoPlayer');
    }

    // ---------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
})();