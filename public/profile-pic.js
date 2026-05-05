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

    // Returns a promise that resolves ONLY after the settings are saved to the server
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

    // --- Language Helper ---
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
        const versionTextColor = isLight ? '#999999' : '#c8c8c8'; // Dark grey for light mode, light grey for dark

        // If it's already correctly colored (e.g. from a previous run), do nothing
        if (logo.dataset.currentLogoColor === targetColor) return;

        fetch('LocalYT-Rev-Files/Logo.svg')
            .then(response => response.text())
            .then(svgText => {
                // 1. Identify the 6 icon paths inside the red box (lines between the first <g> and </g>)
                //    and temporarily mark them so they don't get changed.
                const protectedSvg = svgText.replace(
                    /(<g clip-path="url\(#clip1_2733_1405\)">[\s\S]*?<\/g>)/,
                    (match) => match.replace(/fill="white"/g, 'fill="KEEP_WHITE"')
                );

                // 2. Now safely change all remaining 'fill="white"' (the text) to the target color
                let modifiedSvg = protectedSvg.replace(/fill="white"/g, `fill="${targetColor}"`);

                // 3. Restore the icon back to standard white
                modifiedSvg = modifiedSvg.replace(/fill="KEEP_WHITE"/g, 'fill="white"');

                // 5. Encode to Base64 Data URI to guarantee browser renders exactly this
                const base64Svg = btoa(unescape(encodeURIComponent(modifiedSvg)));
                logo.src = `data:image/svg+xml;base64,${base64Svg}`;
                
                // Mark as colored so we don't re-fetch unnecessarily
                logo.dataset.currentLogoColor = targetColor;
            })
            .catch(err => {
                console.error('Failed to load SVG for coloring, falling back to default:', err);
            });
    }

    // Helper to apply Light Mode overrides (#1e1e1e -> #FFFFFF, etc.)
    function applyLightModeBlackOverride() {
        let oldOverride = document.getElementById('light-mode-black-override');
        if (oldOverride) oldOverride.remove();

        const style = document.createElement('style');
        style.id = 'light-mode-black-override';
        
        style.textContent = `
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

            /* Replace #aaaaaa with #666666 */
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

            /* Active Tab Color for Light Mode */
            .tab.active {
                color: #333 !important;
                border-bottom-color: #333 !important;
            }

            /* Replace #e3e3e3 with #000000 (Post text) */
            [style*="color: rgb(227, 227, 227)"],
            [style*="color: #e3e3e3"],
            .post-content-text {
                color: #000000 !important;
            }

            /* White fade for collapsed comments in Light Mode */
            .comment-text.collapsed::after {
                background: linear-gradient(rgba(255, 255, 255, 0), #f1f1f1) !important;
            }

            /* White fade for collapsed video description in Light Mode */
            .video-description.collapsed::after {
                background: linear-gradient(rgba(255, 255, 255, 0), #ffffff) !important;
            }

            /* Channel name to dark grey */
            .channel-name {
                color: #000000 !important;
            }

            .subscriber-count {
                color: #737373 !important;
            }

            /* Placeholder visibility */
            ::placeholder {
                color: #737373 !important;
            }

            /* Search icon visibility (invert back to dark) */
            .search-icon {
                filter: invert(0.6) !important; 
            }

            /* Tab search icon */
            .tab-search-icon {
                filter: invert(0) !important;
            }

            /* Channel search input text color */
            #channelSearchInput {
                color: #0f0f0f !important;
            }
            /* Main search bar input text color in Light Mode */
            #searchInput {
                color: #000000 !important;
            }
            .video-title:not(.blue-text):not([style*="#128ee9"]),
            .playlist-title:not(.blue-text):not([style*="#128ee9"]),
            .home-video-title:not(.blue-text):not([style*="#128ee9"]),
            .post-author-name:not(.blue-text):not([style*="#128ee9"]),
            .suggestion-title,
            .current-video-title,
            .comment-author,
            .comment-text,
            .comments-count {
                color: #000000 !important;
            }

            .openbtn {
                filter: invert(1);
            }

            /* Sort/View Dropdowns Light Mode */
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

            /* Dropdown arrows for light mode */
            .sort-toggle-arrow,
            .view-toggle-arrow {
                border-top-color: #0f0f0f !important;
            }

            /* Prevent invert filter from breaking the Data URI SVG logo */
            .logo {
                filter: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Helper to safely refresh the page without causing loops
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
                color: #000000 !important;
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

        // Update version text color dynamically
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
                    if (!img.classList.contains('logo')) {
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

        // --- Create Version Number Element ---
        const logo = document.getElementById('mainLogo');
        if (logo && !document.getElementById('logo-version')) {
            // Ensure the logo is inside a wrapper for alignment, or just append after it
            // We will insert the version span immediately after the logo image
            const versionSpan = document.createElement('span');
            versionSpan.id = 'logo-version';
            versionSpan.textContent = 'v4.20'; // Current LocalYT version
            
            // Apply styles based on current mode
            const isLight = getSetting('appearanceMode', 'dark') === 'light';
            versionSpan.style.color = isLight ? '#999999' : '#c8c8c8';
            versionSpan.style.fontFamily = "'RobotoRegular', Arial, sans-serif";
            versionSpan.style.fontSize = "12px"; // Text size
            versionSpan.style.marginLeft = "4px"; // Space between logo and text
            versionSpan.style.transform = "translateY(-5px)"; // Text y position
            versionSpan.style.userSelect = "none";
            versionSpan.style.alignSelf = "center"; // Vertically center if parent is flex
            
            logo.parentNode.insertBefore(versionSpan, logo.nextSibling);
            
            // Store reference to update color later if needed without reload
            window.logoVersionRef = versionSpan;
        }
        // --- End Version Number ---

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

                appearanceItem.addEventListener('click', (e) => {
                    e.stopPropagation();
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

                menuInstance.appendChild(createMenuItem('help.svg', getLang('Help', 'Hilfe'), () => {
                    window.location.href = 'documentation.html';
                }));

                menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                    window.open('https://github.com/pbz134/LocalYT', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                    window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                }));

            } else {
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign In', 'Anmelden'), () => {
                    window.location.href = '/login.html';
                }));

                menuInstance.appendChild(createMenuItem('help.svg', getLang('Help', 'Hilfe'), () => {
                    window.location.href = 'documentation.html';
                }));

                menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                    window.open('https://github.com/pbz134/LocalYT', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                    window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
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
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfilePic);
    } else {
        initProfilePic();
    }
})();