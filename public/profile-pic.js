(function() {
    const PLACEHOLDER = '/LocalYT-Rev-Files/user-profile-placeholder.jpg';
    let menuInstance = null;
    let currentUserId = null;

    // --- Settings Storage Helpers ---
    function getSetting(key, fallback) {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
    }

    function setSetting(key, value) {
        localStorage.setItem(key, value);
        if (currentUserId) {
            saveSettingsToServer();
        }
    }

    function saveSettingsToServer() {
        const settings = {
            language: localStorage.getItem('language'),
            appearanceMode: localStorage.getItem('appearanceMode')
        };
        fetch('/user-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        }).catch(err => console.error('Failed to sync settings:', err));
    }

    function saveSettingsToServerSync() {
        const settings = {
            language: localStorage.getItem('language'),
            appearanceMode: localStorage.getItem('appearanceMode')
        };
        return fetch('/user-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        }).catch(err => console.error('Failed to sync settings:', err));
    }

    function loadSettingsFromServer() {
        return fetch('/user-settings')
            .then(res => {
                if (!res.ok) throw new Error('Not authenticated');
                return res.json();
            })
            .then(settings => {
                if (settings.language) localStorage.setItem('language', settings.language);
                if (settings.appearanceMode) localStorage.setItem('appearanceMode', settings.appearanceMode);
                return settings;
            })
            .catch(() => null);
    }

    function getLang(en, de) {
        return getSetting('language', 'en') === 'de' ? de : en;
    }

    function createMenuItem(icon, text, onClick) {
        const item = document.createElement('div');
        item.className = 'profile-menu-item';
        
        const iconImg = document.createElement('img');
        iconImg.src = `/LocalYT-Rev-Files/${icon}`;
        iconImg.className = 'profile-menu-icon';
        iconImg.draggable = false;
        
        const textSpan = document.createElement('span');
        textSpan.className = 'profile-menu-text';
        textSpan.textContent = text;
        
        item.appendChild(iconImg);
        item.appendChild(textSpan);
        
        if (onClick) {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
                closeMenu();
            });
        }
        
        return item;
    }

    function closeMenu() {
        if (menuInstance) {
            menuInstance.classList.remove('open');
        }
        document.removeEventListener('click', closeMenu);
    }

    function toggleMenu() {
        if (!menuInstance) return;
        
        if (menuInstance.classList.contains('open')) {
            closeMenu();
        } else {
            menuInstance.classList.add('open');
            setTimeout(() => {
                document.addEventListener('click', closeMenu);
            }, 0);
        }
    }

    // ======================================================================
    // BULLETPROOF LOGO COLOR (Data URI method to bypass <img> SVG limits)
    // ======================================================================
    function applyLogoColor() {
        const logo = document.getElementById('mainLogo');
        if (!logo) return;

        const isLight = getSetting('appearanceMode', 'dark') === 'light';
        const targetColor = isLight ? '#333333' : '#ffffff';
        const versionTextColor = isLight ? '#999999' : '#c8c8c8';

        if (logo.dataset.currentLogoColor === targetColor) return;

        fetch('LocalYT-Rev-Files/Logo.svg')
            .then(response => response.text())
            .then(svgText => {
                const protectedSvg = svgText.replace(
                    /(<g clip-path="url\(#clip1_2733_1405\)">[\s\S]*?<\/g>)/,
                    (match) => match.replace(/fill="white"/g, 'fill="KEEP_WHITE"')
                );

                let modifiedSvg = protectedSvg.replace(/fill="white"/g, `fill="${targetColor}"`);
                modifiedSvg = modifiedSvg.replace(/fill="KEEP_WHITE"/g, 'fill="white"');

                const base64Svg = btoa(unescape(encodeURIComponent(modifiedSvg)));
                logo.src = `data:image/svg+xml;base64,${base64Svg}`;
                
                logo.dataset.currentLogoColor = targetColor;
            })
            .then(() => {
                applyChristmasHat(); 
            })
            .catch(err => {
                console.error('Failed to load SVG for coloring, falling back to default:', err);
            });
    }

    // ======================================================================
    // CHRISTMAS HAT OVERLAY (Server Time Check)
    // ======================================================================
    function applyChristmasHat() {
        const logo = document.getElementById('mainLogo');
        if (!logo) return;

        if (logo.dataset.christmasHatApplied === 'true') return;

        fetch(window.location.href, { method: 'HEAD' })
            .then(response => {
                const serverDateStr = response.headers.get('Date');
                if (!serverDateStr) return;
                
                const serverMonth = new Date(serverDateStr).getMonth();
                
                if (serverMonth !== 11) return;

                requestAnimationFrame(() => {
                    if (logo.dataset.christmasHatApplied === 'true') return;

                    const logoWidth = logo.offsetWidth;
                    const logoHeight = logo.offsetHeight;

                    if (logoWidth === 0 || logoHeight === 0) {
                        return;
                    }

                    let wrapper = logo.parentElement;
                    if (!wrapper.classList.contains('christmas-logo-wrapper')) {
                        wrapper = document.createElement('div');
                        wrapper.className = 'christmas-logo-wrapper';
                        wrapper.style.position = 'relative';
                        wrapper.style.display = 'inline-flex';
                        wrapper.style.alignItems = 'center';
                        wrapper.style.overflow = 'visible';
                        logo.parentNode.insertBefore(wrapper, logo);
                        wrapper.appendChild(logo);
                    }

                    const hatImg = document.createElement('img');
                    hatImg.src = '/LocalYT-Rev-Files/christmas-hat.png';
                    hatImg.className = 'christmas-hat-overlay';
                    hatImg.draggable = false;

                    const hatWidth = logoWidth * 0.18; 
                    
                    const offsetY = -(hatWidth * 0.45);
                    const offsetX = -(hatWidth * -0.55);

                    Object.assign(hatImg.style, {
                        position: 'absolute',
                        top: `${offsetY}px`,
                        left: `${offsetX}px`,
                        width: `${hatWidth}px`,
                        height: 'auto',
                        pointerEvents: 'none',
                        zIndex: '10',
                        transform: 'rotate(15deg)'
                    });

                    wrapper.appendChild(hatImg);
                    logo.dataset.christmasHatApplied = 'true';
                });
            })
            .catch(err => {
                console.error('Failed to check server time for Christmas hat:', err);
            });
    }

    function applyLightModeBlackOverride() {
        let oldOverride = document.getElementById('light-mode-black-override');
        if (oldOverride) oldOverride.remove();
    
        const titleScheme = JSON.parse(localStorage.getItem('titleColorScheme') || '{}');
        const isBlueTitles = titleScheme.scheme === 'blue';
    
        let styleText = `
            [style*="background-color: rgb(30, 30, 30)"],
            [style*="background-color: #1e1e1e"],
            .video-description,
            .video-item,
            .playlist-item,
            .post-item,
            .channel-top-section,
            .channel-content-section {
                background-color: #FFFFFF !important;
            }
            
            [style*="color: rgb(136, 136, 136)"],
            [style*="color: #888888"],
            .video-description,
            .video-description.collapsed,
            .home-video-description-text,
            .playlist-description,
            .playlist-video-count,
            .video-count,
            .post-date,
            .home-video-meta,
            .comment-timestamp,
            .sidebar-autoplay-label,
            .suggestion-channel,
            .view-count {
                color: #555555 !important;
            }
    
            [style*="color: rgb(204, 204, 204)"],
            [style*="color: #cccccc"],
            .about-description .description-text,
            .stats-item,
            .stats-item.total-views,
            .share-button,
            #shareBtnText {
                color: #555555 !important;
            }
    
            [style*="color: rgb(170, 170, 170)"],
            [style*="color: #aaaaaa"],
            .tab,
            .like-dislike-icons span,
            .share-container span,
            .save-container span,

            .sub-count,
            .comment-like-btn span,
            .description-toggle {
                color: #666666 !important;
            }
    
            #classicInfoBoxWrapper {
                background-color: #ffffff !important;
                border-color: #e0e0e0 !important;
            }
    
            #classicInfoBoxWrapper #classicActionsWrapper {
                border-top-color: #e0e0e0 !important;
            }
    
            .channel-name,
            .classic-channel-name-text {
                color: #000000 !important;
            }
    
            body[data-video-layout="classic"] .video-description,
            .classic-layout-active .video-description {
                background-color: #ffffff !important;
            }
    
            body[data-video-layout="classic"] .description-toggle,
            .classic-layout-active .description-toggle {
                background-color: #ffffff !important;
                border-top-color: #e0e0e0 !important;
                color: #333333 !important;
            }
    
            .channel-name,
            .classic-channel-name-text {
                color: #000000 !important;
            }
    
            .tab.active {
                color: #333 !important;
                border-bottom-color: #333 !important;
            }
    
            .suggestion-item.current-video-item {
                background-color: #999 !important;
            }
    
            .playlist-section-header, .playlist-section-header a {
                color: #333 !important;
            }
    
            .suggestion-item {
                background-color: #ffffff !important;
                color: #0f0f0f !important;
            }
    
            .suggestion-item:hover {
                background-color: #e0e0e0 !important;
            }
    
            .search-suggestions {
                background-color: #ffffff !important;
                border-color: rgba(0, 0, 0, 0.1) !important;
            }
    
            .suggestion-item .history-icon {
                filter: invert(0) !important;
            }
    
            .suggestion-item .history-icon {
                filter: invert(0.8) !important;
            }
    
            [style*="color: rgb(227, 227, 227)"],
            [style*="color: #e3e3e3"],
            .post-content-text,
            .classic-playlist-description {
                color: #000000 !important;
            }
    
            .comment-text.collapsed::after {
                background: linear-gradient(rgba(255, 255, 255, 0), #f1f1f1) !important;
            }
    
            .video-description.collapsed::after {
                background: linear-gradient(rgba(255, 255, 255, 0), #ffffff) !important;
            }
    
            .channel-name {
                color: #000000 !important;
            }
    
            .subscriber-count {
                color: #737373 !important;
            }
    
            ::placeholder {
                color: #737373 !important;
            }
    
            .search-icon {
                filter: invert(0.6) !important; 
            }
    
            .tab-search-icon {
                filter: invert(0) !important;
            }
    
            #channelSearchInput {
                color: #0f0f0f !important;
            }
            #searchInput {
                color: #000000 !important;
            }
        `;
    
    // Only force title colors to black if blue titles are OFF
    if (!isBlueTitles) {
        styleText += `
        .video-title:not(.blue-text):not([style*="#128ee9"]),
        .playlist-title:not(.blue-text):not([style*="#128ee9"]),
        .home-video-title:not(.blue-text):not([style*="#128ee9"]),
        .post-author-name:not(.blue-text):not([style*="#128ee9"]),
        .suggestion-title,
        .current-video-title,
        .comment-author,
        .comment-text,
        .comments-count,
        #commentsTotalAmount {
            color: #000000 !important;
        }
        `;
    } else {
        // Blue titles ON – make suggestion-title and current-video-title darker grey
        styleText += `
        .suggestion-title,
        .current-video-title {
            color: #444444 !important;
        }
        `;
    }
    
        styleText += `
            .openbtn {
                filter: invert(1);
            }
    
            .sort-toggle,
            .sort-toggle.open,
            .view-toggle,
            .view-toggle.open,
            .sort-dropdown-menu,
            .view-dropdown-menu {
                background-color: #f0f0f0 !important;
                color: #0f0f0f !important;
            }
            
            .sort-dropdown-item,
            .view-dropdown-item {
                color: #0f0f0f !important;
            }
            
            .sort-dropdown-item:hover,
            .view-dropdown-item:hover {
                background-color: #e0e0e0 !important;
            }
    
            .sort-toggle-arrow,
            .view-toggle-arrow {
                border-top-color: #0f0f0f !important;
            }
    
            .logo {
                filter: none !important;
            }
        `;
    
        const style = document.createElement('style');
        style.id = 'light-mode-black-override';
        style.textContent = styleText;
        document.head.appendChild(style);
    }

    function safeRefreshPage() {
        if (sessionStorage.getItem('justRefreshedAppearance') === 'true') {
            sessionStorage.removeItem('justRefreshedAppearance');
            return; 
        }
        sessionStorage.setItem('justRefreshedAppearance', 'true');
        setTimeout(() => {
            location.reload();
        }, 50); 
    }

    function toggleAppearanceMode(isShiftHeld = false) {
        const root = document.documentElement;
        const currentMode = getSetting('appearanceMode', 'dark');

        const oledOverride = document.getElementById('oled-black-override');
        if (oledOverride && currentMode === 'oled') {
            oledOverride.remove();
        }

        const lightOverride = document.getElementById('light-mode-black-override');
        if (lightOverride && currentMode !== 'light') {
             lightOverride.remove();
        }

        if (isShiftHeld) {
            if (currentMode === 'dark' || currentMode === 'oled') {
                root.style.setProperty('--main-bg-color', '#f1f1f1');
                root.style.setProperty('--secondary-bg-color', '#ffffff');
                root.style.setProperty('--input-bg-color', '#f1f1f1');
                
                applyLightModeBlackOverride();
                setSetting('appearanceMode', 'light');

                safeRefreshPage();

            } else {
                root.style.setProperty('--main-bg-color', '#0f0f0f');
                root.style.setProperty('--secondary-bg-color', '#212121');
                root.style.setProperty('--input-bg-color', '#1a1a1a');
                setSetting('appearanceMode', 'dark');
                safeRefreshPage();
            }
        } else {
            if (currentMode === 'oled') {
                root.style.setProperty('--main-bg-color', '#0f0f0f');
                root.style.setProperty('--secondary-bg-color', '#212121');
                root.style.setProperty('--input-bg-color', '#1a1a1a');
                setSetting('appearanceMode', 'dark');
            } else if (currentMode === 'light') {
                root.style.setProperty('--main-bg-color', '#0f0f0f');
                root.style.setProperty('--secondary-bg-color', '#212121');
                root.style.setProperty('--input-bg-color', '#1a1a1a');
                setSetting('appearanceMode', 'dark');
                safeRefreshPage();

            } else {
                root.style.setProperty('--main-bg-color', '#000000');
                root.style.setProperty('--secondary-bg-color', '#000000');
                root.style.setProperty('--input-bg-color', '#000000');
                
                const style = document.createElement('style');
                style.id = 'oled-black-override';
                
                style.textContent = `
                    body,
                    html,
                    .channel-top-section,
                    .channel-content-section,
                    .settings-section,
                    .pref-list-container,
                    .tab-panel,
                    .profile-menu-dropdown,
                    .post-item,
                    .video-item,
                    .playlist-item,
                    .delete-account-form,
                    .crop-modal-overlay,
                    .about-container,
                    .home-preview-section,
                    .videos-wrapper,
                    .posts-container,
                    .playlists-container,
                    .search-container { 
                        background-color: #000000 !important; 
                        background: #000000 !important;
                    }
                    .subscribe-button {
                        background-color: red !important;
                    }
                    img[src$=".svg"] {
                        background-color: transparent !important;
                    }
                    .playlist-thumbnail,
                    .video-thumbnail,
                    .channel-banner,
                    .post-images-wrapper,
                    .home-player-wrapper,
                    img[src$=".jpg"], 
                    img[src$=".jpeg"], 
                    img[src$=".png"] {
                        background-color: transparent !important;
                        background: transparent !important !important;
                    }
            .video-description,
            .video-description.collapsed {
                color: #aaaaaa !important;
            }
                `;
                const old = document.getElementById('oled-black-override');
                if (old) old.remove();
                document.head.appendChild(style);
                
                setSetting('appearanceMode', 'oled');
            }
        }
        
        const oldStyle = document.getElementById('profile-menu-styles');
        if (oldStyle) oldStyle.remove();
        injectMenuStyles();

        if (window.logoVersionRef) {
            const mode = getSetting('appearanceMode', 'dark');
            window.logoVersionRef.style.color = (mode === 'light') ? '#999999' : '#c8c8c8';
        }
      
        const searchIcon = document.getElementById('searchIcon') || document.querySelector('.search-icon');
        const searchInput = document.getElementById('searchInput');
        
        if (getSetting('appearanceMode', 'dark') === 'light') {
            if (searchIcon) searchIcon.style.filter = 'invert(1)';
            if (searchInput) {
                searchInput.style.color = '#0f0f0f';
                searchInput.style.backgroundColor = '#f1f1f1'; 
                
                const phStyle = document.getElementById('light-mode-placeholder-style');
                if (!phStyle) {
                    const s = document.createElement('style');
                    s.id = 'light-mode-placeholder-style';
                    s.textContent = `#searchInput::placeholder { color: #888 !important; }`;
                    document.head.appendChild(s);
                }
            }
            
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') {
                    if (!img.classList.contains('logo') && !img.classList.contains('christmas-hat-overlay')) {
                        img.style.filter = 'invert(1)';
                    }
                }
            });
            
            applyLightModeBlackOverride();
            
        } else if (getSetting('appearanceMode', 'dark') === 'oled') {
            if (searchIcon) searchIcon.style.filter = '';
            if (searchInput) {
                searchInput.style.color = '';
                searchInput.style.backgroundColor = '';
            }
            const phStyle = document.getElementById('light-mode-placeholder-style');
            if (phStyle) phStyle.remove();
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') img.style.filter = '';
            });
            
        } else {
            if (searchIcon) searchIcon.style.filter = '';
            if (searchInput) {
                searchInput.style.color = '';
                searchInput.style.backgroundColor = '';
            }
            const phStyle = document.getElementById('light-mode-placeholder-style');
            if (phStyle) phStyle.remove();
            const ovd = document.getElementById('oled-black-override');
            if (ovd) ovd.remove();
            const lvd = document.getElementById('light-mode-black-override');
            if (lvd) lvd.remove();
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') img.style.filter = '';
            });
        }
    }

    function updateAppearanceText(item) {
        const currentMode = getSetting('appearanceMode', 'dark');
        const textSpan = item.querySelector('.profile-menu-text');
        
        if (currentMode === 'light') {
            textSpan.textContent = getLang('Appearance: Light (BETA)', 'Erscheinungsbild: Hell (BETA)');
        } else if (currentMode === 'oled') {
            textSpan.textContent = getLang('Appearance: OLED', 'Erscheinungsbild: OLED');
        } else {
            textSpan.textContent = getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel');
        }
    }

    function toggleLanguage(item) {
        const currentLang = getSetting('language', 'en');
        const newLang = currentLang === 'de' ? 'en' : 'de';
        setSetting('language', newLang);
        
        if (item) {
            const currentMode = getSetting('appearanceMode', 'dark');
            const textSpan = item.querySelector('.profile-menu-text');
            if (newLang === 'de') {
                textSpan.textContent = currentMode === 'oled' ? 'Erscheinungsbild: OLED' : 
                                  currentMode === 'light' ? 'Erscheinungsbild: Hell' : 
                                  'Erscheinungsbild: Dunkel';
            } else {
                textSpan.textContent = currentMode === 'oled' ? 'Appearance: OLED' : 
                                  currentMode === 'light' ? 'Appearance: Light' : 
                                  'Appearance: Dark';
            }
        }
        
        if (currentUserId) {
            saveSettingsToServerSync().then(() => {
                location.reload();
            });
        } else {
            location.reload();
        }
    }

    function updateLanguageText(item) {
        const currentLang = getSetting('language', 'en');
        const textSpan = item.querySelector('.profile-menu-text');
        if (currentLang === 'de') {
            textSpan.textContent = 'Sprache: Deutsch';
        } else {
            textSpan.textContent = 'Language: English';
        }
    }

    function applyLanguage() {
        const lang = getSetting('language', 'en');
        
        const dict = {
            'subscribeButton': { en: 'Subscribe', de: 'Abonnieren' },
            'subscribedState': { en: 'Subscribed', de: 'Abonniert' },
            'shareContainer': { en: 'Share', de: 'Teilen' },
            'saveContainer': { en: 'Save', de: 'Speichern' },
            'savedState': { en: 'Saved', de: 'Gespeichert' },
            'descriptionToggleMore': { en: 'Show more', de: 'Mehr anzeigen' },
            'descriptionToggleLess': { en: 'Show less', de: 'Weniger anzeigen' },
            'noDescription': { en: 'No description available for this video.', de: 'Keine Beschreibung für dieses Video verfügbar.' },
            'commentsCount': { en: 'Comments', de: 'Kommentare' },
            'saveModalTitle': { en: 'Save to Playlist', de: 'In Playlist speichern' },
            'noPlaylistsMessage': { en: 'No playlists yet. Create one below.', de: 'Keine Playlisten vorhanden. Erstellen Sie unten eine.' },
            'newPlaylistName': { en: 'New playlist name', de: 'Name der neuen Playlist' },
            'createPlaylistBtn': { en: 'Create', de: 'Erstellen' },
            'shareModalTitle': { en: 'Share Video', de: 'Video teilen' },
            'copyWithTimestamp': { en: 'Copy Link + Timestamp', de: 'Link + Zeitstempel kopieren' },
            'copyWithoutTimestamp': { en: 'Copy Link', de: 'Link kopieren' },
            'copyMessage': { en: 'Video URL copied to clipboard!', de: 'Video-URL in die Zwischenablage kopiert!' },
            'recHeader': { en: 'Recommended', de: 'Empfohlen' }
        };

        Object.keys(dict).forEach(key => {
            const el = document.getElementById(key);
            if (el) {
                if (el.tagName === 'INPUT') {
                    el.placeholder = dict[key][lang] || dict[key]['en'];
                } else if (el.querySelector('span')) {
                    el.querySelector('span').textContent = dict[key][lang] || dict[key]['en'];
                } else {
                    el.textContent = dict[key][lang] || dict[key]['en'];
                }
            }
        });
        
        const saveH2 = document.querySelector('#saveModal h2');
        if (saveH2) saveH2.textContent = dict.saveModalTitle[lang];
        
        const shareH2 = document.querySelector('#shareModal h2');
        if (shareH2) shareH2.textContent = dict.shareModalTitle[lang];

        const subBtn = document.getElementById('subscribeButton');
        if (subBtn) {
             if (subBtn.classList.contains('subscribed')) {
                subBtn.textContent = dict.subscribedState[lang];
            } else {
                subBtn.textContent = dict.subscribeButton[lang];
            }
        }

        const saveSpan = document.querySelector('#saveContainer span');
        if (saveSpan) {
            const saveIcon = document.getElementById('saveIcon');
            const isSaved = saveIcon && saveIcon.src.includes('saved.svg');
            
            if (isSaved) {
                saveSpan.textContent = dict.savedState[lang];
            } else {
                saveSpan.textContent = dict.saveContainer[lang];
            }
        }
    }

    function applyAppearanceMode() {
        const mode = getSetting('appearanceMode', 'dark');
        if (mode === 'oled') {
            document.documentElement.style.setProperty('--main-bg-color', '#000000');
            document.documentElement.style.setProperty('--secondary-bg-color', '#000000');
            document.documentElement.style.setProperty('--input-bg-color', '#000000');
        } else if (mode === 'light') {
            document.documentElement.style.setProperty('--main-bg-color', '#f1f1f1');
            document.documentElement.style.setProperty('--secondary-bg-color', '#ffffff');
            document.documentElement.style.setProperty('--input-bg-color', '#f1f1f1');
            applyLightModeBlackOverride();
        }
    }

    // ================================================================
    // UPDATED initNotifications – makes notification items clickable
    // ================================================================
    function initNotifications() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions) return;
        if (document.getElementById('notifBell')) return;

        const notifWrapper = document.createElement('div');
        notifWrapper.style.position = 'relative';
        notifWrapper.style.marginRight = '24px';
        notifWrapper.style.display = 'flex';
        notifWrapper.style.alignItems = 'center';
        
        const notifIcon = document.createElement('img');
        notifIcon.id = 'notifBell';
        notifIcon.src = '/LocalYT-Rev-Files/notifications.svg';
        notifIcon.className = 'notif-icon';
        notifIcon.draggable = false;
        
        const badge = document.createElement('span');
        badge.id = 'notifBadge';
        badge.className = 'notif-badge';
        
        const notifDropdown = document.createElement('div');
        notifDropdown.id = 'notifDropdown';
        notifDropdown.className = 'profile-menu-dropdown notif-dropdown';
        
        notifWrapper.appendChild(notifIcon);
        notifWrapper.appendChild(badge);
        notifWrapper.appendChild(notifDropdown);
        
        const profilePic = document.getElementById('headerProfilePic');
        if (profilePic) userActions.insertBefore(notifWrapper, profilePic);
        else userActions.appendChild(notifWrapper);

        notifIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notifDropdown.classList.contains('open')) {
                notifDropdown.classList.remove('open');
            } else {
                notifDropdown.classList.add('open');
                badge.style.display = 'none';
                fetch('/api/notifications/read', { method: 'POST' }).catch(err => console.error(err));
            }
        });

        document.addEventListener('click', () => {
            if (notifDropdown.classList.contains('open')) notifDropdown.classList.remove('open');
        });

        fetch('/api/notifications')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data) return;
                if (data.unreadCount > 0) {
                    badge.textContent = data.unreadCount;
                    badge.style.display = 'flex';
                }
                if (data.notifications.length === 0) {
                    notifDropdown.innerHTML = `<div class="profile-menu-item" style="cursor:default; flex-direction:column; align-items:flex-start;"><span style="font-weight:bold;">No new notifications</span></div>`;
                } else {
                    notifDropdown.innerHTML = '';
                    data.notifications.forEach(n => {
                        const item = document.createElement('div');
                        item.className = 'profile-menu-item';
                        item.style.flexDirection = 'column';
                        item.style.alignItems = 'flex-start';
                        item.style.padding = '12px 20px';
                        item.style.borderBottom = '1px solid rgba(128,128,128,0.2)';
                        
                        const msg = document.createElement('span');
                        msg.style.fontWeight = 'bold';
                        msg.style.fontSize = '14px';
                        msg.textContent = n.message;
                        
                        const time = document.createElement('span');
                        time.style.fontSize = '12px';
                        time.style.opacity = '0.7';
                        time.style.marginTop = '4px';
                        time.textContent = new Date(n.timestamp).toLocaleString();
                        
                        item.appendChild(msg);
                        item.appendChild(time);

                        // ---- Make notification clickable if it contains a channel name ----
                        let channelName = null;
                        if (n.channel) {
                            channelName = n.channel;
                        } else if (n.message && n.message.includes(':')) {
                            const parts = n.message.split(':');
                            channelName = parts[0].trim();
                        }
                        if (channelName) {
                            const url = `channel.html?channel=${encodeURIComponent(channelName)}`;
                            item.style.cursor = 'pointer';
                            // Left click – navigate in same tab
                            item.addEventListener('click', (e) => {
                                e.stopPropagation();
                                window.location.href = url;
                                notifDropdown.classList.remove('open'); // close dropdown
                            });
                            // Middle click – open in new tab
                            item.addEventListener('mouseup', (e) => {
                                if (e.button === 1) {
                                    e.preventDefault();
                                    window.open(url, '_blank');
                                    notifDropdown.classList.remove('open');
                                }
                            });
                            // Right click – open in new tab
                            item.addEventListener('contextmenu', (e) => {
                                e.preventDefault();
                                window.open(url, '_blank');
                                notifDropdown.classList.remove('open');
                            });
                        }
                        // ----------------------------------------------------------------

                        notifDropdown.appendChild(item);
                    });
                }
            })
            .catch(err => console.error('Error fetching notifications:', err));
    }

    function initProfilePic() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions) {
            userActions = document.createElement('div');
            userActions.className = 'user-actions';
            const topBar = document.querySelector('.top-bar');
            if (topBar) topBar.appendChild(userActions);
        }

        applyAppearanceMode();
        applyLogoColor();

        const logo = document.getElementById('mainLogo');
        if (logo && !document.getElementById('logo-version')) {
            const versionSpan = document.createElement('span');
            versionSpan.id = 'logo-version';
            versionSpan.textContent = 'v4.80'; // Current LocalYT Version
            
            const isLight = getSetting('appearanceMode', 'dark') === 'light';
            versionSpan.style.color = isLight ? '#999999' : '#c8c8c8';
            versionSpan.style.fontFamily = "'RobotoRegular', Arial, sans-serif";
            versionSpan.style.fontSize = "12px";
            versionSpan.style.marginLeft = "4px";
            versionSpan.style.transform = "translateY(-5px)";
            versionSpan.style.userSelect = "none";
            versionSpan.style.alignSelf = "center";
            
            logo.parentNode.insertBefore(versionSpan, logo.nextSibling);
            
            window.logoVersionRef = versionSpan;
        }

        if (getSetting('language', 'en') === 'de') {
            applyLanguage();
        }

        userActions.style.position = 'relative';

        const existing = document.getElementById('headerProfilePic');
        if (existing) existing.remove();
        
        const oldMenu = document.getElementById('profileMenuDropdown');
        if (oldMenu) oldMenu.remove();

        const img = document.createElement('img');
        img.id = 'headerProfilePic';
        img.className = 'header-profile-pic';
        img.alt = 'Profile';
        img.src = PLACEHOLDER;
        
        menuInstance = document.createElement('div');
        menuInstance.id = 'profileMenuDropdown';
        menuInstance.className = 'profile-menu-dropdown';

        let userData = null;

        fetch('/session-user')
            .then(res => {
                if (res.ok) return res.json();
                return null;
            })
            .then(data => {
                userData = data;
                
                if (userData && userData.username) {
                    currentUserId = userData.username;
                    
                    return loadSettingsFromServer().then(() => {
                        applyAppearanceMode();
                        if (getSetting('language', 'en') === 'de') {
                            applyLanguage();
                        }
                        
                        return fetch('/user-profile-pic')
                            .then(picRes => picRes.json())
                            .then(picData => {
                                if (picData.hasCustomPic && picData.picUrl) {
                                    img.src = picData.picUrl;
                                }
                            })
                            .catch(() => {});
                    });
                }
                return null;
            })
            .then(() => {
                buildMenu(userData);
                if (userData && userData.username) {
                    initNotifications();
                }
            })
            .catch(err => {
                console.error('Error checking session:', err);
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign In', 'Anmelden'), () => {
                    window.location.href = '/login.html';
                }));
            });

        function buildMenu(userData) {
            if (userData && userData.username) {
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign Out', 'Abmelden'), () => {
                    fetch('/logout').then(() => {
                        window.location.href = '/login.html';
                    }).catch(err => console.error('Logout failed:', err));
                }));

                const appearanceItem = createMenuItem('appearance.svg', getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel'));
                updateAppearanceText(appearanceItem);

                let holdTimer;
                appearanceItem.addEventListener('mousedown', () => { holdTimer = setTimeout(() => { toggleAppearanceMode(true); updateAppearanceText(appearanceItem); closeMenu(); }, 500); });
                appearanceItem.addEventListener('mouseup', () => clearTimeout(holdTimer));
                appearanceItem.addEventListener('mouseleave', () => clearTimeout(holdTimer));

                appearanceItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearTimeout(holdTimer);
                    const isShiftHeld = e.shiftKey;
                    toggleAppearanceMode(isShiftHeld);
                    updateAppearanceText(appearanceItem);
                    closeMenu();
                });

                menuInstance.appendChild(appearanceItem);

                const languageItem = createMenuItem('language.svg', getLang('Language: English', 'Sprache: Englisch'));
                updateLanguageText(languageItem);
                
                languageItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleLanguage(languageItem);
                    closeMenu();
                });
                
                menuInstance.appendChild(languageItem);

                menuInstance.appendChild(createMenuItem('settings.svg', getLang('Settings', 'Einstellungen'), () => {
                    window.location.href = 'settings.html';
                }));

                menuInstance.appendChild(createMenuItem('changelog.svg', getLang('Changelog', 'Änderungsprotokoll'), () => {
                    window.location.href = 'changelog.html';
                }));

                menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                    window.open('https://github.com/pbz134/LocalYT', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                    window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('about.svg', getLang('About', 'Über'), () => {
                    window.location.href = 'about.html';
                }));

            } else {
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign In', 'Anmelden'), () => {
                    window.location.href = '/login.html';
                }));

                menuInstance.appendChild(createMenuItem('changelog.svg', getLang('Changelog', 'Änderungsprotokoll'), () => {
                    window.location.href = 'changelog.html';
                }));

                menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                    window.open('https://github.com/pbz134/LocalYT', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                    window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('about.svg', getLang('About', 'Über'), () => {
                    window.location.href = 'about.html';
                }));
            }
        }

        img.onclick = function(e) {
            e.stopPropagation();
            toggleMenu();
        };

        userActions.appendChild(img);
        userActions.appendChild(menuInstance);

        injectMenuStyles();
    }

    function injectMenuStyles() {
        if (document.getElementById('profile-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'profile-menu-styles';
        
        const isLightMode = getSetting('appearanceMode', 'dark') === 'light';
        const textColor = isLightMode ? '#0f0f0f' : '#fff';  
        const hoverBg = isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)';
        const borderColor = isLightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        const shadowColor = isLightMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)';
        
        style.textContent = `
            .profile-menu-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background-color: var(--secondary-bg-color);
                border: 1px solid ${borderColor};
                min-width: 220px;
                box-shadow: 0 4px 20px ${shadowColor};
                z-index: 2000;
                display: none;
                padding: 8px 0;
            }

            .profile-menu-dropdown.open {
                display: block;
            }

            .profile-menu-item {
                display: flex;
                align-items: center;
                padding: 10px 20px;
                color: ${textColor};
                font-family: 'RobotoRegular', Arial, sans-serif;
                font-size: 14px;
                cursor: pointer;
                transition: background-color 0.15s ease;
                user-select: none;
            }

            .profile-menu-item:hover {
                background-color: ${hoverBg};
            }

            .profile-menu-icon {
                width: 20px;
                height: 20px;
                margin-right: 16px;
                opacity: 0.9;
                filter: ${isLightMode ? 'invert(0)' : 'invert(1)'};
            }

            .header-profile-pic {
                cursor: pointer;
            }

            .notif-icon {
                width: 28px;
                height: 28px;
                cursor: pointer;
                filter: ${isLightMode ? 'invert(0)' : 'invert(1)'};
            }
            .notif-badge {
                position: absolute;
                top: -5px;
                right: -8px;
                background-color: red;
                color: white;
                border-radius: 50%;
                font-size: 10px;
                padding: 2px 5px;
                display: none;
                font-family: 'RobotoRegular', Arial, sans-serif;
                font-weight: bold;
                align-items: center;
                justify-content: center;
                min-width: 16px;
                height: 16px;
                box-sizing: border-box;
            }
            .notif-dropdown {
                min-width: 300px;
                max-height: 400px;
                overflow-y: auto;
            }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfilePic);
    } else {
        initProfilePic();
    }
})();