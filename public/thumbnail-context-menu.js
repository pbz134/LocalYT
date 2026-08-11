/**
 * thumbnail-context-menu.js
 * Adds a 3-dot menu to video thumbnails on hover across all pages.
 * Options: Add to Watch later, Add to playlist, Share (copy link)
 */
(function() {
    // ==============================
    // STYLES
    // ==============================
    const css = document.createElement('style');
    css.id = 'thumbnail-context-menu-css';
    css.textContent = `
        /* 3-Dot Button */
        .thumbnail-menu-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            background: #000;
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.15s, background 0.15s;
            z-index: 10;
            pointer-events: none;
            padding: 0;
        }
        .thumbnail-container:hover .thumbnail-menu-btn {
            opacity: 1;
            pointer-events: auto;
        }
        .thumbnail-menu-btn:hover {
            background: rgba(40, 40, 40, 0.95);
        }
        .thumbnail-menu-btn svg {
            width: 16px;
            height: 16px;
            fill: #fff;
            pointer-events: none;
        }

        /* Move to top-left on user_playlists.html to avoid the remove (x) button */
        .playlist-video-item .thumbnail-menu-btn {
            right: auto;
            left: 4px;
        }

        /* Context Menu */
        .thumbnail-context-menu {
            position: fixed;
            background: #282828;
            border: 1px solid #3f3f3f;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
            z-index: 2000;
            min-width: 160px;
            overflow: hidden;
            padding: 6px 0;
        }
        .thumbnail-context-menu-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 14px;
            color: #e1e1e1;
            font-size: 13px;
            font-family: 'RobotoRegular', Arial, sans-serif;
            cursor: pointer;
            transition: background-color 0.1s;
            white-space: nowrap;
        }
        .thumbnail-context-menu-item:hover {
            background-color: #3f3f3f;
        }
        .thumbnail-context-menu-item svg {
            width: 16px;
            height: 16px;
            fill: #aaa;
            flex-shrink: 0;
        }
        .thumbnail-context-menu-item:hover svg {
            fill: #fff;
        }

        /* ===== MODALS (Global) ===== */
        .tcm-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            justify-content: center;
            align-items: center;
            z-index: 3000;
        }

        /* Share Modal – kept for reference but no longer used */
        .tcm-share-modal {
            background-color: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            position: relative;
            width: 320px;
        }
        .tcm-share-modal h2 {
            color: #fff;
            margin: 0 0 20px 0;
            font-size: 18px;
            font-family: 'Kaleko205Round', Arial, sans-serif;
        }
        .tcm-modal-close {
            position: absolute;
            top: 10px;
            right: 14px;
            font-size: 22px;
            font-weight: bold;
            color: #fff;
            background: none;
            border: none;
            cursor: pointer;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
        }
        .tcm-modal-close:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
        .tcm-share-btn {
            background-color: red;
            color: #fff;
            border: none;
            padding: 10px 16px;
            border-radius: 5px;
            cursor: pointer;
            margin: 4px;
            font-size: 14px;
            width: calc(100% - 32px);
        }
        .tcm-share-btn:hover {
            background-color: #c40000;
        }

        /* Save to Playlist Modal */
        .tcm-save-modal {
            background-color: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
            width: 380px;
            max-height: 80vh;
            overflow-y: auto;
            position: relative;
        }
        .tcm-save-modal h2 {
            color: #fff;
            margin: 0 0 15px 0;
            font-size: 18px;
            font-family: 'Kaleko205Round', Arial, sans-serif;
        }
        .tcm-no-playlists-msg {
            color: #888;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .tcm-save-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            border-radius: 4px;
            cursor: pointer;
            color: #d2cfcf;
            font-size: 14px;
            transition: background-color 0.15s;
        }
        .tcm-save-item:hover {
            background-color: #3f3f3f;
        }
        .tcm-save-item.already-saved {
            color: #888;
            cursor: default;
        }
        .tcm-save-item.already-saved:hover {
            background-color: transparent;
        }
        .tcm-save-item .playlist-video-count {
            color: #666;
            font-size: 12px;
            margin-left: 6px;
        }
        .tcm-save-item .check-icon {
            color: #fff;
            font-size: 18px;
        }
        .tcm-create-row {
            display: flex;
            gap: 8px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #3f3f3f;
        }
        .tcm-create-row input {
            flex: 1;
            background: #0f0f0f;
            border: 1px solid #555;
            border-radius: 4px;
            padding: 8px 10px;
            color: #fff;
            font-size: 14px;
            outline: none;
            font-family: 'RobotoRegular', Arial, sans-serif;
        }
        .tcm-create-row input:focus {
            border-color: #3ea6ff;
        }
        .tcm-create-row button {
            background-color: #cc0000;
            color: #fff;
            border: none;
            padding: 8px 14px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            font-family: 'RobotoRegular', Arial, sans-serif;
            white-space: nowrap;
        }
        .tcm-create-row button:hover {
            background-color: #c40000;
        }

        /* Toast */
        .tcm-toast {
            display: none;
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #1a1a1a;
            color: #fff;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 4000;
            font-family: 'RobotoRegular', Arial, sans-serif;
            font-size: 14px;
            border: 1px solid #333;
        }
    `;
    document.head.appendChild(css);

    // ==============================
    // ICONS
    // ==============================
    const DOTS_SVG = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
    const SAVE_SVG = `<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>`;
    const SHARE_SVG = `<svg viewBox="0 0 24 24"><path d="M14 9V3L22 12 14 21v-6c-5 0-8.5 1.5-11 5 1-5 4-10 11-11z"/></svg>`;
    const CLOCK_SVG = `<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>`;

    // ==============================
    // GLOBAL MODALS & TOAST
    // ==============================
    document.body.insertAdjacentHTML('beforeend', `
        <div id="tcmSaveOverlay" class="tcm-overlay">
            <div class="tcm-save-modal">
                <button class="tcm-modal-close" id="tcmSaveClose">&times;</button>
                <h2>Save to Playlist</h2>
                <p id="tcmNoPlaylistsMsg" class="tcm-no-playlists-msg" style="display:none;">No playlists yet. Create one below.</p>
                <div id="tcmSavePlaylistList"></div>
                <div class="tcm-create-row">
                    <input type="text" id="tcmNewPlaylistName" placeholder="New playlist name" maxlength="100">
                    <button id="tcmCreatePlaylistBtn">Create</button>
                </div>
            </div>
        </div>
        <div id="tcmToast" class="tcm-toast"></div>
    `);

    // ==============================
    // STATE
    // ==============================
    let currentMenuVideoPath = null;
    let activeContextMenu = null;
    let activeMenuBtn = null;

    // ==============================
    // HELPERS
    // ==============================
    function getLang(en, de) {
        return localStorage.getItem('language') === 'de' ? de : en;
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function showToast(message) {
        const toast = document.getElementById('tcmToast');
        toast.textContent = message;
        toast.style.display = 'block';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2000);
    }

    function closeContextMenu() {
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
        if (activeMenuBtn) {
            activeMenuBtn = null;
        }
    }

    function closeAllModals() {
        document.getElementById('tcmSaveOverlay').style.display = 'none';
        closeContextMenu();
    }

    // Reconstructs the video path out of a thumbnail URL (Fallback for index.html & user_playlists.html)
    function pathFromThumbnailSrc(src) {
        if (!src) return null;
        try {
            const u = new URL(src, window.location.origin);
            const m = u.pathname.match(/^\/thumbnails(?:-small)?\/(.+)\.jpg$/);
            if (!m) return null;
            let encodedPath = m[1];
            let decodedPath;
            try {
                decodedPath = decodeURIComponent(encodedPath);
            } catch(e) {
                decodedPath = encodedPath;
            }
            return decodedPath + '.mp4';
        } catch(e) { return null; }
    }

    // ==============================
    // 3-DOT MENU LOGIC
    // ==============================
    function addMenuButtonToThumbnail(container, videoPath) {
        if (!videoPath || container.querySelector('.thumbnail-menu-btn')) return;
        
        const btn = document.createElement('button');
        btn.className = 'thumbnail-menu-btn';
        btn.innerHTML = DOTS_SVG;
        btn.dataset.videoPath = videoPath;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openContextMenu(btn, videoPath);
        });
        
        container.appendChild(btn);
    }

    function openContextMenu(btn, videoPath) {
        if (activeContextMenu && activeMenuBtn === btn) {
            closeContextMenu();
            return;
        }
        
        closeContextMenu();
        currentMenuVideoPath = videoPath;
        activeMenuBtn = btn;

        const menu = document.createElement('div');
        menu.className = 'thumbnail-context-menu';

        // 1. Add to Watch Later Item
        const watchLaterItem = document.createElement('div');
        watchLaterItem.className = 'thumbnail-context-menu-item';
        watchLaterItem.innerHTML = `${CLOCK_SVG} <span>${getLang('Add to Watch later', 'Zu "Später ansehen" hinzufügen')}</span>`;
        watchLaterItem.addEventListener('click', (e) => {
            e.stopPropagation();
            saveToWatchLater(videoPath);
        });

        // 2. Add to Playlist Item
        const addPlaylistItem = document.createElement('div');
        addPlaylistItem.className = 'thumbnail-context-menu-item';
        addPlaylistItem.innerHTML = `${SAVE_SVG} <span>${getLang('Add to playlist', 'Zur Playlist hinzufügen')}</span>`;
        addPlaylistItem.addEventListener('click', (e) => {
            e.stopPropagation();
            openSaveModal(videoPath);
        });

        // 3. Share Item – copies link directly, no modal
        const shareItem = document.createElement('div');
        shareItem.className = 'thumbnail-context-menu-item';
        shareItem.innerHTML = `${SHARE_SVG} <span>${getLang('Share', 'Teilen')}</span>`;
        shareItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            await copyShareLink(videoPath);
        });

        menu.appendChild(watchLaterItem);
        menu.appendChild(addPlaylistItem);
        menu.appendChild(shareItem);
        
        document.body.appendChild(menu);
        activeContextMenu = menu;

        // Position Context Menu
        const rect = btn.getBoundingClientRect();
        let top = rect.bottom + 4;
        let left = rect.right - menu.offsetWidth;

        if (left < 4) left = 4;
        if (top + menu.offsetHeight > window.innerHeight - 4) {
            top = rect.top - menu.offsetHeight - 4;
        }

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }

    document.addEventListener('click', (e) => {
        if (activeContextMenu && !activeContextMenu.contains(e.target) && e.target !== activeMenuBtn) {
            closeContextMenu();
        }
    });

    // ==============================
    // SHARE – direct copy (no modal)
    // ==============================
    async function copyShareLink(videoPath) {
        closeContextMenu();
        const url = await buildVideoUrl(videoPath);
        copyToClipboard(url);
    }

    // ==============================
    // VIDEO URL HELPERS
    // ==============================
    async function buildVideoUrl(videoPath) {
        let url = `${window.location.origin}/video.html?src=${encodeURIComponent(videoPath)}`;
        
        try {
            const response = await fetch(`/api/shortlink?video=${encodeURIComponent(videoPath)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.shortPath) url = `${window.location.origin}${data.shortPath}`;
            }
        } catch (e) {}
        
        // Preserve playlist context if we are currently inside a playlist on video.html
        if (window.location.pathname.includes('video.html')) {
            const urlParams = new URLSearchParams(window.location.search);
            const playlist = urlParams.get('playlist');
            const userPlaylist = urlParams.get('userplaylist');
            if (playlist) url += `&playlist=${encodeURIComponent(playlist)}`;
            if (userPlaylist) url += `&userplaylist=${encodeURIComponent(userPlaylist)}`;
        }
        
        return url;
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showToast(getLang('Video URL copied to clipboard!', 'Video-URL in die Zwischenablage kopiert!'));
            }).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const tempInput = document.createElement('input');
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showToast(getLang('Video URL copied to clipboard!', 'Video-URL in die Zwischenablage kopiert!'));
    }

    // ==============================
    // SAVE TO PLAYLIST MODAL LOGIC
    // ==============================
    function openSaveModal(videoPath) {
        closeContextMenu();
        document.getElementById('tcmNewPlaylistName').value = '';
        fetchPlaylists();
        document.getElementById('tcmSaveOverlay').style.display = 'flex';
    }

    document.getElementById('tcmSaveClose').addEventListener('click', closeAllModals);
    document.getElementById('tcmSaveOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('tcmSaveOverlay')) closeAllModals();
    });

    async function fetchPlaylists() {
        const listEl = document.getElementById('tcmSavePlaylistList');
        const noMsg = document.getElementById('tcmNoPlaylistsMsg');
        listEl.innerHTML = '';

        try {
            const response = await fetch('/user-playlists');
            if (!response.ok) {
                noMsg.style.display = 'block';
                noMsg.textContent = getLang('Please log in to save videos to playlists.', 'Bitte melde dich an, um Videos zu Playlisten hinzuzufügen.');
                return;
            }
            const playlists = await response.json();
            const names = Object.keys(playlists);

            if (names.length === 0) {
                noMsg.style.display = 'block';
                noMsg.textContent = getLang('No playlists yet. Create one below.', 'Noch keine Playlisten. Erstelle unten eine neue.');
            } else {
                noMsg.style.display = 'none';
                names.forEach(name => {
                    const item = document.createElement('div');
                    item.className = 'tcm-save-item';
                    const count = playlists[name].length;
                    const alreadySaved = playlists[name].includes(currentMenuVideoPath);

                    if (alreadySaved) {
                        item.classList.add('already-saved');
                        item.innerHTML = `<span>${escapeHtml(name)} <span class="playlist-video-count">${count} videos</span></span><span class="check-icon">✓</span>`;
                    } else {
                        item.innerHTML = `<span>${escapeHtml(name)} <span class="playlist-video-count">${count} videos</span></span>`;
                        item.addEventListener('click', () => saveToPlaylist(name));
                    }
                    listEl.appendChild(item);
                });
            }
        } catch (e) {
            console.error('Error loading playlists:', e);
            noMsg.style.display = 'block';
            noMsg.textContent = getLang('Error loading playlists.', 'Fehler beim Laden der Playlisten.');
        }
    }

    async function saveToPlaylist(playlistName) {
        try {
            const response = await fetch('/save-to-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlist: playlistName, video: currentMenuVideoPath })
            });
            if (response.status === 409) return;
            if (!response.ok) {
                alert(getLang('Error saving to playlist.', 'Fehler beim Speichern in der Playlist.'));
                return;
            }
            closeAllModals();
            showToast(getLang('Saved to playlist', 'Zur Playlist hinzugefügt'));
        } catch (e) {
            console.error('Error saving to playlist:', e);
        }
    }

    async function saveToWatchLater(videoPath) {
        closeContextMenu();
        const watchLaterName = getLang('Watch later', 'Später ansehen');

        try {
            let saveRes = await fetch('/save-to-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlist: watchLaterName, video: videoPath })
            });

            if (saveRes.status === 404) {
                const createRes = await fetch('/create-playlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: watchLaterName })
                });

                if (!createRes.ok && createRes.status !== 409) {
                    alert(getLang('Error creating Watch later playlist.', 'Fehler beim Erstellen der "Später ansehen" Playlist.'));
                    return;
                }

                saveRes = await fetch('/save-to-playlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playlist: watchLaterName, video: videoPath })
                });
            }

            if (saveRes.status === 409) {
                showToast(getLang('Already in Watch later', 'Bereits in "Später ansehen"'));
                return;
            }
            
            if (!saveRes.ok) {
                alert(getLang('Error saving to Watch later.', 'Fehler beim Speichern in "Später ansehen".'));
                return;
            }

            showToast(getLang('Saved to Watch later', 'Zu "Später ansehen" hinzugefügt'));

        } catch (e) {
            console.error('Error saving to Watch later:', e);
        }
    }

    async function createAndSavePlaylist() {
        const input = document.getElementById('tcmNewPlaylistName');
        const name = input.value.trim();
        if (!name) return;

        try {
            const createRes = await fetch('/create-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (createRes.status === 409) {
                alert(getLang('A playlist with this name already exists.', 'Eine Playlist mit diesem Namen existiert bereits.'));
                return;
            }
            if (!createRes.ok) {
                alert(getLang('Error creating playlist.', 'Fehler beim Erstellen der Playlist.'));
                return;
            }
            input.value = '';
            await fetchPlaylists();
            await saveToPlaylist(name);
        } catch (e) {
            console.error('Error creating playlist:', e);
        }
    }

    document.getElementById('tcmCreatePlaylistBtn').addEventListener('click', createAndSavePlaylist);
    document.getElementById('tcmNewPlaylistName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createAndSavePlaylist();
    });

    // ==============================
    // OBSERVERS & INITIALIZATION
    // ==============================
    function processThumbnails() {
        // Standard video items (index.html & channel.html)
        document.querySelectorAll('.video-item .thumbnail-container').forEach(container => {
            const videoItem = container.closest('.video-item');
            if (!videoItem) return;
            
            const videoTitleEl = videoItem.querySelector('.video-title');
            if (!videoTitleEl) return;
            
            const onclickAttr = videoTitleEl.getAttribute('onclick') || '';
            let videoPath = null;
            
            const openVideoMatch = onclickAttr.match(/openVideo\(['"]([^'"]+)['"]\)/);
            if (openVideoMatch) {
                try { videoPath = decodeURIComponent(openVideoMatch[1]); } catch(e) { videoPath = openVideoMatch[1]; }
            } else {
                const srcMatch = onclickAttr.match(/src=([^&'"]+)/);
                if (srcMatch) {
                    try { videoPath = decodeURIComponent(srcMatch[1]); } catch(e) { videoPath = srcMatch[1]; }
                }
            }
            
            if (videoPath) {
                addMenuButtonToThumbnail(container, videoPath);
            } else {
                const imgEl = container.querySelector('img.video-thumbnail');
                if (imgEl) {
                    const fallbackPath = pathFromThumbnailSrc(imgEl.src);
                    addMenuButtonToThumbnail(container, fallbackPath);
                }
            }
        });

        // Playlist video items (user_playlists.html)
        document.querySelectorAll('.playlist-video-item .thumbnail-container').forEach(container => {
            if (container.querySelector('.thumbnail-menu-btn')) return;
            const imgEl = container.querySelector('img.video-thumbnail');
            if (imgEl) {
                const fallbackPath = pathFromThumbnailSrc(imgEl.src);
                addMenuButtonToThumbnail(container, fallbackPath);
            }
        });

        // Sidebar suggestion items (video.html)
        document.querySelectorAll('.suggestion-item .thumbnail-container').forEach(container => {
            const suggestionItem = container.closest('.suggestion-item');
            if (!suggestionItem) return;
            
            const videoPath = suggestionItem.dataset.videoPath;
            if (videoPath) {
                addMenuButtonToThumbnail(container, videoPath);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processThumbnails);
    } else {
        processThumbnails();
    }

    const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && (node.matches('.video-item, .playlist-video-item, .suggestion-item, .home-row-wrapper, .channel-videos, .channel-search-results, .playlist-videos-grid') || node.querySelector('.video-item, .playlist-video-item, .suggestion-item'))) {
                        shouldProcess = true;
                        break;
                    }
                }
            }
            if (shouldProcess) break;
        }
        if (shouldProcess) {
            clearTimeout(observer._timer);
            observer._timer = setTimeout(processThumbnails, 50);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();