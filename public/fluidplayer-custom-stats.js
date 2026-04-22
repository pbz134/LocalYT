/**
 * fluidplayer-custom-stats.js
 * Adds "Stats for Nerds", "Copy URL", and "Copy URL with Timestamp" to Fluid Player.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Helper: Wait for fluidPlayer to be defined on window
    const waitForFluidPlayer = setInterval(function() {
        if (window.fluidPlayer) {
            clearInterval(waitForFluidPlayer);
            initStatsForNerds();
        }
    }, 100);

    function initStatsForNerds() {
        const OriginalFluidPlayer = window.fluidPlayer;

        window.fluidPlayer = function(target, options) {
            const instance = OriginalFluidPlayer(target, options);
            
            setTimeout(function() {
                setupCustomContextMenu(target);
            }, 150);

            return instance;
        };

        Object.setPrototypeOf(window.fluidPlayer, OriginalFluidPlayer);
    }

    function setupCustomContextMenu(targetId) {
        const videoNode = typeof targetId === 'string' ? document.getElementById(targetId) : targetId;
        if (!videoNode) return;

        const wrapper = videoNode.closest('.fluid_video_wrapper');
        if (!wrapper) return;

        const menu = wrapper.querySelector('.fluid_context_menu');
        if (!menu) return;

        const list = menu.querySelector('ul');
        if (!list) return;

        // --- Add CSS ---
        if (!document.getElementById('fp-styles-stats')) {
            const style = document.createElement('style');
            style.id = 'fp-styles-stats';
            style.innerHTML = `
                .fp_stats_overlay {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(0, 0, 0, 0.85);
                    color: #fff;
                    padding: 12px;
                    border-radius: 4px;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    z-index: 99;
                    pointer-events: none;
                    line-height: 1.6;
                    width: 280px;
                    user-select: text;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                }
                .fp_stats_overlay div { 
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis; 
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .fp_stats_overlay div:last-child { border-bottom: none; }
                .fp_stat_label { color: #aaa; }
                .fp_stat_value { color: #fff; float: right; }

                /* Toast Notification */
                .fp_copy_toast {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(255, 255, 255, 0.9);
                    color: #000;
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-family: sans-serif;
                    font-size: 14px;
                    z-index: 100;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                .fp_copy_toast.show { opacity: 1; }
            `;
            document.head.appendChild(style);
        }

        // --- Create Menu Items ---

        // 1. Copy Video URL
        const copyUrlItem = document.createElement('li');
        copyUrlItem.innerText = 'Copy video URL';
        copyUrlItem.style.cursor = 'pointer';
        
        // 2. Copy Video URL with Timestamp
        const copyTsItem = document.createElement('li');
        copyTsItem.innerText = 'Copy video URL at current time';
        copyTsItem.style.cursor = 'pointer';

        // 3. Stats for Nerds
        const statsItem = document.createElement('li');
        statsItem.innerText = 'Stats for Nerds';
        statsItem.style.cursor = 'pointer';

        // Find Version Item to insert before (to keep items at bottom)
        const versionItem = list.querySelector('li:last-child');

        // Insert Order: Copy URL -> Copy TS -> Stats -> Version
        list.insertBefore(copyUrlItem, versionItem);
        list.insertBefore(copyTsItem, versionItem);
        list.insertBefore(statsItem, versionItem);


        // --- Logic: Copy URL ---
        copyUrlItem.addEventListener('click', function(e) {
            e.stopPropagation();
            const video = wrapper.querySelector('video');
            const url = video.currentSrc || video.src;
            copyToClipboard(url, wrapper);
            menu.style.display = 'none'; // Close menu after click
        });

        // --- Logic: Copy URL with Timestamp ---
        copyTsItem.addEventListener('click', function(e) {
            e.stopPropagation();
            const video = wrapper.querySelector('video');
            let url = video.currentSrc || video.src;
            
            // Check if URL already has params
            const separator = url.indexOf('?') >= 0 ? '&' : '?';
            
            // Get current time in seconds
            const t = Math.floor(video.currentTime);
            
            // Construct final URL (e.g., file.mp4?t=123)
            const timestampUrl = `${url}${separator}t=${t}`;
            
            copyToClipboard(timestampUrl, wrapper);
            menu.style.display = 'none'; // Close menu after click
        });

        // --- Logic: Stats Toggle ---
        statsItem.addEventListener('click', function(e) {
            e.stopPropagation();
            
            let overlay = wrapper.querySelector('.fp_stats_overlay');

            if (overlay) {
                overlay.remove();
                if (wrapper._statsInterval) clearInterval(wrapper._statsInterval);
                // Stop FPS counter
                if (wrapper._fpsFrameId) cancelAnimationFrame(wrapper._fpsFrameId);
                
                // --- FIX ADDED HERE: Close menu when toggling stats off ---
                menu.style.display = 'none'; 
                return;
            }

            overlay = document.createElement('div');
            overlay.className = 'fp_stats_overlay';
            wrapper.appendChild(overlay);

            const video = wrapper.querySelector('video');
            
            // --- FIX: Accurate FPS Counter using requestAnimationFrame ---
            let fpsFrames = 0;
            let fpsLastTime = performance.now();
            let fpsCurrentValue = '...';

            const fpsLoop = function() {
                // If overlay is gone, stop loop
                if (!document.body.contains(overlay)) {
                     cancelAnimationFrame(wrapper._fpsFrameId);
                     return;
                }
                
                fpsFrames++;
                const now = performance.now();
                
                // Update display every ~500ms to match UI update rate
                if (now >= fpsLastTime + 500) {
                    fpsCurrentValue = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
                    fpsFrames = 0;
                    fpsLastTime = now;
                }
                wrapper._fpsFrameId = requestAnimationFrame(fpsLoop);
            };
            wrapper._fpsFrameId = requestAnimationFrame(fpsLoop);

            const updateStats = () => {
                if (!video || !document.body.contains(overlay)) {
                    clearInterval(wrapper._statsInterval);
                    if (wrapper._fpsFrameId) cancelAnimationFrame(wrapper._fpsFrameId);
                    return;
                }

                let html = '';
                
                // 1. RESOLUTION
                html += createStatRow('Resolution', `${video.videoWidth} x ${video.videoHeight}`);

                // 2. FPS (Current Display Refresh Rate)
                html += createStatRow('FPS (Current)', `${fpsCurrentValue}`);

                // 3. CODEC
                html += createStatRow('Codec', getCodecInfo(video, wrapper));

                // 4. BITRATE
                html += createStatRow('Buffer Speed', calculateBitrate(video));

                // 5. VOLUME (New)
                // Shows percentage, and (Muted) status if applicable
                let volStr = Math.round(video.volume * 100) + '%';
                if (video.muted || video.volume === 0) volStr += ' (Muted)';
                html += createStatRow('Volume', volStr);

                // 6. SPEED / PLAYBACK RATE (New)
                // Shows current playback rate (e.g., 1.0x, 1.5x)
                let speedVal = video.playbackRate.toFixed(2);
                if (speedVal === '1.00') speedVal = '1'; // Clean up display for normal speed
                html += createStatRow('Speed', speedVal + 'x');

                // 7. BUFFER HEALTH
                if (video.buffered.length > 0) {
                    const buffered = video.buffered.end(video.buffered.length - 1) - video.currentTime;
                    html += createStatRow('Buffer', formatTime(buffered));
                }

                // 8. DROPPED FRAMES (Firefox)
                if (video.mozDecodedFrames !== undefined) {
                    const dropped = video.mozParsedFrames - video.mozDecodedFrames;
                    html += createStatRow('Dropped Frames', dropped);
                }

                overlay.innerHTML = html;
            };

            updateStats();
            wrapper._statsInterval = setInterval(updateStats, 1000); // Update every 1s

            // --- FIX ADDED HERE: Close menu when toggling stats on ---
            menu.style.display = 'none';
        });


        // --- Helper Functions ---

        async function copyToClipboard(text, wrapperElement) {
            try {
                await navigator.clipboard.writeText(text);
                showToast('Link Copied!', wrapperElement);
            } catch (err) {
                // Fallback for older browsers or non-secure contexts
                const textArea = document.createElement("textarea");
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    showToast('Link Copied!', wrapperElement);
                } catch (e) { 
                    console.error('Failed to copy', e); 
                }
                document.body.removeChild(textArea);
            }
        }

        function showToast(message, wrapperElement) {
            // Remove existing toast if any
            const existingToast = wrapperElement.querySelector('.fp_copy_toast');
            if (existingToast) existingToast.remove();

            const toast = document.createElement('div');
            toast.className = 'fp_copy_toast';
            toast.innerText = message;
            wrapperElement.appendChild(toast);

            // Trigger reflow to enable transition
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300); // Wait for fade out
            }, 1500);
        }

        function createStatRow(label, value) {
            return `<div><span class="fp_stat_label">${label}</span> <span class="fp_stat_value">${value}</span></div>`;
        }

        function formatTime(s) {
            if (isNaN(s) || !isFinite(s)) return 'Live';
            const m = Math.floor(s / 60), sec = Math.floor(s % 60);
            return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
        }

        function getExpectedFps(video, wrapper) {
            // Check HLS metadata first
            if (window.Hls && video.hlsPlayer && video.hlsPlayer.levels) {
                 const level = video.hlsPlayer.levels[video.hlsPlayer.currentLevel];
                 if(level && level.frameRate) return level.frameRate;
            }
            return "~24"; 
        }

        function getCodecInfo(video, wrapper) {
            // 1. Check HLS/DASH config
            if (window.Hls && video.hlsPlayer && video.hlsPlayer.levels) {
                const level = video.hlsPlayer.levels[video.hlsPlayer.currentLevel];
                if(level && level.codecSet) return level.codecSet;
            }

            // 2. Check Source Tags (Most Reliable)
            if (video.currentSrc) {
                const sources = video.querySelectorAll('source');
                for (let i=0; i<sources.length; i++) {
                    if (sources[i].src === video.currentSrc) {
                        const typeAttr = sources[i].type;
                        if (typeAttr && typeAttr.includes('codecs=')) {
                            return typeAttr.split('codecs=')[1].replace(/"/g, '');
                        }
                    }
                }
            }

            // 3. File Extension Fallback (MP4 usually implies H.264)
            const src = video.currentSrc || video.src;
            if (src) {
                const ext = src.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
                if (['mp4', 'm4v', 'mov'].includes(ext)) return 'H.264 (Likely)';
                if (['webm'].includes(ext)) return 'VP9/AV1 (Likely)';
                if (['ogg', 'ogv'].includes(ext)) return 'Theora/Vorbis';
            }

            // 4. Browser Capability Guess (Prioritize H.264 as it's most common)
            if (video.canPlayType) {
                 // Check H.264 support first
                 if (video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '') return 'H.264 (Guessed)';
                 // Then VP9
                 if (video.canPlayType('video/webm; codecs="vp9"') !== '') return 'VP9 (Guessed)';
            }
            return 'Unknown';
        }

        /**
         * Calculates Bitrate by measuring buffer growth.
         */
        function calculateBitrate(video) {
            // 1. Safari Native API
            if (video.webkitVideoDecodingByteRate) {
                return (video.webkitVideoDecodingByteRate / 1000).toFixed(0) + ' kbps';
            }

            // 2. HLS.js API
            if (window.Hls && video.hlsPlayer) {
                if (video.hlsPlayer.stats && video.hlsPlayer.stats.total && video.hlsPlayer.stats.total.bwEstimate) {
                     return (video.hlsPlayer.stats.total.bwEstimate / 1000).toFixed(0) + ' kbps';
                }
                if (video.hlsPlayer.levels) {
                    const level = video.hlsPlayer.levels[video.hlsPlayer.currentLevel];
                    if (level && level.bitrate) return (level.bitrate / 1000).toFixed(0) + ' kbps';
                }
            }

            // 3. Buffer Growth Estimation
            if (video.buffered.length > 0) {
                const now = Date.now();
                const currentBufferEnd = video.buffered.end(video.buffered.length - 1);
                
                if (!video._fp_bit_state) {
                    video._fp_bit_state = { lastTime: now, lastBuffer: currentBufferEnd, display: '...' };
                }

                const state = video._fp_bit_state;
                const timeDiff = (now - state.lastTime) / 1000;

                if (timeDiff >= 0.5) {
                    const bufferDiff = currentBufferEnd - state.lastBuffer;
                    
                    let ratio = 0;
                    if (timeDiff > 0) ratio = bufferDiff / timeDiff;
                    
                    if (ratio < 0) ratio = 0;
                    if (ratio > 100) ratio = 0;

                    if (ratio === 0) state.display = 'Stalled';
                    else if (ratio < 0.9) state.display = `Slow (${ratio.toFixed(1)}x)`;
                    else if (ratio > 1.5) state.display = `Fast (${ratio.toFixed(1)}x)`;
                    else state.display = `Optimal (${ratio.toFixed(1)}x)`;

                    state.lastTime = now;
                    state.lastBuffer = currentBufferEnd;
                }

                return state.display;
            }
            
            return 'Live';
        }
    }
});