/**
 * LYT Player (LocalYT Player)
 * A lightweight, custom video player built from scratch.
 * Compatible with the LocalYT CSS framework.
 */

(function(global) {
    'use strict';

    // Helper: Pad numbers (00:00)
    function pad(num) {
        return ('0' + num).slice(-2);
    }

    // Helper: Format seconds to HH:MM:SS or MM:SS
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${pad(m)}:${pad(s)}`;
        }
        return `${m}:${pad(s)}`;
    }

    // Helper: Throttle function
    function throttle(func, limit) {
        let lastFunc;
        let lastRan;
        return function() {
            const context = this;
            const args = arguments;
            if (!lastRan) {
                func.apply(context, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function() {
                    if ((Date.now() - lastRan) >= limit) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        };
    }

    // SVG Icons
    const SVG = {
        play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
        skipNext: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zM6 18l8.5-6L6 6v12z"/></svg>', 
        volumeHigh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
        volumeMedium: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>',
        volumeLow: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 9v6h4l5 5V4l-5 5H7z"/></svg>',
        volumeMute: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
        subtitles: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10 0h2v2h-2v-2zm-6-4h8v2h-8v-2z"/></svg>',
        speed: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
        fullscreen: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
        fullscreenExit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
    };

    class LYTPlayer {
        constructor(videoId, options) {
            this.video = document.getElementById(videoId);
            if (!this.video) throw new Error(`Video element #${videoId} not found.`);
            
            this.options = options || {};
            this.id = videoId;
            
            // State
            this.isCurrentlyPlayingAd = false;
            this.timelinePreviewData = [];
            this.hlsPlayer = null;
            this.dashPlayer = null;
            this.isFullScreen = false;
            this.isTheatre = false;
            this.isMiniPlayer = false;
            this.isMuted = false;
            this.currentSpeed = 1;
            this.subtitlesEnabled = false;
            this.currentTrackIndex = -1;
            this._lastVolume = 0.5;
            this._hideTimer = null;
            this._seeking = false;
            this._statsInterval = null;
            this._fpsFrameId = null;
            this._hasPlayedOnce = false; // Track if video has started playing
            
            // Version
            this.version = 'v1.2.0';
            
            // Speed options
            this.speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
            
            this.init();
        }

        init() {
            this.setupWrapper();
            this.setupControls();
            this.bindEvents();
            this.loadTimelinePreview();
            
            // Set initial volume display
            this.updateVolumeIcon();
            // Initialize volume bar width based on state
            if(this.dom.volumeBar) {
                const vol = this.video.muted ? 0 : this.video.volume;
                this.dom.volumeFill.style.width = `${vol * 100}%`;
            }
            
            // Apply subtitles on by default if option is set
            const layout = this.options.layoutControls || {};
            if (layout.subtitlesOnByDefault) {
                setTimeout(() => {
                    if (this.video.textTracks.length > 0) {
                        this.setSubtitleTrack(0);
                    }
                }, 500);
            }
            
            // Initial subtitle button opacity
            this.dom.subtitlesBtn.style.opacity = '0.6';
            
            // Set title text if provided
            if (layout.title && this.dom.titleDisplay) {
                this.dom.titleDisplay.textContent = layout.title;
            }
            
            // Trigger user callback
            if (layout.playerInitCallback) {
                layout.playerInitCallback();
            }
        }

        setupWrapper() {
            let wrapper = this.video.parentElement;
            if (!wrapper.classList.contains('fluid_video_wrapper')) {
                wrapper = document.createElement('div');
                wrapper.className = 'fluid_video_wrapper fluid_player_layout_default';
                this.video.parentNode.insertBefore(wrapper, this.video);
                wrapper.appendChild(this.video);
            }
            this.wrapper = wrapper;

            if (this.options.layoutControls && this.options.layoutControls.posterImage) {
                this.video.poster = this.options.layoutControls.posterImage;
            }
        }

        setupControls() {
            const layout = this.options.layoutControls || {};
            const primaryColor = layout.primaryColor || 'red';
            const posterImage = layout.posterImage || '';

            // FIX: Escaped single quotes properly for inline style attribute to prevent SyntaxError
            const posterStyle = posterImage ? "background-image: url('" + posterImage.replace(/'/g, "\\'") + "');" : '';

            const controlsHtml = `
                <style>
                    /* ===== LYT PLAYER CONTROLS ===== */
                    .fluid_video_wrapper {
                        position: relative !important;
                        overflow: hidden;
                        background: #000;
                    }
                    .fluid_video_wrapper video {
                        display: block;
                        width: 100%;
                        height: auto;
                        aspect-ratio: 16 / 9;
                    }
                    
                    /* Poster / Thumbnail Overlay */
                    .lyt_poster_overlay {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background-size: cover;
                        background-position: center;
                        background-repeat: no-repeat;
                        z-index: 1;
                        cursor: pointer;
                        transition: opacity 0.2s ease;
                        background-color: #000;
                    }

                    .fluid_video_wrapper video[poster] {
                        object-fit: cover;
                    }

                    .video-stage .logo-overlay {
                        position: absolute;
                        z-index: 6;
                        pointer-events: none;
                    }

                    .lyt_poster_overlay.lyt_hidden {
                        opacity: 0;
                        pointer-events: none;
                    }
                    
                    /* Title Display (Top Left) */
                    .lyt_title_display {
                        position: absolute;
                        top: 12px;
                        left: 12px;
                        color: #fff;
                        font-size: 16px;
                        font-family: 'Roboto', 'Arial', sans-serif;
                        font-weight: 500;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6);
                        pointer-events: none;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                        z-index: 15;
                        max-width: calc(100% - 120px);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        line-height: 1.2;
                    }
                    
                    .lyt_controls_container {
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        background: linear-gradient(transparent, rgba(0,0,0,0.9));
                        padding: 24px 12px 6px 12px;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                        z-index: 10;
                        user-select: none;
                    }
                    
                    .fluid_video_wrapper:hover .lyt_title_display,
                    .lyt_controls_container.lyt_controls_visible ~ .lyt_title_display,
                    .fluid_video_wrapper:hover .lyt_controls_container ~ .lyt_title_display,
                    .lyt_controls_container.lyt_controls_visible + .lyt_title_display,
                    .lyt_controls_container.lyt_controls_visible ~ .lyt_title_display {
                        opacity: 1;
                    }
                    
                    .fluid_video_wrapper:hover .lyt_controls_container,
                    .lyt_controls_container.lyt_controls_visible {
                        opacity: 1;
                    }
                    
                    /* Progress Bar */
                    .lyt_progress_container {
                        width: 100%;
                        height: 5px;
                        background: rgba(255,255,255,0.2);
                        cursor: pointer;
                        position: relative;
                        margin-bottom: 6px;
                        transition: height 0.15s ease;
                    }
                    .lyt_progress_container:hover {
                        height: 7px;
                    }
                    .lyt_progress_buffered {
                        position: absolute;
                        top: 0; left: 0;
                        height: 100%;
                        background: rgba(255,255,255,0.4);
                        pointer-events: none;
                        width: 0%;
                    }
                    .lyt_progress_played {
                        position: absolute;
                        top: 0; left: 0;
                        height: 100%;
                        background: ${primaryColor};
                        pointer-events: none;
                        width: 0%;
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                    }
                    .lyt_progress_dot {
                        width: 13px;
                        height: 13px;
                        background: ${primaryColor};
                        border-radius: 50%;
                        position: absolute;
                        right: -6.5px;
                        top: 50%;
                        transform: translateY(-50%);
                        opacity: 1;
                        pointer-events: none;
                        box-shadow: 0 0 4px rgba(0,0,0,0.5);
                        z-index: 2;
                    }
                    
                    /* Bottom controls row */
                    .lyt_controls_row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        height: 36px;
                    }
                    .lyt_controls_left {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    .lyt_controls_right {
                        display: flex;
                        align-items: center;
                        gap: 2px;
                    }
                    
                    /* Control buttons */
                    .lyt_btn {
                        background: none;
                        border: none;
                        color: #fff;
                        cursor: pointer;
                        padding: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 3px;
                        transition: background 0.15s;
                        outline: none;
                        position: relative;
                        line-height: 0;
                    }
                    .lyt_btn:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .lyt_btn svg {
                        width: 24px;
                        height: 24px;
                        display: block;
                        pointer-events: none;
                    }
                    .lyt_btn_play svg {
                        width: 26px;
                        height: 26px;
                    }
                    
                    /* Volume group */
                    .lyt_volume_group {
                        display: flex;
                        align-items: center;
                        gap: 0;
                    }
                    .lyt_volume_slider_wrap {
                        width: 0;
                        overflow: hidden;
                        transition: width 0.2s ease, opacity 0.2s ease;
                        opacity: 0;
                        display: flex;
                        align-items: center;
                        height: 24px; /* Increased height to fit the 13px dot vertically */
                    }
                    .lyt_volume_group:hover .lyt_volume_slider_wrap,
                    .lyt_volume_slider_wrap.lyt_slider_visible {
                        width: 70px;
                        opacity: 1;
                    }
                    
                    .lyt_volume_bar {
                        width: 64px;
                        height: 4px;
                        background: rgba(255,255,255,0.3);
                        border-radius: 2px;
                        cursor: pointer;
                        position: relative;
                        margin: 0 6px 0 4px;
                        overflow: visible; /* Added to allow dot to overflow vertically */
                    }
                    .lyt_volume_fill {
                        position: absolute;
                        top: 0; left: 0;
                        height: 100%;
                        background: #fff;
                        border-radius: 2px;
                        pointer-events: none;
                        width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                        overflow: visible; /* Added to allow dot to overflow vertically */
                    }
                    /* The White Dot at the front of the volume bar */
                    .lyt_volume_dot {
                        width: 13px;
                        height: 13px;
                        background: #fff;
                        border-radius: 50%;
                        position: absolute;
                        right: -6.5px;
                        top: 50%;
                        transform: translateY(-50%);
                        box-shadow: 0 0 4px rgba(0,0,0,0.5);
                        z-index: 2;
                        pointer-events: none;
                    }
                    
                    /* Time display */
                    .lyt_time {
                        color: #fff;
                        font-size: 12px;
                        font-family: 'Roboto', 'Arial', sans-serif;
                        white-space: nowrap;
                        user-select: none;
                        padding: 0 8px 0 4px;
                        letter-spacing: 0.3px;
                        cursor: default;
                    }
                    
                    /* Popup menus */
                    .lyt_popup_menu {
                        position: absolute;
                        bottom: 42px;
                        right: 0;
                        background: rgba(28,28,28,0.97);
                        border-radius: 4px;
                        padding: 4px 0;
                        min-width: 90px;
                        display: none;
                        z-index: 20;
                        box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                    }
                    .lyt_popup_menu.lyt_show {
                        display: block;
                    }
                    .lyt_menu_option {
                        display: block;
                        width: 100%;
                        background: none;
                        border: none;
                        color: #eee;
                        font-size: 13px;
                        padding: 6px 16px;
                        cursor: pointer;
                        text-align: left;
                        font-family: 'Roboto', 'Arial', sans-serif;
                        transition: background 0.1s;
                        white-space: nowrap;
                    }
                    .lyt_menu_option:hover {
                        background: rgba(255,255,255,0.1);
                        color: #fff;
                    }
                    .lyt_menu_option.lyt_active {
                        color: ${primaryColor};
                    }
                    .lyt_menu_option.lyt_active::before {
                        content: '\\2713  ';
                    }
                    
                    /* Context Menu */
                    .lyt_context_menu {
                        position: absolute;
                        background: rgba(50, 50, 50, 0.8);
                        border-radius: 4px;
                        padding: 4px 0;
                        min-width: 200px;
                        z-index: 30;
                        display: none;
                        box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                        font-family: 'Roboto', 'Arial', sans-serif;
                    }
                    .lyt_context_menu.lyt_show {
                        display: block;
                    }
                    .lyt_ctx_item {
                        display: block;
                        width: 100%;
                        background: none;
                        border: none;
                        color: #eee;
                        font-size: 13px;
                        padding: 8px 16px;
                        cursor: pointer;
                        text-align: left;
                        font-family: inherit;
                        transition: background 0.1s;
                        white-space: nowrap;
                    }
                    .lyt_ctx_item:hover {
                        background: rgba(255,255,255,0.1);
                        color: #fff;
                    }
                    .lyt_ctx_item.lyt_ctx_version {
                        color: #999;
                        font-size: 11px;
                        cursor: default;
                        margin-top: 4px;
                        border-top: 1px solid rgba(255,255,255,0.1);
                        padding-top: 8px;
                    }
                    .lyt_ctx_item.lyt_ctx_version:hover {
                        background: none;
                        color: #999;
                    }

                    /* Subtitles display */
                    .lyt_subtitles_display {
                        position: absolute;
                        left: 50%;
                        bottom: 70px;
                        transform: translateX(-50%);
                        text-align: center;
                        pointer-events: none;
                        z-index: 8;
                        width: 80%;
                        max-width: 700px;
                    }
                    .lyt_sub_text {
                        display: inline-block;
                        background: rgba(0,0,0,0.75);
                        color: #fff;
                        font-size: 16px;
                        font-family: 'Roboto', 'Arial', sans-serif;
                        padding: 3px 10px;
                        border-radius: 3px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }
                    
                    /* Timeline preview */
                    .lyt_timeline_preview {
                        display: none;
                        position: absolute;
                        bottom: 18px;
                        pointer-events: none;
                        z-index: 15;
                        width: 120px;
                        height: 68px;
                        background-size: cover;
                        background-position: center;
                        border-radius: 3px;
                        border: 1px solid rgba(255,255,255,0.15);
                    }

                    /* Loading spinner */
                    .vast_video_loading {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        display: none;
                        align-items: center;
                        justify-content: center;
                        z-index: 5;
                        background: rgba(0,0,0,0.2);
                        pointer-events: none;
                    }
                    .lyt-spinner {
                        display: inline-block;
                        width: 64px;
                        height: 64px;
                    }
                    .lyt-spinner svg {
                        animation: lyt-rotate 2s linear infinite;
                        width: 100%;
                        height: 100%;
                    }
                    .lyt-spinner circle {
                        stroke: #fff;
                        stroke-width: 4;
                        stroke-linecap: round;
                        fill: none;
                        stroke-dasharray: 80, 200;
                        stroke-dashoffset: 0;
                        animation: lyt-dash 1.5s ease-in-out infinite;
                    }
                    @keyframes lyt-rotate {
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes lyt-dash {
                        0% { stroke-dasharray: 1, 200; stroke-dashoffset: 0; }
                        50% { stroke-dasharray: 90, 200; stroke-dashoffset: -35px; }
                        100% { stroke-dasharray: 90, 200; stroke-dashoffset: -125px; }
                    }
                    
                    /* Fullscreen pseudo fallback */
                    .fluid_video_wrapper.pseudo_fullscreen {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100vw !important;
                        height: 100vh !important;
                        z-index: 9999 !important;
                        background: #000;
                    }

                    /* Stats for Nerds Overlay */
                    .lyt_stats_overlay {
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
                    .lyt_stats_overlay div { 
                        white-space: nowrap; 
                        overflow: hidden; 
                        text-overflow: ellipsis; 
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                    }
                    .lyt_stats_overlay div:last-child { border-bottom: none; }
                    .lyt_stat_label { color: #aaa; }
                    .lyt_stat_value { color: #fff; float: right; }

                    /* Toast Notification */
                    .lyt_copy_toast {
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
                    .lyt_copy_toast.show { opacity: 1; }

                    /* Center Play/Pause Animation */
                    .lyt_center_anim {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        z-index: 20;
                        pointer-events: none;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0;
                        transition: opacity 0.3s ease, transform 0.3s ease;
                    }
                    
                    .lyt_center_anim.lyt_show {
                        opacity: 1;
                        animation: lyt-center-pop 0.4s ease-out forwards;
                    }
                    
                    .lyt_center_bg {
                        position: absolute;
                        width: 80px;
                        height: 80px;
                        background-color: rgba(0, 0, 0, 0.5);
                        border-radius: 50%;
                        z-index: -1;
                    }
                    
                    .lyt_center_icon {
                        color: #fff;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    .lyt_center_icon svg {
                        width: 40px;
                        height: 40px;
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
                    }

                    @keyframes lyt-center-pop {
                        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
                    }

                </style>

                <!-- Poster/Thumbnail Overlay -->
                <div class="lyt_poster_overlay" style="${posterStyle}"></div>

                <!-- Title Display -->
                <div class="lyt_title_display"></div>

                <!-- Subtitles Overlay -->
                <div class="lyt_subtitles_display"></div>

                <!-- Context Menu -->
                <div class="lyt_context_menu">
                    <button class="lyt_ctx_item" data-action="copy-url">Copy video URL</button>
                    <button class="lyt_ctx_item" data-action="copy-url-time">Copy video URL at current time</button>
                    <button class="lyt_ctx_item" data-action="stats">Stats for nerds</button>
                    <div class="lyt_ctx_item lyt_ctx_version">LYT Player ${this.version}</div>
                </div>

                <div class="lyt_controls_container">
                    <!-- Progress Bar -->
                    <div class="lyt_progress_container">
                        <div class="lyt_progress_buffered"></div>
                        <div class="lyt_progress_played">
                            <div class="lyt_progress_dot"></div>
                        </div>
                        <div class="lyt_timeline_preview"></div>
                    </div>

                    <!-- Bottom Row -->
                    <div class="lyt_controls_row">
                        <!-- Left Controls -->
                        <div class="lyt_controls_left">
                            <button class="lyt_btn lyt_btn_play" aria-label="Play">${SVG.play}</button>
                            
                            <!-- Skip Button (Added) -->
                            <button class="lyt_btn lyt_btn_skip" aria-label="Skip to next video">${SVG.skipNext}</button>
                            
                            <div class="lyt_volume_group">
                                <button class="lyt_btn lyt_btn_volume" aria-label="Volume">${SVG.volumeHigh}</button>
                                <div class="lyt_volume_slider_wrap">
                                    <!-- New Volume Bar Structure -->
                                    <div class="lyt_volume_bar">
                                        <div class="lyt_volume_fill">
                                            <div class="lyt_volume_dot"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <span class="lyt_time">0:00 / 0:00</span>
                        </div>

                        <!-- Right Controls -->
                        <div class="lyt_controls_right">
                            <button class="lyt_btn lyt_btn_subtitles" aria-label="Subtitles">${SVG.subtitles}</button>
                            <div class="lyt_popup_menu lyt_subtitles_menu"></div>
                            
                            <button class="lyt_btn lyt_btn_speed" aria-label="Playback speed">${SVG.speed}</button>
                            <div class="lyt_popup_menu lyt_speed_menu"></div>
                            
                            <button class="lyt_btn lyt_btn_fullscreen" aria-label="Fullscreen">${SVG.fullscreen}</button>
                        </div>
                    </div>
                </div>
                
                <!-- Loading Spinner -->
                <div class="vast_video_loading"><div class="lyt-spinner"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20"></circle></svg></div></div>
            `;

            this.wrapper.insertAdjacentHTML('beforeend', controlsHtml);

            // Cache DOM Elements
            this.dom = {
                controls: this.wrapper.querySelector('.lyt_controls_container'),
                progressContainer: this.wrapper.querySelector('.lyt_progress_container'),
                progressPlayed: this.wrapper.querySelector('.lyt_progress_played'),
                progressDot: this.wrapper.querySelector('.lyt_progress_dot'),
                bufferBar: this.wrapper.querySelector('.lyt_progress_buffered'),
                playBtn: this.wrapper.querySelector('.lyt_btn_play'),
                skipBtn: this.wrapper.querySelector('.lyt_btn_skip'), // Added
                volumeBtn: this.wrapper.querySelector('.lyt_btn_volume'),
                volumeBar: this.wrapper.querySelector('.lyt_volume_bar'),       
                volumeFill: this.wrapper.querySelector('.lyt_volume_fill'),   
                volumeDot: this.wrapper.querySelector('.lyt_volume_dot'),     
                volumeSliderWrap: this.wrapper.querySelector('.lyt_volume_slider_wrap'),
                timeDisplay: this.wrapper.querySelector('.lyt_time'),
                subtitlesBtn: this.wrapper.querySelector('.lyt_btn_subtitles'),
                subtitlesMenu: this.wrapper.querySelector('.lyt_subtitles_menu'),
                subtitlesDisplay: this.wrapper.querySelector('.lyt_subtitles_display'),
                speedBtn: this.wrapper.querySelector('.lyt_btn_speed'),
                speedMenu: this.wrapper.querySelector('.lyt_speed_menu'),
                fullscreenBtn: this.wrapper.querySelector('.lyt_btn_fullscreen'),
                loading: this.wrapper.querySelector('.vast_video_loading'),
                preview: this.wrapper.querySelector('.lyt_timeline_preview'),
                contextMenu: this.wrapper.querySelector('.lyt_context_menu'),
                posterOverlay: this.wrapper.querySelector('.lyt_poster_overlay'),
                titleDisplay: this.wrapper.querySelector('.lyt_title_display')
            };
            
            this.buildSpeedMenu();
            this.buildSubtitlesMenu();
        }
        
        buildSpeedMenu() {
            let html = '';
            this.speedOptions.forEach(speed => {
                const label = speed === 1 ? 'Normal' : speed + 'x';
                const activeClass = speed === 1 ? ' lyt_active' : '';
                html += `<button class="lyt_menu_option lyt_speed_option${activeClass}" data-speed="${speed}">${label}</button>`;
            });
            this.dom.speedMenu.innerHTML = html;
        }
        
        buildSubtitlesMenu() {
            const tracks = this.video.textTracks;
            let html = `<button class="lyt_menu_option lyt_sub_option${this.currentTrackIndex === -1 ? ' lyt_active' : ''}" data-track="-1">Off</button>`;
            
            if (tracks && tracks.length > 0) {
                for (let i = 0; i < tracks.length; i++) {
                    const track = tracks[i];
                    const activeClass = this.currentTrackIndex === i ? ' lyt_active' : '';
                    const label = track.label || track.language || ('Track ' + (i + 1));
                    html += `<button class="lyt_menu_option lyt_sub_option${activeClass}" data-track="${i}">${label}</button>`;
                }
            }
            
            this.dom.subtitlesMenu.innerHTML = html;
        }

        bindEvents() {
            // Video Events
            this.video.addEventListener('play', () => {
                this.updatePlayPauseBtn(true);
                this.hidePoster();
                this.showCenterAnimation('pause');
            });
            this.video.addEventListener('pause', () => {
                this.updatePlayPauseBtn(false);
                this.showCenterAnimation('play');
            });
            this.video.addEventListener('pause', () => this.updatePlayPauseBtn(false));
            this.video.addEventListener('timeupdate', () => this.updateTime());
            this.video.addEventListener('progress', () => this.updateBuffer());
            this.video.addEventListener('waiting', () => this.showLoader(true));
            this.video.addEventListener('playing', () => this.showLoader(false));
            this.video.addEventListener('ended', () => this.onVideoEnded());
            this.video.addEventListener('volumechange', () => this.updateVolumeIcon());
            this.video.addEventListener('loadedmetadata', () => {
                this.buildSubtitlesMenu();
            });

            // Play/Pause button
            this.dom.playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.video.paused ? this.video.play() : this.video.pause();
            });
            
            // Skip button (Added)
            this.dom.skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Dispatch custom event to allow parent (video.html) to handle navigation
                this.video.dispatchEvent(new CustomEvent('lyt-skip'));
                // Optional: Give immediate feedback by pausing
                this.video.pause(); 
            });
            
            // Single click on video to toggle play
            this.video.addEventListener('click', () => {
                this.video.paused ? this.video.play() : this.video.pause();
            });

            // Double click on video to toggle fullscreen
            this.video.addEventListener('dblclick', () => {
                this.toggleFullScreen();
            });

            // Volume button (mute/unmute)
            this.dom.volumeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMute();
            });
            
            // --- New Volume Bar Events (Drag handling) ---
            this.dom.volumeBar.addEventListener('mousedown', (e) => this.handleVolumeDrag(e));
            
            // Keep volume slider visible while interacting
            this.dom.volumeBar.addEventListener('mousedown', () => {
                this.dom.volumeSliderWrap.classList.add('lyt_slider_visible');
            });

            // Progress Bar seeking
            this.dom.progressContainer.addEventListener('mousedown', (e) => this.handleSeekDrag(e));
            
            // Fullscreen
            this.dom.fullscreenBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFullScreen();
            });
            
            // Speed button & menu
            this.dom.speedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenu(this.dom.speedMenu);
            });
            this.dom.speedMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                const option = e.target.closest('.lyt_speed_option');
                if (!option) return;
                const speed = parseFloat(option.dataset.speed);
                this.setPlaybackSpeed(speed);
                this.closeAllMenus();
            });
            
            // Subtitles button & menu
            this.dom.subtitlesBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.buildSubtitlesMenu();
                this.toggleMenu(this.dom.subtitlesMenu);
            });
            this.dom.subtitlesMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                const option = e.target.closest('.lyt_sub_option');
                if (!option) return;
                const trackIndex = parseInt(option.dataset.track);
                this.setSubtitleTrack(trackIndex);
                this.closeAllMenus();
            });

            // Context Menu
            this.wrapper.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e.clientX, e.clientY);
            });

            this.dom.contextMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.lyt_ctx_item');
                if (!item) return;
                
                const action = item.dataset.action;
                if (action === 'copy-url') {
                    this.copyVideoUrl();
                } else if (action === 'copy-url-time') {
                    this.copyVideoUrlWithTime();
                } else if (action === 'stats') {
                    this.toggleStatsOverlay();
                }
                this.closeContextMenu();
            });

            // Close menus on outside click
            document.addEventListener('click', (e) => {
                if (!this.wrapper.contains(e.target)) {
                    this.closeAllMenus();
                    this.closeContextMenu();
                }
            });
            
            // Close menus on video/progress interaction
            this.video.addEventListener('click', () => {
                this.closeAllMenus();
                this.closeContextMenu();
            });
            this.dom.progressContainer.addEventListener('mousedown', () => {
                this.closeAllMenus();
                this.closeContextMenu();
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => this.handleKeyboard(e));
            
            // Fullscreen change event (properly listen to the document event)
            document.addEventListener('fullscreenchange', () => this.onFullScreenChange());
            
            // Auto-hide controls
            this.setupAutoHide();
            
            // Subtitle cue change listener
            this.video.textTracks.addEventListener('change', () => {
                this.updateSubtitlesDisplay();
            });

            // Poster click to play
            if (this.dom.posterOverlay) {
                this.dom.posterOverlay.addEventListener('click', () => {
                    this.video.play();
                    const logoOverlay = document.querySelector('.video-wrapper .logo-overlay');
                    if (logoOverlay) {
                        logoOverlay.style.display = 'none';
                    }
                });
            }
        }
        
        hidePoster() {
            if (!this._hasPlayedOnce && this.dom.posterOverlay) {
                this._hasPlayedOnce = true;
                this.dom.posterOverlay.classList.add('lyt_hidden');
            }
        }
        
        setupAutoHide() {
            const showControls = () => {
                this.dom.controls.classList.add('lyt_controls_visible');
                clearTimeout(this._hideTimer);
                if (!this.video.paused) {
                    this._hideTimer = setTimeout(() => {
                        this.dom.controls.classList.remove('lyt_controls_visible');
                    }, 3000);
                }
            };
            
            this.wrapper.addEventListener('mousemove', showControls);
            this.wrapper.addEventListener('touchstart', showControls);
            this.video.addEventListener('play', showControls);
            this.video.addEventListener('pause', showControls);
        }
        
        toggleMenu(menu) {
            const isOpen = menu.classList.contains('lyt_show');
            this.closeAllMenus();
            if (!isOpen) {
                menu.classList.add('lyt_show');
            }
        }
        
        closeAllMenus() {
            this.dom.speedMenu.classList.remove('lyt_show');
            this.dom.subtitlesMenu.classList.remove('lyt_show');
        }

        showContextMenu(clientX, clientY) {
            this.closeContextMenu(); 
            
            const menu = this.dom.contextMenu;
            menu.classList.add('lyt_show');
            
            const wrapperRect = this.wrapper.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();
            
            let x = clientX - wrapperRect.left;
            let y = clientY - wrapperRect.top;
            
            if (x + menuRect.width > wrapperRect.width) {
                x = wrapperRect.width - menuRect.width;
            }
            if (y + menuRect.height > wrapperRect.height) {
                y = wrapperRect.height - menuRect.height;
            }
            
            x = Math.max(0, x);
            y = Math.max(0, y);
            
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
        }

        closeContextMenu() {
            this.dom.contextMenu.classList.remove('lyt_show');
        }

        updatePlayPauseBtn(isPlaying) {
            this.dom.playBtn.innerHTML = isPlaying ? SVG.pause : SVG.play;
            this.dom.playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
        }

        showCenterAnimation(type) {
            const existing = this.wrapper.querySelector('.lyt_center_anim');
            if (existing) existing.remove();

            const icon = type === 'play' ? SVG.play : SVG.pause;
            
            const anim = document.createElement('div');
            anim.className = 'lyt_center_anim';
            anim.innerHTML = `
                <div class="lyt_center_bg"></div>
                <div class="lyt_center_icon">${icon}</div>
            `;
            
            this.wrapper.appendChild(anim);

            void anim.offsetWidth;
            
            anim.classList.add('lyt_show');

            setTimeout(() => {
                anim.classList.remove('lyt_show');
                setTimeout(() => anim.remove(), 300); 
            }, 400);
        }

        updateTime() {
            const duration = this.video.duration || 0;
            const current = this.video.currentTime || 0;
            const percent = duration > 0 ? (current / duration) * 100 : 0;

            this.dom.progressPlayed.style.width = `${percent}%`;
            this.dom.timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        }

        updateBuffer() {
            if (this.video.buffered.length > 0) {
                const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
                const duration = this.video.duration || 1;
                this.dom.bufferBar.style.width = `${(bufferedEnd / duration) * 100}%`;
            }
        }

        showLoader(show) {
            this.dom.loading.style.display = show ? 'flex' : 'none';
        }

        toggleMute() {
            if (this.video.muted || this.video.volume === 0) {
                this.video.muted = false;
                this.video.volume = this._lastVolume || 0.5;
                this.isMuted = false;
            } else {
                this._lastVolume = this.video.volume;
                this.video.muted = true;
                this.isMuted = true;
            }
            this.updateVolumeIcon();
        }

        updateVolumeIcon() {
            const vol = this.video.muted ? 0 : this.video.volume;
            let icon;
            if (vol === 0) {
                icon = SVG.volumeMute;
            } else if (vol < 0.4) {
                icon = SVG.volumeLow;
            } else if (vol < 0.7) {
                icon = SVG.volumeMedium;
            } else {
                icon = SVG.volumeHigh;
            }
            this.dom.volumeBtn.innerHTML = icon;
            
            // Update volume bar fill width
            const percent = vol * 100;
            if(this.dom.volumeFill) {
                this.dom.volumeFill.style.width = `${percent}%`;
            }
        }
        
        setPlaybackSpeed(speed) {
            this.currentSpeed = speed;
            this.video.playbackRate = speed;
            this.dom.speedMenu.querySelectorAll('.lyt_speed_option').forEach(opt => {
                opt.classList.toggle('lyt_active', parseFloat(opt.dataset.speed) === speed);
            });
        }
        
        setSubtitleTrack(trackIndex) {
            this.currentTrackIndex = trackIndex;
            const tracks = this.video.textTracks;
            
            for (let i = 0; i < tracks.length; i++) {
                if (i !== trackIndex) {
                    tracks[i].mode = 'hidden';
                }
            }
            
            if (trackIndex >= 0 && tracks[trackIndex]) {
                tracks[trackIndex].mode = 'showing';
                const trackElements = this.video.querySelectorAll('track');
                if (trackElements[trackIndex] && trackElements[trackIndex].kind === 'metadata') {
                    trackElements[trackIndex].kind = 'subtitles';
                }
            }
            
            this.subtitlesEnabled = trackIndex >= 0;
            this.dom.subtitlesBtn.style.opacity = this.subtitlesEnabled ? '1' : '0.6';
            
            this.dom.subtitlesMenu.querySelectorAll('.lyt_sub_option').forEach(opt => {
                opt.classList.toggle('lyt_active', parseInt(opt.dataset.track) === trackIndex);
            });
            
            if (!this.subtitlesEnabled) {
                this.dom.subtitlesDisplay.innerHTML = '';
            } else {
                this.updateSubtitlesDisplay();
            }
        }
        
        updateSubtitlesDisplay() {
            if (!this.subtitlesEnabled || this.currentTrackIndex < 0) {
                this.dom.subtitlesDisplay.innerHTML = '';
                return;
            }
            
            const track = this.video.textTracks[this.currentTrackIndex];
            if (!track) return;
            
            if (track.mode !== 'showing') {
                track.mode = 'showing';
            }
            
            const activeCues = track.activeCues;
            if (activeCues && activeCues.length > 0) {
                let html = '';
                for (let i = 0; i < activeCues.length; i++) {
                    const cue = activeCues[i];
                    html += `<span class="lyt_sub_text">${cue.text}</span><br>`;
                }
                this.dom.subtitlesDisplay.innerHTML = html;
            } else {
                this.dom.subtitlesDisplay.innerHTML = '';
            }
        }

        handleSeekDrag(e) {
            e.preventDefault();
            this._seeking = true;
            const rect = this.dom.progressContainer.getBoundingClientRect();
            
            const calcPercent = (clientX) => {
                let x = clientX - rect.left;
                let percent = x / rect.width;
                return Math.max(0, Math.min(1, percent));
            };
            
            const percent = calcPercent(e.clientX);
            this.dom.progressPlayed.style.width = `${percent * 100}%`;

            const moveHandler = (ev) => {
                const p = calcPercent(ev.clientX);
                this.dom.progressPlayed.style.width = `${p * 100}%`;
            };
            
            const upHandler = (ev) => {
                const p = calcPercent(ev.clientX);
                if (this.video.duration) {
                    this.video.currentTime = p * this.video.duration;
                }
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
                this._seeking = false;
            };
            
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        }

        handleVolumeDrag(e) {
            e.preventDefault();
            const rect = this.dom.volumeBar.getBoundingClientRect();
            
            const calcVol = (clientX) => {
                let x = clientX - rect.left;
                let vol = x / rect.width;
                return Math.max(0, Math.min(1, vol));
            };

            const setVolume = (vol) => {
                this.video.volume = vol;
                if (vol > 0) {
                    this.video.muted = false;
                    this._lastVolume = vol;
                    this.isMuted = false;
                } else {
                    this.video.muted = true;
                    this.isMuted = true;
                }
                this.updateVolumeIcon();
            };

            const initialVol = calcVol(e.clientX);
            setVolume(initialVol);

            const moveHandler = (ev) => {
                const v = calcVol(ev.clientX);
                setVolume(v);
            };
            
            const upHandler = (ev) => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
            };
            
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        }

        handleKeyboard(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.target.isContentEditable) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    this.video.paused ? this.video.play() : this.video.pause();
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    this.video.currentTime -= 5;
                    break;
                case 'arrowright':
                    e.preventDefault();
                    this.video.currentTime += 5;
                    break;
                case 'arrowup':
                    e.preventDefault();
                    this.video.volume = Math.min(1, this.video.volume + 0.05);
                    this.updateVolumeIcon();
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    this.video.volume = Math.max(0, this.video.volume - 0.05);
                    this.updateVolumeIcon();
                    break;
                case 'f':
                    e.preventDefault();
                    this.toggleFullScreen();
                    break;
                case 'm':
                    e.preventDefault();
                    this.toggleMute();
                    break;
                case 'c':
                    e.preventDefault();
                    if (this.currentTrackIndex >= 0) {
                        this.setSubtitleTrack(-1);
                    } else if (this.video.textTracks.length > 0) {
                        this.setSubtitleTrack(0);
                    }
                    break;
                case 'j':
                    e.preventDefault();
                    this.video.currentTime -= 10;
                    break;
                case 'l':
                    e.preventDefault();
                    this.video.currentTime += 10;
                    break;
                case 'shift+n': // Optional: Shortcut for skip if desired, though not requested
                     this.video.dispatchEvent(new CustomEvent('lyt-skip'));
                     break;
            }
        }

        async copyVideoUrl() {
            const url = this.video.currentSrc || this.video.src;
            await this.copyToClipboard(url);
        }

        async copyVideoUrlWithTime() {
            let url = this.video.currentSrc || this.video.src;
            const separator = url.indexOf('?') >= 0 ? '&' : '?';
            const t = Math.floor(this.video.currentTime);
            const timestampUrl = `${url}${separator}t=${t}`;
            await this.copyToClipboard(timestampUrl);
        }

        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.showToast('Link Copied!');
            } catch (err) {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    this.showToast('Link Copied!');
                } catch (e) { 
                    console.error('Failed to copy', e); 
                }
                document.body.removeChild(textArea);
            }
        }

        showToast(message) {
            const existingToast = this.wrapper.querySelector('.lyt_copy_toast');
            if (existingToast) existingToast.remove();

            const toast = document.createElement('div');
            toast.className = 'lyt_copy_toast';
            toast.innerText = message;
            this.wrapper.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.add('show');
            });

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300); 
            }, 1500);
        }

        toggleStatsOverlay() {
            let overlay = this.wrapper.querySelector('.lyt_stats_overlay');

            if (overlay) {
                overlay.remove();
                if (this._statsInterval) clearInterval(this._statsInterval);
                if (this._fpsFrameId) cancelAnimationFrame(this._fpsFrameId);
                return;
            }

            overlay = document.createElement('div');
            overlay.className = 'lyt_stats_overlay';
            this.wrapper.appendChild(overlay);

            const video = this.video;
            
            let fpsFrames = 0;
            let fpsLastTime = performance.now();
            let fpsCurrentValue = '...';

            const fpsLoop = () => {
                if (!document.body.contains(overlay)) {
                     cancelAnimationFrame(this._fpsFrameId);
                     return;
                }
                
                fpsFrames++;
                const now = performance.now();
                
                if (now >= fpsLastTime + 500) {
                    fpsCurrentValue = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
                    fpsFrames = 0;
                    fpsLastTime = now;
                }
                this._fpsFrameId = requestAnimationFrame(fpsLoop);
            };
            this._fpsFrameId = requestAnimationFrame(fpsLoop);

            const updateStats = () => {
                if (!video || !document.body.contains(overlay)) {
                    clearInterval(this._statsInterval);
                    if (this._fpsFrameId) cancelAnimationFrame(this._fpsFrameId);
                    return;
                }

                let html = '';
                html += this.createStatRow('Resolution', `${video.videoWidth} x ${video.videoHeight}`);
                html += this.createStatRow('FPS (Current)', `${fpsCurrentValue}`);
                html += this.createStatRow('Codec', this.getCodecInfo());
                html += this.createStatRow('Buffer Speed', this.calculateBitrate());

                let volStr = Math.round(video.volume * 100) + '%';
                if (video.muted || video.volume === 0) volStr += ' (Muted)';
                html += this.createStatRow('Volume', volStr);

                let speedVal = video.playbackRate.toFixed(2);
                if (speedVal === '1.00') speedVal = '1';
                html += this.createStatRow('Speed', speedVal + 'x');

                if (video.buffered.length > 0) {
                    const buffered = video.buffered.end(video.buffered.length - 1) - video.currentTime;
                    html += this.createStatRow('Buffer', this.formatTimeStat(buffered));
                }

                if (video.mozDecodedFrames !== undefined) {
                    const dropped = video.mozParsedFrames - video.mozDecodedFrames;
                    html += this.createStatRow('Dropped Frames', dropped);
                }

                overlay.innerHTML = html;
            };

            updateStats();
            this._statsInterval = setInterval(updateStats, 1000);
        }

        createStatRow(label, value) {
            return `<div><span class="lyt_stat_label">${label}</span> <span class="lyt_stat_value">${value}</span></div>`;
        }

        formatTimeStat(s) {
            if (isNaN(s) || !isFinite(s)) return 'Live';
            const m = Math.floor(s / 60), sec = Math.floor(s % 60);
            return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
        }

        getCodecInfo() {
            const video = this.video;
            if (window.Hls && video.hlsPlayer && video.hlsPlayer.levels) {
                const level = video.hlsPlayer.levels[video.hlsPlayer.currentLevel];
                if(level && level.codecSet) return level.codecSet;
            }
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
            const src = video.currentSrc || video.src;
            if (src) {
                const ext = src.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
                if (['mp4', 'm4v', 'mov'].includes(ext)) return 'H.264 (Likely)';
                if (['webm'].includes(ext)) return 'VP9/AV1 (Likely)';
                if (['ogg', 'ogv'].includes(ext)) return 'Theora/Vorbis';
            }
            if (video.canPlayType) {
                 if (video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '') return 'H.264 (Guessed)';
                 if (video.canPlayType('video/webm; codecs="vp9"') !== '') return 'VP9 (Guessed)';
            }
            return 'Unknown';
        }

        calculateBitrate() {
            const video = this.video;
            if (video.webkitVideoDecodingByteRate) {
                return (video.webkitVideoDecodingByteRate / 1000).toFixed(0) + ' kbps';
            }
            if (window.Hls && video.hlsPlayer) {
                if (video.hlsPlayer.stats && video.hlsPlayer.stats.total && video.hlsPlayer.stats.total.bwEstimate) {
                     return (video.hlsPlayer.stats.total.bwEstimate / 1000).toFixed(0) + ' kbps';
                }
                if (video.hlsPlayer.levels) {
                    const level = video.hlsPlayer.levels[video.hlsPlayer.currentLevel];
                    if (level && level.bitrate) return (level.bitrate / 1000).toFixed(0) + ' kbps';
                }
            }
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

        toggleFullScreen(state) {
            if (typeof state === 'undefined') {
                state = !this.isFullScreen;
            }

            if (state) {
                const requestFn = this.wrapper.requestFullscreen || this.wrapper.webkitRequestFullscreen || this.wrapper.msRequestFullscreen;
                if (requestFn) {
                    requestFn.call(this.wrapper).catch(err => {
                        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
                    });
                }
            } else {
                const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
                if (exitFn) {
                    exitFn.call(document).catch(err => {
                        console.error(`Error attempting to disable full-screen mode: ${err.message}`);
                    });
                }
            }
        }
        
        onFullScreenChange() {
            this.isFullScreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
            
            if (this.isFullScreen) {
                this.dom.fullscreenBtn.innerHTML = SVG.fullscreenExit;
                this.dom.fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen');
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    this.wrapper.classList.add('pseudo_fullscreen');
                }
            } else {
                this.dom.fullscreenBtn.innerHTML = SVG.fullscreen;
                this.dom.fullscreenBtn.setAttribute('aria-label', 'Fullscreen');
                this.wrapper.classList.remove('pseudo_fullscreen');
            }
        }

        toggleTheatre() {
            this.isTheatre = !this.isTheatre;
            this.wrapper.classList.toggle('fluid_theatre_mode', this.isTheatre);
        }

        toggleMiniPlayer() {
            this.isMiniPlayer = !this.isMiniPlayer;
            this.wrapper.classList.toggle('fluid_mini_player_mode', this.isMiniPlayer);
        }

        async loadTimelinePreview() {
            const vtt = this.options.layoutControls && this.options.layoutControls.timelinePreview && this.options.layoutControls.timelinePreview.file;
            if (!vtt) return;

            try {
                const resp = await fetch(vtt);
                const text = await resp.text();
                const lines = text.split('\n');
                let timeStart, timeEnd;
                
                lines.forEach(line => {
                    if (line.includes('-->')) {
                        const times = line.split('-->');
                        timeStart = this.parseTimeCode(times[0]);
                        timeEnd = this.parseTimeCode(times[1]);
                    } else if (timeStart !== undefined && line.trim() !== '') {
                        this.timelinePreviewData.push({
                            start: timeStart,
                            end: timeEnd,
                            img: line.trim()
                        });
                    }
                });

                this.dom.progressContainer.addEventListener('mousemove', throttle((e) => {
                    const rect = this.dom.progressContainer.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    const time = percent * this.video.duration;
                    
                    const preview = this.timelinePreviewData.find(p => time >= p.start && time <= p.end);
                    if (preview) {
                        this.dom.preview.style.display = 'block';
                        let imgUrl = preview.img;
                        let bgPos = 'center';
                        let bgSize = 'cover';
                        
                        if (imgUrl.includes('#xywh=')) {
                            const parts = imgUrl.split('#xywh=');
                            imgUrl = parts[0];
                            const coords = parts[1].split(',').map(Number);
                            if (coords.length === 4) {
                                bgPos = `-${coords[0]}px -${coords[1]}px`;
                                bgSize = 'auto';
                            }
                        }
                        
                        this.dom.preview.style.backgroundImage = `url(${imgUrl})`;
                        this.dom.preview.style.backgroundPosition = bgPos;
                        this.dom.preview.style.backgroundSize = bgSize;
                        
                        let left = e.clientX - rect.left - 60;
                        left = Math.max(0, Math.min(left, rect.width - 120));
                        this.dom.preview.style.left = `${left}px`;
                    } else {
                        this.dom.preview.style.display = 'none';
                    }
                }, 100));
                
                this.dom.progressContainer.addEventListener('mouseleave', () => {
                    this.dom.preview.style.display = 'none';
                });

            } catch (err) {
                console.log("Could not load timeline preview VTT", err);
            }
        }

        parseTimeCode(timeString) {
            const parts = timeString.trim().split(':');
            const seconds = parts[2] ? parseFloat(parts[2]) : 0;
            const minutes = parts[1] ? parseInt(parts[1]) : 0;
            const hours = parts[0] ? parseInt(parts[0]) : 0;
            return (hours * 3600) + (minutes * 60) + seconds;
        }

        onVideoEnded() {
            this.dom.controls.classList.add('lyt_controls_visible');
            this.updatePlayPauseBtn(false);
        }

        play() { this.video.play(); }
        pause() { this.video.pause(); }
        skipTo(time) { this.video.currentTime = time; }
        
        setVolume(vol) { 
            this.video.volume = vol; 
            this.updateVolumeIcon();
        }
        
        on(event, callback) {
            this.video.addEventListener(event, callback);
        }
    }

    global.LYTPlayer = function(videoId, options) {
        return new LYTPlayer(videoId, options);
    };

})(window);