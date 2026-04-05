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

    function toggleAppearanceMode() {
        const root = document.documentElement;
        const currentMode = getSetting('appearanceMode', 'dark');

        if (currentMode === 'oled') {
            root.style.setProperty('--main-bg-color', '#0f0f0f');
            root.style.setProperty('--secondary-bg-color', '#212121');
            root.style.setProperty('--input-bg-color', '#1a1a1a');
            setSetting('appearanceMode', 'dark');
        } else {
            root.style.setProperty('--main-bg-color', '#000000');
            root.style.setProperty('--secondary-bg-color', '#000000');
            root.style.setProperty('--input-bg-color', '#000000');
            setSetting('appearanceMode', 'oled');
        }
    }

    function updateAppearanceText(item) {
        const currentMode = getSetting('appearanceMode', 'dark');
        const textSpan = item.querySelector('.profile-menu-text');
        if (currentMode === 'oled') {
            textSpan.textContent = getLang('Appearance: OLED', 'Erscheinungsbild: OLED');
        } else {
            textSpan.textContent = getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel');
        }
    }

    function toggleLanguage(item) {
        const currentLang = getSetting('language', 'en');
        const newLang = currentLang === 'de' ? 'en' : 'de';
        setSetting('language', newLang);
        
        // Immediately update the menu text before reload
        if (item) {
            const currentMode = getSetting('appearanceMode', 'dark');
            const textSpan = item.querySelector('.profile-menu-text');
            if (newLang === 'de') {
                textSpan.textContent = currentMode === 'oled' ? 'Erscheinungsbild: OLED' : 'Erscheinungsbild: Dunkel';
            } else {
                textSpan.textContent = currentMode === 'oled' ? 'Appearance: OLED' : 'Appearance: Dark';
            }
        }
        
        // Wait for server sync to finish before reloading
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
                    toggleAppearanceMode();
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
        style.textContent = `
            .profile-menu-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background-color: var(--secondary-bg-color);
                border: 1px solid rgba(255, 255, 255, 0.1);
                min-width: 220px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                z-index: 2000;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-10px);
                transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
                padding: 8px 0;
            }

            .profile-menu-dropdown.open {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }

            .profile-menu-item {
                display: flex;
                align-items: center;
                padding: 10px 20px;
                color: #fff;
                font-family: 'RobotoRegular', Arial, sans-serif;
                font-size: 14px;
                cursor: pointer;
                transition: background-color 0.15s ease;
                user-select: none;
            }

            .profile-menu-item:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }

            .profile-menu-icon {
                width: 20px;
                height: 20px;
                margin-right: 16px;
                opacity: 0.9;
                filter: invert(1);
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